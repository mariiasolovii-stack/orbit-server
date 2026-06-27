import { describe, it, expect } from "vitest";
import {
  totalEarnedForGroup,
  calcGroupPayout,
  BASE_RATE,
} from "./routers";

// The dual-platform payout model:
// - $20 base ONLY if video posted on both TikTok AND Instagram.
// - Bonus = highest tier reached by the HIGHER view count across both platforms.
// - Bonuses are retroactive/incremental.

function makePair(
  primaryViews: number,
  dupViews: number,
  lastPaidTier = 0,
  reviewStatus = "approved"
) {
  return {
    primary: {
      id: "p1",
      platform: "TikTok",
      views: primaryViews,
      reviewStatus,
      isCrosspostDuplicate: 0,
      lastPaidTier,
    },
    dup: {
      id: "d1",
      platform: "Instagram",
      views: dupViews,
      reviewStatus: "approved",
      isCrosspostDuplicate: 1,
      lastPaidTier: 0,
    },
  };
}

describe("totalEarnedForGroup (dual-platform model)", () => {
  it("pays nothing when hasBothPlatforms is false", () => {
    expect(totalEarnedForGroup(0, false)).toBe(0);
    expect(totalEarnedForGroup(50000, false)).toBe(0);
  });

  it("pays nothing below the 300-view minimum", () => {
    expect(totalEarnedForGroup(0, true)).toBe(0);
    expect(totalEarnedForGroup(299, true)).toBe(0);
  });

  it("pays the $20 base once a group qualifies but is below the first bonus tier", () => {
    expect(totalEarnedForGroup(300, true)).toBe(20);
    expect(totalEarnedForGroup(5000, true)).toBe(20);
    expect(totalEarnedForGroup(9999, true)).toBe(20);
  });

  it("adds the correct bonus on top of the base at each tier", () => {
    expect(totalEarnedForGroup(10000, true)).toBe(BASE_RATE + 10); // 30
    expect(totalEarnedForGroup(25000, true)).toBe(BASE_RATE + 50); // 70
    expect(totalEarnedForGroup(50000, true)).toBe(BASE_RATE + 150); // 170
    expect(totalEarnedForGroup(100000, true)).toBe(BASE_RATE + 300); // 320
    expect(totalEarnedForGroup(250000, true)).toBe(BASE_RATE + 400); // 420
    expect(totalEarnedForGroup(1000000, true)).toBe(BASE_RATE + 500); // 520
    expect(totalEarnedForGroup(1500000, true)).toBe(BASE_RATE + 1000); // 1020
    expect(totalEarnedForGroup(5000000, true)).toBe(BASE_RATE + 1500); // 1520
  });

  it("uses the highest applicable bonus tier", () => {
    expect(totalEarnedForGroup(150000, true)).toBe(BASE_RATE + 300);
    expect(totalEarnedForGroup(2000000, true)).toBe(BASE_RATE + 1000);
    expect(totalEarnedForGroup(6000000, true)).toBe(BASE_RATE + 1500);
  });
});

describe("calcGroupPayout (retroactive / incremental)", () => {
  it("returns 0 for unapproved primary post", () => {
    const { primary, dup } = makePair(100000, 50000, 0, "pending");
    expect(calcGroupPayout(primary, dup).amount).toBe(0);
  });

  it("returns 0 for single-platform video (no duplicate)", () => {
    const primary = { id: "p1", platform: "TikTok", views: 100000, reviewStatus: "approved", isCrosspostDuplicate: 0, lastPaidTier: 0 };
    expect(calcGroupPayout(primary, null).amount).toBe(0);
  });

  it("returns 0 below the minimum view threshold", () => {
    const { primary, dup } = makePair(200, 150);
    expect(calcGroupPayout(primary, dup).amount).toBe(0);
  });

  it("pays the full amount earned on first payout", () => {
    expect(calcGroupPayout(makePair(300, 200).primary, makePair(300, 200).dup).amount).toBe(20);
    expect(calcGroupPayout(makePair(10000, 5000).primary, makePair(10000, 5000).dup).amount).toBe(30);
    expect(calcGroupPayout(makePair(100000, 50000).primary, makePair(100000, 50000).dup).amount).toBe(320);
  });

  it("pays only the difference when a post crosses into a higher tier", () => {
    // Already paid $20 base, primary now at 10k -> total $30, owe $10
    const { primary: p1, dup: d1 } = makePair(10000, 5000, 20);
    expect(calcGroupPayout(p1, d1).amount).toBe(10);

    // Already paid $30, primary now at 100k -> total $320, owe $290
    const { primary: p2, dup: d2 } = makePair(100000, 50000, 30);
    expect(calcGroupPayout(p2, d2).amount).toBe(290);

    // Already paid $320, primary now at 1M -> total $520, owe $200
    const { primary: p3, dup: d3 } = makePair(1000000, 500000, 320);
    expect(calcGroupPayout(p3, d3).amount).toBe(200);
  });

  it("does not double-pay when views stay within the same tier", () => {
    // Already paid $30 at 10k, still at 24k (same 10k tier) -> owe 0
    const { primary: p1, dup: d1 } = makePair(24000, 15000, 30);
    expect(calcGroupPayout(p1, d1).amount).toBe(0);

    // Already paid base $20, still at 9,999 -> owe 0
    const { primary: p2, dup: d2 } = makePair(9999, 8000, 20);
    expect(calcGroupPayout(p2, d2).amount).toBe(0);
  });

  it("labels base vs bonus payouts", () => {
    const { primary: p1, dup: d1 } = makePair(5000, 3000);
    expect(calcGroupPayout(p1, d1).type).toBe("base");

    const { primary: p2, dup: d2 } = makePair(10000, 8000);
    expect(calcGroupPayout(p2, d2).type).toBe("bonus");
  });

  it("uses the HIGHER view count across both platforms for bonus", () => {
    // Primary (TikTok): 8k, Dup (Instagram): 30k → bonus from 30k (25k tier = $50)
    const primary = { id: "p", platform: "TikTok", views: 8000, reviewStatus: "approved", isCrosspostDuplicate: 0, lastPaidTier: 0 };
    const dup = { id: "d", platform: "Instagram", views: 30000, reviewStatus: "approved", isCrosspostDuplicate: 1, lastPaidTier: 0 };
    const result = calcGroupPayout(primary, dup);
    expect(result.maxViews).toBe(30000);
    expect(result.amount).toBe(70); // $20 + $50
  });
});
