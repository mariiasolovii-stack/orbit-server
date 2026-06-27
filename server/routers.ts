import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import * as trackr from "./trackr";

// ============ PAYOUT CALCULATION HELPERS ============

/**
 * Universal payout model — applies to ALL creators (trial and active alike).
 * Everyone earns a $20 base per qualifying video plus retroactive view-tier
 * bonuses. "Trial" is now only a roster label (no separate pay rules) until a
 * creator is manually re-tagged "active".
 *
 * Bonus tiers (cumulative, retroactive — pay only the incremental difference):
 *   10k -> +$10, 25k -> +$50, 50k -> +$150, 100k -> +$300,
 *   250k -> +$400, 1M -> +$500, 1.5M -> +$1,000, 5M -> +$1,500
 * Base rate ($20) applies once the post has at least the minimum qualifying views.
 */
export const BASE_RATE = 20;
export const MIN_QUALIFYING_VIEWS = 300;
export const BONUS_TIERS = [
  { views: 5000000, amount: 1500 },
  { views: 1500000, amount: 1000 },
  { views: 1000000, amount: 500 },
  { views: 250000, amount: 400 },
  { views: 100000, amount: 300 },
  { views: 50000, amount: 150 },
  { views: 25000, amount: 50 },
  { views: 10000, amount: 10 },
];

/**
 * Compute the TOTAL earned for a post at its current view count under the
 * universal model: $20 base + the single highest bonus tier reached.
 */
export function totalEarnedForViews(views: number): number {
  if ((views || 0) < MIN_QUALIFYING_VIEWS) return 0;
  const tier = BONUS_TIERS.find(t => views >= t.views);
  return BASE_RATE + (tier ? tier.amount : 0);
}

/**
 * Calculate the incremental pending payout for a single post (retroactive):
 * total earned at current views minus what has already been paid.
 */
