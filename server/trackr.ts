import axios from 'axios';
import * as db from './db';

const TRACKR_BASE_URL = 'https://app.ugctrackr.com/api/external/v1';
const CAMPAIGN_ID = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';

export interface TrackrPost {
  post_id: string;
  campaign_id: string;
  username: string;
  platform: string;
  title: string;
  link: string;
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface SyncResult {
  fetched: number;       // total posts returned by Trackr
  newPosts: number;      // posts created
  updatedPosts: number;  // existing posts updated
  newCreators: number;   // creators auto-created
  unchanged: number;     // posts that matched but had no changes
  errors: string[];
}

/**
 * Fetch all posts for the campaign from the Trackr API.
 */
export async function getTrackrPosts(apiKey?: string): Promise<TrackrPost[]> {
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }
  const response = await axios.get(`${TRACKR_BASE_URL}/posts`, {
    params: { campaign_id: CAMPAIGN_ID },
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data?.data || [];
}

/**
 * Normalize a platform string to a consistent display value.
 */
function normalizePlatform(platform: string): string {
  const p = (platform || '').toLowerCase();
  if (p.includes('tiktok')) return 'TikTok';
  if (p.includes('instagram') || p.includes('ig')) return 'Instagram';
  if (p.includes('youtube') || p.includes('yt')) return 'YouTube';
  return platform || 'Unknown';
}

/**
 * Sync posts from UGCTrackr API: import new posts, auto-create creators,
 * and update view/engagement counts on existing posts.
 */
export async function syncTrackrPosts(apiKey?: string): Promise<SyncResult> {
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }

  const result: SyncResult = {
    fetched: 0,
    newPosts: 0,
    updatedPosts: 0,
    newCreators: 0,
    unchanged: 0,
    errors: [],
  };

  let trackrPosts: TrackrPost[] = [];
  try {
    trackrPosts = await getTrackrPosts(key);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Trackr API sync failed: ${errorMsg}`);
  }

  result.fetched = trackrPosts.length;

  // Load existing data once
  const existingCreators = await db.listCreators();
  const existingPosts = await db.listPosts();

  // Build lookup maps. Match creators by tiktok/instagram handle OR name (username).
  const creatorByHandle = new Map<string, string>(); // lowercase handle/name -> creatorId
  for (const c of existingCreators) {
    if (c.name) creatorByHandle.set(c.name.toLowerCase(), c.id);
    if (c.tiktokHandle) creatorByHandle.set(c.tiktokHandle.toLowerCase().replace(/^@/, ''), c.id);
    if (c.instagramHandle) creatorByHandle.set(c.instagramHandle.toLowerCase().replace(/^@/, ''), c.id);
  }

  // Posts can be matched by trackrPostId first, then by URL.
  const postByTrackrId = new Map<string, typeof existingPosts[number]>();
  const postByUrl = new Map<string, typeof existingPosts[number]>();
  for (const p of existingPosts) {
    if (p.trackrPostId) postByTrackrId.set(p.trackrPostId, p);
    if (p.postUrl) postByUrl.set(p.postUrl, p);
  }

  // Cache of newly created creators within this run (avoid dup creation)
  const createdCreatorIds = new Map<string, string>(); // username lower -> id

  for (const tp of trackrPosts) {
    try {
      const usernameKey = (tp.username || '').toLowerCase().replace(/^@/, '');
      const platform = normalizePlatform(tp.platform);

      // 1. Resolve or create the creator
      let creatorId = creatorByHandle.get(usernameKey) || createdCreatorIds.get(usernameKey);
      if (!creatorId) {
        const platformField = platform === 'TikTok'
          ? { tiktokHandle: tp.username }
          : platform === 'Instagram'
            ? { instagramHandle: tp.username }
            : {};
        const newCreator = await db.createCreator({
          name: tp.username,
          email: null,
          status: 'trial',
          compType: 'ppp',
          baseRate: 25,
          retainerAmount: 0,
          platforms: JSON.stringify([platform]),
          tiktokHandle: null,
          instagramHandle: null,
          startDate: null,
          docusignStatus: 'pending',
          docusignEnvelopeId: null,
          notes: 'Auto-created from Trackr sync',
          ...platformField,
        } as any);
        creatorId = newCreator.id;
        createdCreatorIds.set(usernameKey, creatorId);
        creatorByHandle.set(usernameKey, creatorId);
        result.newCreators++;
      }

      // 2. Resolve existing post (by trackr id, then url)
      const existing = postByTrackrId.get(tp.post_id) || postByUrl.get(tp.link);

      const postedAt = tp.posted_at ? new Date(tp.posted_at) : new Date();
      const engagement = {
        views: tp.views || 0,
        likes: tp.likes || 0,
        comments: tp.comments || 0,
        shares: tp.shares || 0,
        saves: tp.saves || 0,
        title: tp.title || null,
        trackrPostId: tp.post_id,
      };

      if (existing) {
        // Update if any engagement metric changed
        const changed =
          existing.views !== engagement.views ||
          existing.likes !== engagement.likes ||
          existing.comments !== engagement.comments ||
          existing.shares !== engagement.shares ||
          existing.saves !== engagement.saves ||
          !existing.trackrPostId;

        if (changed) {
          await db.updatePost(existing.id, engagement as any);
          result.updatedPosts++;
        } else {
          result.unchanged++;
        }
      } else {
        // Create a new post
        await db.createPost({
          creatorId,
          platform,
          postDate: postedAt,
          postUrl: tp.link,
          reviewStatus: 'pending',
          isTrialPost: 0,
          lastPaidTier: 0,
          notes: null,
          ...engagement,
        } as any);
        result.newPosts++;
      }
    } catch (error) {
      result.errors.push(
        `Failed to sync post ${tp.post_id} (${tp.username}): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return result;
}

/**
 * Get campaign details from Trackr API.
 */
export async function getTrackrCampaignDetails(apiKey?: string) {
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }
  const response = await axios.get(`${TRACKR_BASE_URL}/campaigns/${CAMPAIGN_ID}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data?.data || null;
}
