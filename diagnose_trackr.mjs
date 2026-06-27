/**
 * Diagnostic script: compare Trackr API data vs DB posts.
 * Run: node diagnose_trackr.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
const API_KEY = process.env.TRACKR_API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!API_KEY) { console.error('TRACKR_API_KEY not set'); process.exit(1); }
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

// ── 1. Fetch ALL pages from Trackr ──────────────────────────────────────────
async function fetchAllTrackrPosts() {
  let page = 1;
  const all = [];
  while (true) {
    const url = `https://app.ugctrackr.com/api/external/v1/posts?campaign_id=${CAMPAIGN_ID}&page=${page}&per_page=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!res.ok) { console.error('Trackr error', res.status, await res.text()); break; }
    const json = await res.json();
    const posts = json.data ?? json.posts ?? json ?? [];
    if (!Array.isArray(posts) || posts.length === 0) break;
    all.push(...posts);
    if (posts.length < 100) break;
    page++;
  }
  return all;
}

// ── 2. Load DB posts ─────────────────────────────────────────────────────────
async function fetchDbPosts() {
  const conn = await mysql.createConnection(DB_URL);
  const [rows] = await conn.execute('SELECT id, creator_id, post_url, trackr_post_id, views, likes, comments, shares, saves, post_date, review_status FROM posts ORDER BY post_date DESC');
  await conn.end();
  return rows;
}

async function fetchDbCreators() {
  const conn = await mysql.createConnection(DB_URL);
  const [rows] = await conn.execute('SELECT id, name, tiktok_handle, instagram_handle FROM creators');
  await conn.end();
  return rows;
}

// ── 3. Analyse ───────────────────────────────────────────────────────────────
const trackrPosts = await fetchAllTrackrPosts();
const dbPosts = await fetchDbPosts();
const dbCreators = await fetchDbCreators();

console.log('\n══════════════════════════════════════════════════════');
console.log('TRACKR API TOTALS (all pages)');
console.log('══════════════════════════════════════════════════════');
console.log(`  Total posts returned by API : ${trackrPosts.length}`);
const trackrViews = trackrPosts.reduce((s, p) => s + (p.views ?? p.view_count ?? 0), 0);
const trackrLikes = trackrPosts.reduce((s, p) => s + (p.likes ?? p.like_count ?? 0), 0);
console.log(`  Total views                 : ${trackrViews.toLocaleString()}`);
console.log(`  Total likes                 : ${trackrLikes.toLocaleString()}`);

// Show the raw keys of the first post so we know the field names
if (trackrPosts.length > 0) {
  console.log('\n  Sample post keys:', Object.keys(trackrPosts[0]).join(', '));
  console.log('  Sample post:', JSON.stringify(trackrPosts[0], null, 2).slice(0, 600));
}

console.log('\n══════════════════════════════════════════════════════');
console.log('DB TOTALS');
console.log('══════════════════════════════════════════════════════');
console.log(`  Total posts in DB           : ${dbPosts.length}`);
const dbViews = dbPosts.reduce((s, p) => s + (p.views ?? 0), 0);
console.log(`  Total views in DB           : ${dbViews.toLocaleString()}`);

// June 2026 only
const junePosts = dbPosts.filter(p => {
  const d = new Date(p.post_date);
  return d.getUTCFullYear() === 2026 && d.getUTCMonth() === 5;
});
const juneViews = junePosts.reduce((s, p) => s + (p.views ?? 0), 0);
console.log(`  June 2026 posts in DB       : ${junePosts.length}`);
console.log(`  June 2026 views in DB       : ${juneViews.toLocaleString()}`);

// ── 4. Find Trackr posts NOT in DB ──────────────────────────────────────────
const dbTrackrIds = new Set(dbPosts.map(p => p.trackr_post_id).filter(Boolean));
const dbUrls = new Set(dbPosts.map(p => p.post_url).filter(Boolean));

const missingFromDb = trackrPosts.filter(p => {
  const tid = p.id ?? p.post_id;
  const url = p.link ?? p.url ?? p.post_url;
  return !dbTrackrIds.has(String(tid)) && !dbUrls.has(url);
});

console.log('\n══════════════════════════════════════════════════════');
console.log(`TRACKR POSTS NOT IN DB: ${missingFromDb.length}`);
console.log('══════════════════════════════════════════════════════');
if (missingFromDb.length > 0) {
  const missingViews = missingFromDb.reduce((s, p) => s + (p.views ?? p.view_count ?? 0), 0);
  console.log(`  Missing views total: ${missingViews.toLocaleString()}`);
  missingFromDb.slice(0, 20).forEach(p => {
    const url = p.link ?? p.url ?? p.post_url ?? '(no url)';
    const views = p.views ?? p.view_count ?? 0;
    const date = p.post_date ?? p.created_at ?? p.date ?? '?';
    const handle = p.username ?? p.handle ?? p.creator_handle ?? '?';
    console.log(`  [${handle}] ${views.toLocaleString()} views | ${date} | ${url}`);
  });
}

// ── 5. Detect crossposted videos (same creator, same date ±1 day, on both TikTok + IG) ──
console.log('\n══════════════════════════════════════════════════════');
console.log('POTENTIAL CROSSPOST DUPLICATES IN DB (same creator, close date, both platforms)');
console.log('══════════════════════════════════════════════════════');
const byCreator = {};
for (const p of dbPosts) {
  if (!byCreator[p.creator_id]) byCreator[p.creator_id] = [];
  byCreator[p.creator_id].push(p);
}

let crosspostCount = 0;
for (const [cid, posts] of Object.entries(byCreator)) {
  const creator = dbCreators.find(c => c.id === cid);
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i], b = posts[j];
      if (!a.post_url || !b.post_url) continue;
      const aIsT = a.post_url.includes('tiktok');
      const bIsT = b.post_url.includes('tiktok');
      const aIsI = a.post_url.includes('instagram') || a.post_url.includes('reel');
      const bIsI = b.post_url.includes('instagram') || b.post_url.includes('reel');
      const crossPlatform = (aIsT && bIsI) || (aIsI && bIsT);
      if (!crossPlatform) continue;
      const da = new Date(a.post_date), db2 = new Date(b.post_date);
      const diffDays = Math.abs(da - db2) / 86400000;
      if (diffDays <= 3) {
        crosspostCount++;
        const name = creator?.name ?? cid;
        console.log(`  ${name}: TikTok ${a.views?.toLocaleString()} views (${new Date(a.post_date).toISOString().slice(0,10)}) + IG ${b.views?.toLocaleString()} views (${new Date(b.post_date).toISOString().slice(0,10)}) — within ${diffDays.toFixed(1)} days`);
      }
    }
  }
}
if (crosspostCount === 0) console.log('  None detected by URL+date heuristic.');

// ── 6. Per-creator view breakdown ────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('PER-CREATOR VIEW TOTALS (DB, June 2026)');
console.log('══════════════════════════════════════════════════════');
const creatorViews = {};
for (const p of junePosts) {
  creatorViews[p.creator_id] = (creatorViews[p.creator_id] ?? 0) + (p.views ?? 0);
}
for (const [cid, views] of Object.entries(creatorViews).sort((a,b) => b[1]-a[1])) {
  const name = dbCreators.find(c => c.id === cid)?.name ?? cid;
  const posts = junePosts.filter(p => p.creator_id === cid);
  console.log(`  ${name}: ${views.toLocaleString()} views across ${posts.length} posts`);
}

// ── 7. Pagination check ──────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('PAGINATION / FIELD NAME CHECK');
console.log('══════════════════════════════════════════════════════');
console.log(`  Trackr posts fetched (all pages): ${trackrPosts.length}`);
console.log(`  Expected per Trackr dashboard  : 412`);
console.log(`  Gap                            : ${412 - trackrPosts.length}`);
