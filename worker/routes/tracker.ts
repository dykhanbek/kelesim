// Obligation tracker: calendar, deadlines, dashboard, notifications, search, documents archive.
import { Hono } from "hono";
import { addDays, diffDays, isIsoDate, todayKz } from "../../shared/dates";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { completeDeadline, dealToApi, type DealRow } from "../lib/deals";
import { ApiError, readJson, str } from "../lib/http";

export const tracker = new Hono<AppEnv>();
tracker.use("*", requireAuth);

const DEADLINE_SELECT = `SELECT d.*, dl.number AS deal_number, dl.amount AS amount, dl.currency AS currency,
  (SELECT COUNT(*) FROM proof_files p WHERE p.deadline_id = d.id) AS files_count,
  json_extract(dl.data_json, '$.counterparty.name') AS counterparty_name
  FROM deadlines d JOIN deals dl ON dl.id = d.deal_id`;

tracker.get("/deadlines", async (c) => {
  const user = c.get("user");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const deal = c.req.query("deal");
  const where = ["d.user_id = ?"];
  const vals: unknown[] = [user.id];
  if (isIsoDate(from)) { where.push("d.due_date >= ?"); vals.push(from); }
  if (isIsoDate(to)) { where.push("d.due_date <= ?"); vals.push(to); }
  if (deal) { where.push("d.deal_id = ?"); vals.push(deal); }
  const rows = await c.env.DB.prepare(`${DEADLINE_SELECT} WHERE ${where.join(" AND ")} ORDER BY d.due_date`).bind(...vals).all();
  return c.json({ items: rows.results, today: todayKz() });
});

/** Mark done, optionally with a proof note (bank statement, customs declaration number). */
tracker.post("/deadlines/:id/done", async (c) => {
  const body = await readJson(c);
  const r = await completeDeadline(c.env.DB, c.get("user").id, c.req.param("id"), str(body.proof, 300));
  return c.json({ ok: true, deal_closed: r.closed });
});

tracker.post("/deadlines/:id/undo", async (c) => {
  const user = c.get("user");
  const dl = await c.env.DB.prepare("SELECT deal_id FROM deadlines WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<{ deal_id: string }>();
  if (!dl) throw new ApiError(404, "deadline_not_found");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE deadlines SET done_at = NULL, proof_note = '' WHERE id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("UPDATE deals SET status = 'active' WHERE id = ? AND status = 'closed'").bind(dl.deal_id),
  ]);
  return c.json({ ok: true });
});

tracker.post("/deadlines/:id/snooze", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE deadlines SET snoozed_until = ? WHERE id = ? AND user_id = ?").bind(addDays(todayKz(), 1), c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

tracker.get("/dashboard", async (c) => {
  const user = c.get("user");
  const today = todayKz();
  const [dealsRes, upcomingRes, overdueRes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM deals WHERE user_id = ? AND status != 'closed' ORDER BY created_at DESC").bind(user.id).all<DealRow>(),
    c.env.DB.prepare(`${DEADLINE_SELECT} WHERE d.user_id = ? AND d.done_at IS NULL AND d.due_date >= ? ORDER BY d.due_date LIMIT 6`).bind(user.id, today).all(),
    c.env.DB.prepare(`${DEADLINE_SELECT} WHERE d.user_id = ? AND d.done_at IS NULL AND d.due_date < ? ORDER BY d.due_date`).bind(user.id, today).all(),
  ]);
  const deals = dealsRes.results.map(dealToApi);
  const active = deals.filter((d) => d.status === "active");
  const drafts = deals.filter((d) => d.status === "draft" || d.status === "checked");
  const needsUcn = active.filter((d) => d.check?.ucn_required && !d.ucn);
  const attention = needsUcn.length + overdueRes.results.length + active.filter((d) => d.risk === "red").length;

  // Next-step hint: overdue > UCN > nearest deadline > draft > new deal
  let next: { kind: string; deal_id?: string; deal_number?: string; counterparty?: string; deadline_kind?: string; due_date?: string } = { kind: "new_deal" };
  const firstOverdue = overdueRes.results[0] as Record<string, string> | undefined;
  const firstUpcoming = upcomingRes.results[0] as Record<string, string> | undefined;
  if (firstOverdue) next = { kind: "overdue", deal_id: firstOverdue.deal_id, deal_number: firstOverdue.deal_number, counterparty: firstOverdue.counterparty_name, deadline_kind: firstOverdue.kind, due_date: firstOverdue.due_date };
  else if (needsUcn[0]) next = { kind: "ucn", deal_id: needsUcn[0].id, deal_number: needsUcn[0].number, counterparty: needsUcn[0].counterparty_name };
  else if (firstUpcoming && diffDays(today, firstUpcoming.due_date) <= 14) next = { kind: "deadline", deal_id: firstUpcoming.deal_id, deal_number: firstUpcoming.deal_number, counterparty: firstUpcoming.counterparty_name, deadline_kind: firstUpcoming.kind, due_date: firstUpcoming.due_date };
  else if (drafts[0]) next = { kind: "draft", deal_id: drafts[0].id, deal_number: drafts[0].number, counterparty: drafts[0].counterparty_name };

  const totalDeals = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM deals WHERE user_id = ?").bind(user.id).first<{ n: number }>();
  return c.json({
    today,
    total_deals: totalDeals?.n ?? 0,
    stats: { active: active.length, attention, drafts: drafts.length },
    nearest: firstUpcoming ?? null,
    upcoming: upcomingRes.results,
    overdue: overdueRes.results,
    deals: deals.map((d) => ({ ...d, data: undefined, check: d.check ? { overall: d.check.overall, ucn_required: d.check.ucn_required } : null })),
    next,
    telegram_connected: Boolean(user.telegram_chat_id),
  });
});

/** Bell: overdue + due within 7 days. */
tracker.get("/notifications", async (c) => {
  const user = c.get("user");
  const today = todayKz();
  const rows = await c.env.DB.prepare(`${DEADLINE_SELECT} WHERE d.user_id = ? AND d.done_at IS NULL AND d.due_date <= ? ORDER BY d.due_date`)
    .bind(user.id, addDays(today, 7))
    .all();
  return c.json({ items: rows.results, today });
});

tracker.get("/search", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return c.json({ deals: [], counterparties: [] });
  const like = `%${q}%`;
  const [d, cp] = await Promise.all([
    c.env.DB.prepare("SELECT id, number, status, risk, amount, currency, json_extract(data_json, '$.counterparty.name') AS counterparty_name FROM deals WHERE user_id = ? AND (lower(number) LIKE ? OR lower(data_json) LIKE ?) LIMIT 8").bind(user.id, like, like).all(),
    c.env.DB.prepare("SELECT id, name, country, check_status FROM counterparties WHERE user_id = ? AND (lower(name) LIKE ? OR lower(name_local) LIKE ?) LIMIT 5").bind(user.id, like, like).all(),
  ]);
  return c.json({ deals: d.results, counterparties: cp.results });
});

/** Documents archive: every deal with a generated package. */
tracker.get("/documents", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT * FROM deals WHERE user_id = ? AND docs_generated_at IS NOT NULL ORDER BY docs_generated_at DESC").bind(user.id).all<DealRow>();
  return c.json({
    items: rows.results.map((r) => {
      const d = dealToApi(r);
      return { id: d.id, number: d.number, counterparty_name: d.counterparty_name, contract_type: d.contract_type, lang_pair: d.lang_pair, amount: d.amount, currency: d.currency, docs_generated_at: d.docs_generated_at, status: d.status };
    }),
  });
});
