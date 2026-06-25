import axios from 'axios';
import * as db from './db';

const TRACKR_BASE_URL = 'https://app.ugctrackr.com/api/external/v1';
const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';

/**
 * Sync posts from UGCTrackr API and update view counts in database
 */
export async function syncTrackrPosts(apiKey: string): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    // Fetch posts from Trackr API
    const response = await axios.get(
      `${TRACKR_BASE_URL}/campaigns/${CAMPAIGN_ID}/posts`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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
        // Try to match by post URL or external ID
        const matchedPost = dbPosts.find(p => 
          p.postUrl === trackrPost.post_url || 
          p.id === trackrPost.external_id
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
        errors.push(`Failed to sync post ${trackrPost.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { synced, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Trackr API sync failed: ${errorMsg}`);
  }
}

/**
 * Get campaign details from Trackr API
 */
export async function getTrackrCampaignDetails(apiKey: string) {
  try {
    const response = await axios.get(
      `${TRACKR_BASE_URL}/campaigns/${CAMPAIGN_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data?.data || null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch campaign details: ${errorMsg}`);
  }
}
