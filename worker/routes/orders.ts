// Paid service orders. The customer places an order, pays by a Kaspi transfer / invoice and reports
// the payment; an administrator confirms it, does the work and attaches the result.
import { Hono } from "hono";
import { cleanOrderDetails, initialStatus, NEXT_STATUSES, ORDER_STATUSES, serviceById, STATUS_LABEL, formatTenge, type OrderStatus } from "../../shared/services";
import type { AppEnv, Env } from "../env";
import { notifyAdmins, notifyUser, requireAdmin } from "../lib/admin";
import { requireAuth } from "../lib/auth";
import { ApiError, nowIso, readJson, str, uid } from "../lib/http";

export interface OrderRow {
  id: string; number: string; user_id: string; service: string; status: OrderStatus; price: number | null;
  deal_id: string | null; review_id: string | null; details_json: string; contact: string;
  result_text: string; result_url: string; admin_note: string; created_at: string; updated_at: string;
  paid_reported_at: string | null; done_at: string | null;
}

export const paymentInfo = (env: Pick<Env, "PAY_KASPI" | "PAY_RECIPIENT">) => ({ kaspi: env.PAY_KASPI?.trim() || null, recipient: env.PAY_RECIPIENT?.trim() || null });

const toApi = (r: OrderRow, admin = false) => ({
  id: r.id, number: r.number, service: r.service, status: r.status, price: r.price, deal_id: r.deal_id, review_id: r.review_id,
  details: JSON.parse(r.details_json) as Record<string, string>, contact: r.contact,
  result_text: r.result_text, result_url: r.result_url, created_at: r.created_at, updated_at: r.updated_at, done_at: r.done_at,
  ...(admin ? { admin_note: r.admin_note, user_id: r.user_id } : {}),
});

async function nextNumber(db: D1Database): Promise<string> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM orders").first<{ n: number }>();
  return `K-${1001 + (r?.n ?? 0)}`;
}

const log = (db: D1Database, orderId: string, status: string, note = "") =>
  db.prepare("INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)").bind(orderId, status, note);

export const orders = new Hono<AppEnv>();
orders.use("*", requireAuth);

orders.get("/", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all<OrderRow>();
  return c.json({ orders: rows.results.map((r) => toApi(r)), payment: paymentInfo(c.env) });
});

orders.post("/", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const service = serviceById(str(body.service, 40));
  if (!service) throw new ApiError(422, "service_unknown");
  const cleaned = cleanOrderDetails(service, (body.details ?? {}) as Record<string, unknown>);
  if (!cleaned.ok) throw new ApiError(422, "order_field", { field: cleaned.field });
  const contact = str(body.contact, 120);
  if (contact.length < 5) throw new ApiError(422, "order_field", { field: "contact" });
  const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN ('new', 'awaiting_payment')").bind(user.id).first<{ n: number }>();
  if ((open?.n ?? 0) >= 10) throw new ApiError(429, "order_limit");

  const own = async (table: "deals" | "contract_reviews", id: string) =>
    id ? (await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, user.id).first<{ id: string }>())?.id ?? null : null;
  const dealId = await own("deals", str(body.deal_id, 64));
  const reviewId = await own("contract_reviews", str(body.review_id, 64));
  if (service.id === "lawyer_review" && !reviewId) throw new ApiError(422, "order_field", { field: "review" });

  const id = uid();
  const status = initialStatus(service);
  let number = await nextNumber(c.env.DB);
  const insert = (num: string) =>
    c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO orders (id, number, user_id, service, status, price, deal_id, review_id, details_json, contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, num, user.id, service.id, status, service.price, dealId, reviewId, JSON.stringify(cleaned.details), contact),
      log(c.env.DB, id, status),
    ]);
  try {
    await insert(number);
  } catch {
    number = `${number}-${id.slice(0, 4)}`; // two orders in the same instant
    await insert(number);
  }
  const d = cleaned.details;
  await notifyAdmins(c.env, `🆕 Заказ ${number}: ${service.title.ru}${service.price ? ` · ${formatTenge(service.price)}` : ""}\nКлиент: ${user.name || user.login} · ${contact}\n${Object.values(d).join(" · ").slice(0, 600)}\n${c.env.APP_URL}/app/admin?order=${id}`);
  const row = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  return c.json({ order: toApi(row!), payment: paymentInfo(c.env) }, 201);
});

