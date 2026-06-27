import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Verifies the calendar-month pay-period scoping in `payouts.calculatePending`.
// Everyone is on the universal model ($20 base + bonus tiers), so we focus here
// on which posts get COUNTED for a given month, not the per-post math.

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

const creators = [
  { id: "c-active", name: "Active Girl", status: "active", archived: 0 },
  { id: "c-trial", name: "Trial Girl", status: "trial", archived: 0 },
  { id: "c-fired", name: "Fired Girl", status: "fired", archived: 0 },
  { id: "c-archived", name: "Archived Girl", status: "active", archived: 1 },
];

// June 2026 = month index 5
const jun = (day: number) => new Date(Date.UTC(2026, 5, day));
const may = (day: number) => new Date(Date.UTC(2026, 4, day));
const jul = (day: number) => new Date(Date.UTC(2026, 6, day));

const posts = [
  // Active girl: one approved June post at 100k -> $320
  { id: "p1", creatorId: "c-active", views: 100000, reviewStatus: "approved", postDate: jun(10), lastPaidTier: 0 },
  // Active girl: approved but in MAY -> excluded from June
  { id: "p2", creatorId: "c-active", views: 100000, reviewStatus: "approved", postDate: may(20), lastPaidTier: 0 },
  // Active girl: approved but in JULY -> excluded from June
  { id: "p3", creatorId: "c-active", views: 100000, reviewStatus: "approved", postDate: jul(2), lastPaidTier: 0 },
  // Trial girl: approved June post at 10k -> $30 (universal model, same as active)
  { id: "p4", creatorId: "c-trial", views: 10000, reviewStatus: "approved", postDate: jun(5), lastPaidTier: 0 },
  // Trial girl: pending June post -> excluded (not approved)
  { id: "p5", creatorId: "c-trial", views: 500000, reviewStatus: "pending", postDate: jun(6), lastPaidTier: 0 },
  // Fired girl: approved June post -> excluded (creator fired)
  { id: "p6", creatorId: "c-fired", views: 100000, reviewStatus: "approved", postDate: jun(7), lastPaidTier: 0 },
  // Archived girl: approved June post -> excluded (creator archived)
  { id: "p7", creatorId: "c-archived", views: 100000, reviewStatus: "approved", postDate: jun(8), lastPaidTier: 0 },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(db, "listPosts").mockResolvedValue(posts as any);
  vi.spyOn(db, "listCreators").mockResolvedValue(creators as any);
});

describe("payouts.calculatePending — calendar-month scoping", () => {
  it("counts only approved posts within the selected month for non-fired/non-archived creators", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.payouts.calculatePending({ year: 2026, month: 5 }); // June

    // Active girl: only the June 100k post counts -> $320
    expect(result["c-active"]).toBe(320);
    // Trial girl: only the approved June 10k post counts -> $30
    expect(result["c-trial"]).toBe(30);
    // Fired and archived creators are excluded entirely
    expect(result["c-fired"]).toBeUndefined();
    expect(result["c-archived"]).toBeUndefined();
  });

  it("excludes posts outside the selected month (May/July not counted in June)", async () => {
    const caller = appRouter.createCaller(ctx());
    const june = await caller.payouts.calculatePending({ year: 2026, month: 5 });
    // Active girl has 3 approved 100k posts (May, June, July) but only June counts
    expect(june["c-active"]).toBe(320);

    const may = await caller.payouts.calculatePending({ year: 2026, month: 4 });
    expect(may["c-active"]).toBe(320); // the May post
    expect(may["c-trial"]).toBeUndefined(); // trial girl had no May post
  });

  it("excludes pending (unapproved) posts even inside the selected month", async () => {
    const caller = appRouter.createCaller(ctx());
    const june = await caller.payouts.calculatePending({ year: 2026, month: 5 });
    // Trial girl's 500k pending post is NOT added; only her approved 10k post -> $30
    expect(june["c-trial"]).toBe(30);
  });
});
