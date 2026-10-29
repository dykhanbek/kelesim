import { Hono } from "hono";
import { applyUcn, dealTotal, validateDeal } from "../../shared/compliance";
import { sanitizeDeal } from "../../shared/sanitize";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { addEvent, dealToApi, finalizeDeal, limitReached, loadDeal, nextDealNumber, rebuildDeadlines, runCheck, type DealRow } from "../lib/deals";
import { ApiError, nowIso, readJson, str, uid } from "../lib/http";

export const deals = new Hono<AppEnv>();
deals.use("*", requireAuth);

/** Deal list with filters: status, risk, counterparty, free-text q. */
deals.get("/", async (c) => {
  const user = c.get("user");
  const where = ["user_id = ?"];
  const vals: unknown[] = [user.id];
  const status = c.req.query("status");
  const risk = c.req.query("risk");
  const cp = c.req.query("counterparty");
  const q = c.req.query("q");
  if (status) { where.push("status = ?"); vals.push(status); }
  if (risk) { where.push("risk = ?"); vals.push(risk); }
  if (cp) { where.push("counterparty_id = ?"); vals.push(cp); }
  if (q) { where.push("(lower(number) LIKE ? OR lower(data_json) LIKE ?)"); vals.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`); }
  const rows = await c.env.DB.prepare(`SELECT * FROM deals WHERE ${where.join(" AND ")} ORDER BY created_at DESC`).bind(...vals).all<DealRow>();
  return c.json({ items: rows.results.map((r) => { const d = dealToApi(r); return { ...d, data: undefined, check: undefined }; }) });
});

/** Create a draft (wizard step 1). Free plan with an exhausted limit gets 402 → pricing screen. */
deals.post("/", async (c) => {
  const user = c.get("user");
  if (await limitReached(c.env.DB, user)) throw new ApiError(402, "plan_limit");
  const body = await readJson(c);
  const data = sanitizeDeal(body.data);
  const id = uid();
  const number = await nextDealNumber(c.env.DB, user.id);
  await c.env.DB.prepare("INSERT INTO deals (id, user_id, number, data_json, amount, currency) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, number, JSON.stringify(data), dealTotal(data), data.currency)
    .run();
  await addEvent(c.env.DB, id, "created", str(body.source, 40));
  return c.json({ id, number }, 201);
});

deals.get("/:id", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  const [deadlines, events, company, proofs] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM deadlines WHERE deal_id = ? ORDER BY due_date").bind(row.id).all(),
    c.env.DB.prepare("SELECT * FROM deal_events WHERE deal_id = ? ORDER BY id DESC").bind(row.id).all(),
    c.env.DB.prepare("SELECT * FROM companies WHERE user_id = ?").bind(user.id).first(),
    c.env.DB.prepare("SELECT id, deadline_id, filename, size, content_type, created_at FROM proof_files WHERE deal_id = ? ORDER BY created_at").bind(row.id).all(),
  ]);
  return c.json({ deal: dealToApi(row), deadlines: deadlines.results, events: events.results, company, files: proofs.results });
});

/** Autosave of the wizard (draft) and clause edits (active deals). */
deals.put("/:id", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  const data = sanitizeDeal((await readJson(c)).data);
  await c.env.DB.prepare("UPDATE deals SET data_json = ?, amount = ?, currency = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(data), dealTotal(data), data.currency, nowIso(), row.id)
    .run();
  return c.json({ ok: true, saved_at: nowIso() });
});

/** Runs the three checks. Validates the full form first. */
deals.post("/:id/check", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  const errors = validateDeal(JSON.parse(row.data_json));
  if (Object.keys(errors).length) throw new ApiError(422, "validation", errors);
  const result = await runCheck(c.env, row);
  return c.json({ result });
});

/**
 * Document package generated & downloaded: counts against the plan, saves the deal
 * and adds deadlines to the calendar. Re-generation after clause edits rebuilds deadlines.
 */
deals.post("/:id/generate", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  const errors = validateDeal(JSON.parse(row.data_json));
  if (Object.keys(errors).length) throw new ApiError(422, "validation", errors);
  const { check, firstTime } = await finalizeDeal(c.env, user, row);
  const deadlines = await c.env.DB.prepare("SELECT * FROM deadlines WHERE deal_id = ? ORDER BY due_date").bind(row.id).all();
  return c.json({ check, first_time: firstTime, deadlines: deadlines.results });
});

/** Enter the UCN received from the bank → closes the "ucn" deadline. */
deals.post("/:id/ucn", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  const ucn = str((await readJson(c)).ucn, 40);
  if (ucn.length < 4) throw new ApiError(422, "validation", { ucn: "required" });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE deals SET ucn = ?, updated_at = ? WHERE id = ?").bind(ucn, nowIso(), row.id),
    c.env.DB.prepare("UPDATE deadlines SET done_at = ?, proof_note = ? WHERE deal_id = ? AND kind = 'ucn' AND done_at IS NULL").bind(nowIso(), `УНК ${ucn}`, row.id),
  ]);
  if (row.check_json) {
    const check = applyUcn(JSON.parse(row.check_json), ucn);
    await c.env.DB.prepare("UPDATE deals SET check_json = ?, risk = ? WHERE id = ?").bind(JSON.stringify(check), check.overall, row.id).run();
  }
  await addEvent(c.env.DB, row.id, "ucn", ucn);
  return c.json({ ok: true });
});

/** Re-run the check for an active deal (e.g. after editing terms) and refresh its deadlines. */
deals.post("/:id/recheck", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  const result = await runCheck(c.env, row);
  if (row.docs_generated_at) await rebuildDeadlines(c.env.DB, row, result);
  return c.json({ result });
});

deals.delete("/:id", async (c) => {
  const user = c.get("user");
  const row = await loadDeal(c.env.DB, user.id, c.req.param("id"));
  if (row.status !== "draft" && row.status !== "checked") throw new ApiError(409, "only_drafts_can_be_deleted");
  await c.env.DB.prepare("DELETE FROM deals WHERE id = ?").bind(row.id).run();
  return c.json({ ok: true });
});
