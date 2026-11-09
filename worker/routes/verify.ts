// Confirms that the user owns the login they registered with:
//  • email login → 6-digit code sent by email (Resend);
//  • phone login → the Telegram bot asks to share the contact; Telegram itself vouches
//    for the number, so no SMS provider is needed. The number must match the login.
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { normalizeLogin, randomToken, requireAuth, sha256 } from "../lib/auth";
import { emailConfigured, isEmail, sendEmail } from "../lib/email";
import { ApiError, readJson, str } from "../lib/http";
import { assertNotLimited, hit, type Rule } from "../lib/ratelimit";
import { telegramConfigured, tg } from "../lib/telegram";
import { isLocalDev } from "./auth";

export const verify = new Hono<AppEnv>();
verify.use("*", requireAuth);

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const START_RULE: Rule = { limit: 5, windowMs: 60 * 60_000 }; // 5 codes / links per hour per user

/** 6-digit numeric code, uniformly random. */
export function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

verify.post("/start", async (c) => {
  const user = c.get("user");
  if (user.verified_at) return c.json({ ok: true, verified: true });
  const db = c.env.DB;
  const key = `verify:${user.id}`;
  await assertNotLimited(db, [[key, START_RULE]]);
  const dev = isLocalDev(c);
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();

  if (isEmail(user.login)) {
    if (!emailConfigured(c.env) && !dev) throw new ApiError(409, "email_not_configured");
    const code = sixDigitCode();
    await db
      .prepare("INSERT INTO verify_codes (user_id, channel, code_hash, chat_id, attempts, expires_at) VALUES (?, 'email', ?, NULL, 0, ?) ON CONFLICT(user_id) DO UPDATE SET channel = 'email', code_hash = excluded.code_hash, chat_id = NULL, attempts = 0, expires_at = excluded.expires_at")
      .bind(user.id, await sha256(code), expires)
      .run();
    await hit(db, key, START_RULE);
    const en = user.lang === "en";
    await sendEmail(
      c.env,
      user.login,
      en ? `Kelisim: confirmation code ${code}` : `Kelisim: код подтверждения ${code}`,
      en ? `Your code: ${code}. It is valid for ${CODE_TTL_MIN} minutes. If you did not sign up for Kelisim, ignore this email.` : `Ваш код: ${code}. Он действует ${CODE_TTL_MIN} минут. Если вы не регистрировались в Kelisim, просто проигнорируйте письмо.`,
    );
    return c.json({ ok: true, channel: "email", to: user.login, ...(dev && !emailConfigured(c.env) ? { dev_code: code } : {}) });
  }

  // Phone login → Telegram contact sharing
  if (!telegramConfigured(c.env) && !dev) throw new ApiError(409, "telegram_not_configured");
  const token = randomToken(12);
  await db
    .prepare("INSERT INTO verify_codes (user_id, channel, code_hash, chat_id, attempts, expires_at) VALUES (?, 'telegram', ?, NULL, 0, ?) ON CONFLICT(user_id) DO UPDATE SET channel = 'telegram', code_hash = excluded.code_hash, chat_id = NULL, attempts = 0, expires_at = excluded.expires_at")
    .bind(user.id, await sha256(token), expires)
    .run();
  await hit(db, key, START_RULE);
  const bot = c.env.TELEGRAM_BOT_USERNAME || "kelisim_dev_bot";
  return c.json({ ok: true, channel: "telegram", url: `https://t.me/${bot}?start=v_${token}`, ...(dev ? { dev_token: token } : {}) });
});

verify.post("/confirm", async (c) => {
  const user = c.get("user");
  if (user.verified_at) return c.json({ ok: true });
  const code = str((await readJson(c)).code, 12).replace(/\D/g, "");
  const db = c.env.DB;
  const row = await db
    .prepare("SELECT code_hash, attempts, expires_at FROM verify_codes WHERE user_id = ? AND channel = 'email'")
    .bind(user.id)
    .first<{ code_hash: string; attempts: number; expires_at: string }>();
  if (!row || row.expires_at < new Date().toISOString()) throw new ApiError(422, "code_expired");
  if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "too_many_attempts");
  if ((await sha256(code)) !== row.code_hash) {
    await db.prepare("UPDATE verify_codes SET attempts = attempts + 1 WHERE user_id = ?").bind(user.id).run();
    throw new ApiError(422, "wrong_code");
  }
  await db.batch([
    db.prepare("UPDATE users SET verified_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id),
    db.prepare("DELETE FROM verify_codes WHERE user_id = ?").bind(user.id),
  ]);
  return c.json({ ok: true });
});

// ───────────── Telegram side (called from the webhook) ─────────────