export function calcPayout(post: any): { amount: number; type: string } {
  if (post.reviewStatus !== 'approved') return { amount: 0, type: 'pending' };
  const views = post.views || 0;
  if (views < MIN_QUALIFYING_VIEWS) return { amount: 0, type: 'pending' };

  const total = totalEarnedForViews(views);
  const lastPaid = post.lastPaidTier || 0; // stores cumulative amount already paid
  const tier = BONUS_TIERS.find(t => views >= t.views);

  return {
    amount: Math.max(0, total - lastPaid),
    type: tier ? 'bonus' : 'base',
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ CREATORS ============
  creators: router({
    // Active roster (non-archived)
    list: protectedProcedure.query(async () => {
      return db.listActiveCreators();
    }),

    // All creators including archived
    listAll: protectedProcedure.query(async () => {
      return db.listCreators();
    }),

    // Archived / removed creators
    listArchived: protectedProcedure.query(async () => {
      return db.listArchivedCreators();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return db.getCreator(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.union([z.string().email(), z.literal("")]).optional().nullable(),
        status: z.enum(['trial', 'active', 'fired']).default('trial'),
        compType: z.enum(['ppp', 'retainer']).default('ppp'),
        baseRate: z.number().default(25),
        retainerAmount: z.number().default(0),
        platforms: z.array(z.string()).optional(),
        tiktokHandle: z.string().optional(),
        instagramHandle: z.string().optional(),
        startDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const creator = await db.createCreator({
          name: input.name,
          email: input.email ? input.email : null,
          status: input.status,
          compType: input.compType,
          baseRate: input.baseRate,
          retainerAmount: input.retainerAmount,
          platforms: input.platforms ? JSON.stringify(input.platforms) : null,
          tiktokHandle: db.normalizeHandle(input.tiktokHandle),
          instagramHandle: db.normalizeHandle(input.instagramHandle),
          startDate: input.startDate,
          docusignStatus: 'pending',
          notes: input.notes,
        } as any);
        return creator;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          email: z.union([z.string().email(), z.literal("")]).optional().nullable(),
          status: z.enum(['trial', 'active', 'fired']).optional(),
          compType: z.enum(['ppp', 'retainer']).optional(),
          baseRate: z.number().optional(),
          retainerAmount: z.number().optional(),
          platforms: z.array(z.string()).optional(),
          tiktokHandle: z.string().optional(),
          instagramHandle: z.string().optional(),
          docusignStatus: z.enum(['pending', 'sent', 'signed']).optional(),
          docusignEnvelopeId: z.string().optional(),
          notes: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const updateData: any = { ...input.data };
        if (input.data.platforms) {
          updateData.platforms = JSON.stringify(input.data.platforms);
        }
        if (updateData.email === "") {
          updateData.email = null;
        }
        if (input.data.tiktokHandle !== undefined) {
          updateData.tiktokHandle = db.normalizeHandle(input.data.tiktokHandle);
        }
        if (input.data.instagramHandle !== undefined) {
          updateData.instagramHandle = db.normalizeHandle(input.data.instagramHandle);
        }
        return db.updateCreator(input.id, updateData);
      }),

    promote: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return db.updateCreator(input.id, { status: 'active' });
      }),

    // Mark as fired (status only) - they stay on the roster so you can keep watching their views
    fire: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return db.updateCreator(input.id, { status: 'fired' });
      }),

    // Archive (soft-delete): removes from active roster but keeps all post/view data.
    // keepSyncing controls whether Trackr keeps pulling this creator's handles.
    archive: protectedProcedure
      .input(z.object({ id: z.string(), keepSyncing: z.boolean().default(true) }))
      .mutation(async ({ input }) => {
        return db.archiveCreator(input.id, input.keepSyncing);
      }),

    // Restore an archived creator back to the active roster
    restore: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return db.restoreCreator(input.id);
      }),
  }),

  // ============ POSTS ============
  posts: router({
    list: protectedProcedure.query(async () => {
      return db.listPosts();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return db.getPost(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        creatorId: z.string(),
        platform: z.string(),
        postDate: z.date(),
        postUrl: z.string().optional(),
        views: z.number().default(0),
        reviewStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const creator = await db.getCreator(input.creatorId);
        if (!creator) throw new TRPCError({ code: 'NOT_FOUND', message: 'Creator not found' });

        const post = await db.createPost({
          creatorId: input.creatorId,
          platform: input.platform,
          postDate: input.postDate,
          postUrl: input.postUrl,
          views: input.views,
          reviewStatus: input.reviewStatus,
          isTrialPost: creator.status === 'trial' ? 1 : 0,
          lastPaidTier: 0,
          notes: input.notes,
        } as any);
        return post;
      }),

    updateViews: protectedProcedure
      .input(z.object({ id: z.string(), views: z.number() }))
      .mutation(async ({ input }) => {
        return db.updatePost(input.id, { views: input.views });
      }),

    approve: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return db.updatePost(input.id, { reviewStatus: 'approved' });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deletePost(input.id);
        return { success: true };
      }),
  }),

  // ============ PAYOUT TIERS ============
  payoutTiers: router({
    list: protectedProcedure.query(async () => {
      return db.listPayoutTiers();
    }),

    create: protectedProcedure
      .input(z.object({
        viewsThreshold: z.number(),
        payoutAmount: z.number(),
      }))
      .mutation(async ({ input }) => {
        return db.createPayoutTier(input as any);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        viewsThreshold: z.number().optional(),
        payoutAmount: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return db.updatePayoutTier(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deletePayoutTier(input.id);
        return { success: true };
      }),
  }),

  // ============ PAYOUTS ============
  payouts: router({
    list: protectedProcedure.query(async () => {
      return db.listPayouts();
    }),

    // Pending payouts for a calendar-month pay period.
    // `month` is 0-indexed (0 = January). Defaults to the current month.
    calculatePending: protectedProcedure
      .input(
        z
          .object({
            year: z.number().int().optional(),
            month: z.number().int().min(0).max(11).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const now = new Date();
        const year = input?.year ?? now.getUTCFullYear();
        const month = input?.month ?? now.getUTCMonth();
        const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
        const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0)); // exclusive

        const posts = await db.listPosts();
        const creators = await db.listCreators();

        const pending: Record<string, number> = {};

        for (const post of posts) {
          const creator = creators.find(c => c.id === post.creatorId);
          if (!creator) continue;
          // Fired/archived creators are not owed new payouts.
          if (creator.status === 'fired' || (creator as any).archived === 1) continue;

          // Scope to the selected calendar-month pay period by post date.
          const postDate = post.postDate ? new Date(post.postDate) : null;
          if (!postDate || postDate < periodStart || postDate >= periodEnd) continue;

          // Universal payout model for everyone (trial + active).
          const { amount } = calcPayout(post);
          if (amount > 0) {
            pending[post.creatorId] = (pending[post.creatorId] || 0) + amount;
          }
        }

        return pending;
      }),

    // Record a payment for one creator's outstanding balance in a given pay
    // period. This advances each qualifying post's `lastPaidTier` to its current
    // total earned so the retroactive math never re-pays the same amount, and
    // writes a payout history row per post. `month` is 0-indexed.
    markPaid: protectedProcedure
      .input(
        z.object({
          creatorId: z.string(),
          year: z.number().int().optional(),
          month: z.number().int().min(0).max(11).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const now = new Date();
        const year = input.year ?? now.getUTCFullYear();
        const month = input.month ?? now.getUTCMonth();
        const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
        const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0)); // exclusive

        const creator = await db.getCreator(input.creatorId);
        if (!creator) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Creator not found' });
        }

        const posts = await db.listPosts();
        const payoutDate = new Date();
        let totalPaid = 0;
        let postsPaid = 0;

        for (const post of posts) {
          if (post.creatorId !== input.creatorId) continue;

          // Scope to the selected calendar-month pay period by post date.
          const postDate = post.postDate ? new Date(post.postDate) : null;
          if (!postDate || postDate < periodStart || postDate >= periodEnd) continue;

          const { amount, type } = calcPayout(post);
          if (amount <= 0) continue;

          // Advance lastPaidTier to the full total earned at current views so the
          // incremental difference becomes 0 until the post crosses a higher tier.
          const newPaidTotal = totalEarnedForViews(post.views || 0);
          await db.updatePost(post.id, { lastPaidTier: newPaidTotal });
          await db.createPayout({
            creatorId: input.creatorId,
            postId: post.id,
            amount,
            payoutType: type === 'bonus' ? 'bonus' : 'post',
            payoutDate,
            notes: `Marked paid for ${year}-${String(month + 1).padStart(2, '0')} pay period`,
          } as any);

          totalPaid += amount;
          postsPaid += 1;
        }

        return { creatorId: input.creatorId, totalPaid, postsPaid };
      }),
  }),

  // ============ SCRIPTS ============
  scripts: router({
    list: protectedProcedure.query(async () => {
      return db.listScripts();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return db.getScript(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        format: z.enum(['talking_head', 'non_talking_head', 'skit', 'slideshow']),
        content: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createScript(input as any);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        title: z.string().optional(),
        format: z.enum(['talking_head', 'non_talking_head', 'skit', 'slideshow']).optional(),
        content: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return db.updateScript(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteScript(input.id);
        return { success: true };
      }),
  }),

  // ============ TRACKR SYNC ============
  trackr: router({
    sync: protectedProcedure.mutation(async () => {
      const apiKey = process.env.TRACKR_API_KEY;
      if (!apiKey) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trackr API key not configured. Please set TRACKR_API_KEY in settings.' });
      }
      return trackr.syncTrackrPosts(apiKey);
    }),
  }),

  // ============ AI SUMMARIES ============
  summaries: router({
    generate: protectedProcedure
      .input(z.object({ creatorId: z.string() }))
      .mutation(async ({ input }) => {
        const aiSummary = await import('./ai-summary');
        return aiSummary.generateCreatorSummary(input.creatorId);
      }),

    generateAll: protectedProcedure.mutation(async () => {
      const aiSummary = await import('./ai-summary');
      return aiSummary.generateAllCreatorSummaries();
    }),
  }),

  // ============ SETTINGS ============
  settings: router({
    list: protectedProcedure.query(async () => {
      return db.listSettings();
    }),

    get: protectedProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        return db.getSetting(input.key);
      }),

    upsert: protectedProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
      }))
      .mutation(async ({ input }) => {
        return db.upsertSetting(input.key, input.value);
      }),
  }),
});

export type AppRouter = typeof appRouter;
