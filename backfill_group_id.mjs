/**
 * Backfill crosspost_group_id for all existing posts.
 * Groups posts by (creator_id + title_first_80_chars + calendar_day).
 * Posts in the same group share the same crosspost_group_id.
 * Solo posts (no partner on the other platform) also get a group_id
 * (just their own) so the payout logic can check group size.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Load all posts
const [posts] = await conn.execute(
  'SELECT id, creator_id, platform, post_date, title FROM posts ORDER BY post_date'
);

console.log(`Loaded ${posts.length} posts`);

// Build groups: key = creatorId|YYYY-MM-DD|title[:80]
const groups = new Map(); // key -> [post_id, ...]

for (const p of posts) {
  const day = p.post_date
    ? new Date(p.post_date).toISOString().slice(0, 10)
    : '0000-00-00';
  const title = (p.title || '').trim().toLowerCase().slice(0, 80);
  const key = `${p.creator_id}|${day}|${title}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p.id);
}

// Assign a stable group_id (md5 of the key, truncated to 32 chars)
let updated = 0;
for (const [key, ids] of groups) {
  const groupId = crypto.createHash('md5').update(key).digest('hex').slice(0, 32);
  for (const id of ids) {
    await conn.execute(
      'UPDATE posts SET crosspost_group_id = ? WHERE id = ?',
      [groupId, id]
    );
    updated++;
  }
}

console.log(`Updated ${updated} posts with crosspost_group_id`);

// Verify: show groups with 2+ posts (these are the TT+IG pairs)
const [pairs] = await conn.execute(`
  SELECT crosspost_group_id, COUNT(*) as cnt, GROUP_CONCAT(platform ORDER BY platform) as platforms
  FROM posts
  GROUP BY crosspost_group_id
  HAVING cnt > 1
  LIMIT 10
`);
console.log(`\nSample crosspost groups (${pairs.length} shown):`);
for (const r of pairs) {
  console.log(`  ${r.crosspost_group_id}: ${r.cnt} posts [${r.platforms}]`);
}

const [solo] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT crosspost_group_id FROM posts GROUP BY crosspost_group_id HAVING COUNT(*) = 1
  ) t
`);
const [dual] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT crosspost_group_id FROM posts GROUP BY crosspost_group_id HAVING COUNT(*) = 2
  ) t
`);
console.log(`\nSolo posts (single platform): ${solo[0].cnt} groups`);
console.log(`Dual-platform pairs (TT+IG):  ${dual[0].cnt} groups`);

await conn.end();
