import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Creators table - tracks all UGC creators in the program
 */
export const creators = mysqlTable("creators", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  status: mysqlEnum("status", ["trial", "active", "fired"]).default("trial").notNull(),
  compType: mysqlEnum("comp_type", ["ppp", "retainer"]).default("ppp").notNull(), // per-post or retainer
  baseRate: int("base_rate").default(25), // $ per post for PPP
  retainerAmount: int("retainer_amount").default(0), // $ per month for retainer
  platforms: text("platforms"), // JSON array of platforms
  tiktokHandle: varchar("tiktok_handle", { length: 255 }),
  instagramHandle: varchar("instagram_handle", { length: 255 }),
  startDate: timestamp("start_date"), // trial start date
  docusignStatus: mysqlEnum("docusign_status", ["pending", "sent", "signed"]).default("pending"),
  docusignEnvelopeId: varchar("docusign_envelope_id", { length: 255 }),
  archived: int("archived").default(0), // boolean: 1 = archived/removed from active roster
  archivedAt: timestamp("archived_at"), // when archived
  syncEnabled: int("sync_enabled").default(1), // boolean: 1 = keep syncing this creator's handles from Trackr
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Creator = typeof creators.$inferSelect;
export type InsertCreator = typeof creators.$inferInsert;

/**
 * Posts table - tracks individual posts and their performance
 */
export const posts = mysqlTable("posts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  creatorId: varchar("creator_id", { length: 36 }).notNull(),
  platform: varchar("platform", { length: 50 }).notNull(), // TikTok, Instagram, YouTube, etc.
  postDate: timestamp("post_date").notNull(),
  postUrl: varchar("post_url", { length: 500 }),
  views: int("views").default(0),
  likes: int("likes").default(0),
  comments: int("comments").default(0),
  shares: int("shares").default(0),
  saves: int("saves").default(0),
  title: text("title"), // post caption/title from Trackr
  trackrPostId: varchar("trackr_post_id", { length: 64 }), // Trackr's post_id for reliable matching
  reviewStatus: mysqlEnum("review_status", ["pending", "approved", "rejected"]).default("pending"),
  isTrialPost: int("is_trial_post").default(0), // boolean flag
  lastPaidTier: int("last_paid_tier").default(0), // highest tier amount already paid for this post
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

/**
 * Payout tiers table - defines view thresholds and payout amounts
 */
export const payoutTiers = mysqlTable("payout_tiers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  viewsThreshold: int("views_threshold").notNull(), // e.g., 1000, 10000, 100000
  payoutAmount: int("payout_amount").notNull(), // $ amount for hitting this tier
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PayoutTier = typeof payoutTiers.$inferSelect;
export type InsertPayoutTier = typeof payoutTiers.$inferInsert;

/**
 * Payouts table - historical record of all payouts
 */
export const payouts = mysqlTable("payouts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  creatorId: varchar("creator_id", { length: 36 }).notNull(),
  postId: varchar("post_id", { length: 36 }),
  amount: int("amount").notNull(), // $ amount
  payoutType: mysqlEnum("payout_type", ["post", "warmup", "bonus", "retainer"]).default("post"),
  payoutDate: timestamp("payout_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = typeof payouts.$inferInsert;

/**
 * Scripts table - library of content scripts for creators
 */
export const scripts = mysqlTable("scripts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  format: mysqlEnum("format", ["talking_head", "non_talking_head", "skit", "slideshow"]).notNull(),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Script = typeof scripts.$inferSelect;
export type InsertScript = typeof scripts.$inferInsert;

/**
 * Settings table - key-value configuration storage
 */
export const settings = mysqlTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;