import { Hono } from "hono";
import { isValidBin } from "../../shared/bin";
import { FREE_PACKAGES_PER_MONTH, type AppEnv } from "../env";
import { deleteCookie } from "hono/cookie";
import { hashPassword, requireAuth, SESSION_COOKIE, verifyPassword } from "../lib/auth";
import { deleteUserData } from "../lib/cleanup";
import { consentLogStmt, LEGAL_VERSION } from "../lib/consent";
import { lookupCompany } from "../lib/registry";
import { usageThisMonth } from "../lib/deals";
import { emailConfigured, isEmail, sendEmail } from "../lib/email";
import { ApiError, readJson, str } from "../lib/http";

export const account = new Hono<AppEnv>();
account.use("*", requireAuth);

/** Update profile: name, interface language, plan (simulated — no payment in the MVP), onboarding progress. */
account.patch("/me", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof body.name === "string") { sets.push("name = ?"); vals.push(str(body.name, 80)); }
  if (body.lang === "ru" || body.lang === "en" || body.lang === "kk") { sets.push("lang = ?"); vals.push(body.lang); }
  if (body.plan === "free" || body.plan === "basic" || body.plan === "pro") { sets.push("plan = ?"); vals.push(body.plan); }
  if (typeof body.email === "string") {
    const email = str(body.email, 120).toLowerCase();
    if (email && !isEmail(email)) throw new ApiError(422, "validation", { email: "invalid_email" });
    sets.push("email = ?");
    vals.push(email || null);
  }
  if (typeof body.email_reminders === "boolean") { sets.push("email_reminders = ?"); vals.push(body.email_reminders ? 1 : 0); }
  // Advertising consent can be given or withdrawn at any time; each change is logged
  const marketingChanged = typeof body.marketing_consent === "boolean" && Boolean(user.marketing_consent) !== body.marketing_consent;
  if (marketingChanged) {
    sets.push("marketing_consent = ?", "marketing_consent_at = ?");
    vals.push(body.marketing_consent ? 1 : 0, new Date().toISOString());
  }
  if (typeof body.onboarding_step === "number" && body.onboarding_step >= 1 && body.onboarding_step <= 4) {
    sets.push("onboarding_step = ?");
    vals.push(Math.max(user.onboarding_step, body.onboarding_step));
  }
  if (!sets.length) throw new ApiError(400, "nothing_to_update");
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, user.id).run();
  if (marketingChanged) await consentLogStmt(c, user.id, "marketing", body.marketing_consent === true).run();
  return c.json({ ok: true });
});