const T = {
  ru: {
    ask: "Чтобы подтвердить номер телефона для Kelisim, нажмите кнопку ниже — Telegram передаст ваш номер.",
    btn: "📱 Поделиться номером",
    expired: "Ссылка для подтверждения устарела. Откройте Kelisim и нажмите «Подтвердить» ещё раз.",
    notOwn: "Пожалуйста, отправьте свой номер кнопкой «Поделиться номером», а не чужой контакт.",
    mismatch: (p: string) => `Номер в Telegram (${p}) не совпадает с номером, на который зарегистрирован аккаунт Kelisim. Войдите в Telegram с этим номером или зарегистрируйтесь в Kelisim на номер ${p}.`,
    ok: "✅ Номер подтверждён. Можно вернуться в Kelisim. Напоминания о сроках тоже будут приходить сюда.",
  },
  en: {
    ask: "To confirm your phone number for Kelisim, tap the button below — Telegram will share your number.",
    btn: "📱 Share my number",
    expired: "The confirmation link has expired. Open Kelisim and tap «Confirm» again.",
    notOwn: "Please send your own number with the «Share my number» button, not someone else's contact.",
    mismatch: (p: string) => `Your Telegram number (${p}) does not match the phone your Kelisim account is registered with.`,
    ok: "✅ Phone number confirmed. You can return to Kelisim. Deadline reminders will also come here.",
  },
};

/** /start v_<token>: remember which chat is confirming, ask for the contact. */
export async function tgVerifyStart(env: Env, chatId: string, token: string, lang: "ru" | "en") {
  const db = env.DB;
  const row = await db
    .prepare("SELECT v.user_id, u.lang FROM verify_codes v JOIN users u ON u.id = v.user_id WHERE v.code_hash = ? AND v.channel = 'telegram' AND v.expires_at > ?")
    .bind(await sha256(token), new Date().toISOString())
    .first<{ user_id: string; lang: string }>();
  const t = T[(row?.lang === "en" ? "en" : row ? "ru" : lang) as "ru" | "en"];
  if (!row) return tg(env, "sendMessage", { chat_id: chatId, text: t.expired });
  await db.prepare("UPDATE verify_codes SET chat_id = ? WHERE user_id = ?").bind(chatId, row.user_id).run();
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text: t.ask,
    reply_markup: { keyboard: [[{ text: t.btn, request_contact: true }]], one_time_keyboard: true, resize_keyboard: true },
  });
}

/** Result of a shared contact — exported for unit tests. */
export function checkContact(contact: { phone_number?: string; user_id?: number }, fromId: number, login: string): "ok" | "not_own" | "mismatch" {
  if (!contact.user_id || contact.user_id !== fromId) return "not_own";
  const phone = normalizeLogin(String(contact.phone_number ?? ""));
  return phone && phone === login ? "ok" : "mismatch";
}

/** message.contact: Telegram vouches for the number; it must match the account login. */
export async function tgVerifyContact(env: Env, chatId: string, fromId: number, contact: { phone_number?: string; user_id?: number }) {
  const db = env.DB;
  const row = await db
    .prepare("SELECT v.user_id, u.login, u.lang, u.telegram_chat_id FROM verify_codes v JOIN users u ON u.id = v.user_id WHERE v.chat_id = ? AND v.channel = 'telegram' AND v.expires_at > ?")
    .bind(chatId, new Date().toISOString())
    .first<{ user_id: string; login: string; lang: string; telegram_chat_id: string | null }>();
  const t = T[row?.lang === "en" ? "en" : "ru"];
  const remove = { remove_keyboard: true };
  if (!row) return tg(env, "sendMessage", { chat_id: chatId, text: t.expired, reply_markup: remove });
  const res = checkContact(contact, fromId, row.login);
  if (res === "not_own") return tg(env, "sendMessage", { chat_id: chatId, text: t.notOwn });
  if (res === "mismatch") {
    const shown = normalizeLogin(String(contact.phone_number ?? "")) ?? String(contact.phone_number ?? "");
    return tg(env, "sendMessage", { chat_id: chatId, text: t.mismatch(shown), reply_markup: remove });
  }
  await db.batch([
    // confirming through the bot also connects it for reminders (if no other chat is linked)
    db.prepare("UPDATE users SET verified_at = ?, telegram_chat_id = COALESCE(telegram_chat_id, ?) WHERE id = ?").bind(new Date().toISOString(), chatId, row.user_id),
    db.prepare("DELETE FROM verify_codes WHERE user_id = ?").bind(row.user_id),
  ]);
  return tg(env, "sendMessage", { chat_id: chatId, text: t.ok, reply_markup: remove });
}
