import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

/** Error with a machine-readable code; the frontend translates the code. */
export class ApiError extends HTTPException {
  constructor(status: 400 | 401 | 402 | 403 | 404 | 409 | 422 | 500, public code: string, public details?: unknown) {
    super(status, { message: code });
  }
}

export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new ApiError(400, "bad_json");
  }
}

export function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
