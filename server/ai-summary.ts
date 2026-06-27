import { invokeLLM } from './_core/llm';
import * as db from './db';
import type { Post } from '../drizzle/schema';

export interface CreatorSummary {
  creatorId: string;
  creatorName: string;
  summary: string;
  flags: {
    engagementIssues: string[];
    postingPatterns: string[];
    contentQuality: string[];
    platformInsights: string[];
  };
  metrics: {
    totalPosts: number;
    postsLast7Days: number;
    totalViews: number;
    avgViewsAllTime: number;
    avgViewsLast7Days: number;
    tiktokPosts: number;
    instagramPosts: number;
    tiktokEngagement: number;
    instagramEngagement: number;
    bestPostViews: number;
    avgGapDays: number;
  };
  generatedAt: Date;
}

const DAY = 1000 * 60 * 60 * 24;

function platformMatches(value: string | null | undefined, target: 'tiktok' | 'instagram'): boolean {
  const p = (value || '').toLowerCase();
  if (target === 'tiktok') return p.includes('tiktok');
  return p.includes('instagram') || p === 'ig';
}

/** Engagement rate = (likes + comments + shares + saves) / views, as a percent. */
function engagementRate(p: Post): number {
  const views = p.views || 0;
  if (!views) return 0;
  return (((p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0)) / views) * 100;
}

function postTime(p: Post): number {
  return new Date(p.postDate || p.createdAt).getTime();
}

function sumViews(arr: Post[]): number {
  return arr.reduce((s, p) => s + (p.views || 0), 0);
}

function avgEngagement(arr: Post[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, p) => s + engagementRate(p), 0) / arr.length;
}

/**
 * Generate an AI-powered creator summary that looks at the WHOLE profile history
 * plus a focused last-7-days window: posting habits, platform comparison,
 * top-performing posts, and content/engagement quality.
 */
