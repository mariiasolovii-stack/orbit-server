/**
 * Tests for the dual-platform payout model.
 *
 * Rules:
 * - $20 base ONLY if video was posted on both TikTok AND Instagram.
 * - Bonus = highest tier reached by the HIGHER view count across both platforms.
 * - Single-platform videos earn $0.
 * - lastPaidTier is stored on the primary post; retroactive diff is owed.
 */
import { describe, it, expect } from 'vitest';
import {
  calcGroupPayout,
  totalEarnedForGroup,
  groupPostsByGroupId,
  resolveGroup,
  BASE_RATE,
  BONUS_TIERS,
} from './routers';

// ── Helper factories ─────────────────────────────────────────────────────────

function makePost(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'post-1',
    creatorId: overrides.creatorId ?? 'creator-1',
    platform: overrides.platform ?? 'TikTok',
    views: overrides.views ?? 1000,
    reviewStatus: overrides.reviewStatus ?? 'approved',
    isCrosspostDuplicate: overrides.isCrosspostDuplicate ?? 0,
    lastPaidTier: overrides.lastPaidTier ?? 0,
    crosspostGroupId: overrides.crosspostGroupId ?? 'group-1',
    postDate: overrides.postDate ?? new Date('2026-06-15'),
    ...overrides,
  };
}

// ── totalEarnedForGroup ──────────────────────────────────────────────────────

describe('totalEarnedForGroup', () => {
  it('returns 0 when hasBothPlatforms is false', () => {
    expect(totalEarnedForGroup(50000, false)).toBe(0);
  });

  it('returns 0 when views below MIN_QUALIFYING_VIEWS', () => {
    expect(totalEarnedForGroup(200, true)).toBe(0);
  });

  it('returns $20 base with no bonus for 300-9999 views', () => {
    expect(totalEarnedForGroup(300, true)).toBe(20);
    expect(totalEarnedForGroup(9999, true)).toBe(20);
  });

  it('returns $20 + $10 bonus at 10k views', () => {
    expect(totalEarnedForGroup(10000, true)).toBe(30);
  });

  it('returns $20 + $50 bonus at 25k views', () => {
    expect(totalEarnedForGroup(25000, true)).toBe(70);
  });

  it('returns $20 + $150 bonus at 50k views', () => {
    expect(totalEarnedForGroup(50000, true)).toBe(170);
  });

  it('returns $20 + $300 bonus at 100k views', () => {
    expect(totalEarnedForGroup(100000, true)).toBe(320);
  });

  it('returns $20 + $400 bonus at 250k views', () => {
    expect(totalEarnedForGroup(250000, true)).toBe(420);
  });

  it('returns $20 + $500 bonus at 1M views', () => {
    expect(totalEarnedForGroup(1000000, true)).toBe(520);
  });

  it('returns $20 + $1000 bonus at 1.5M views', () => {
    expect(totalEarnedForGroup(1500000, true)).toBe(1020);
  });

  it('returns $20 + $1500 bonus at 5M views', () => {
    expect(totalEarnedForGroup(5000000, true)).toBe(1520);
  });
});

// ── calcGroupPayout ──────────────────────────────────────────────────────────

describe('calcGroupPayout', () => {
  it('returns $0 for a single-platform video (TikTok only)', () => {
    const primary = makePost({ platform: 'TikTok', views: 50000 });
    const { amount, hasBothPlatforms } = calcGroupPayout(primary, null);
    expect(amount).toBe(0);
    expect(hasBothPlatforms).toBe(false);
  });

  it('returns $0 for a single-platform video (Instagram only)', () => {
    const primary = makePost({ platform: 'Instagram', views: 50000 });
    const { amount } = calcGroupPayout(primary, null);
    expect(amount).toBe(0);
  });

  it('returns $20 base for a dual-platform video with 300+ views', () => {
    const primary = makePost({ platform: 'TikTok', views: 500 });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 400, isCrosspostDuplicate: 1 });
    const { amount, hasBothPlatforms } = calcGroupPayout(primary, dup);
    expect(hasBothPlatforms).toBe(true);
    expect(amount).toBe(20);
  });

  it('uses the HIGHER view count for bonus calculation', () => {
    // TikTok: 8k views (below 10k tier), Instagram: 30k views (25k tier = +$50)
    const primary = makePost({ platform: 'TikTok', views: 8000 });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 30000, isCrosspostDuplicate: 1 });
    const { amount, maxViews, hasBothPlatforms } = calcGroupPayout(primary, dup);
    expect(hasBothPlatforms).toBe(true);
    expect(maxViews).toBe(30000);
    expect(amount).toBe(70); // $20 base + $50 bonus
  });

  it('uses the HIGHER view count even when primary has fewer views', () => {
    // Primary (TikTok): 5k, Duplicate (Instagram): 200k (100k tier = +$300)
    const primary = makePost({ platform: 'TikTok', views: 5000 });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 200000, isCrosspostDuplicate: 1 });
    const { amount, maxViews } = calcGroupPayout(primary, dup);
    expect(maxViews).toBe(200000);
    expect(amount).toBe(320); // $20 + $300
  });

  it('returns $0 for unapproved primary post', () => {
    const primary = makePost({ platform: 'TikTok', views: 50000, reviewStatus: 'pending' });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 50000, isCrosspostDuplicate: 1 });
    const { amount } = calcGroupPayout(primary, dup);
    expect(amount).toBe(0);
  });

  it('is retroactive: subtracts lastPaidTier from primary', () => {
    // Group has been paid $20 base already (lastPaidTier=20). Now hits 10k → owes $10 more.
    const primary = makePost({ platform: 'TikTok', views: 10000, lastPaidTier: 20 });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 9000, isCrosspostDuplicate: 1 });
    const { amount } = calcGroupPayout(primary, dup);
    expect(amount).toBe(10); // $30 total - $20 already paid
  });

  it('returns $0 when already fully paid', () => {
    const primary = makePost({ platform: 'TikTok', views: 10000, lastPaidTier: 30 });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 9000, isCrosspostDuplicate: 1 });
    const { amount } = calcGroupPayout(primary, dup);
    expect(amount).toBe(0);
  });

  it('handles view growth: pays only the incremental difference', () => {
    // Paid at 10k tier ($30). Now has 50k views → owes $170 - $30 = $140.
    const primary = makePost({ platform: 'TikTok', views: 55000, lastPaidTier: 30 });
    const dup = makePost({ id: 'post-2', platform: 'Instagram', views: 40000, isCrosspostDuplicate: 1 });
    const { amount } = calcGroupPayout(primary, dup);
    expect(amount).toBe(140); // $170 total - $30 paid
  });
});

