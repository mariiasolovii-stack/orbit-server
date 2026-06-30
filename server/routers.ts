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
 * Dual-platform payout model:
 * - $20 base ONLY if the video was posted on BOTH TikTok AND Instagram.
 *   A video on only one platform earns $0 base.
 * - Bonus = the single highest tier reached by the HIGHER view count
 *   across both platforms for that video.
 * - lastPaidTier is stored on the PRIMARY post (isCrosspostDuplicate=0)
 *   and represents the cumulative amount already paid for the whole group.
 *
 * Bonus tiers (retroactive — pay only the incremental difference):
 *   10k -> +$10, 25k -> +$50, 50k -> +$150, 100k -> +$300,
 *   250k -> +$400, 1M -> +$500, 1.5M -> +$1,000, 5M -> +$1,500
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

/** Bonus amount for a given view count (0 if below all tiers). */
export function bonusForViews(views: number): number {
  const tier = BONUS_TIERS.find(t => views >= t.views);
  return tier ? tier.amount : 0;
}

/**
 * Compute the TOTAL earned for a video GROUP at the given max view count.
 * hasBothPlatforms must be true for the $20 base to apply.
 */
export function totalEarnedForGroup(maxViews: number, hasBothPlatforms: boolean): number {
  if (!hasBothPlatforms) return 0;
  if ((maxViews || 0) < MIN_QUALIFYING_VIEWS) return 0;
  return BASE_RATE + bonusForViews(maxViews);
}

/**
 * Legacy single-post helper (kept for tests that haven't migrated yet).
 * @deprecated Use calcGroupPayout instead.
 */
export function totalEarnedForViews(views: number): number {
  if ((views || 0) < MIN_QUALIFYING_VIEWS) return 0;
  const tier = BONUS_TIERS.find(t => views >= t.views);
  return BASE_RATE + (tier ? tier.amount : 0);
}

/**
 * Calculate the incremental pending payout for a VIDEO GROUP (retroactive).
 *
 * @param primary   The primary post (isCrosspostDuplicate=0) — carries lastPaidTier.
 * @param duplicate The crossposted partner post on the other platform, or null if
 *                  the video was only posted on one platform.
 */
export function calcGroupPayout(
  primary: any,
  duplicate: any | null
): { amount: number; type: string; maxViews: number; hasBothPlatforms: boolean } {
  if (primary.reviewStatus !== 'approved') {
    return { amount: 0, type: 'pending', maxViews: 0, hasBothPlatforms: false };
  }

  // Require both TikTok and Instagram for base pay.
  const platforms = new Set<string>();
  platforms.add((primary.platform || '').toLowerCase());
  if (duplicate) platforms.add((duplicate.platform || '').toLowerCase());
  const hasBothPlatforms =
    (platforms.has('tiktok') && platforms.has('instagram'));

  const primaryViews = primary.views || 0;
  const duplicateViews = duplicate ? (duplicate.views || 0) : 0;
  const maxViews = Math.max(primaryViews, duplicateViews);

  const total = totalEarnedForGroup(maxViews, hasBothPlatforms);
  const lastPaid = primary.lastPaidTier || 0;
  const bonus = bonusForViews(maxViews);

  return {
    amount: Math.max(0, total - lastPaid),
    type: bonus > 0 ? 'bonus' : (hasBothPlatforms && maxViews >= MIN_QUALIFYING_VIEWS ? 'base' : 'pending'),
    maxViews,
    hasBothPlatforms,
  };
}

/**
 * Group a flat list of posts by crosspostGroupId.
 * Returns a map of groupId -> [primary, ...duplicates].
 * Posts without a groupId are treated as solo (their own group).
 */
export function groupPostsByGroupId(posts: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const p of posts) {
    const key = (p as any).crosspostGroupId || p.id; // fallback: solo group
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return groups;
}

/**
 * From a group of posts (same crosspostGroupId), identify the primary post
 * (isCrosspostDuplicate=0, or the one with the most views if all are 0) and
 * the duplicate (the other platform's post, if present).
 */
