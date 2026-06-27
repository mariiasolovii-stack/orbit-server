/**
 * Diagnose Rachel's sync issue: compare DB posts vs Trackr API posts.
 * Run: node diagnose_rachel.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
const API_KEY = process.env.TRACKR_API_KEY;
const DB_URL = process.env.DATABASE_URL;

// ── Fetch ALL Trackr posts (cursor pagination) ───────────────────────────────
async function fetchAllTrackrPosts() {
  const all = [];
  let cursor = null;
  while (true) {
    const params = new URLSearchParams({ campaign_id: CAMPAIGN_ID, limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`https://app.ugctrackr.com/api/external/v1/posts?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const json = await res.json();
    const posts = json.data ?? [];
    all.push(...posts);
    const next = json.meta?.next_cursor;
    if (!next || posts.length === 0) break;
    cursor = next;
  }
  return all;
}

// ── DB helpers ───────────────────────────────────────────────────────────────
const conn = await mysql.createConnection(DB_URL);

const [creators] = await conn.execute('SELECT id, name, tiktok_handle, instagram_handle, status FROM creators');
const [posts] = await conn.execute(
  'SELECT id, creator_id, post_url, trackr_post_id, views, post_date, review_status, is_crosspost_duplicate FROM posts ORDER BY post_date DESC'
);

// ── Find Rachel in DB ────────────────────────────────────────────────────────
const rachel = creators.filter(c =>
  c.name?.toLowerCase().includes('rachel') ||
  c.tiktok_handle?.toLowerCase().includes('rachel') ||
  c.instagram_handle?.toLowerCase().includes('rachel')
);

console.log('\n══════════════════════════════════════════════════════');
console.log('RACHEL IN DB');
console.log('══════════════════════════════════════════════════════');
if (rachel.length === 0) {
  console.log('  !! No creator named Rachel found in DB');
} else {
  for (const r of rachel) {
    console.log(`  id=${r.id} | name="${r.name}" | tiktok="${r.tiktok_handle}" | ig="${r.instagram_handle}" | status=${r.status}`);
    const rPosts = posts.filter(p => p.creator_id === r.id);
    console.log(`  Posts in DB: ${rPosts.length}`);
    for (const p of rPosts) {
      console.log(`    [${new Date(p.post_date).toISOString().slice(0,10)}] ${p.views?.toLocaleString()} views | ${p.review_status} | crosspost=${p.is_crosspost_duplicate} | ${p.post_url}`);
    }
  }
}

// ── Fetch Trackr posts ───────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('FETCHING ALL TRACKR POSTS (this may take a moment)...');
console.log('══════════════════════════════════════════════════════');
const trackrPosts = await fetchAllTrackrPosts();
console.log(`  Total fetched: ${trackrPosts.length}`);

// ── Find Rachel in Trackr ────────────────────────────────────────────────────
const rachelTrackr = trackrPosts.filter(p =>
  p.username?.toLowerCase().includes('rachel')
);

console.log('\n══════════════════════════════════════════════════════');
console.log(`RACHEL POSTS IN TRACKR (username contains "rachel"): ${rachelTrackr.length}`);
console.log('══════════════════════════════════════════════════════');
for (const p of rachelTrackr) {
  console.log(`  [${p.posted_at?.slice(0,10)}] @${p.username} | ${p.platform} | ${(p.views||0).toLocaleString()} views | ${p.link}`);
}

// ── Check ALL unique usernames in Trackr ─────────────────────────────────────
const allUsernames = [...new Set(trackrPosts.map(p => p.username))].sort();
console.log('\n══════════════════════════════════════════════════════');
console.log(`ALL TRACKR USERNAMES (${allUsernames.length} unique)`);
console.log('══════════════════════════════════════════════════════');
for (const u of allUsernames) {
  const uPosts = trackrPosts.filter(p => p.username === u);
  const totalViews = uPosts.reduce((s, p) => s + (p.views || 0), 0);
  const inDb = creators.find(c =>
    c.name?.toLowerCase() === u.toLowerCase() ||
    c.tiktok_handle?.toLowerCase() === u.toLowerCase() ||
    c.instagram_handle?.toLowerCase() === u.toLowerCase()
  );
  const matchStatus = inDb ? `✓ matched to "${inDb.name}"` : '✗ NOT IN DB';
  console.log(`  @${u} | ${uPosts.length} posts | ${totalViews.toLocaleString()} views | ${matchStatus}`);
}

// ── Check which Trackr usernames are NOT matched to any DB creator ────────────
const unmatched = allUsernames.filter(u => !creators.find(c =>
  c.name?.toLowerCase() === u.toLowerCase() ||
  c.tiktok_handle?.toLowerCase() === u.toLowerCase() ||
  c.instagram_handle?.toLowerCase() === u.toLowerCase()
));

console.log('\n══════════════════════════════════════════════════════');
console.log(`UNMATCHED TRACKR USERNAMES (${unmatched.length}) — posts exist but no DB creator match`);
console.log('══════════════════════════════════════════════════════');
for (const u of unmatched) {
  const uPosts = trackrPosts.filter(p => p.username === u);
  const totalViews = uPosts.reduce((s, p) => s + (p.views || 0), 0);
  console.log(`  @${u} | ${uPosts.length} posts | ${totalViews.toLocaleString()} views`);
}

// ── Check posts that ARE in DB but have wrong creator assignment ──────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('DB POSTS WITH HIGH VIEWS (>10k) — verify creator assignment');
console.log('══════════════════════════════════════════════════════');
const highViewPosts = posts.filter(p => (p.views || 0) >= 10000);
for (const p of highViewPosts) {
  const creator = creators.find(c => c.id === p.creator_id);
  console.log(`  ${creator?.name ?? '??'} | ${(p.views||0).toLocaleString()} views | ${p.post_url}`);
}

await conn.end();