// ── groupPostsByGroupId + resolveGroup ───────────────────────────────────────

describe('groupPostsByGroupId', () => {
  it('groups posts by crosspostGroupId', () => {
    const posts = [
      makePost({ id: 'a', crosspostGroupId: 'g1', platform: 'TikTok' }),
      makePost({ id: 'b', crosspostGroupId: 'g1', platform: 'Instagram', isCrosspostDuplicate: 1 }),
      makePost({ id: 'c', crosspostGroupId: 'g2', platform: 'TikTok' }),
    ];
    const groups = groupPostsByGroupId(posts);
    expect(groups.size).toBe(2);
    expect(groups.get('g1')!.length).toBe(2);
    expect(groups.get('g2')!.length).toBe(1);
  });

  it('falls back to post.id for posts without a groupId', () => {
    const posts = [
      makePost({ id: 'solo', crosspostGroupId: null }),
    ];
    const groups = groupPostsByGroupId(posts);
    expect(groups.size).toBe(1);
    expect(groups.has('solo')).toBe(true);
  });
});

describe('resolveGroup', () => {
  it('identifies primary (isCrosspostDuplicate=0) and duplicate', () => {
    const primary = makePost({ id: 'p', platform: 'TikTok', isCrosspostDuplicate: 0 });
    const dup = makePost({ id: 'd', platform: 'Instagram', isCrosspostDuplicate: 1 });
    const { primary: p, duplicate: d } = resolveGroup([primary, dup]);
    expect(p.id).toBe('p');
    expect(d!.id).toBe('d');
  });

  it('returns null duplicate for solo posts', () => {
    const solo = makePost({ id: 'solo', isCrosspostDuplicate: 0 });
    const { primary, duplicate } = resolveGroup([solo]);
    expect(primary.id).toBe('solo');
    expect(duplicate).toBeNull();
  });
});

// ── End-to-end: calculatePending logic ──────────────────────────────────────

describe('payout calculation end-to-end', () => {
  it('a creator with 3 dual-platform videos earns correct total', () => {
    // Video 1: TT 500 views, IG 400 views → $20 base only
    // Video 2: TT 12k views, IG 8k views → $20 + $10 bonus = $30
    // Video 3: TT 60k views, IG 30k views → $20 + $150 bonus = $170
    const groups = [
      { primary: makePost({ id: 'p1', platform: 'TikTok', views: 500 }),
        dup: makePost({ id: 'd1', platform: 'Instagram', views: 400, isCrosspostDuplicate: 1 }) },
      { primary: makePost({ id: 'p2', platform: 'TikTok', views: 12000 }),
        dup: makePost({ id: 'd2', platform: 'Instagram', views: 8000, isCrosspostDuplicate: 1 }) },
      { primary: makePost({ id: 'p3', platform: 'TikTok', views: 60000 }),
        dup: makePost({ id: 'd3', platform: 'Instagram', views: 30000, isCrosspostDuplicate: 1 }) },
    ];
    const total = groups.reduce((sum, g) => sum + calcGroupPayout(g.primary, g.dup).amount, 0);
    expect(total).toBe(220); // $20 + $30 + $170
  });

  it('a creator with only single-platform videos earns $0', () => {
    const posts = [
      makePost({ id: 'a', platform: 'TikTok', views: 50000 }),
      makePost({ id: 'b', platform: 'TikTok', views: 100000 }),
    ];
    const total = posts.reduce((sum, p) => sum + calcGroupPayout(p, null).amount, 0);
    expect(total).toBe(0);
  });

  it('bonus uses the platform with more views, not just the primary', () => {
    // Primary (TikTok) has 5k views, Instagram has 300k views → bonus should be $400 (250k tier)
    const primary = makePost({ platform: 'TikTok', views: 5000 });
    const dup = makePost({ id: 'dup', platform: 'Instagram', views: 300000, isCrosspostDuplicate: 1 });
    const { amount, maxViews } = calcGroupPayout(primary, dup);
    expect(maxViews).toBe(300000);
    expect(amount).toBe(420); // $20 + $400
  });
});