/** Consents: current state + history (subject's right to know how their data is processed). */
account.get("/consents", async (c) => {
  const user = c.get("user");
  const log = await c.env.DB.prepare("SELECT kind, granted, version, created_at FROM consent_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
  return c.json({
    terms_accepted_at: user.terms_accepted_at,
    pd_consent_at: user.pd_consent_at,
    marketing_consent: Boolean(user.marketing_consent),
    marketing_consent_at: user.marketing_consent_at,
    consent_version: user.consent_version,
    current_version: LEGAL_VERSION,
    log: log.results,
  });
});

/** "Download my data": everything stored about the user as one JSON file. */
account.get("/export", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const q = (sql: string) => db.prepare(sql).bind(user.id).all().then((r) => r.results);
  const [company, counterparties, deals, deadlines, events, files, consents, reviews, orders] = await Promise.all([
    db.prepare("SELECT * FROM companies WHERE user_id = ?").bind(user.id).first(),
    q("SELECT * FROM counterparties WHERE user_id = ?"),
    q("SELECT * FROM deals WHERE user_id = ?"),
    q("SELECT * FROM deadlines WHERE user_id = ?"),
    q("SELECT e.* FROM deal_events e JOIN deals d ON d.id = e.deal_id WHERE d.user_id = ?"),
    q("SELECT id, deadline_id, filename, size, content_type, created_at FROM proof_files WHERE user_id = ?"),
    q("SELECT kind, granted, version, ip, user_agent, created_at FROM consent_log WHERE user_id = ? ORDER BY created_at"),
    q("SELECT id, deal_id, filename, text, score, risk, created_at FROM contract_reviews WHERE user_id = ?"),
    q("SELECT number, service, status, price, details_json, contact, result_text, result_url, created_at, done_at FROM orders WHERE user_id = ?"),
  ]);
  const parse = (rows: any[]) => rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of ["data_json", "check_json"]) if (typeof out[k] === "string") { try { out[k] = JSON.parse(out[k] as string); } catch { /* keep */ } }
    return out;
  });
  const { telegram_link_code: _code, ...profile } = user;
  const body = JSON.stringify({ exported_at: new Date().toISOString(), profile, company, counterparties, deals: parse(deals), deadlines, events, proof_files: files, consents, contract_reviews: reviews, orders }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="kelisim-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});

/**
 * Delete account = withdrawal of the personal-data consent: all data is erased immediately.
 * Requires the current password (not for one-click demo accounts).
 */
account.delete("/me", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  if (!user.login.endsWith("@kelisim.demo")) {
    const row = await c.env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string; password_salt: string }>();
    if (!row || !(await verifyPassword(str(body.password, 200), row.password_hash, row.password_salt))) throw new ApiError(403, "wrong_password");
  }
  await deleteUserData(c.env, user.id);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

account.get("/usage", async (c) => {
  const user = c.get("user");
  const used = await usageThisMonth(c.env.DB, user.id);
  const limit = user.plan === "free" ? FREE_PACKAGES_PER_MONTH : null;
  return c.json({ plan: user.plan, used, limit, reached: limit !== null && used >= limit });
});

/** BIN/IIN lookup: checksum, then the official statistical register (stat.gov.kz, cached), then the demo registry. */
account.get("/company/lookup", async (c) => {
  const bin = (c.req.query("bin") ?? "").replace(/\D/g, "");
  if (!isValidBin(bin)) throw new ApiError(422, "invalid_bin");
  return c.json(await lookupCompany(c.env, bin));
});

const COMPANY_FIELDS = ["bin", "legal_form", "name_ru", "name_en", "city", "address", "signatory", "signatory_basis", "bank_name", "bik", "iban"] as const;

account.get("/company", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE user_id = ?").bind(c.get("user").id).first();
  return c.json({ company: row });
});

account.put("/company", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const v = Object.fromEntries(COMPANY_FIELDS.map((f) => [f, str(body[f], 300)])) as Record<(typeof COMPANY_FIELDS)[number], string>;
  const errors: Record<string, string> = {};
  if (v.bin && !isValidBin(v.bin)) errors.bin = "invalid_bin";
  if (!v.name_ru) errors.name_ru = "required";
  if (v.iban && !/^KZ\d{2}[A-Z0-9]{16}$/i.test(v.iban.replace(/\s/g, ""))) errors.iban = "invalid_iban";
  if (Object.keys(errors).length) throw new ApiError(422, "validation", errors);
  v.iban = v.iban.replace(/\s/g, "").toUpperCase();
  await c.env.DB.prepare(
    `INSERT INTO companies (user_id, ${COMPANY_FIELDS.join(", ")}, updated_at) VALUES (?, ${COMPANY_FIELDS.map(() => "?").join(", ")}, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET ${COMPANY_FIELDS.map((f) => `${f} = excluded.${f}`).join(", ")}, updated_at = excluded.updated_at`,
  )
    .bind(user.id, ...COMPANY_FIELDS.map((f) => v[f]))
    .run();
  return c.json({ ok: true });
});

account.post("/password", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const next = str(body.next, 200);
  if (next.length < 8) throw new ApiError(422, "weak_password");
  const row = await c.env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string; password_salt: string }>();
  if (!row || !(await verifyPassword(str(body.current, 200), row.password_hash, row.password_salt))) throw new ApiError(401, "invalid_credentials");
  const { hash, salt } = await hashPassword(next);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(hash, salt, user.id).run();
  return c.json({ ok: true });
});

account.post("/email-test", async (c) => {
  const user = c.get("user");
  if (!emailConfigured(c.env)) throw new ApiError(409, "email_not_configured");
  if (!isEmail(user.email)) throw new ApiError(422, "validation", { email: "invalid_email" });
  const en = user.lang === "en";
  const ok = await sendEmail(c.env, user.email, en ? "Kelisim: test email" : "Kelisim: тестовое письмо",
    en ? "Email reminders are on. Kelisim will write 7, 3 and 1 day before each deadline." : "Напоминания на почту включены. Kelisim напишет за 7, 3 и 1 день до каждого срока.",
    { label: en ? "Open Kelisim" : "Открыть Kelisim", url: `${c.env.APP_URL}/app` });
  if (!ok) throw new ApiError(500, "email_failed");
  return c.json({ ok: true });
});
