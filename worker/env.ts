export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** "off" disables the fictitious demo entries that are screened in addition to the real lists. */
  DEMO_SANCTIONS?: string;
  /** Email via Resend (optional). */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Optional R2 bucket for proof files; without it files ≤ 1 MB are stored in D1. */
  PROOFS?: R2Bucket;
}

export interface UserRow {
  id: string;
  login: string;
  name: string;
  lang: "ru" | "en";
  plan: "free" | "basic" | "pro";
  onboarding_step: number;
  telegram_chat_id: string | null;
  telegram_link_code: string | null;
  email: string | null;
  email_reminders: number;
  created_at: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: UserRow } };

/** Free plan: document packages per calendar month. */
export const FREE_PACKAGES_PER_MONTH = 2;