export function resolveGroup(groupPosts: any[]): { primary: any; duplicate: any | null } {
  // Primary = the post marked as NOT a crosspost duplicate.
  // If none are marked (e.g. solo post), just use the first.
  const primary = groupPosts.find(p => !(p.isCrosspostDuplicate === 1 || p.isCrosspostDuplicate === true))
    ?? groupPosts[0];
  const duplicate = groupPosts.find(p => p.id !== primary.id) ?? null;
  return { primary, duplicate };
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

    // Merge a duplicate/ghost creator into a target creator:
    // reassigns all posts from sourceId to targetId, then deletes sourceId.
    merge: protectedProcedure
      .input(z.object({
        sourceId: z.string(),   // creator to delete (ghost/duplicate)
        targetId: z.string(),   // creator to keep (the real one)
      }))
      .mutation(async ({ input }) => {
        if (input.sourceId === input.targetId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source and target must be different creators' });
        }
        const dbConn = await db.getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        // Reassign all posts from source to target
        const { posts: postsTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [updateResult] = await dbConn.update(postsTable)
          .set({ creatorId: input.targetId })
          .where(eq(postsTable.creatorId, input.sourceId)) as any;
        const movedPosts = updateResult?.affectedRows ?? 0;

        // Delete the source creator
        const { creators: creatorsTable } = await import('../drizzle/schema');
        await dbConn.delete(creatorsTable).where(eq(creatorsTable.id, input.sourceId));

        return { movedPosts, deletedCreatorId: input.sourceId };
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

        // Filter to posts in this pay period, then group by crosspostGroupId.
        const periodPosts = posts.filter(post => {
          const creator = creators.find(c => c.id === post.creatorId);
          if (!creator) return false;
          if (creator.status === 'fired' || (creator as any).archived === 1) return false;
          const postDate = post.postDate ? new Date(post.postDate) : null;
          return postDate && postDate >= periodStart && postDate < periodEnd;
        });

        // Group by crosspostGroupId and calculate payout per group.
        const groups = groupPostsByGroupId(periodPosts);
        for (const groupPosts of Array.from(groups.values())) {
          const { primary, duplicate } = resolveGroup(groupPosts);
          const { amount } = calcGroupPayout(primary, duplicate);
          if (amount > 0) {
            pending[primary.creatorId] = (pending[primary.creatorId] || 0) + amount;
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
        let groupsPaid = 0;

        // Filter to this creator's posts in this pay period.
        const periodPosts = posts.filter(post => {
          if (post.creatorId !== input.creatorId) return false;
          const postDate = post.postDate ? new Date(post.postDate) : null;
          return postDate && postDate >= periodStart && postDate < periodEnd;
        });

        // Group and calculate payout per group.
        const groups = groupPostsByGroupId(periodPosts);
        for (const groupPosts of Array.from(groups.values())) {
          const { primary, duplicate } = resolveGroup(groupPosts);
          const { amount, type, maxViews } = calcGroupPayout(primary, duplicate);
          if (amount <= 0) continue;

          // Advance lastPaidTier on the PRIMARY post to the full group total earned.
          const newPaidTotal = totalEarnedForGroup(maxViews, true);
          await db.updatePost(primary.id, { lastPaidTier: newPaidTotal });
          await db.createPayout({
            creatorId: input.creatorId,
            postId: primary.id,
            amount,
            payoutType: type === 'bonus' ? 'bonus' : 'post',
            payoutDate,
            notes: `Marked paid for ${year}-${String(month + 1).padStart(2, '0')} pay period`,
          } as any);

          totalPaid += amount;
          groupsPaid += 1;
        }

        return { creatorId: input.creatorId, totalPaid, postsPaid: groupsPaid };
      }),

    // Full per-post payout breakdown for a given creator + pay period.
    // Returns every post in the period with its date, platform, views, URL,
    // payout amount, and whether it is a crosspost duplicate.
    getBreakdown: protectedProcedure
      .input(
        z.object({
          creatorId: z.string(),
          year: z.number().int().optional(),
          month: z.number().int().min(0).max(11).optional(),
        })
      )
      .query(async ({ input }) => {
        const now = new Date();
        const year = input.year ?? now.getUTCFullYear();
        const month = input.month ?? now.getUTCMonth();
        const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
        const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

        const allPosts = await db.listPosts();
        const periodPosts = allPosts.filter(p => {
          if (p.creatorId !== input.creatorId) return false;
          const d = p.postDate ? new Date(p.postDate) : null;
          return d && d >= periodStart && d < periodEnd;
        });

        // Group by crosspostGroupId and build one row per group.
        const groups = groupPostsByGroupId(periodPosts);
        const rows: any[] = [];

        for (const groupPosts of Array.from(groups.values())) {
          const { primary, duplicate } = resolveGroup(groupPosts);
          const { amount, type, maxViews, hasBothPlatforms } = calcGroupPayout(primary, duplicate);

          // Determine which platform has the higher views (drives the bonus).
          const primaryViews = primary.views || 0;
          const duplicateViews = duplicate ? (duplicate.views || 0) : 0;
          const bonusPlatform = duplicate
            ? (primaryViews >= duplicateViews ? primary.platform : duplicate.platform)
            : primary.platform;

          rows.push({
            id: primary.id,
            platform: primary.platform,
            partnerPlatform: duplicate ? duplicate.platform : null,
            postDate: primary.postDate,
            postUrl: primary.postUrl,
            partnerPostUrl: duplicate ? duplicate.postUrl : null,
            title: (primary as any).title || null,
            views: primaryViews,
            partnerViews: duplicateViews,
            maxViews,
            bonusPlatform,
            hasBothPlatforms,
            likes: primary.likes || 0,
            comments: primary.comments || 0,
            shares: primary.shares || 0,
            saves: primary.saves || 0,
            reviewStatus: primary.reviewStatus,
            isCrosspostDuplicate: (primary as any).isCrosspostDuplicate === 1,
            lastPaidTier: primary.lastPaidTier || 0,
            payoutAmount: amount,
            payoutType: type,
          });
        }

        rows.sort((a, b) => new Date(b.postDate).getTime() - new Date(a.postDate).getTime());
        return rows;
      }),

    generateInvoice: protectedProcedure
      .input(
        z.object({
          creatorId: z.string(),
          year: z.number().int().optional(),
          month: z.number().int().min(0).max(11).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const ExcelJS = require('exceljs');
        const now = new Date();
        const year = input.year ?? now.getUTCFullYear();
        const month = input.month ?? now.getUTCMonth();
        const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
        const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

        const creator = await db.getCreator(input.creatorId);
        if (!creator) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Creator not found' });
        }

        const allPosts = await db.listPosts();
        const periodPosts = allPosts.filter(p => {
          if (p.creatorId !== input.creatorId) return false;
          const d = p.postDate ? new Date(p.postDate) : null;
          return d && d >= periodStart && d < periodEnd;
        });

        const groups = groupPostsByGroupId(periodPosts);
        const invoiceRows: any[] = [];
        let totalBase = 0;
        let totalBonus = 0;
        let videoCount = 0;

        for (const groupPosts of Array.from(groups.values())) {
          const { primary, duplicate } = resolveGroup(groupPosts);
          const { amount, type, maxViews, hasBothPlatforms } = calcGroupPayout(primary, duplicate);

          if (!hasBothPlatforms) continue;

          const baseAmount = hasBothPlatforms ? BASE_RATE : 0;
          const bonusAmount = bonusForViews(maxViews);
          const totalAmount = baseAmount + bonusAmount;

          if (totalAmount > 0) {
            const primaryViews = primary.views || 0;
            const duplicateViews = duplicate ? (duplicate.views || 0) : 0;
            const bonusPlatform = primaryViews >= duplicateViews ? primary.platform : (duplicate?.platform || primary.platform);

            invoiceRows.push({
              date: primary.postDate ? new Date(primary.postDate).toLocaleDateString('en-US') : '',
              platform: primary.platform,
              partnerPlatform: duplicate ? duplicate.platform : '',
              url: primary.postUrl || '',
              partnerUrl: duplicate ? (duplicate.postUrl || '') : '',
              views: primaryViews,
              partnerViews: duplicateViews,
              maxViews,
              bonusPlatform,
              baseAmount,
              bonusAmount,
              totalAmount,
            });

            totalBase += baseAmount;
            totalBonus += bonusAmount;
            videoCount += 1;
          }
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoice');

        worksheet.columns = [
          { header: '', key: 'col1', width: 25 },
          { header: '', key: 'col2', width: 5 },
          { header: '', key: 'col3', width: 35 },
        ];

        const headerRows = [
          ['Creator Name', '', creator.name],
          ['Bonus Total', '', totalBonus],
          ['Number of videos', '', videoCount],
          ['Base Total', '', totalBase],
          ['Total Month Compensation', '', totalBase + totalBonus],
          ['Social Media Handle', '', ''],
          ['TikTok', '', creator.tiktokHandle || ''],
          ['Instagram', '', creator.instagramHandle || ''],
          ['MONTH', '', `${year}-${String(month + 1).padStart(2, '0')}`],
        ];

        headerRows.forEach((row, idx) => {
          const wsRow = worksheet.addRow(row);
          if (idx < 5) {
            wsRow.eachCell((cell: any) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
              cell.font = { bold: true };
            });
          }
        });

        worksheet.addRow([]);

        const tableHeaderRow = worksheet.addRow([
          'Video Link',
          'Platform',
          'Views',
          'Tier',
          'Bonus $',
          'Base $',
          'Total $',
        ]);
        tableHeaderRow.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D3D3D3' } };
          cell.font = { bold: true };
        });

        invoiceRows.forEach(row => {
          const tierName = BONUS_TIERS.find(t => row.maxViews >= t.views)?.views || '';
          worksheet.addRow([
            row.url,
            `${row.platform}${row.partnerPlatform ? ` / ${row.partnerPlatform}` : ''}`,
            `${row.views}${row.partnerViews ? ` / ${row.partnerViews}` : ''}`,
            tierName ? `${(tierName / 1000).toFixed(0)}k` : '-',
            row.bonusAmount,
            row.baseAmount,
            row.totalAmount,
          ]);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = buffer.toString('base64');
        const filename = `Alta_Invoice_${creator.name}_${year}-${String(month + 1).padStart(2, '0')}.xlsx`;

        return {
          filename,
          base64,
          totalBase,
          totalBonus,
          totalAmount: totalBase + totalBonus,
          videoCount,
        };
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
