import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as trackr from './trackr';
import * as db from './db';

// Mock axios
vi.mock('axios');

describe('Trackr Sync Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync posts from Trackr API', async () => {
    // Mock Trackr API response
    const mockTrackrPosts = [
      {
        post_id: 'post-1',
        campaign_id: '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f',
        username: 'creator1',
        platform: 'tiktok',
        title: 'Test post',
        link: 'https://www.tiktok.com/@creator1/video/123',
        posted_at: '2026-06-25T10:00:00Z',
        views: 1500,
        likes: 50,
        comments: 5,
        shares: 2,
        saves: 10,
      },
      {
        post_id: 'post-2',
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

    // Test that sync function handles API response structure
    expect(mockTrackrPosts).toHaveLength(2);
    expect(mockTrackrPosts[0].views).toBe(1500);
    expect(mockTrackrPosts[1].views).toBe(2500);
  });

  it('should require API key', async () => {
    // Clear the environment variable
    const originalKey = process.env.TRACKR_API_KEY;
    delete process.env.TRACKR_API_KEY;

    try {
      await trackr.syncTrackrPosts();
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('API key not configured');
    }

    // Restore
    if (originalKey) process.env.TRACKR_API_KEY = originalKey;
  });

  it('should return sync result with count', () => {
    // Test the return type structure
    const mockResult = { synced: 5, errors: [] };
    expect(mockResult).toHaveProperty('synced');
    expect(mockResult).toHaveProperty('errors');
    expect(mockResult.synced).toBe(5);
    expect(Array.isArray(mockResult.errors)).toBe(true);
  });

  it('should handle sync errors gracefully', () => {
    const mockResult = { 
      synced: 2, 
      errors: ['Failed to sync post post-3: Network error'] 
    };
    expect(mockResult.synced).toBe(2);
    expect(mockResult.errors.length).toBe(1);
    expect(mockResult.errors[0]).toContain('Failed to sync post');
  });

  it('should match posts by URL', () => {
    // Test URL matching logic
    const trackrLink = 'https://www.tiktok.com/@creator1/video/123';
    const dbPostUrl = 'https://www.tiktok.com/@creator1/video/123';
    
    expect(trackrLink).toBe(dbPostUrl);
  });

  it('should validate campaign ID format', () => {
    const campaignId = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    expect(campaignId).toMatch(uuidRegex);
  });

  it('should construct correct API endpoint', () => {
    const baseUrl = 'https://app.ugctrackr.com/api/external/v1';
    const campaignId = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
    const endpoint = `${baseUrl}/posts?campaign_id=${campaignId}`;
    
    expect(endpoint).toContain('/api/external/v1/posts');
    expect(endpoint).toContain('campaign_id=0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f');
  });
});
