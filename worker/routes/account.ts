import { Hono } from "hono";
import { isValidBin } from "../../shared/bin";
import { DEMO_REGISTRY } from "../../shared/sample";
import { FREE_PACKAGES_PER_MONTH, type AppEnv } from "../env";
import { hashPassword, requireAuth, verifyPassword } from "../lib/auth";
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
  if (body.lang === "ru" || body.lang === "en") { sets.push("lang = ?"); vals.push(body.lang); }
  if (body.plan === "free" || body.plan === "basic" || body.plan === "pro") { sets.push("plan = ?"); vals.push(body.plan); }
  if (typeof body.email === "string") {
    const email = str(body.email, 120).toLowerCase();
    if (email && !isEmail(email)) throw new ApiError(422, "validation", { email: "invalid_email" });
    sets.push("email = ?");
    vals.push(email || null);
  }
  if (typeof body.email_reminders === "boolean") { sets.push("email_reminders = ?"); vals.push(body.email_reminders ? 1 : 0); }
  if (typeof body.onboarding_step === "number" && body.onboarding_step >= 1 && body.onboarding_step <= 4) {
    sets.push("onboarding_step = ?");
    vals.push(Math.max(user.onboarding_step, body.onboarding_step));
  }
  if (!sets.length) throw new ApiError(400, "nothing_to_update");
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, user.id).run();
  return c.json({ ok: true });
});

account.get("/usage", async (c) => {
  const user = c.get("user");
  const used = await usageThisMonth(c.env.DB, user.id);
  const limit = user.plan === "free" ? FREE_PACKAGES_PER_MONTH : null;
  return c.json({ plan: user.plan, used, limit, reached: limit !== null && used >= limit });
});

/** BIN lookup with checksum validation. The registry is a demo stub (production: stat.gov.kz / egov API). */
account.get("/company/lookup", async (c) => {
  const bin = (c.req.query("bin") ?? "").replace(/\D/g, "");
  if (!isValidBin(bin)) throw new ApiError(422, "invalid_bin");
  const found = DEMO_REGISTRY[bin];
  return c.json({ found: Boolean(found), company: found ?? { bin } });
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
