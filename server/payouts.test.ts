import { describe, it, expect } from "vitest";
import { totalEarnedForViews, calcPayout, BASE_RATE } from "./routers";

// The unified payout model: every creator (trial and active) earns a $20 base
// per qualifying video (300+ views) plus the single highest bonus tier reached.
// Bonuses are retroactive/incremental.

describe("totalEarnedForViews (universal model)", () => {
  it("pays nothing below the 300-view minimum", () => {
    expect(totalEarnedForViews(0)).toBe(0);
    expect(totalEarnedForViews(299)).toBe(0);
  });

  it("pays the $20 base once a post qualifies but is below the first bonus tier", () => {
    expect(totalEarnedForViews(300)).toBe(20);
    expect(totalEarnedForViews(5000)).toBe(20);
    expect(totalEarnedForViews(9999)).toBe(20);
  });

  it("adds the correct bonus on top of the base at each tier", () => {
    expect(totalEarnedForViews(10000)).toBe(BASE_RATE + 10); // 30
    expect(totalEarnedForViews(25000)).toBe(BASE_RATE + 50); // 70
    expect(totalEarnedForViews(50000)).toBe(BASE_RATE + 150); // 170
    expect(totalEarnedForViews(100000)).toBe(BASE_RATE + 300); // 320
    expect(totalEarnedForViews(250000)).toBe(BASE_RATE + 400); // 420
    expect(totalEarnedForViews(1000000)).toBe(BASE_RATE + 500); // 520
    expect(totalEarnedForViews(1500000)).toBe(BASE_RATE + 1000); // 1020
    expect(totalEarnedForViews(5000000)).toBe(BASE_RATE + 1500); // 1520
  });

  it("uses the highest applicable bonus tier", () => {
    // 150k views -> 100k tier ($300), not 50k ($150)
    expect(totalEarnedForViews(150000)).toBe(BASE_RATE + 300);
    // 2M views -> 1.5M tier ($1000), not 1M ($500)
    expect(totalEarnedForViews(2000000)).toBe(BASE_RATE + 1000);
    // 6M views -> 5M tier ($1500)
    expect(totalEarnedForViews(6000000)).toBe(BASE_RATE + 1500);
  });
});

describe("calcPayout (retroactive / incremental)", () => {
  const approved = (views: number, lastPaidTier = 0) => ({
    reviewStatus: "approved",
    views,
    lastPaidTier,
  });

  it("returns 0 for unapproved posts", () => {
    expect(calcPayout({ reviewStatus: "pending", views: 100000, lastPaidTier: 0 }).amount).toBe(0);
  });

  it("returns 0 below the minimum view threshold", () => {
    expect(calcPayout(approved(299)).amount).toBe(0);
  });

  it("pays the full amount earned on first payout", () => {
    expect(calcPayout(approved(300)).amount).toBe(20);
    expect(calcPayout(approved(10000)).amount).toBe(30);
    expect(calcPayout(approved(100000)).amount).toBe(320);
  });

  it("pays only the difference when a post crosses into a higher tier", () => {
    // Already paid $20 base, post now at 10k -> total $30, owe $10
    expect(calcPayout(approved(10000, 20)).amount).toBe(10);
    // Already paid $30, post now at 100k -> total $320, owe $290
    expect(calcPayout(approved(100000, 30)).amount).toBe(290);
    // Already paid $320, post now at 1M -> total $520, owe $200
    expect(calcPayout(approved(1000000, 320)).amount).toBe(200);
  });

  it("does not double-pay when views stay within the same tier", () => {
    // Already paid $30 at 10k, still at 24k (same 10k tier) -> owe 0
    expect(calcPayout(approved(24000, 30)).amount).toBe(0);
    // Already paid base $20, still at 9,999 -> owe 0
    expect(calcPayout(approved(9999, 20)).amount).toBe(0);
  });

  it("labels base vs bonus payouts", () => {
    expect(calcPayout(approved(5000)).type).toBe("base");
    expect(calcPayout(approved(10000)).type).toBe("bonus");
  });
});
