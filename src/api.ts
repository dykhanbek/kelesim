// Thin fetch wrapper around the Worker JSON API.
import type { ComplianceResult, DealInput, ScreeningResult } from "../shared/types";

export class HttpError extends Error {
  constructor(public status: number, public code: string, public details: any) {
    super(code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, data.error ?? "error", data.details);
  return data as T;
}

/** multipart upload (proof files) */
async function upload<T>(url: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api${url}`, { method: "POST", credentials: "same-origin", body: fd });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, data.error ?? "error", data.details);
  return data as T;
}

export const api = {
  upload,
  get: <T = any>(url: string) => request<T>("GET", url),
  post: <T = any>(url: string, body: unknown = {}) => request<T>("POST", url, body),
  put: <T = any>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T = any>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T = any>(url: string) => request<T>("DELETE", url),
};

// ── Shared response shapes ───────────────────────────────
export interface Me {
  id: string;
  login: string;
  name: string;
  lang: "ru" | "en";
  plan: "free" | "basic" | "pro";
  onboarding_step: number;
  telegram_connected: boolean;
  email: string | null;
  email_reminders: boolean;
  /** one-click demo account (pre-filled deals) */
  is_demo?: boolean;
}

export interface DealSummary {
  id: string;
  number: string;
  status: "draft" | "checked" | "active" | "closed";
  risk: "green" | "yellow" | "red" | null;
  ucn: string;
  amount: number;
  currency: string;
  counterparty_id: string | null;
  counterparty_name: string;
  contract_type: string;
  lang_pair: string;
  docs_generated_at: string | null;
  created_at: string;
  updated_at: string;
  check?: { overall: string; ucn_required: boolean } | null;
}

export interface DealFull extends Omit<DealSummary, "check"> {
  data: DealInput;
  check: ComplianceResult | null;
}

export interface Deadline {
  id: string;
  deal_id: string;
  kind: "ucn" | "payment" | "delivery" | "repatriation";
  due_date: string;
  done_at: string | null;
  proof_note: string;
  snoozed_until: string | null;
  deal_number?: string;
  counterparty_name?: string;
  files_count?: number;
  amount?: number;
  currency?: string;
}

export interface ProofFile {
  id: string;
  deadline_id: string;
  filename: string;
  size: number;
  content_type: string;
  created_at: string;
}

export interface Counterparty {
  id: string;
  name: string;
  name_local: string;
  country: string;
  address: string;
  bank_details: string;
  check_status: "green" | "yellow" | "red" | null;
  checked_at: string | null;
  check: ScreeningResult | null;
  deals_count?: number;
}
