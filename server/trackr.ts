import axios from 'axios';
import * as db from './db';

const TRACKR_BASE_URL = 'https://app.ugctrackr.com/api/external/v1';
const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';

/**
 * Sync posts from UGCTrackr API and update view counts in database
 */
export async function syncTrackrPosts(apiKey?: string): Promise<{ synced: number; errors: string[] }> {
  // Use provided API key or fall back to environment variable
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }
  const errors: string[] = [];
  let synced = 0;

  try {
    // Fetch posts from Trackr API using query parameter
    const response = await axios.get(
      `${TRACKR_BASE_URL}/posts`,
      {
        params: {
          campaign_id: CAMPAIGN_ID,
        },
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const trackrPosts = response.data?.data || [];

    // Get all existing posts from database
    const dbPosts = await db.listPosts();

    // Process each Trackr post
    for (const trackrPost of trackrPosts) {
      try {
        // Try to match by post URL (link field in Trackr)
        const matchedPost = dbPosts.find(p => 
          p.postUrl === trackrPost.link
        );

        if (matchedPost) {
          // Update view count
          const views = trackrPost.views || 0;
          if (views !== matchedPost.views) {
            await db.updatePost(matchedPost.id, { views });
            synced++;
          }
        }
      } catch (error) {
        errors.push(`Failed to sync post ${trackrPost.post_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { synced, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Trackr API sync error:', errorMsg);
    throw new Error(`Trackr API sync failed: ${errorMsg}`);
  }
}

/**
 * Get campaign details from Trackr API
 */
export async function getTrackrCampaignDetails(apiKey?: string) {
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }
  try {
    const response = await axios.get(
      `${TRACKR_BASE_URL}/campaigns/${CAMPAIGN_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data?.data || null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Trackr campaign details error:', errorMsg);
    throw new Error(`Failed to fetch campaign details: ${errorMsg}`);
  }
}

/**
 * Get all posts for the campaign
 */
export async function getTrackrPosts(apiKey?: string) {
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }
  try {
    const response = await axios.get(
      `${TRACKR_BASE_URL}/posts`,
      {
        params: {
          campaign_id: CAMPAIGN_ID,
        },
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data?.data || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Trackr posts fetch error:', errorMsg);
    throw new Error(`Failed to fetch posts: ${errorMsg}`);
  }
}
