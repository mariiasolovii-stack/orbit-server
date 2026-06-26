import { invokeLLM } from './_core/llm';
import * as db from './db';

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
  generatedAt: Date;
}

function platformMatches(value: string | null | undefined, target: 'tiktok' | 'instagram'): boolean {
  const p = (value || '').toLowerCase();
  if (target === 'tiktok') return p.includes('tiktok');
  return p.includes('instagram') || p === 'ig';
}

function engagementRate(views: number, likes: number, comments: number, shares: number, saves: number): number {
  if (!views) return 0;
  return ((likes + comments + shares + saves) / views) * 100;
}

/**
 * Generate AI-powered daily summary for a creator based on their recent posts.
 * Combines deterministic rule-based flags with an LLM narrative.
 */
export async function generateCreatorSummary(creatorId: string): Promise<CreatorSummary> {
  const creator = await db.getCreator(creatorId);
  if (!creator) {
    throw new Error(`Creator ${creatorId} not found`);
  }

  const allPosts = await db.listPosts();
  const creatorPosts = allPosts.filter(p => p.creatorId === creatorId);

  // Sort by post date (newest first), fall back to createdAt
  const recentPosts = creatorPosts
    .sort((a, b) => {
      const da = new Date(a.postDate || a.createdAt).getTime();
      const dbb = new Date(b.postDate || b.createdAt).getTime();
      return dbb - da;
    })
    .slice(0, 50);

  if (recentPosts.length === 0) {
    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: 'No posts found for this creator yet. Once posts are synced from Trackr, a performance analysis will be generated.',
      flags: { engagementIssues: [], postingPatterns: [], contentQuality: [], platformInsights: [] },
      generatedAt: new Date(),
    };
  }

  // ---- Platform split (case-insensitive) ----
  const tikTokPosts = recentPosts.filter(p => platformMatches(p.platform, 'tiktok'));
  const instagramPosts = recentPosts.filter(p => platformMatches(p.platform, 'instagram'));
  const sumViews = (arr: typeof recentPosts) => arr.reduce((s, p) => s + (p.views || 0), 0);
  const tikTokViews = sumViews(tikTokPosts);
  const instagramViews = sumViews(instagramPosts);

  const avgEng = (arr: typeof recentPosts) => {
    if (arr.length === 0) return 0;
    const total = arr.reduce((s, p) => s + engagementRate(p.views || 0, p.likes || 0, p.comments || 0, p.shares || 0, p.saves || 0), 0);
    return total / arr.length;
  };
  const tikTokEng = avgEng(tikTokPosts);
  const instagramEng = avgEng(instagramPosts);

  // ---- Posting cadence analysis ----
  const postDates = recentPosts
    .map(p => new Date(p.postDate || p.createdAt).getTime())
    .sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 0; i < postDates.length - 1; i++) {
    gaps.push(Math.floor((postDates[i] - postDates[i + 1]) / (1000 * 60 * 60 * 24)));
  }
  const maxGap = Math.max(...gaps, 0);
  const avgGap = gaps.length > 0 ? (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

  const now = Date.now();
  const last7Days = recentPosts.filter(p => (now - new Date(p.postDate || p.createdAt).getTime()) / (1000 * 60 * 60 * 24) <= 7);

  // Posts per calendar day (to detect >1/day)
  const postsByDay = new Map<string, number>();
  for (const p of recentPosts) {
    const day = new Date(p.postDate || p.createdAt).toISOString().split('T')[0];
    postsByDay.set(day, (postsByDay.get(day) || 0) + 1);
  }
  const daysWithMultiplePosts = Array.from(postsByDay.entries()).filter(([, n]) => n > 1);
  const daysSinceLastPost = postDates.length ? Math.floor((now - postDates[0]) / (1000 * 60 * 60 * 24)) : 999;

  // ---- Deterministic flags ----
  const postingPatterns: string[] = [];
  if (last7Days.length < 5) {
    postingPatterns.push(`Only ${last7Days.length} post(s) in the last 7 days (target: 5+).`);
  }
  if (maxGap >= 2) {
    postingPatterns.push(`Took a ${maxGap}-day break between posts (2+ day gap detected).`);
  }
  if (daysSinceLastPost >= 2) {
    postingPatterns.push(`No new post in ${daysSinceLastPost} days.`);
  }
  if (daysWithMultiplePosts.length > 0) {
    postingPatterns.push(`Posted more than once on ${daysWithMultiplePosts.length} day(s) — consider spacing posts out.`);
  }

  const engagementIssues: string[] = [];
  const lowEngagementPosts = recentPosts.filter(p => (p.views || 0) >= 500 && engagementRate(p.views || 0, p.likes || 0, p.comments || 0, p.shares || 0, p.saves || 0) < 3);
  if (lowEngagementPosts.length > 0) {
    engagementIssues.push(`${lowEngagementPosts.length} post(s) have engagement under 3% — likes/comments are low relative to views.`);
  }

  const platformInsights: string[] = [];
  if (tikTokPosts.length > 0 && instagramPosts.length > 0) {
    if (tikTokEng > instagramEng * 1.5) {
      platformInsights.push(`Instagram engagement (${instagramEng.toFixed(1)}%) is much lower than TikTok (${tikTokEng.toFixed(1)}%) — optimize IG.`);
    } else if (instagramEng > tikTokEng * 1.5) {
      platformInsights.push(`TikTok engagement (${tikTokEng.toFixed(1)}%) is much lower than Instagram (${instagramEng.toFixed(1)}%) — optimize TikTok.`);
    }
  }
  if (tikTokPosts.length === 0 && instagramPosts.length > 0) {
    platformInsights.push('No TikTok posts detected — creator may not be spending time on TikTok.');
  }
  if (instagramPosts.length === 0 && tikTokPosts.length > 0) {
    platformInsights.push('No Instagram posts detected — creator may not be spending time on Instagram.');
  }

  // ---- Content quality signal (captions) ----
  const captionsSample = recentPosts
    .slice(0, 10)
    .map(p => p.title)
    .filter((t): t is string => !!t && t.trim().length > 0);

  // ---- Build LLM prompt with rich data ----
  const analysisPrompt = `You are a UGC (User-Generated Content) expert analyzing a creator's recent performance.

Creator: ${creator.name}
Status: ${creator.status === 'trial' ? 'Trial' : creator.status === 'active' ? 'Active' : creator.status}

PERFORMANCE (last ${recentPosts.length} posts):
- Posts in last 7 days: ${last7Days.length}
- TikTok: ${tikTokPosts.length} posts, ${tikTokViews.toLocaleString()} views, ${tikTokEng.toFixed(1)}% avg engagement
- Instagram: ${instagramPosts.length} posts, ${instagramViews.toLocaleString()} views, ${instagramEng.toFixed(1)}% avg engagement
- Max gap between posts: ${maxGap} days | Avg gap: ${avgGap.toFixed(1)} days
- Days since last post: ${daysSinceLastPost}
- Best post: ${Math.max(...recentPosts.map(p => p.views || 0), 0).toLocaleString()} views
- Avg views/post: ${Math.round(sumViews(recentPosts) / recentPosts.length).toLocaleString()}

SYSTEM-DETECTED FLAGS (already computed, incorporate and expand on these):
- Posting: ${postingPatterns.length ? postingPatterns.join(' ') : 'None'}
- Engagement: ${engagementIssues.length ? engagementIssues.join(' ') : 'None'}
- Platform: ${platformInsights.length ? platformInsights.join(' ') : 'None'}

RECENT CAPTIONS (evaluate hashtags/caption quality):
${captionsSample.length ? captionsSample.map((c, i) => `${i + 1}. ${c.slice(0, 200)}`).join('\n') : 'No captions available.'}

Provide a concise analysis. Respond as JSON ONLY:
{
  "summary": "2-3 sentence overall performance summary for the manager",
  "engagementIssues": ["..."],
  "postingPatterns": ["..."],
  "contentQuality": ["flag weak/missing hashtags or captions; if captions look good, say so"],
  "platformInsights": ["TikTok vs IG comparison and recommendations"]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: 'You are a UGC performance analyst. Respond with valid JSON only, no markdown.' },
        { role: 'user', content: analysisPrompt },
      ],
    });

    const responseText = typeof response === 'string' ? response : (response as any).message?.content || '';
    let analysisData: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      analysisData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch {
      analysisData = { summary: responseText, engagementIssues: [], postingPatterns: [], contentQuality: [], platformInsights: [] };
    }

    // Merge deterministic flags with LLM flags (dedupe)
    const merge = (a: string[], b: string[]) => Array.from(new Set([...(a || []), ...(b || [])]));

    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: analysisData.summary || 'Analysis complete.',
      flags: {
        engagementIssues: merge(engagementIssues, analysisData.engagementIssues),
        postingPatterns: merge(postingPatterns, analysisData.postingPatterns),
        contentQuality: merge([], analysisData.contentQuality),
        platformInsights: merge(platformInsights, analysisData.platformInsights),
      },
      generatedAt: new Date(),
    };
  } catch (error) {
    // If the LLM fails, still return deterministic flags so the manager gets value
    console.error('LLM analysis failed:', error);
    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: `Rule-based summary (AI narrative unavailable): ${recentPosts.length} posts analyzed, ${last7Days.length} in the last 7 days. ${postingPatterns[0] || ''}`.trim(),
      flags: {
        engagementIssues,
        postingPatterns,
        contentQuality: [],
        platformInsights,
      },
      generatedAt: new Date(),
    };
  }
}

/**
 * Generate summaries for all (non-fired) creators sequentially.
 */
export async function generateAllCreatorSummaries(): Promise<CreatorSummary[]> {
  const creators = (await db.listCreators()).filter(c => c.status !== 'fired');
  const summaries: CreatorSummary[] = [];

  for (const creator of creators) {
    try {
      summaries.push(await generateCreatorSummary(creator.id));
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to generate summary for ${creator.name}:`, error);
    }
  }

  return summaries;
}
