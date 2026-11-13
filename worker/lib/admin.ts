// Administrators are listed in the ADMIN_LOGINS secret (comma-separated emails / phones as used at login).
import type { MiddlewareHandler } from "hono";
import type { AppEnv, Env, UserRow } from "../env";
import { currentUser, normalizeLogin } from "./auth";
import { ApiError } from "./http";
import { tg } from "./telegram";

export function adminLogins(env: Pick<Env, "ADMIN_LOGINS">): string[] {
  return (env.ADMIN_LOGINS ?? "")
    .split(/[,;\n]/)
    .map((s) => normalizeLogin(s) ?? "")
    .filter(Boolean);
}

export const isAdmin = (env: Pick<Env, "ADMIN_LOGINS">, user: Pick<UserRow, "login">) => adminLogins(env).includes(user.login);

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new ApiError(401, "unauthorized");
  // 404, not 403: the admin area does not reveal itself to ordinary users
  if (!isAdmin(c.env, user)) throw new ApiError(404, "not_found");
  c.set("user", user);
  await next();
};

/** Telegram message to every administrator who linked the bot. Never throws. */
export async function notifyAdmins(env: Env, text: string) {
  const logins = adminLogins(env);
  if (!logins.length || !env.TELEGRAM_BOT_TOKEN) return;
  try {
    const rows = await env.DB.prepare(`SELECT telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL AND login IN (${logins.map(() => "?").join(",")})`).bind(...logins).all<{ telegram_chat_id: string }>();
    for (const r of rows.results) await tg(env, "sendMessage", { chat_id: r.telegram_chat_id, text, disable_web_page_preview: true });
  } catch (e) {
    console.error("notifyAdmins failed", e);
  }
}

export async function notifyUser(env: Env, userId: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    const u = await env.DB.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").bind(userId).first<{ telegram_chat_id: string | null }>();
    if (u?.telegram_chat_id) await tg(env, "sendMessage", { chat_id: u.telegram_chat_id, text, disable_web_page_preview: true });
  } catch (e) {
    console.error("notifyUser failed", e);
  }
}
