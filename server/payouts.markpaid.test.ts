import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Verifies that `payouts.markPaid` records payout history and advances each
// post's `lastPaidTier` so the retroactive math does NOT re-pay the same amount
// on the next cycle.

function ctx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "owner",
      email: null,
      name: "Owner",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext;
}

const jun = (day: number) => new Date(Date.UTC(2026, 5, day));

describe("payouts.markPaid", () => {
  let postsStore: any[];
  let payoutsStore: any[];

  beforeEach(() => {
    vi.restoreAllMocks();

    postsStore = [
      // 100k views, approved, never paid -> total earned $320
      { id: "p1", creatorId: "c1", views: 100000, reviewStatus: "approved", postDate: jun(10), lastPaidTier: 0 },
      // 10k views, approved, never paid -> total earned $30
      { id: "p2", creatorId: "c1", views: 10000, reviewStatus: "approved", postDate: jun(12), lastPaidTier: 0 },
      // pending post -> not paid
      { id: "p3", creatorId: "c1", views: 500000, reviewStatus: "pending", postDate: jun(13), lastPaidTier: 0 },
    ];
    payoutsStore = [];

    vi.spyOn(db, "getCreator").mockResolvedValue({ id: "c1", name: "Creator One", status: "active", archived: 0 } as any);
    vi.spyOn(db, "listPosts").mockImplementation(async () => postsStore as any);
    vi.spyOn(db, "listCreators").mockResolvedValue([
      { id: "c1", name: "Creator One", status: "active", archived: 0 } as any,
    ]);
    vi.spyOn(db, "updatePost").mockImplementation(async (id: string, data: any) => {
      const p = postsStore.find((x) => x.id === id);
      if (p) Object.assign(p, data);
      return p as any;
    });
    vi.spyOn(db, "createPayout").mockImplementation(async (data: any) => {
      const row = { id: `payout-${payoutsStore.length + 1}`, ...data };
      payoutsStore.push(row);
      return row as any;
    });
  });

  it("records payouts for approved posts and advances lastPaidTier", async () => {
    const caller = appRouter.createCaller(ctx());
    const res = await caller.payouts.markPaid({ creatorId: "c1", year: 2026, month: 5 });

    // Total $320 + $30 = $350 across 2 approved posts (pending excluded)
    expect(res.totalPaid).toBe(350);
    expect(res.postsPaid).toBe(2);
    expect(payoutsStore.length).toBe(2);

    // lastPaidTier advanced to each post's total earned
    expect(postsStore.find((p) => p.id === "p1")!.lastPaidTier).toBe(320);
    expect(postsStore.find((p) => p.id === "p2")!.lastPaidTier).toBe(30);
    // pending post untouched
    expect(postsStore.find((p) => p.id === "p3")!.lastPaidTier).toBe(0);
  });

  it("owes $0 on the next cycle after being marked paid (no double-pay)", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.payouts.markPaid({ creatorId: "c1", year: 2026, month: 5 });

    const pending = await caller.payouts.calculatePending({ year: 2026, month: 5 });
    // c1 fully paid -> not present (no positive amount accumulated)
    expect(pending["c1"]).toBeUndefined();
  });

  it("pays only the incremental difference after views grow into a higher tier", async () => {
    const caller = appRouter.createCaller(ctx());
    // First payment at current views
    await caller.payouts.markPaid({ creatorId: "c1", year: 2026, month: 5 });

    // p2 grows from 10k ($30 total) to 100k ($320 total) -> owes the $290 difference
    postsStore.find((p) => p.id === "p2")!.views = 100000;

    const pending = await caller.payouts.calculatePending({ year: 2026, month: 5 });
    expect(pending["c1"]).toBe(290);
  });
});
