/**
 * Quick handle-matching diagnostic: fetch first 200 Trackr posts and compare
 * usernames against DB creator handles to find mismatches.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
const API_KEY = process.env.TRACKR_API_KEY;
const DB_URL = process.env.DATABASE_URL;

// Fetch just first 200 posts to get all unique usernames quickly
const res = await fetch(
  `https://app.ugctrackr.com/api/external/v1/posts?campaign_id=${CAMPAIGN_ID}&limit=200`,
  { headers: { Authorization: `Bearer ${API_KEY}` } }
);
const json = await res.json();
const posts = json.data ?? [];
const meta = json.meta ?? {};
console.log(`Fetched ${posts.length} posts (total in API: ${meta.count ?? '?'})`);

// Collect unique usernames from this page
const usernames = [...new Set(posts.map(p => p.username))].sort();

// Load DB creators
const conn = await mysql.createConnection(DB_URL);
const [creators] = await conn.execute(
  'SELECT id, name, tiktok_handle, instagram_handle, status FROM creators'
);
await conn.end();

function normalizeHandle(h) {
  if (!h || h === 'null') return '';
  return h.replace(/^@/, '').trim().toLowerCase();
}

console.log('\n══════════════════════════════════════════════════════');
console.log('TRACKR USERNAME → DB CREATOR MATCH (first 200 posts)');
console.log('══════════════════════════════════════════════════════');
for (const username of usernames) {
  const uLower = username.toLowerCase();
  const match = creators.find(c =>
    normalizeHandle(c.name) === uLower ||
    normalizeHandle(c.tiktok_handle) === uLower ||
    normalizeHandle(c.instagram_handle) === uLower
  );
  const uPosts = posts.filter(p => p.username === username);
  const totalViews = uPosts.reduce((s, p) => s + (p.views || 0), 0);
  if (match) {
    console.log(`  ✓ @${username} (${uPosts.length} posts, ${totalViews.toLocaleString()} views) → "${match.name}" [${match.status}]`);
    console.log(`      DB handles: tiktok="${match.tiktok_handle}" | ig="${match.instagram_handle}"`);
  } else {
    console.log(`  ✗ @${username} (${uPosts.length} posts, ${totalViews.toLocaleString()} views) → NO MATCH IN DB`);
    // Show closest DB creator by name similarity
    const partial = creators.filter(c =>
      c.name?.toLowerCase().includes(uLower.slice(0, 5)) ||
      uLower.includes(normalizeHandle(c.name).slice(0, 5))
    );
    if (partial.length) console.log(`      Possible match: ${partial.map(c => `"${c.name}" (tt=${c.tiktok_handle}, ig=${c.instagram_handle})`).join(', ')}`);
  }
}

// Also show DB creators that have NO posts at all
console.log('\n══════════════════════════════════════════════════════');
console.log('DB CREATORS WITH ZERO POSTS (might be handle mismatch)');
console.log('══════════════════════════════════════════════════════');
const conn2 = await mysql.createConnection(DB_URL);
const [postCounts] = await conn2.execute(
  'SELECT creator_id, COUNT(*) as cnt FROM posts GROUP BY creator_id'
);
await conn2.end();
const postCountMap = Object.fromEntries(postCounts.map(r => [r.creator_id, r.cnt]));
for (const c of creators) {
  if (!postCountMap[c.id] || postCountMap[c.id] === 0) {
    console.log(`  "${c.name}" [${c.status}] tiktok="${c.tiktok_handle}" ig="${c.instagram_handle}"`);
  }
}
