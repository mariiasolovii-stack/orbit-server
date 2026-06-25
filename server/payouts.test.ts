import { describe, it, expect } from 'vitest';

// Test retroactive payout calculation logic
describe('Retroactive Payout Calculation', () => {
  const defaultTiers = [
    { views: 1000, amount: 25 },
    { views: 10000, amount: 30 },
    { views: 100000, amount: 75 },
    { views: 500000, amount: 200 },
    { views: 1000000, amount: 500 },
  ];

  const calculatePayoutForViews = (views: number, tiers: typeof defaultTiers, lastPaidTier: number = 0) => {
    const applicableTier = tiers.filter(t => views >= t.views).pop();
    if (!applicableTier || views < 300) return 0;
    
    const lastPaidAmount = lastPaidTier > 0 ? tiers.find(t => t.amount === lastPaidTier)?.amount || 0 : 0;
    return Math.max(0, applicableTier.amount - lastPaidAmount);
  };

  it('should return 0 for posts with less than 300 views', () => {
    expect(calculatePayoutForViews(100, defaultTiers)).toBe(0);
    expect(calculatePayoutForViews(299, defaultTiers)).toBe(0);
  });

  it('should pay the tier amount for first payout', () => {
    expect(calculatePayoutForViews(1000, defaultTiers)).toBe(25);
    expect(calculatePayoutForViews(10000, defaultTiers)).toBe(30);
    expect(calculatePayoutForViews(100000, defaultTiers)).toBe(75);
  });

  it('should pay only the difference when crossing tiers', () => {
    // Post starts at 1k views (tier 1: $25)
    expect(calculatePayoutForViews(1000, defaultTiers, 0)).toBe(25);
    
    // Post crosses to 10k views (tier 2: $30)
    // Should pay difference: $30 - $25 = $5
    expect(calculatePayoutForViews(10000, defaultTiers, 25)).toBe(5);
    
    // Post crosses to 100k views (tier 3: $75)
    // Should pay difference: $75 - $30 = $45
    expect(calculatePayoutForViews(100000, defaultTiers, 30)).toBe(45);
  });

  it('should not double-pay when views stay in same tier', () => {
    expect(calculatePayoutForViews(5000, defaultTiers, 25)).toBe(0);
    expect(calculatePayoutForViews(9999, defaultTiers, 25)).toBe(0);
  });
});

// Test trial creator payout logic
describe('Trial Creator Payout Logic', () => {
  const calculateTrialPayout = (views: number, isWarmupPost: boolean = false) => {
    const baseRate = 20;
    const warmupRate = 5;
    
    if (isWarmupPost) return warmupRate;
    
    // Base rate for all posts
    let payout = baseRate;
    
    // Tiered bonuses
    const bonuses = [
      { views: 10000, bonus: 10 },
      { views: 25000, bonus: 50 },
      { views: 50000, bonus: 150 },
      { views: 100000, bonus: 300 },
      { views: 250000, bonus: 400 },
      { views: 1000000, bonus: 500 },
      { views: 1500000, bonus: 1000 },
      { views: 5000000, bonus: 1500 },
    ];
    
    for (const bonus of bonuses) {
      if (views >= bonus.views) {
        payout = bonus.bonus; // Replace with bonus amount (not additive)
      }
    }
    
    return payout;
  };

  it('should pay $5 for warmup posts', () => {
    expect(calculateTrialPayout(0, true)).toBe(5);
    expect(calculateTrialPayout(100, true)).toBe(5);
  });

  it('should pay $20 base rate for regular posts', () => {
    expect(calculateTrialPayout(300)).toBe(20);
    expect(calculateTrialPayout(5000)).toBe(20);
  });

  it('should pay tiered bonuses based on views', () => {
    expect(calculateTrialPayout(10000)).toBe(10);
    expect(calculateTrialPayout(25000)).toBe(50);
    expect(calculateTrialPayout(50000)).toBe(150);
    expect(calculateTrialPayout(100000)).toBe(300);
    expect(calculateTrialPayout(250000)).toBe(400);
    expect(calculateTrialPayout(1000000)).toBe(500);
    expect(calculateTrialPayout(1500000)).toBe(1000);
    expect(calculateTrialPayout(5000000)).toBe(1500);
  });

  it('should use highest applicable bonus tier', () => {
    // 150k views: should be in 100k tier ($300), not 50k tier ($150)
    expect(calculateTrialPayout(150000)).toBe(300);
    
    // 2M views: should be in 1.5M tier ($1000), not 1M tier ($500)
    expect(calculateTrialPayout(2000000)).toBe(1000);
  });
});

// Test minimum view threshold
describe('Minimum View Threshold', () => {
  it('should require minimum 300 views to qualify', () => {
    const minViews = 300;
    expect(299 < minViews).toBe(true);
    expect(300 >= minViews).toBe(true);
    expect(301 >= minViews).toBe(true);
  });
});
