// Supplier contract reviews: the text is extracted in the browser, analysed here by the rule engine
// (shared/contract-review.ts) and stored so the customer can come back to it or order a lawyer.
import { Hono } from "hono";
import { reviewContract, normalizeText, REVIEW_MIN_CHARS, type ReviewResult } from "../../shared/contract-review";
import type { DealInput } from "../../shared/types";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { addEvent } from "../lib/deals";
import { ApiError, readJson, str, uid } from "../lib/http";

export const contracts = new Hono<AppEnv>();
contracts.use("*", requireAuth);

/** Fair-use limit per calendar month (the review itself is free). */
export const REVIEWS_PER_MONTH = 30;

interface ReviewRow {
  id: string; deal_id: string | null; filename: string; text: string; score: number; risk: string; result_json: string; created_at: string;
  deal_number?: string | null;
}
const toApi = (r: ReviewRow, withText = false) => ({
  id: r.id, deal_id: r.deal_id, deal_number: r.deal_number ?? null, filename: r.filename, score: r.score, risk: r.risk, created_at: r.created_at,
  result: JSON.parse(r.result_json) as ReviewResult,
  ...(withText ? { text: r.text } : {}),
});

contracts.post("/", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const text = normalizeText(typeof body.text === "string" ? body.text : "");
  if (text.length < REVIEW_MIN_CHARS) throw new ApiError(422, "contract_too_short");
  const month = new Date().toISOString().slice(0, 7);
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM contract_reviews WHERE user_id = ? AND substr(created_at, 1, 7) = ?").bind(user.id, month).first<{ n: number }>();
  if ((used?.n ?? 0) >= REVIEWS_PER_MONTH) throw new ApiError(429, "review_limit");

  let deal: DealInput | undefined;
  let dealId: string | null = null;
  const reqDeal = str(body.deal_id, 64);
  if (reqDeal) {
    const row = await c.env.DB.prepare("SELECT id, data_json FROM deals WHERE id = ? AND user_id = ?").bind(reqDeal, user.id).first<{ id: string; data_json: string }>();
    if (!row) throw new ApiError(404, "deal_not_found");
    deal = JSON.parse(row.data_json) as DealInput;
    dealId = row.id;
  }
  const result = reviewContract(text, { deal });
  const id = uid();
  const filename = str(body.filename, 160).replace(/[^\p{L}\p{N}._ ()-]/gu, "_");
  await c.env.DB.prepare("INSERT INTO contract_reviews (id, user_id, deal_id, filename, text, score, risk, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, dealId, filename, text, result.score, result.risk, JSON.stringify(result))
    .run();
  if (dealId) await addEvent(c.env.DB, dealId, "contract_review", `${result.score}/100`);
  return c.json({ review: toApi({ id, deal_id: dealId, filename, text, score: result.score, risk: result.risk, result_json: JSON.stringify(result), created_at: new Date().toISOString() }) }, 201);
});

contracts.get("/", async (c) => {
  const user = c.get("user");
  const dealId = c.req.query("deal_id");
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.deal_id, r.filename, r.score, r.risk, r.result_json, r.created_at, d.number AS deal_number, '' AS text
     FROM contract_reviews r LEFT JOIN deals d ON d.id = r.deal_id
     WHERE r.user_id = ? ${dealId ? "AND r.deal_id = ?" : ""} ORDER BY r.created_at DESC LIMIT 100`,
  ).bind(...(dealId ? [user.id, dealId] : [user.id])).all<ReviewRow>();
  return c.json({ reviews: rows.results.map((r) => toApi(r)), limit: REVIEWS_PER_MONTH });
});

contracts.get("/:id", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare("SELECT r.*, d.number AS deal_number FROM contract_reviews r LEFT JOIN deals d ON d.id = r.deal_id WHERE r.id = ? AND r.user_id = ?").bind(c.req.param("id"), user.id).first<ReviewRow>();
  if (!r) throw new ApiError(404, "not_found");
  return c.json({ review: toApi(r, true) });
});

contracts.delete("/:id", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("DELETE FROM contract_reviews WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});
