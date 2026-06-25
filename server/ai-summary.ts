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

/**
 * Generate AI-powered daily summary for a creator based on their recent posts
 */
export async function generateCreatorSummary(creatorId: string): Promise<CreatorSummary> {
  // Get creator info
  const creator = await db.getCreator(creatorId);
  if (!creator) {
    throw new Error(`Creator ${creatorId} not found`);
  }

  // Get creator's posts from the last 30 days
  const allPosts = await db.listPosts();
  const creatorPosts = allPosts.filter(p => p.creatorId === creatorId);
  
  // Sort by date (newest first)
  const recentPosts = creatorPosts
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50); // Last 50 posts

  if (recentPosts.length === 0) {
    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: 'No posts found for this creator yet.',
      flags: {
        engagementIssues: [],
        postingPatterns: [],
        contentQuality: [],
        platformInsights: [],
      },
      generatedAt: new Date(),
    };
  }

  // Prepare data for LLM analysis
  const postsData = recentPosts.map(p => ({
    platform: p.platform,
    date: new Date(p.createdAt).toISOString().split('T')[0],
    views: p.views || 0,
    postUrl: p.postUrl,
    reviewStatus: p.reviewStatus,
  }));

  // Calculate metrics
  const tikTokPosts = postsData.filter(p => p.platform === 'tiktok');
  const instagramPosts = postsData.filter(p => p.platform === 'instagram');
  const tikTokViews = tikTokPosts.reduce((sum, p) => sum + p.views, 0);
  const instagramViews = instagramPosts.reduce((sum, p) => sum + p.views, 0);

  // Analyze posting patterns
  const postDates = recentPosts.map(p => new Date(p.createdAt).getTime()).sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 0; i < postDates.length - 1; i++) {
    const gap = Math.floor((postDates[i] - postDates[i + 1]) / (1000 * 60 * 60 * 24));
    gaps.push(gap);
  }

  const maxGap = Math.max(...gaps, 0);
  const avgGap = gaps.length > 0 ? Math.floor(gaps.reduce((a, b) => a + b) / gaps.length) : 0;
  const last7Days = recentPosts.filter(p => {
    const daysSince = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 7;
  });

  // Build analysis prompt
  const analysisPrompt = `You are a UGC (User-Generated Content) expert analyzing creator performance data.

Creator: ${creator.name}
Platforms: ${typeof creator.platforms === 'string' ? creator.platforms : (Array.isArray(creator.platforms) ? (creator.platforms as string[]).join(', ') : 'Unknown')}
Trial Status: ${creator.status === 'trial' ? 'Yes (Trial)' : 'Active'}

RECENT PERFORMANCE DATA (Last 50 posts):
- Total Posts: ${recentPosts.length}
- Posts in Last 7 Days: ${last7Days.length}
- TikTok Posts: ${tikTokPosts.length} (${tikTokViews.toLocaleString()} views)
- Instagram Posts: ${instagramPosts.length} (${instagramViews.toLocaleString()} views)
- Max Days Between Posts: ${maxGap} days
- Average Days Between Posts: ${avgGap} days
- Highest Performing Post: ${Math.max(...postsData.map(p => p.views), 0).toLocaleString()} views
- Average Views Per Post: ${Math.round(postsData.reduce((sum, p) => sum + p.views, 0) / postsData.length).toLocaleString()}

Recent Posts (last 10):
${recentPosts.slice(0, 10).map((p, i) => `${i + 1}. ${new Date(p.createdAt).toLocaleDateString()} - ${p.platform} - ${p.views?.toLocaleString()} views`).join('\n')}

Please provide:
1. A brief 2-3 sentence overall performance summary
2. Engagement analysis (compare TikTok vs Instagram performance, identify which platform is underperforming)
3. Posting pattern flags (check for: 2+ day breaks, more than 1 post per day, less than 5 posts per week)
4. Content quality concerns (suggest if hashtags/captions might need optimization based on engagement patterns)
5. Platform-specific insights and recommendations

Format your response as JSON with this structure:
{
  "summary": "2-3 sentence overall performance summary",
  "engagementIssues": ["issue1", "issue2"],
  "postingPatterns": ["pattern1", "pattern2"],
  "contentQuality": ["concern1", "concern2"],
  "platformInsights": ["insight1", "insight2"]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'You are a UGC performance analyst. Respond with valid JSON only, no markdown formatting.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
    });

    // Parse LLM response
    let analysisData;
    try {
      // Extract JSON from response (in case it has extra text)
      const responseText = typeof response === 'string' ? response : (response as any).message?.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
      analysisData = JSON.parse(jsonStr);
    } catch {
      // Fallback if JSON parsing fails
      const responseText = typeof response === 'string' ? response : (response as any).message?.content || '';
      analysisData = {
        summary: responseText,
        engagementIssues: [],
        postingPatterns: [],
        contentQuality: [],
        platformInsights: [],
      };
    }

    return {
      creatorId,
      creatorName: creator.name || 'Unknown',
      summary: analysisData.summary || 'Analysis complete.',
      flags: {
        engagementIssues: analysisData.engagementIssues || [],
        postingPatterns: analysisData.postingPatterns || [],
        contentQuality: analysisData.contentQuality || [],
        platformInsights: analysisData.platformInsights || [],
      },
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('LLM analysis failed:', error);
    throw new Error(`Failed to generate AI summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate summaries for all creators
 */
export async function generateAllCreatorSummaries(): Promise<CreatorSummary[]> {
  const creators = await db.listCreators();
  const summaries: CreatorSummary[] = [];

  for (const creator of creators) {
    try {
      const summary = await generateCreatorSummary(creator.id);
      summaries.push(summary);
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to generate summary for ${creator.name}:`, error);
    }
  }

  return summaries;
}
