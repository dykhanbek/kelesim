// Fixed-window rate limiting stored in D1 (table rate_limits).
// Used against password brute force (per account + per IP) and against spamming
// password-reset emails and demo accounts.
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "./http";

export interface Rule {
  /** max hits inside the window */
  limit: number;
  /** window length, ms */
  windowMs: number;
}

export const RULES = {
  /** 5 wrong passwords for one account in 15 min → that account is locked for the rest of the window */
  loginAccount: { limit: 5, windowMs: 15 * 60_000 },
  /** 20 wrong passwords from one IP in 15 min (many accounts from one address) */
  loginIp: { limit: 20, windowMs: 15 * 60_000 },
  /** 5 password-reset requests per IP per hour */
  forgotIp: { limit: 5, windowMs: 60 * 60_000 },
  /** 10 demo accounts per IP per hour */
  demoIp: { limit: 10, windowMs: 60 * 60_000 },
} satisfies Record<string, Rule>;

export interface Bucket {
  count: number;
  window_start: number;
}

/** Pure decision: is the bucket over its limit at `now`? Returns seconds until it frees up (0 = allowed). */
export function retryAfter(bucket: Bucket | null, rule: Rule, now: number): number {
  if (!bucket) return 0;
  const ends = bucket.window_start + rule.windowMs;
  if (now >= ends) return 0; // window expired
  return bucket.count >= rule.limit ? Math.ceil((ends - now) / 1000) : 0;
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

async function getBucket(db: D1Database, key: string): Promise<Bucket | null> {
  return db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first<Bucket>();
}

/** Throws 429 if any of the keys is over its limit. */
export async function assertNotLimited(db: D1Database, checks: [key: string, rule: Rule][], now = Date.now()) {
  for (const [key, rule] of checks) {
    const wait = retryAfter(await getBucket(db, key), rule, now);
    if (wait > 0) throw new ApiError(429, "too_many_attempts", { retry_after: wait });
  }
}

/** Counts one hit; starts a new window when the old one has expired. */
export async function hit(db: D1Database, key: string, rule: Rule, now = Date.now()) {
  await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count        = CASE WHEN window_start + ?3 <= ?2 THEN 1  ELSE count + 1 END,
         window_start = CASE WHEN window_start + ?3 <= ?2 THEN ?2 ELSE window_start END`,
    )
    .bind(key, now, rule.windowMs)
    .run();
}

export async function clear(db: D1Database, key: string) {
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}
