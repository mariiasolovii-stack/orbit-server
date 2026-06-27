/**
 * Probe the Trackr API to understand pagination structure and available params.
 */
import 'dotenv/config';

const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
const API_KEY = process.env.TRACKR_API_KEY;
const BASE = 'https://app.ugctrackr.com/api/external/v1';

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

// 1. Check what the top-level API response looks like (no pagination)
console.log('\n── Default response (no page param) ──');
const r1 = await get(`/posts?campaign_id=${CAMPAIGN_ID}`);
console.log('Status:', r1.status);
if (typeof r1.data === 'object' && r1.data !== null) {
  console.log('Top-level keys:', Object.keys(r1.data).join(', '));
  // Look for pagination metadata
  const meta = r1.data.meta ?? r1.data.pagination ?? r1.data.page_info ?? r1.data;
  if (meta) console.log('Meta/pagination fields:', JSON.stringify(meta, null, 2).slice(0, 500));
  const posts = r1.data.data ?? r1.data.posts ?? r1.data;
  if (Array.isArray(posts)) {
    console.log(`Posts array length: ${posts.length}`);
    if (posts[0]) console.log('First post keys:', Object.keys(posts[0]).join(', '));
  }
}

// 2. Try page=2
console.log('\n── Page 2 ──');
const r2 = await get(`/posts?campaign_id=${CAMPAIGN_ID}&page=2`);
console.log('Status:', r2.status);
if (typeof r2.data === 'object') {
  const posts = r2.data.data ?? r2.data.posts ?? r2.data;
  if (Array.isArray(posts)) console.log(`Posts on page 2: ${posts.length}`);
  else console.log('Response:', JSON.stringify(r2.data).slice(0, 300));
}

// 3. Try per_page=200
console.log('\n── per_page=200 ──');
const r3 = await get(`/posts?campaign_id=${CAMPAIGN_ID}&per_page=200`);
console.log('Status:', r3.status);
if (typeof r3.data === 'object') {
  const posts = r3.data.data ?? r3.data.posts ?? r3.data;
  if (Array.isArray(posts)) console.log(`Posts with per_page=200: ${posts.length}`);
}

// 4. Try limit param
console.log('\n── limit=200 ──');
const r4 = await get(`/posts?campaign_id=${CAMPAIGN_ID}&limit=200`);
console.log('Status:', r4.status);
if (typeof r4.data === 'object') {
  const posts = r4.data.data ?? r4.data.posts ?? r4.data;
  if (Array.isArray(posts)) console.log(`Posts with limit=200: ${posts.length}`);
}

// 5. Check if there's a date filter
console.log('\n── Date filter: June 2026 ──');
const r5 = await get(`/posts?campaign_id=${CAMPAIGN_ID}&start_date=2026-06-01&end_date=2026-06-30`);
console.log('Status:', r5.status);
if (typeof r5.data === 'object') {
  const posts = r5.data.data ?? r5.data.posts ?? r5.data;
  if (Array.isArray(posts)) console.log(`Posts with date filter: ${posts.length}`);
  else console.log(JSON.stringify(r5.data).slice(0, 300));
}

// 6. Check full response structure of page 1
console.log('\n── Full response structure of page 1 ──');
console.log(JSON.stringify(r1.data, null, 2).slice(0, 2000));
