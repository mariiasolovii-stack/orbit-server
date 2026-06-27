/**
 * Fast DB-only diagnostic: show all creators + their posts, and identify
 * which ones are likely "Rachel" or have handle mismatch issues.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
const conn = await mysql.createConnection(DB_URL);

const [creators] = await conn.execute(
  'SELECT id, name, tiktok_handle, instagram_handle, status FROM creators ORDER BY name'
);
const [posts] = await conn.execute(
  `SELECT p.id, p.creator_id, p.post_url, p.trackr_post_id, p.views, p.post_date,
          p.review_status, p.is_crosspost_duplicate, p.last_paid_tier
   FROM posts p ORDER BY p.views DESC`
);

await conn.end();

console.log('\n══════════════════════════════════════════════════════');
console.log('ALL CREATORS IN DB');
console.log('══════════════════════════════════════════════════════');
for (const c of creators) {
  const cPosts = posts.filter(p => p.creator_id === c.id);
  const totalViews = cPosts.reduce((s, p) => s + (p.views || 0), 0);
  const maxViews = cPosts.length ? Math.max(...cPosts.map(p => p.views || 0)) : 0;
  console.log(`\n  [${c.status}] "${c.name}" (id=${c.id})`);
  console.log(`    tiktok="${c.tiktok_handle}" | ig="${c.instagram_handle}"`);
  console.log(`    Posts: ${cPosts.length} | Total views: ${totalViews.toLocaleString()} | Max single post: ${maxViews.toLocaleString()}`);
  // Show top 3 posts
  const top3 = cPosts.slice(0, 3);
  for (const p of top3) {
    const date = new Date(p.post_date).toISOString().slice(0, 10);
    const platform = p.post_url?.includes('tiktok') ? 'TikTok' : p.post_url?.includes('instagram') ? 'IG' : '?';
    console.log(`    → ${date} | ${platform} | ${(p.views||0).toLocaleString()} views | crosspost=${p.is_crosspost_duplicate} | ${p.post_url?.slice(0,60)}`);
  }
}

// Show posts with high views that might be misattributed
console.log('\n══════════════════════════════════════════════════════');
console.log('TOP 20 POSTS BY VIEWS (check creator assignment)');
console.log('══════════════════════════════════════════════════════');
const top20 = posts.slice(0, 20);
for (const p of top20) {
  const c = creators.find(x => x.id === p.creator_id);
  const date = new Date(p.post_date).toISOString().slice(0, 10);
  console.log(`  ${(p.views||0).toLocaleString().padStart(12)} views | ${c?.name ?? '??'} | ${date} | ${p.post_url?.slice(0,70)}`);
}