orders.get("/:id", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<OrderRow>();
  if (!r) throw new ApiError(404, "not_found");
  return c.json({ order: toApi(r), payment: paymentInfo(c.env) });
});

/** "I have paid": the administrator then checks the transfer and starts the work. */
orders.post("/:id/paid", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<OrderRow>();
  if (!r) throw new ApiError(404, "not_found");
  if (r.status !== "awaiting_payment") throw new ApiError(409, "order_status");
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE orders SET status = 'payment_reported', paid_reported_at = ?, updated_at = ? WHERE id = ?").bind(now, now, r.id),
    log(c.env.DB, r.id, "payment_reported"),
  ]);
  await notifyAdmins(c.env, `💳 Клиент сообщил об оплате заказа ${r.number}${r.price ? ` · ${formatTenge(r.price)}` : ""}\nПроверьте поступление и возьмите в работу: ${c.env.APP_URL}/app/admin?order=${r.id}`);
  return c.json({ order: toApi({ ...r, status: "payment_reported" }) });
});

orders.post("/:id/cancel", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<OrderRow>();
  if (!r) throw new ApiError(404, "not_found");
  if (r.status !== "new" && r.status !== "awaiting_payment") throw new ApiError(409, "order_status");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(), r.id),
    log(c.env.DB, r.id, "cancelled", "by customer"),
  ]);
  return c.json({ order: toApi({ ...r, status: "cancelled" }) });
});

// ───────────────────────── administrator ─────────────────────────

export const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

admin.get("/stats", async (c) => {
  const db = c.env.DB;
  const one = (sql: string) => db.prepare(sql).first<{ n: number }>().then((r) => r?.n ?? 0);
  const [users, verified, deals, reviews, ordersTotal, paid, revenue, week] = await Promise.all([
    one("SELECT COUNT(*) AS n FROM users WHERE login NOT LIKE '%@kelisim.demo'"),
    one("SELECT COUNT(*) AS n FROM users WHERE verified_at IS NOT NULL AND login NOT LIKE '%@kelisim.demo'"),
    one("SELECT COUNT(*) AS n FROM deals d JOIN users u ON u.id = d.user_id WHERE u.login NOT LIKE '%@kelisim.demo'"),
    one("SELECT COUNT(*) AS n FROM contract_reviews"),
    one("SELECT COUNT(*) AS n FROM orders"),
    one("SELECT COUNT(*) AS n FROM orders WHERE status IN ('in_progress', 'done') AND price IS NOT NULL"),
    one("SELECT COALESCE(SUM(price), 0) AS n FROM orders WHERE status IN ('in_progress', 'done')"),
    one("SELECT COUNT(*) AS n FROM users WHERE login NOT LIKE '%@kelisim.demo' AND created_at >= datetime('now', '-7 days')"),
  ]);
  return c.json({ users, verified, deals, reviews, orders: ordersTotal, paid, revenue, users_week: week });
});

admin.get("/orders", async (c) => {
  const status = c.req.query("status");
  const filter = status && (ORDER_STATUSES as string[]).includes(status) ? "WHERE o.status = ?" : "";
  const rows = await c.env.DB.prepare(
    `SELECT o.*, u.login AS user_login, u.name AS user_name, co.name_ru AS company FROM orders o
     JOIN users u ON u.id = o.user_id LEFT JOIN companies co ON co.user_id = o.user_id ${filter} ORDER BY o.created_at DESC LIMIT 300`,
  ).bind(...(filter ? [status] : [])).all<OrderRow & { user_login: string; user_name: string; company: string | null }>();
  return c.json({ orders: rows.results.map((r) => ({ ...toApi(r, true), user_login: r.user_login, user_name: r.user_name, company: r.company })) });
});

