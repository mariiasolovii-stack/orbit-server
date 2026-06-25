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
 * Calculate pending payout for a single post based on retroactive tier logic.
 * Returns the incremental amount owed (new tier amount - last paid tier).
 */
async function calcPendingPayout(post: any): Promise<number> {
  if (post.reviewStatus !== 'approved') return 0;
  if ((post.views || 0) < 300) return 0; // Min 300 views to qualify
  
  const tiers = await db.listPayoutTiers();
  const sorted = [...tiers].sort((a, b) => b.viewsThreshold - a.viewsThreshold);
  const tier = sorted.find(t => post.views >= t.viewsThreshold);
  const owed = tier ? tier.payoutAmount : 0;
  const lastPaid = post.lastPaidTier || 0;
  
  return Math.max(0, owed - lastPaid);
}

/**
 * Calculate trial creator payout based on warmup posts and view tiers.
 */
async function calcTrialCreatorPayout(post: any): Promise<{ amount: number; type: string }> {
  if (post.reviewStatus !== 'approved') return { amount: 0, type: 'pending' };
  if ((post.views || 0) < 300) return { amount: 0, type: 'pending' };
  
  const views = post.views || 0;
  const lastPaid = post.lastPaidTier || 0;
  
  // Define trial creator tiers
  const trialTiers = [
    { views: 5000000, amount: 1500 },
    { views: 1500000, amount: 1000 },
    { views: 1000000, amount: 500 },
    { views: 250000, amount: 400 },
    { views: 100000, amount: 300 },
    { views: 50000, amount: 150 },
    { views: 25000, amount: 50 },
    { views: 10000, amount: 10 },
  ];
  
  const tier = trialTiers.find(t => views >= t.views);
  const owed = tier ? tier.amount : 20; // $20 base rate per video
  
  return {
    amount: Math.max(0, owed - lastPaid),
    type: tier ? 'bonus' : 'post'
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
    list: protectedProcedure.query(async () => {
      return db.listCreators();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return db.getCreator(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
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
          email: input.email,
          status: input.status,
          compType: input.compType,
          baseRate: input.baseRate,
          retainerAmount: input.retainerAmount,
          platforms: input.platforms ? JSON.stringify(input.platforms) : null,
          tiktokHandle: input.tiktokHandle,
          instagramHandle: input.instagramHandle,
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
          email: z.string().email().optional(),
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
        return db.updateCreator(input.id, updateData);
      }),

    promote: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return db.updateCreator(input.id, { status: 'active' });
      }),

    fire: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return db.updateCreator(input.id, { status: 'fired' });
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

    calculatePending: protectedProcedure.query(async () => {
      const posts = await db.listPosts();
      const creators = await db.listCreators();
      
      const pending: Record<string, number> = {};
      
      for (const post of posts) {
        const creator = creators.find(c => c.id === post.creatorId);
        if (!creator) continue;
        
        let amount = 0;
        if (creator.status === 'trial') {
          const trial = await calcTrialCreatorPayout(post);
          amount = trial.amount;
        } else if (creator.status === 'active') {
          amount = await calcPendingPayout(post);
        }
        
        if (amount > 0) {
          pending[post.creatorId] = (pending[post.creatorId] || 0) + amount;
        }
      }
      
      return pending;
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
      const apiKey = await db.getSetting('trackr_api_key');
      if (!apiKey) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trackr API key not configured' });
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
