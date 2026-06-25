import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, creators, posts, payoutTiers, payouts, scripts, settings, Creator, Post, PayoutTier, Payout, Script, Setting } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ CREATORS ============

export async function listCreators(): Promise<Creator[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(creators).orderBy(desc(creators.createdAt));
}

export async function getCreator(id: string): Promise<Creator | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
  return result[0];
}

export async function createCreator(data: Omit<Creator, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Creator> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const id = data.id || `creator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(creators).values({ ...data, id } as any);
  const result = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
  return result[0];
}

export async function updateCreator(id: string, data: Partial<Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Creator> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(creators).set(data).where(eq(creators.id, id));
  const result = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
  return result[0];
}

// ============ POSTS ============

export async function listPosts(): Promise<Post[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(posts).orderBy(desc(posts.postDate));
}

export async function getPost(id: string): Promise<Post | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return result[0];
}

export async function createPost(data: Omit<Post, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Post> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const id = data.id || `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(posts).values({ ...data, id } as any);
  const result = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return result[0];
}

export async function updatePost(id: string, data: Partial<Omit<Post, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Post> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(posts).set(data).where(eq(posts.id, id));
  const result = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return result[0];
}

export async function deletePost(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(posts).where(eq(posts.id, id));
}

// ============ PAYOUT TIERS ============

export async function listPayoutTiers(): Promise<PayoutTier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payoutTiers).orderBy(payoutTiers.viewsThreshold);
}

export async function createPayoutTier(data: Omit<PayoutTier, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<PayoutTier> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const id = data.id || `tier-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(payoutTiers).values({ ...data, id } as any);
  const result = await db.select().from(payoutTiers).where(eq(payoutTiers.id, id)).limit(1);
  return result[0];
}

export async function updatePayoutTier(id: string, data: Partial<Omit<PayoutTier, 'id' | 'createdAt' | 'updatedAt'>>): Promise<PayoutTier> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(payoutTiers).set(data).where(eq(payoutTiers.id, id));
  const result = await db.select().from(payoutTiers).where(eq(payoutTiers.id, id)).limit(1);
  return result[0];
}

export async function deletePayoutTier(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(payoutTiers).where(eq(payoutTiers.id, id));
}

// ============ PAYOUTS ============

export async function listPayouts(): Promise<Payout[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payouts).orderBy(desc(payouts.payoutDate));
}

export async function createPayout(data: Omit<Payout, 'id' | 'createdAt'> & { id?: string }): Promise<Payout> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const id = data.id || `payout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(payouts).values({ ...data, id } as any);
  const result = await db.select().from(payouts).where(eq(payouts.id, id)).limit(1);
  return result[0];
}

// ============ SCRIPTS ============

export async function listScripts(): Promise<Script[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scripts).orderBy(desc(scripts.createdAt));
}

export async function getScript(id: string): Promise<Script | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
  return result[0];
}

export async function createScript(data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Script> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const id = data.id || `script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(scripts).values({ ...data, id } as any);
  const result = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
  return result[0];
}

export async function updateScript(id: string, data: Partial<Omit<Script, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Script> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(scripts).set(data).where(eq(scripts.id, id));
  const result = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
  return result[0];
}

export async function deleteScript(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(scripts).where(eq(scripts.id, id));
}

// ============ SETTINGS ============

export async function listSettings(): Promise<Setting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(settings);
}

export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0]?.value ?? undefined;
}

export async function upsertSetting(key: string, value: string): Promise<Setting> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const id = `setting-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(settings).values({ id, key, value } as any).onDuplicateKeyUpdate({
    set: { value }
  });
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0];
}
