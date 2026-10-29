// Proof files for deadlines (bank statement, customs declaration).
// Stored in R2 when the PROOFS bucket is bound, otherwise in D1 (≤ 1 MB per file).
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { addEvent } from "../lib/deals";
import { ApiError, uid } from "../lib/http";

export const files = new Hono<AppEnv>();
files.use("*", requireAuth);

const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]);
export const MAX_R2 = 10 * 1024 * 1024;
export const MAX_D1 = 1024 * 1024;

files.post("/deadlines/:id/files", async (c) => {
  const user = c.get("user");
  const dl = await c.env.DB.prepare("SELECT id, deal_id, kind FROM deadlines WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; deal_id: string; kind: string }>();
  if (!dl) throw new ApiError(404, "deadline_not_found");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new ApiError(400, "file_required");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) throw new ApiError(422, "file_type");
  const max = c.env.PROOFS ? MAX_R2 : MAX_D1;
  if (file.size > max) throw new ApiError(422, "file_too_large", { max });

  const id = uid();
  const name = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "proof";
  const buf = await file.arrayBuffer();
  if (c.env.PROOFS) {
    const key = `${user.id}/${dl.deal_id}/${id}`;
    await c.env.PROOFS.put(key, buf, { httpMetadata: { contentType: type } });
    await c.env.DB.prepare("INSERT INTO proof_files (id, deadline_id, deal_id, user_id, filename, content_type, size, storage, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, 'r2', ?)")
      .bind(id, dl.id, dl.deal_id, user.id, name, type, file.size, key)
      .run();
  } else {
    await c.env.DB.prepare("INSERT INTO proof_files (id, deadline_id, deal_id, user_id, filename, content_type, size, storage, data) VALUES (?, ?, ?, ?, ?, ?, ?, 'd1', ?)")
      .bind(id, dl.id, dl.deal_id, user.id, name, type, file.size, buf)
      .run();
  }
  await addEvent(c.env.DB, dl.deal_id, "file", `${dl.kind} · ${name}`);
  return c.json({ id, filename: name, size: file.size, content_type: type }, 201);
});

files.get("/files/:id", async (c) => {
  const user = c.get("user");
  const f = await c.env.DB.prepare("SELECT * FROM proof_files WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<{
    filename: string; content_type: string; storage: string; r2_key: string | null; data: ArrayBuffer | number[] | null;
  }>();
  if (!f) throw new ApiError(404, "not_found");
  let body: BodyInit | null = null;
  if (f.storage === "r2" && c.env.PROOFS && f.r2_key) body = (await c.env.PROOFS.get(f.r2_key))?.body ?? null;
  else if (f.data) body = f.data instanceof ArrayBuffer ? f.data : new Uint8Array(f.data);
  if (!body) throw new ApiError(404, "not_found");
  const inline = c.req.query("download") ? "attachment" : "inline";
  return new Response(body, {
    headers: {
      "content-type": f.content_type,
      "content-disposition": `${inline}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

files.delete("/files/:id", async (c) => {
  const user = c.get("user");
  const f = await c.env.DB.prepare("SELECT id, r2_key, storage FROM proof_files WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<{ id: string; r2_key: string | null; storage: string }>();
  if (!f) throw new ApiError(404, "not_found");
  if (f.storage === "r2" && f.r2_key && c.env.PROOFS) await c.env.PROOFS.delete(f.r2_key);
  await c.env.DB.prepare("DELETE FROM proof_files WHERE id = ?").bind(f.id).run();
  return c.json({ ok: true });
});
