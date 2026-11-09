import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createSession, currentUser, destroySession, hashPassword, normalizeLogin, randomToken, sha256, verifyPassword } from "../lib/auth";
import { emailConfigured, isEmail, sendEmail } from "../lib/email";
import { ApiError, readJson, str, uid } from "../lib/http";
import { consentLogStmt, LEGAL_VERSION } from "../lib/consent";
import { assertNotLimited, clear, clientIp, hit, RULES } from "../lib/ratelimit";
import { seedDemo } from "../lib/seed";

export const auth = new Hono<AppEnv>();

auth.post("/register", async (c) => {
  const body = await readJson(c);
  const login = normalizeLogin(str(body.login, 120));
  const password = str(body.password, 200);
  if (!login) throw new ApiError(422, "invalid_login");
  if (password.length < 8) throw new ApiError(422, "weak_password");
  // Two separate, unticked-by-default consents are required; marketing is optional (Law of RK on personal data)
  if (body.accept !== true) throw new ApiError(422, "terms_required");
  if (body.pd_consent !== true) throw new ApiError(422, "pd_consent_required");
  const marketing = body.marketing === true;
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE login = ?").bind(login).first();
  if (exists) throw new ApiError(409, "login_taken");
  const { hash, salt } = await hashPassword(password);
  const id = uid();
  const lang = body.lang === "en" ? "en" : "ru";
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, login, password_hash, password_salt, name, lang, email,
                          terms_accepted_at, pd_consent_at, marketing_consent, marketing_consent_at, consent_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, login, hash, salt, str(body.name, 80), lang, isEmail(login) ? login : null, now, now, marketing ? 1 : 0, now, LEGAL_VERSION),
    consentLogStmt(c, id, "terms", true),
    consentLogStmt(c, id, "personal_data", true),
    consentLogStmt(c, id, "marketing", marketing),
  ]);
  await createSession(c, id, true);
  return c.json({ ok: true }, 201);
});

auth.post("/login", async (c) => {
  const body = await readJson(c);
  const login = normalizeLogin(str(body.login, 120));
  const db = c.env.DB;
  // Brute-force protection: checked before the password, so a locked account can't be guessed at all
  const accKey = `login:${login ?? str(body.login, 120).toLowerCase()}`;
  const ipKey = `login-ip:${clientIp(c)}`;
  await assertNotLimited(db, [[accKey, RULES.loginAccount], [ipKey, RULES.loginIp]]);
  const row = login
    ? await db.prepare("SELECT id, password_hash, password_salt FROM users WHERE login = ?").bind(login).first<{ id: string; password_hash: string; password_salt: string }>()
    : null;
  if (!row || !(await verifyPassword(str(body.password, 200), row.password_hash, row.password_salt))) {
    await hit(db, accKey, RULES.loginAccount);
    await hit(db, ipKey, RULES.loginIp);
    throw new ApiError(401, "invalid_credentials");
  }
  await clear(db, accKey);
  await createSession(c, row.id, body.remember !== false);
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ user: null });
  const company = await c.env.DB.prepare("SELECT * FROM companies WHERE user_id = ?").bind(user.id).first();
  return c.json({
    user: { ...user, telegram_connected: Boolean(user.telegram_chat_id), telegram_link_code: undefined, telegram_chat_id: undefined, email_reminders: Boolean(user.email_reminders), marketing_consent: Boolean(user.marketing_consent), is_demo: user.login.endsWith("@kelisim.demo") },
    email_enabled: emailConfigured(c.env),
    company,
  });
});

