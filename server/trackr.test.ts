import { describe, it, expect } from 'vitest';

describe('Trackr API Integration', () => {
  const campaignId = '0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f';
  const apiKey = process.env.TRACKR_API_KEY;
  const baseUrl = 'https://app.ugctrackr.com/api/external/v1';

  it('should have Trackr API key configured', () => {
    expect(apiKey).toBeDefined();
    expect(apiKey?.length).toBeGreaterThan(0);
  });

  it('should format bearer token correctly', () => {
    const bearerToken = `Bearer ${apiKey}`;
    expect(bearerToken).toMatch(/^Bearer /);
    expect(bearerToken.length).toBeGreaterThan(7);
  });

  it('should have valid campaign ID format', () => {
    expect(campaignId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should construct valid API endpoint URL', () => {
    const endpoint = `${baseUrl}/campaigns/${campaignId}/posts`;
    expect(endpoint).toContain('https://');
    expect(endpoint).toContain('/campaigns/');
    expect(endpoint).toContain('/posts');
  });

  it('should validate API request headers', () => {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    expect(headers['Authorization']).toBeDefined();
    expect(headers['Authorization']).toMatch(/^Bearer /);
    expect(headers['Content-Type']).toBe('application/json');
  });
});