export async function generateCreatorSummary(creatorId: string): Promise<CreatorSummary> {
  const creator = await db.getCreator(creatorId);
  if (!creator) {
    throw new Error(`Creator ${creatorId} not found`);
  }

  const allPosts = (await db.listPosts()).filter(p => p.creatorId === creatorId);

  const emptyMetrics = {
    totalPosts: 0, postsLast7Days: 0, totalViews: 0, avgViewsAllTime: 0, avgViewsLast7Days: 0,
    tiktokPosts: 0, instagramPosts: 0, tiktokEngagement: 0, instagramEngagement: 0,
    bestPostViews: 0, avgGapDays: 0,
  };

  if (allPosts.length === 0) {
    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: 'No posts found for this creator yet. Once posts are synced from Trackr, a full performance analysis will be generated.',
      flags: { engagementIssues: [], postingPatterns: [], contentQuality: [], platformInsights: [] },
      metrics: emptyMetrics,
      generatedAt: new Date(),
    };
  }

  // Newest first across the ENTIRE history (not just the latest 50).
  const posts = [...allPosts].sort((a, b) => postTime(b) - postTime(a));
  const now = Date.now();

  // ---- Time windows ----
  const last7 = posts.filter(p => (now - postTime(p)) / DAY <= 7);
  const last30 = posts.filter(p => (now - postTime(p)) / DAY <= 30);
  const firstPostTime = postTime(posts[posts.length - 1]);
  const lifespanDays = Math.max(1, Math.round((now - firstPostTime) / DAY));
  const postsPerWeekAllTime = (posts.length / lifespanDays) * 7;

  // ---- Platform split (whole history) ----
  const tiktok = posts.filter(p => platformMatches(p.platform, 'tiktok'));
  const instagram = posts.filter(p => platformMatches(p.platform, 'instagram'));
  const tiktokEng = avgEngagement(tiktok);
  const instagramEng = avgEngagement(instagram);

  // ---- Posting cadence (whole history) ----
  const times = posts.map(postTime).sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 0; i < times.length - 1; i++) gaps.push(Math.round((times[i] - times[i + 1]) / DAY));
  const maxGap = Math.max(...gaps, 0);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const daysSinceLastPost = Math.floor((now - times[0]) / DAY);

  const postsByDay = new Map<string, number>();
  for (const p of posts) {
    const day = new Date(postTime(p)).toISOString().split('T')[0];
    postsByDay.set(day, (postsByDay.get(day) || 0) + 1);
  }
  const multiPostDays = Array.from(postsByDay.entries()).filter(([, n]) => n > 1);

  // ---- Top performers (whole history) ----
  const byViews = [...posts].sort((a, b) => (b.views || 0) - (a.views || 0));
  const topPosts = byViews.slice(0, 3);
  const bestPostViews = byViews[0]?.views || 0;

  // ---- Format heuristic: short-form (TikTok/Reels) vs long-form (YouTube) ----
  const isLongForm = (p: Post) => {
    const plat = (p.platform || '').toLowerCase();
    return plat.includes('youtube') || plat.includes('long');
  };
  const longForm = posts.filter(isLongForm);
  const shortForm = posts.filter(p => !isLongForm(p));

  // ---- Deterministic flags ----
  const postingPatterns: string[] = [];
  if (last7.length < 5) postingPatterns.push(`Only ${last7.length} post(s) in the last 7 days (target: 5+ per week).`);
  if (maxGap >= 2) postingPatterns.push(`Longest break between posts is ${maxGap} days (2+ day gap detected).`);
  if (daysSinceLastPost >= 2) postingPatterns.push(`No new post in ${daysSinceLastPost} days.`);
  if (multiPostDays.length > 0) postingPatterns.push(`Posted more than once on ${multiPostDays.length} day(s) — spacing posts out usually performs better.`);

  const engagementIssues: string[] = [];
  const lowEng = posts.filter(p => (p.views || 0) >= 500 && engagementRate(p) < 3);
  if (lowEng.length > 0) engagementIssues.push(`${lowEng.length} post(s) with 500+ views are under 3% engagement (low likes/comments relative to views).`);

  const platformInsights: string[] = [];
  if (tiktok.length > 0 && instagram.length > 0) {
    if (tiktokEng > instagramEng * 1.5) platformInsights.push(`Instagram engagement (${instagramEng.toFixed(1)}%) is well below TikTok (${tiktokEng.toFixed(1)}%) — optimize IG content/hashtags.`);
    else if (instagramEng > tiktokEng * 1.5) platformInsights.push(`TikTok engagement (${tiktokEng.toFixed(1)}%) is well below Instagram (${instagramEng.toFixed(1)}%) — optimize TikTok content/hashtags.`);
    const tkRecent = last30.filter(p => platformMatches(p.platform, 'tiktok')).length;
    const igRecent = last30.filter(p => platformMatches(p.platform, 'instagram')).length;
    if (tkRecent === 0) platformInsights.push('No TikTok posts in the last 30 days — creator may be neglecting TikTok.');
    if (igRecent === 0) platformInsights.push('No Instagram posts in the last 30 days — creator may be neglecting Instagram.');
  } else if (tiktok.length === 0) {
    platformInsights.push('No TikTok posts on record — creator may not be posting to TikTok.');
  } else if (instagram.length === 0) {
    platformInsights.push('No Instagram posts on record — creator may not be posting to Instagram.');
  }

  const captionsSample = posts.slice(0, 12).map(p => p.title).filter((t): t is string => !!t && t.trim().length > 0);

  const fmt = (n: number) => Math.round(n).toLocaleString();
  const topPostsText = topPosts.map((p, i) =>
    `${i + 1}. ${p.platform} — ${fmt(p.views || 0)} views, ${engagementRate(p).toFixed(1)}% eng${p.title ? ` — "${p.title.slice(0, 80)}"` : ''}`
  ).join('\n');

  const metrics = {
    totalPosts: posts.length,
    postsLast7Days: last7.length,
    totalViews: sumViews(posts),
    avgViewsAllTime: Math.round(sumViews(posts) / posts.length),
    avgViewsLast7Days: last7.length ? Math.round(sumViews(last7) / last7.length) : 0,
    tiktokPosts: tiktok.length,
    instagramPosts: instagram.length,
    tiktokEngagement: Number(tiktokEng.toFixed(1)),
    instagramEngagement: Number(instagramEng.toFixed(1)),
    bestPostViews,
    avgGapDays: Number(avgGap.toFixed(1)),
  };

  const analysisPrompt = `You are a UGC (User-Generated Content) strategist reviewing one creator. Analyze BOTH the overall profile history AND the most recent 7 days. Be specific and actionable for the manager.

CREATOR: ${creator.name} (status: ${creator.status})

OVERALL PROFILE (entire history — ${posts.length} posts over ~${lifespanDays} days):
- Total views: ${fmt(metrics.totalViews)} | Avg views/post: ${fmt(metrics.avgViewsAllTime)} | Best post: ${fmt(bestPostViews)} views
- Typical posting cadence: ~${postsPerWeekAllTime.toFixed(1)} posts/week | Avg gap ${avgGap.toFixed(1)} days | Longest gap ${maxGap} days
- Days since last post: ${daysSinceLastPost}

LAST 7 DAYS:
- ${last7.length} posts | Avg views/post: ${fmt(metrics.avgViewsLast7Days)}

PLATFORM BREAKDOWN (all-time):
- TikTok: ${tiktok.length} posts, ${fmt(sumViews(tiktok))} views, ${tiktokEng.toFixed(1)}% avg engagement
- Instagram: ${instagram.length} posts, ${fmt(sumViews(instagram))} views, ${instagramEng.toFixed(1)}% avg engagement

FORMAT BREAKDOWN:
- Short-form (TikTok/Reels): ${shortForm.length} posts, ${avgEngagement(shortForm).toFixed(1)}% avg engagement
- Long-form (YouTube/other): ${longForm.length} posts, ${avgEngagement(longForm).toFixed(1)}% avg engagement

TOP POSTS (by views):
${topPostsText || 'n/a'}

SYSTEM-DETECTED FLAGS (incorporate and expand, don't just repeat):
- Posting: ${postingPatterns.join(' ') || 'None'}
- Engagement: ${engagementIssues.join(' ') || 'None'}
- Platform: ${platformInsights.join(' ') || 'None'}

RECENT CAPTIONS (judge hashtag/caption quality):
${captionsSample.length ? captionsSample.map((c, i) => `${i + 1}. ${c.slice(0, 200)}`).join('\n') : 'No captions available.'}

Respond as JSON ONLY (no markdown):
{
  "summary": "3-4 sentence overview covering BOTH overall trajectory and the last 7 days, their general posting habits, and what's working (which platform/format/post types perform best)",
  "engagementIssues": ["how engagement looks and where it's weak; explain in plain terms"],
  "postingPatterns": ["their posting schedule/consistency and any concerns"],
  "contentQuality": ["assess hashtags/captions; if good, say so; suggest improvements"],
  "platformInsights": ["TikTok vs Instagram, short vs long-form: what performs best and where to focus"]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: 'You are a UGC performance analyst. Respond with valid JSON only, no markdown, no code fences.' },
        { role: 'user', content: analysisPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const responseText = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('')
        : '';
    let data: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch {
      data = { summary: responseText, engagementIssues: [], postingPatterns: [], contentQuality: [], platformInsights: [] };
    }

    const merge = (a: string[], b: string[]) => Array.from(new Set([...(a || []), ...((b || []).filter(Boolean))]));

    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: data.summary || 'Analysis complete.',
      flags: {
        engagementIssues: merge(engagementIssues, data.engagementIssues),
        postingPatterns: merge(postingPatterns, data.postingPatterns),
        contentQuality: merge([], data.contentQuality),
        platformInsights: merge(platformInsights, data.platformInsights),
      },
      metrics,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('LLM analysis failed:', error);
    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: `Rule-based summary (AI narrative unavailable): ${posts.length} posts all-time, avg ${fmt(metrics.avgViewsAllTime)} views/post, ${last7.length} posts in the last 7 days. ${postingPatterns[0] || ''}`.trim(),
      flags: { engagementIssues, postingPatterns, contentQuality: [], platformInsights },
      metrics,
      generatedAt: new Date(),
    };
  }
}

/**
 * Generate summaries for all creators on the active roster (excludes archived & fired).
 */
export async function generateAllCreatorSummaries(): Promise<CreatorSummary[]> {
  const creators = (await db.listCreators()).filter(c => c.status !== 'fired' && !c.archived);
  const summaries: CreatorSummary[] = [];

  for (const creator of creators) {
    try {
      summaries.push(await generateCreatorSummary(creator.id));
      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (error) {
      console.error(`Failed to generate summary for ${creator.name}:`, error);
    }
  }

  return summaries;
}
