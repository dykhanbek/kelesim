// Daily housekeeping (cron): removes one-click demo accounts older than a day,
// expired sessions / reset links and stale rate-limit buckets, so the database doesn't grow forever.
import type { Env } from "../env";

export const DEMO_TTL_HOURS = 24;

export interface CleanupReport {
  demoUsers: number;
  sessions: number;
  resets: number;
  rateLimits: number;
}

export async function cleanup(env: Env, now = new Date()): Promise<CleanupReport> {
  const db = env.DB;
  const nowIso = now.toISOString();
  // users.created_at is SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" (UTC)
  const demoCutoff = new Date(now.getTime() - DEMO_TTL_HOURS * 3600_000).toISOString().replace("T", " ").slice(0, 19);

  const demo = await db
    .prepare("SELECT id FROM users WHERE login LIKE '%@kelisim.demo' AND created_at < ?")
    .bind(demoCutoff)
    .all<{ id: string }>();
  const ids = demo.results.map((r) => r.id);

  for (const id of ids) {
    // Proof files kept in R2 are outside the database: delete them first
    if (env.PROOFS) {
      const files = await db.prepare("SELECT r2_key FROM proof_files WHERE user_id = ? AND storage = 'r2' AND r2_key IS NOT NULL").bind(id).all<{ r2_key: string }>();
      for (const f of files.results) await env.PROOFS.delete(f.r2_key);
    }
    // Deals reference counterparties, so remove deals first; everything else cascades from users
    await db.batch([
      db.prepare("DELETE FROM deals WHERE user_id = ?").bind(id),
      db.prepare("DELETE FROM users WHERE id = ?").bind(id),
    ]);
  }

  const sessions = await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(nowIso).run();
  const resets = await db.prepare("DELETE FROM password_resets WHERE expires_at < ?").bind(nowIso).run();
  // Every rule window is ≤ 1 hour, so buckets older than a day are dead
  const rl = await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now.getTime() - 86_400_000).run();

  return {
    demoUsers: ids.length,
    sessions: sessions.meta.changes ?? 0,
    resets: resets.meta.changes ?? 0,
    rateLimits: rl.meta.changes ?? 0,
  };
}
