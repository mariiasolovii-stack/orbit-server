import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import * as trackr from './trackr';
import * as db from './db';

vi.mock('axios');

const mockTrackrPosts = [
  {
    post_id: 'tp-1',
    campaign_id: '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f',
    username: 'creator1',
    platform: 'tiktok',
    title: 'Test post #fyp',
    link: 'https://www.tiktok.com/@creator1/video/123',
    posted_at: '2026-06-25T10:00:00Z',
    views: 1500,
    likes: 50,
    comments: 5,
    shares: 2,
    saves: 10,
  },
  {
    post_id: 'tp-2',
    campaign_id: '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f',
    username: 'creator2',
    platform: 'instagram',
    title: 'Another test',
    link: 'https://www.instagram.com/p/ABC123/',
    posted_at: '2026-06-25T11:00:00Z',
    views: 2500,
    likes: 100,
    comments: 15,
    shares: 0,
    saves: 25,
  },
];

describe('Trackr Sync Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TRACKR_API_KEY = 'test-key';
  });

  it('requires an API key', async () => {
    delete process.env.TRACKR_API_KEY;
    await expect(trackr.syncTrackrPosts()).rejects.toThrow('API key not configured');
    process.env.TRACKR_API_KEY = 'test-key';
  });

  it('imports new posts and auto-creates creators', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: mockTrackrPosts } });
    // No existing creators or posts
    vi.spyOn(db, 'listCreators').mockResolvedValue([]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([]);
    const createdCreators: any[] = [];
    vi.spyOn(db, 'createCreator').mockImplementation(async (data: any) => {
      const c = { id: `c-${createdCreators.length + 1}`, ...data };
      createdCreators.push(c);
      return c;
    });
    const createdPosts: any[] = [];
    vi.spyOn(db, 'createPost').mockImplementation(async (data: any) => {
      const p = { id: `p-${createdPosts.length + 1}`, ...data };
      createdPosts.push(p);
      return p;
    });

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.fetched).toBe(2);
    expect(result.newPosts).toBe(2);
    expect(result.newCreators).toBe(2);
    expect(result.updatedPosts).toBe(0);
    expect(result.errors).toHaveLength(0);
    // platform normalization
    expect(createdPosts[0].platform).toBe('TikTok');
    expect(createdPosts[1].platform).toBe('Instagram');
    // engagement captured
    expect(createdPosts[0].views).toBe(1500);
    expect(createdPosts[0].likes).toBe(50);
    // Trackr-synced posts are auto-approved (already live/verified)
    expect(createdPosts[0].reviewStatus).toBe('approved');
    expect(createdPosts[1].reviewStatus).toBe('approved');
  });

  it('updates existing posts matched by trackr post id', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: [mockTrackrPosts[0]] } });
    vi.spyOn(db, 'listCreators').mockResolvedValue([
      { id: 'c-1', name: 'creator1', tiktokHandle: 'creator1', instagramHandle: null } as any,
    ]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([
      { id: 'p-1', creatorId: 'c-1', postUrl: mockTrackrPosts[0].link, trackrPostId: 'tp-1', views: 1000, likes: 10, comments: 0, shares: 0, saves: 0 } as any,
    ]);
    const updates: any[] = [];
    vi.spyOn(db, 'updatePost').mockImplementation(async (id: string, data: any) => {
      updates.push({ id, data });
      return { id, ...data } as any;
    });
    const createPostSpy = vi.spyOn(db, 'createPost');
    const createCreatorSpy = vi.spyOn(db, 'createCreator');

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.fetched).toBe(1);
    expect(result.updatedPosts).toBe(1);
    expect(result.newPosts).toBe(0);
    expect(result.newCreators).toBe(0);
    expect(createPostSpy).not.toHaveBeenCalled();
    expect(createCreatorSpy).not.toHaveBeenCalled();
    expect(updates[0].data.views).toBe(1500);
  });

  it('marks unchanged posts when metrics are identical', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: [mockTrackrPosts[0]] } });
    vi.spyOn(db, 'listCreators').mockResolvedValue([
      { id: 'c-1', name: 'creator1', tiktokHandle: 'creator1', instagramHandle: null } as any,
    ]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([
      { id: 'p-1', creatorId: 'c-1', postUrl: mockTrackrPosts[0].link, trackrPostId: 'tp-1', views: 1500, likes: 50, comments: 5, shares: 2, saves: 10 } as any,
    ]);
    const updateSpy = vi.spyOn(db, 'updatePost');

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.unchanged).toBe(1);
    expect(result.updatedPosts).toBe(0);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('collects per-post errors without failing the whole sync', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: mockTrackrPosts } });
    vi.spyOn(db, 'listCreators').mockResolvedValue([]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([]);
    vi.spyOn(db, 'createCreator').mockResolvedValue({ id: 'c-1' } as any);
    // First createPost fails, second succeeds
    let call = 0;
    vi.spyOn(db, 'createPost').mockImplementation(async (data: any) => {
      call++;
      if (call === 1) throw new Error('DB write failed');
      return { id: 'p-2', ...data } as any;
    });

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.fetched).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Failed to sync post');
  });

  it('skips creators that are archived with syncing disabled', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: [mockTrackrPosts[0]] } });
    // creator1 exists but has syncEnabled = 0 (archived + opted out)
    vi.spyOn(db, 'listCreators').mockResolvedValue([
      { id: 'c-1', name: 'creator1', tiktokHandle: 'creator1', instagramHandle: null, syncEnabled: 0 } as any,
    ]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([]);
    const createPostSpy = vi.spyOn(db, 'createPost');
    const updatePostSpy = vi.spyOn(db, 'updatePost');

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.unchanged).toBe(1);
    expect(result.newPosts).toBe(0);
    expect(result.updatedPosts).toBe(0);
    expect(createPostSpy).not.toHaveBeenCalled();
    expect(updatePostSpy).not.toHaveBeenCalled();
  });

  it('still syncs fired-but-not-archived creators (syncEnabled = 1)', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: [mockTrackrPosts[0]] } });
    vi.spyOn(db, 'listCreators').mockResolvedValue([
      { id: 'c-1', name: 'creator1', tiktokHandle: 'creator1', instagramHandle: null, status: 'fired', syncEnabled: 1 } as any,
    ]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([
      { id: 'p-1', creatorId: 'c-1', postUrl: mockTrackrPosts[0].link, trackrPostId: 'tp-1', views: 1000, likes: 10, comments: 0, shares: 0, saves: 0 } as any,
    ]);
    vi.spyOn(db, 'updatePost').mockResolvedValue({} as any);

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.updatedPosts).toBe(1);
  });

  it('matches creators by handle even when @ was entered (normalized)', async () => {
    (axios.get as any).mockResolvedValue({ data: { data: [mockTrackrPosts[0]] } });
    // stored handle has a leading @ but should still match 'creator1'
    vi.spyOn(db, 'listCreators').mockResolvedValue([
      { id: 'c-1', name: 'Some Name', tiktokHandle: '@creator1', instagramHandle: null, syncEnabled: 1 } as any,
    ]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([]);
    const createCreatorSpy = vi.spyOn(db, 'createCreator');
    vi.spyOn(db, 'createPost').mockResolvedValue({ id: 'p-1' } as any);

    const result = await trackr.syncTrackrPosts('test-key');

    expect(result.newCreators).toBe(0);
    expect(createCreatorSpy).not.toHaveBeenCalled();
    expect(result.newPosts).toBe(1);
  });

  it('uses the correct campaign id and endpoint', async () => {
    const getSpy = (axios.get as any).mockResolvedValue({ data: { data: [] } });
    vi.spyOn(db, 'listCreators').mockResolvedValue([]);
    vi.spyOn(db, 'listPosts').mockResolvedValue([]);

    await trackr.syncTrackrPosts('test-key');

    expect(getSpy).toHaveBeenCalledWith(
      'https://app.ugctrackr.com/api/external/v1/posts',
      expect.objectContaining({
        params: expect.objectContaining({ campaign_id: '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f', limit: '200' }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      })
    );
  });
});
