// Password hashing (PBKDF2-SHA256 via WebCrypto) and cookie sessions stored in D1.
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, UserRow } from "../env";
import { ApiError } from "./http";

const ITERATIONS = 100_000; // Workers' PBKDF2 maximum
const COOKIE = "kls_session";

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: h } = await hashPassword(password, salt);
  // constant-time comparison
  if (h.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export function randomToken(bytes = 32): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

/** Normalizes an email or a Kazakhstan phone number into a login key. */
export function normalizeLogin(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) return "+7" + digits.slice(1);
  if (digits.length === 10 && digits.startsWith("7")) return "+7" + digits;
  return null;
}

export async function createSession(c: Context<AppEnv>, userId: string, remember: boolean) {
  const token = randomToken();
  const days = remember ? 30 : 1;
  const expires = new Date(Date.now() + days * 86_400_000);
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, expires.toISOString())
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    expires: remember ? expires : undefined,
  });
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

const USER_COLUMNS = "u.id, u.login, u.name, u.lang, u.plan, u.onboarding_step, u.telegram_chat_id, u.telegram_link_code, u.email, u.email_reminders, u.created_at";

export async function currentUser(c: Context<AppEnv>): Promise<UserRow | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<UserRow>();
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new ApiError(401, "unauthorized");
  c.set("user", user);
  await next();
};

export async function getUser(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`).bind(id).first<UserRow>();
}
