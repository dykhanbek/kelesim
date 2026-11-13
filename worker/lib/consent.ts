// Consent bookkeeping: current state on users + an append-only log as evidence.
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { uid } from "./http";
import { clientIp } from "./ratelimit";

/** Version (= effective date) of the legal documents. Bump when the texts change. Must match src/legal/docs.ts. */
export const LEGAL_VERSION = "2026-11-14";

export type ConsentKind = "terms" | "personal_data" | "marketing";

export function consentLogStmt(c: Context<AppEnv>, userId: string, kind: ConsentKind, granted: boolean) {
  return c.env.DB.prepare("INSERT INTO consent_log (id, user_id, kind, granted, version, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
    uid(),
    userId,
    kind,
    granted ? 1 : 0,
    LEGAL_VERSION,
    clientIp(c),
    (c.req.header("user-agent") ?? "").slice(0, 300),
  );
}