/** Password reset: the link is emailed when Resend is configured; otherwise it is shown on screen (demo mode). */
/** Local `wrangler dev` (localhost) — the only place where reset links / verification codes may be shown on screen. */
export function isLocalDev(c: { req: { url: string }; env: { DEV_SHOW_LINKS?: string } }) {
  const host = new URL(c.req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || c.env.DEV_SHOW_LINKS === "on";
}

auth.post("/forgot", async (c) => {
  const body = await readJson(c);
  const login = normalizeLogin(str(body.login, 120));
  if (!login) throw new ApiError(422, "invalid_login");
  const ipKey = `forgot-ip:${clientIp(c)}`;
  await assertNotLimited(c.env.DB, [[ipKey, RULES.forgotIp]]);
  await hit(c.env.DB, ipKey, RULES.forgotIp);
  const mailMode = emailConfigured(c.env);
  // SECURITY: the reset link is shown on screen ONLY in local development. In production the link
  // goes by email only — otherwise anyone could reset anyone's password by typing their login.
  const devLinks = isLocalDev(c);
  if (!mailMode && !devLinks) return c.json({ ok: true, sent: false, unavailable: true, reset_url: null });
  const user = await c.env.DB.prepare("SELECT id, email, lang FROM users WHERE login = ?").bind(login).first<{ id: string; email: string | null; lang: string }>();
  // Same answer whether the account exists or not, and whether it has an email (no user enumeration)
  if (!user || (mailMode && !isEmail(user.email))) return c.json({ ok: true, sent: mailMode, reset_url: null });
  const token = randomToken(24);
  await c.env.DB.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), user.id, new Date(Date.now() + 3600_000).toISOString())
    .run();
  const path = `/reset-password?token=${token}`;
  if (mailMode) {
    const en = user.lang === "en";
    if (isEmail(user.email)) {
      await sendEmail(
        c.env,
        user.email,
        en ? "Kelisim: reset your password" : "Kelisim: восстановление пароля",
        en ? "Someone asked to reset the password of your Kelisim account. The link is valid for 1 hour. If it wasn't you, ignore this email." : "Вы запросили смену пароля в Kelisim. Ссылка действует 1 час. Если это были не вы, просто проигнорируйте письмо.",
        { label: en ? "Set a new password" : "Задать новый пароль", url: new URL(path, c.env.APP_URL).toString() },
      );
    }
    return c.json({ ok: true, sent: true, reset_url: null });
  }
  return c.json({ ok: true, sent: false, reset_url: path });
});

auth.post("/reset", async (c) => {
  const body = await readJson(c);
  const password = str(body.password, 200);
  if (password.length < 8) throw new ApiError(422, "weak_password");
  const tokenHash = await sha256(str(body.token, 100));
  const row = await c.env.DB.prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?")
    .bind(tokenHash, new Date().toISOString())
    .first<{ user_id: string }>();
  if (!row) throw new ApiError(400, "reset_expired");
  const { hash, salt } = await hashPassword(password);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(hash, salt, row.user_id),
    c.env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.user_id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  await createSession(c, row.user_id, true);
  return c.json({ ok: true });
});

/** One-click demo account with seeded deals (Pro plan) — for reviewers and the demo video. */
auth.post("/demo", async (c) => {
  const ipKey = `demo-ip:${clientIp(c)}`;
  await assertNotLimited(c.env.DB, [[ipKey, RULES.demoIp]]);
  await hit(c.env.DB, ipKey, RULES.demoIp);
  const id = uid();
  const { hash, salt } = await hashPassword(randomToken(12));
  const lang = (await readJson<{ lang?: string }>(c).catch(() => ({}) as { lang?: string })).lang === "en" ? "en" : "ru";
  await c.env.DB.prepare(
    "INSERT INTO users (id, login, password_hash, password_salt, name, lang, plan, onboarding_step) VALUES (?, ?, ?, ?, ?, ?, 'pro', 4)",
  )
    .bind(id, `demo-${id.slice(0, 8)}@kelisim.demo`, hash, salt, lang === "en" ? "Aigerim" : "Айгерим", lang)
    .run();
  await seedDemo(c.env.DB, id);
  await createSession(c, id, false);
  return c.json({ ok: true }, 201);
});
