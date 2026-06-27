import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Verifies the calendar-month pay-period scoping in `payouts.calculatePending`.
// Under the dual-platform model, a video only earns if posted on BOTH TikTok
// AND Instagram. Posts here are set up as TT+IG pairs sharing a crosspostGroupId.

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

// Helper to create a TT+IG pair for a creator on a given date
function pair(
  idPrefix: string,
  creatorId: string,
  date: Date,
  ttViews: number,
  igViews: number,
  reviewStatus = "approved",
  groupId?: string
) {
  const gid = groupId ?? `grp-${idPrefix}`;
  return [
    { id: `${idPrefix}-tt`, creatorId, views: ttViews, reviewStatus, postDate: date, lastPaidTier: 0, isCrosspostDuplicate: 0, platform: "TikTok", crosspostGroupId: gid },
    { id: `${idPrefix}-ig`, creatorId, views: igViews, reviewStatus, postDate: date, lastPaidTier: 0, isCrosspostDuplicate: 1, platform: "Instagram", crosspostGroupId: gid },
  ];
}

const posts = [
  // Active girl: one approved June pair at 100k TT / 80k IG -> max 100k -> $320
  ...pair("p1", "c-active", jun(10), 100000, 80000),
  // Active girl: approved but in MAY -> excluded from June
  ...pair("p2", "c-active", may(20), 100000, 80000),
  // Active girl: approved but in JULY -> excluded from June
  ...pair("p3", "c-active", jul(2), 100000, 80000),
  // Trial girl: approved June pair at 10k TT / 8k IG -> max 10k -> $30
  ...pair("p4", "c-trial", jun(5), 10000, 8000),
  // Trial girl: pending June pair -> excluded (not approved)
  ...pair("p5", "c-trial", jun(6), 500000, 400000, "pending"),
  // Fired girl: approved June pair -> excluded (creator fired)
  ...pair("p6", "c-fired", jun(7), 100000, 80000),
  // Archived girl: approved June pair -> excluded (creator archived)
  ...pair("p7", "c-archived", jun(8), 100000, 80000),
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(db, "listPosts").mockResolvedValue(posts as any);
  vi.spyOn(db, "listCreators").mockResolvedValue(creators as any);
});

describe("payouts.calculatePending — calendar-month scoping", () => {
  it("counts only approved dual-platform pairs within the selected month for non-fired/non-archived creators", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.payouts.calculatePending({ year: 2026, month: 5 }); // June

    // Active girl: only the June 100k pair counts -> $320
    expect(result["c-active"]).toBe(320);
    // Trial girl: only the approved June 10k pair counts -> $30
    expect(result["c-trial"]).toBe(30);
    // Fired and archived creators are excluded entirely
    expect(result["c-fired"]).toBeUndefined();
    expect(result["c-archived"]).toBeUndefined();
  });

  it("excludes posts outside the selected month (May/July not counted in June)", async () => {
    const caller = appRouter.createCaller(ctx());
    const june = await caller.payouts.calculatePending({ year: 2026, month: 5 });
    // Active girl has 3 approved 100k pairs (May, June, July) but only June counts
    expect(june["c-active"]).toBe(320);

    const mayResult = await caller.payouts.calculatePending({ year: 2026, month: 4 });
    expect(mayResult["c-active"]).toBe(320); // the May pair
    expect(mayResult["c-trial"]).toBeUndefined(); // trial girl had no May pair
  });

  it("excludes pending (unapproved) posts even inside the selected month", async () => {
    const caller = appRouter.createCaller(ctx());
    const june = await caller.payouts.calculatePending({ year: 2026, month: 5 });
    // Trial girl's 500k pending pair is NOT added; only her approved 10k pair -> $30
    expect(june["c-trial"]).toBe(30);
  });
});
