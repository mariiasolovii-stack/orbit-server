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
 * Fetch ALL posts for the campaign from the Trackr API using cursor-based
 * pagination (limit=200 per page, following next_cursor until exhausted).
 */
export async function getTrackrPosts(apiKey?: string): Promise<TrackrPost[]> {
  const key = apiKey || process.env.TRACKR_API_KEY;
  if (!key) {
    throw new Error('Trackr API key not configured');
  }

  const all: TrackrPost[] = [];
  let cursor: string | null = null;

  while (true) {
    const params: Record<string, string> = {
      campaign_id: CAMPAIGN_ID,
      limit: '200',
    };
    if (cursor) params.cursor = cursor;

    const response = await axios.get(`${TRACKR_BASE_URL}/posts`, {
      params,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    const posts: TrackrPost[] = response.data?.data || [];
    all.push(...posts);

    // The API returns meta.next_cursor when there are more pages.
    const nextCursor = response.data?.meta?.next_cursor;
    if (!nextCursor || posts.length === 0) break;
    cursor = nextCursor;
  }

  return all;
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
 * Build a crosspost-group key: same creator + same title (trimmed, lowercased)
 * + same calendar day. When a video is posted to both TikTok and Instagram on
 * the same day with the same caption, they share this key and only the
 * HIGHEST-VIEW version is used for payout (one $20 base per original video).
 */
function crosspostKey(username: string, title: string, postedAt: Date): string {
  const day = postedAt.toISOString().slice(0, 10); // YYYY-MM-DD
  const t = (title || '').trim().toLowerCase().slice(0, 80); // first 80 chars of caption
  return `${username.toLowerCase()}|${day}|${t}`;
}

/**
 * Deduplicate a list of Trackr posts so that crossposted videos (same creator,
 * same caption, same day on TikTok + Instagram) are collapsed to ONE entry —
 * the one with the highest view count. The other entries are kept in the
 * returned map so we can still store them in the DB but mark them as
 * crosspost duplicates (they won't earn a second $20 base).
 *
 * Returns:
 *   primaryByKey   – Map<crosspostKey, TrackrPost>  (the canonical/highest-view post)
 *   duplicateIds   – Set<string>                    (post_ids that are crosspost dupes)
 */
export function deduplicateCrossposts(posts: TrackrPost[]): {
  primaryByKey: Map<string, TrackrPost>;
  duplicateIds: Set<string>;
} {
  const primaryByKey = new Map<string, TrackrPost>();
  const keyForPost = new Map<string, string>(); // post_id -> crosspostKey

  for (const p of posts) {
    const postedAt = p.posted_at ? new Date(p.posted_at) : new Date();
    const key = crosspostKey(p.username, p.title, postedAt);
    keyForPost.set(p.post_id, key);

    const existing = primaryByKey.get(key);
    if (!existing || (p.views || 0) > (existing.views || 0)) {
      primaryByKey.set(key, p);
    }
  }

  const duplicateIds = new Set<string>();
  for (const p of posts) {
    const key = keyForPost.get(p.post_id)!;
    const primary = primaryByKey.get(key)!;
    if (primary.post_id !== p.post_id) {
      duplicateIds.add(p.post_id);
    }
  }

  return { primaryByKey, duplicateIds };
}

/**
 * Sync posts from UGCTrackr API: import new posts, auto-create creators,
 * update view/engagement counts on existing posts, and deduplicate crossposts
 * so a video posted to both TikTok and Instagram only earns one $20 base.
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

  // Identify crosspost duplicates before any DB writes.
  const { duplicateIds } = deduplicateCrossposts(trackrPosts);

  // Load existing data once
  const existingCreators = await db.listCreators();
  const existingPosts = await db.listPosts();

  // Build lookup maps. Match creators by tiktok/instagram handle OR name (username).
  const creatorByHandle = new Map<string, string>(); // lowercase handle/name -> creatorId
  // Track which creators have syncing disabled (archived + opted out)
  const syncDisabled = new Set<string>(); // creatorId
  for (const c of existingCreators) {
    if ((c as any).syncEnabled === 0) syncDisabled.add(c.id);
    const name = db.normalizeHandle(c.name);
    const tt = db.normalizeHandle(c.tiktokHandle);
    const ig = db.normalizeHandle(c.instagramHandle);
    if (name) creatorByHandle.set(name.toLowerCase(), c.id);
    if (tt) creatorByHandle.set(tt.toLowerCase(), c.id);
    if (ig) creatorByHandle.set(ig.toLowerCase(), c.id);
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
      const usernameKey = (db.normalizeHandle(tp.username) || '').toLowerCase();
      const platform = normalizePlatform(tp.platform);
      const isCrosspostDuplicate = duplicateIds.has(tp.post_id);

      // 1. Resolve or create the creator
      let creatorId = creatorByHandle.get(usernameKey) || createdCreatorIds.get(usernameKey);

      // If this creator exists but has syncing disabled (archived + opted out), skip entirely.
      if (creatorId && syncDisabled.has(creatorId)) {
        result.unchanged++;
        continue;
      }

      if (!creatorId) {
        const cleanUsername = db.normalizeHandle(tp.username);
        const platformField = platform === 'TikTok'
          ? { tiktokHandle: cleanUsername }
          : platform === 'Instagram'
            ? { instagramHandle: cleanUsername }
            : {};
        const newCreator = await db.createCreator({
          name: cleanUsername || tp.username,
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
        // Mark crosspost duplicates so payout logic can skip the $20 base for them.
        // They are still stored for view tracking, but won't earn a second base payment.
        isCrosspostDuplicate: isCrosspostDuplicate ? 1 : 0,
      };

      if (existing) {
        // Update if any engagement metric changed OR if the post is attributed
        // to the wrong creator (e.g. a ghost that was later merged).
        const creatorMismatch = existing.creatorId !== creatorId;
        const changed =
          creatorMismatch ||
          existing.views !== engagement.views ||
          existing.likes !== engagement.likes ||
          existing.comments !== engagement.comments ||
          existing.shares !== engagement.shares ||
          existing.saves !== engagement.saves ||
          !existing.trackrPostId;

        if (changed) {
          await db.updatePost(existing.id, {
            ...engagement,
            ...(creatorMismatch ? { creatorId } : {}),
          } as any);
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
          // Trackr-synced posts are already live/verified on the platform,
          // so auto-approve them (manual posts still default to 'pending').
          reviewStatus: 'approved',
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