admin.get("/orders/:id", async (c) => {
  const db = c.env.DB;
  const r = await db.prepare("SELECT o.*, u.login AS user_login, u.name AS user_name, co.name_ru AS company FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN companies co ON co.user_id = o.user_id WHERE o.id = ?")
    .bind(c.req.param("id")).first<OrderRow & { user_login: string; user_name: string; company: string | null }>();
  if (!r) throw new ApiError(404, "not_found");
  const [review, deal, events] = await Promise.all([
    r.review_id ? db.prepare("SELECT filename, text, score, risk, result_json FROM contract_reviews WHERE id = ?").bind(r.review_id).first<{ filename: string; text: string; score: number; risk: string; result_json: string }>() : null,
    r.deal_id ? db.prepare("SELECT number, amount, currency, data_json FROM deals WHERE id = ?").bind(r.deal_id).first<{ number: string; amount: number; currency: string; data_json: string }>() : null,
    db.prepare("SELECT ts, status, note FROM order_events WHERE order_id = ? ORDER BY id").bind(r.id).all(),
  ]);
  return c.json({
    order: { ...toApi(r, true), user_login: r.user_login, user_name: r.user_name, company: r.company },
    review: review ? { filename: review.filename, text: review.text, score: review.score, risk: review.risk, result: JSON.parse(review.result_json) } : null,
    deal: deal ? { number: deal.number, amount: deal.amount, currency: deal.currency, counterparty: JSON.parse(deal.data_json).counterparty } : null,
    events: events.results,
  });
});

admin.patch("/orders/:id", async (c) => {
  const db = c.env.DB;
  const r = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(c.req.param("id")).first<OrderRow>();
  if (!r) throw new ApiError(404, "not_found");
  const body = await readJson(c);
  const next = { ...r };
  if (typeof body.result_text === "string") next.result_text = body.result_text.trim().slice(0, 20_000);
  if (typeof body.result_url === "string") {
    const url = body.result_url.trim().slice(0, 500);
    if (url && !/^https:\/\//.test(url)) throw new ApiError(422, "order_field", { field: "result_url" });
    next.result_url = url;
  }
  if (typeof body.admin_note === "string") next.admin_note = body.admin_note.trim().slice(0, 2000);
  if (body.price === null || (typeof body.price === "number" && body.price >= 0 && body.price < 100_000_000)) next.price = body.price === null ? null : Math.round(body.price as number);
  let changed = false;
  if (typeof body.status === "string" && body.status !== r.status) {
    if (!NEXT_STATUSES[r.status].includes(body.status as OrderStatus)) throw new ApiError(409, "order_status");
    if (body.status === "done" && !next.result_text && !next.result_url) throw new ApiError(422, "order_field", { field: "result" });
    next.status = body.status as OrderStatus;
    changed = true;
  }
  const now = nowIso();
  const stmts = [
    db.prepare("UPDATE orders SET status = ?, price = ?, result_text = ?, result_url = ?, admin_note = ?, updated_at = ?, done_at = ? WHERE id = ?")
      .bind(next.status, next.price, next.result_text, next.result_url, next.admin_note, now, next.status === "done" ? (r.done_at ?? now) : r.done_at, r.id),
  ];
  if (changed) stmts.push(log(db, r.id, next.status, "by admin"));
  await db.batch(stmts);
  if (changed) {
    const service = serviceById(r.service);
    const extra = next.status === "awaiting_payment" && next.price ? ` К оплате: ${formatTenge(next.price)}.` : next.status === "done" ? " Результат в личном кабинете." : "";
    await notifyUser(c.env, r.user_id, `Kelisim · заказ ${r.number} (${service?.title.ru ?? r.service}): ${STATUS_LABEL[next.status].ru.toLowerCase()}.${extra}\n${c.env.APP_URL}/app/services?order=${r.id}`);
  }
  return c.json({ order: toApi(next, true) });
});
