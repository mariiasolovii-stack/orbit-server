import { describe, it, expect, vi, beforeEach } from "vitest";
import { deduplicateCrossposts } from "./trackr";
import * as db from "./db";
import { appRouter, calcPayout } from "./routers";
import type { TrpcContext } from "./_core/context";

// Tests for crosspost deduplication logic and the getBreakdown procedure.

function ctx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "owner", email: null, name: "Owner",
      loginMethod: "manus", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext;
}

const jun = (day: number) => new Date(Date.UTC(2026, 5, day));

// ── deduplicateCrossposts unit tests ─────────────────────────────────────────
describe("deduplicateCrossposts", () => {
  it("marks the lower-view crosspost as a duplicate", () => {
    const posts = [
      { post_id: "t1", username: "creator1", platform: "tiktok", title: "Same caption", posted_at: "2026-06-10T10:00:00Z", views: 5000, likes: 0, comments: 0, shares: 0, saves: 0, link: "https://tiktok.com/1", campaign_id: "c" },
      { post_id: "i1", username: "creator1", platform: "instagram", title: "Same caption", posted_at: "2026-06-10T11:00:00Z", views: 1000, likes: 0, comments: 0, shares: 0, saves: 0, link: "https://instagram.com/1", campaign_id: "c" },
    ];
    const { primaryByKey, duplicateIds } = deduplicateCrossposts(posts as any);
    // TikTok has more views -> primary; Instagram -> duplicate
    expect(duplicateIds.has("i1")).toBe(true);
    expect(duplicateIds.has("t1")).toBe(false);
    expect(primaryByKey.size).toBe(1);
  });

  it("does NOT mark posts with different captions as duplicates", () => {
    const posts = [
      { post_id: "t1", username: "creator1", platform: "tiktok", title: "Caption A", posted_at: "2026-06-10T10:00:00Z", views: 5000, likes: 0, comments: 0, shares: 0, saves: 0, link: "https://tiktok.com/1", campaign_id: "c" },
      { post_id: "i1", username: "creator1", platform: "instagram", title: "Caption B", posted_at: "2026-06-10T11:00:00Z", views: 1000, likes: 0, comments: 0, shares: 0, saves: 0, link: "https://instagram.com/1", campaign_id: "c" },
    ];
    const { duplicateIds } = deduplicateCrossposts(posts as any);
    expect(duplicateIds.size).toBe(0);
  });

  it("does NOT mark posts from different creators as duplicates", () => {
    const posts = [
      { post_id: "t1", username: "creator1", platform: "tiktok", title: "Same caption", posted_at: "2026-06-10T10:00:00Z", views: 5000, likes: 0, comments: 0, shares: 0, saves: 0, link: "https://tiktok.com/1", campaign_id: "c" },
      { post_id: "i1", username: "creator2", platform: "instagram", title: "Same caption", posted_at: "2026-06-10T11:00:00Z", views: 1000, likes: 0, comments: 0, shares: 0, saves: 0, link: "https://instagram.com/1", campaign_id: "c" },
    ];
    const { duplicateIds } = deduplicateCrossposts(posts as any);
    expect(duplicateIds.size).toBe(0);
  });

  it("handles 3 posts (TikTok + IG + YouTube) — only 2 duplicates", () => {
    const base = { username: "creator1", title: "Same caption", posted_at: "2026-06-10T10:00:00Z", likes: 0, comments: 0, shares: 0, saves: 0, campaign_id: "c" };
    const posts = [
      { ...base, post_id: "t1", platform: "tiktok", views: 10000, link: "https://tiktok.com/1" },
      { ...base, post_id: "i1", platform: "instagram", views: 3000, link: "https://instagram.com/1" },
      { ...base, post_id: "y1", platform: "youtube", views: 500, link: "https://youtube.com/1" },
    ];
    const { duplicateIds } = deduplicateCrossposts(posts as any);
    // TikTok is primary (highest views); IG and YouTube are duplicates
    expect(duplicateIds.has("t1")).toBe(false);
    expect(duplicateIds.has("i1")).toBe(true);
    expect(duplicateIds.has("y1")).toBe(true);
  });
});

// ── calcPayout respects isCrosspostDuplicate ─────────────────────────────────
describe("calcPayout — crosspost duplicate is excluded from payout", () => {
  it("returns $0 for a crosspost duplicate even if it has high views", () => {
    const post = { reviewStatus: "approved", views: 100000, lastPaidTier: 0, isCrosspostDuplicate: 1 };
    expect(calcPayout(post).amount).toBe(0);
    expect(calcPayout(post).type).toBe("crosspost");
  });

  it("returns full amount for the primary (non-duplicate) post", () => {
    const post = { reviewStatus: "approved", views: 100000, lastPaidTier: 0, isCrosspostDuplicate: 0 };
    expect(calcPayout(post).amount).toBe(320); // $20 base + $300 at 100k
  });
});

// ── getBreakdown procedure ────────────────────────────────────────────────────
describe("payouts.getBreakdown", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db, "listPosts").mockResolvedValue([
      { id: "p1", creatorId: "c1", views: 50000, reviewStatus: "approved", postDate: jun(10), lastPaidTier: 0, isCrosspostDuplicate: 0, platform: "TikTok", postUrl: "https://tiktok.com/1", title: "My video" } as any,
      { id: "p2", creatorId: "c1", views: 50000, reviewStatus: "approved", postDate: jun(10), lastPaidTier: 0, isCrosspostDuplicate: 1, platform: "Instagram", postUrl: "https://instagram.com/1", title: "My video" } as any,
      { id: "p3", creatorId: "c1", views: 200, reviewStatus: "approved", postDate: jun(11), lastPaidTier: 0, isCrosspostDuplicate: 0, platform: "TikTok", postUrl: null, title: "Low views" } as any,
    ] as any);
  });

  it("returns all posts in the period with correct payoutAmount and isCrosspostDuplicate flag", async () => {
    const caller = appRouter.createCaller(ctx());
    const rows = await caller.payouts.getBreakdown({ creatorId: "c1", year: 2026, month: 5 });

    expect(rows.length).toBe(3);
    const primary = rows.find(r => r.id === "p1")!;
    const dupe = rows.find(r => r.id === "p2")!;
    const lowViews = rows.find(r => r.id === "p3")!;

    expect(primary.payoutAmount).toBe(170); // $20 + $150 at 50k
    expect(primary.isCrosspostDuplicate).toBe(false);
    expect(dupe.payoutAmount).toBe(0);
    expect(dupe.isCrosspostDuplicate).toBe(true);
    expect(lowViews.payoutAmount).toBe(0); // below 300 view minimum
  });
});
