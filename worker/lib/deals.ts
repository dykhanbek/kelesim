// Deal service: persistence + business operations shared by routes, the cron job and the Telegram bot.
import { applyUcn, checkDeal, dealTotal, screenCounterparty } from "../../shared/compliance";
import { ratesFor, sanctionsFor } from "./external";
import { todayKz } from "../../shared/dates";
import type { ComplianceResult, CounterpartyInput, DealInput, ScreeningResult } from "../../shared/types";
import { FREE_PACKAGES_PER_MONTH, type Env, type UserRow } from "../env";
import { ApiError, nowIso, uid } from "./http";

export interface DealRow {
  id: string;
  user_id: string;
  number: string;
  counterparty_id: string | null;
  status: string;
  risk: string | null;
  data_json: string;
  check_json: string | null;
  ucn: string;
  amount: number;
  currency: string;
  docs_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeadlineRow {
  id: string;
  deal_id: string;
  user_id: string;
  kind: string;
  due_date: string;
  done_at: string | null;
  proof_note: string;
  snoozed_until: string | null;
  last_notified: string | null;
}

export function dealToApi(r: DealRow) {
  const data = JSON.parse(r.data_json) as DealInput;
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    risk: r.risk,
    ucn: r.ucn,
    amount: r.amount,
    currency: r.currency,
    counterparty_id: r.counterparty_id,
    counterparty_name: data.counterparty?.name ?? "",
    contract_type: data.contract_type,
    lang_pair: data.lang_pair,
    docs_generated_at: r.docs_generated_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    data,
    check: r.check_json ? (JSON.parse(r.check_json) as ComplianceResult) : null,
  };
}

export async function loadDeal(db: D1Database, userId: string, id: string): Promise<DealRow> {
  const row = await db.prepare("SELECT * FROM deals WHERE id = ? AND user_id = ?").bind(id, userId).first<DealRow>();
  if (!row) throw new ApiError(404, "deal_not_found");
  return row;
}

export async function addEvent(db: D1Database, dealId: string, kind: string, detail = "") {
  await db.prepare("INSERT INTO deal_events (deal_id, kind, detail) VALUES (?, ?, ?)").bind(dealId, kind, detail).run();
}

export async function nextDealNumber(db: D1Database, userId: string): Promise<string> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM deals WHERE user_id = ?").bind(userId).first<{ n: number }>();
  return `KLS-${String((r?.n ?? 0) + 1).padStart(3, "0")}`;
}

/** Finds a saved counterparty by id/name or creates one; keeps the latest screening. */
export async function upsertCounterparty(
  db: D1Database,
  userId: string,
  cp: CounterpartyInput,
  screening?: ScreeningResult,
): Promise<string> {
  let id = cp.id;
  if (id) {
    const exists = await db.prepare("SELECT id FROM counterparties WHERE id = ? AND user_id = ?").bind(id, userId).first();
    if (!exists) id = undefined;
  }
  if (!id) {
    const byName = await db
      .prepare("SELECT id FROM counterparties WHERE user_id = ? AND lower(name) = lower(?)")
      .bind(userId, cp.name.trim())
      .first<{ id: string }>();
    id = byName?.id;
  }
  if (!id) {
    id = uid();
    await db
      .prepare("INSERT INTO counterparties (id, user_id, name, name_local, country, address, bank_details) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, userId, cp.name.trim(), cp.name_local ?? "", cp.country, cp.address ?? "", cp.bank_details ?? "")
      .run();
  } else {
    await db
      .prepare("UPDATE counterparties SET name = ?, name_local = ?, country = ?, address = ?, bank_details = ? WHERE id = ?")
      .bind(cp.name.trim(), cp.name_local ?? "", cp.country, cp.address ?? "", cp.bank_details ?? "", id)
      .run();
  }
  if (screening) await saveScreening(db, id, screening);
  return id;
}

export async function saveScreening(db: D1Database, cpId: string, s: ScreeningResult) {
  await db
    .prepare("UPDATE counterparties SET check_status = ?, check_json = ?, checked_at = ? WHERE id = ?")
    .bind(s.status, JSON.stringify(s), s.checked_at, cpId)
    .run();
}

/** Screens a counterparty against the real lists (+ demo entries) and stores the result. */
export async function screen(env: Env, cp: CounterpartyInput): Promise<ScreeningResult> {
  const src = await sanctionsFor(env, cp);
  return screenCounterparty(cp, src.entries, new Date(), src.version);
}

export async function screenAndSave(env: Env, cpId: string, cp: CounterpartyInput): Promise<ScreeningResult> {
  const s = await screen(env, cp);
  await saveScreening(env.DB, cpId, s);
  return s;
}

/** Runs the compliance engine on the stored deal data and persists the result. */
export async function runCheck(env: Env, row: DealRow): Promise<ComplianceResult> {
  const db = env.DB;
  const data = JSON.parse(row.data_json) as DealInput;
  const [src, rates] = await Promise.all([sanctionsFor(env, data.counterparty), ratesFor(env, data.terms.sign_date)]);
  const result = applyUcn(checkDeal(data, new Date(), { sanctions: src.entries, listsVersion: src.version, rates }), row.ucn);
  const cpId = await upsertCounterparty(db, row.user_id, data.counterparty, screenCounterparty(data.counterparty, src.entries, new Date(), src.version));
  if (data.counterparty.id !== cpId) {
    data.counterparty.id = cpId;
  }
  const status = row.status === "draft" ? "checked" : row.status;
  await db
    .prepare("UPDATE deals SET check_json = ?, risk = ?, status = ?, counterparty_id = ?, data_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(result), result.overall, status, cpId, JSON.stringify(data), nowIso(), row.id)
    .run();
  await addEvent(db, row.id, "checked", result.overall);
  return result;
}

export function monthKey(): string {
  return todayKz().slice(0, 7);
}

export async function usageThisMonth(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare("SELECT packages FROM usage WHERE user_id = ? AND month = ?").bind(userId, monthKey()).first<{ packages: number }>();
  return r?.packages ?? 0;
}

export async function limitReached(db: D1Database, user: UserRow): Promise<boolean> {
  return user.plan === "free" && (await usageThisMonth(db, user.id)) >= FREE_PACKAGES_PER_MONTH;
}

/**
 * Saves the deal as active: counts the package against the plan (first time only),
 * and (re)builds the open deadlines from the latest check.
 */
export async function finalizeDeal(env: Env, user: UserRow, row: DealRow) {
  const db = env.DB;
  const check = await runCheck(env, row);
  if (check.overall === "red") throw new ApiError(409, "deal_is_red");
  const firstTime = !row.docs_generated_at;
  if (firstTime) {
    if (await limitReached(db, user)) throw new ApiError(402, "plan_limit");
    await db
      .prepare("INSERT INTO usage (user_id, month, packages) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET packages = packages + 1")
      .bind(user.id, monthKey())
      .run();
  }
  await rebuildDeadlines(db, row, check);
  const newStatus = row.status === "closed" ? "closed" : "active";
  await db.prepare("UPDATE deals SET status = ?, docs_generated_at = ?, updated_at = ? WHERE id = ?").bind(newStatus, nowIso(), nowIso(), row.id).run();
  await addEvent(db, row.id, firstTime ? "docs" : "docs_regenerated");
  return { check, firstTime };
}

/** Replaces not-yet-done deadlines with the ones derived from the current terms. */
export async function rebuildDeadlines(db: D1Database, row: DealRow, check: ComplianceResult) {
  const existing = await db.prepare("SELECT * FROM deadlines WHERE deal_id = ?").bind(row.id).all<DeadlineRow>();
  const done = new Set(existing.results.filter((d) => d.done_at).map((d) => d.kind));
  const stmts = [db.prepare("DELETE FROM deadlines WHERE deal_id = ? AND done_at IS NULL").bind(row.id)];
  for (const d of check.deadlines) {
    if (done.has(d.kind)) continue;
    if (d.kind === "ucn" && row.ucn) continue; // UCN already entered
    stmts.push(
      db.prepare("INSERT INTO deadlines (id, deal_id, user_id, kind, due_date) VALUES (?, ?, ?, ?, ?)").bind(uid(), row.id, row.user_id, d.kind, d.due_date),
    );
  }
  await db.batch(stmts);
}

/** Marks a deadline done and closes the deal when nothing is left. Returns true if the deal closed. */
export async function completeDeadline(db: D1Database, userId: string, deadlineId: string, proof = ""): Promise<{ closed: boolean; deadline: DeadlineRow }> {
  const dl = await db.prepare("SELECT * FROM deadlines WHERE id = ? AND user_id = ?").bind(deadlineId, userId).first<DeadlineRow>();
  if (!dl) throw new ApiError(404, "deadline_not_found");
  if (!dl.done_at) {
    await db.prepare("UPDATE deadlines SET done_at = ?, proof_note = ? WHERE id = ?").bind(nowIso(), proof, dl.id).run();
    await addEvent(db, dl.deal_id, "deadline_done", dl.kind + (proof ? ` · ${proof}` : ""));
  }
  const open = await db.prepare("SELECT COUNT(*) AS n FROM deadlines WHERE deal_id = ? AND done_at IS NULL").bind(dl.deal_id).first<{ n: number }>();
  let closed = false;
  if ((open?.n ?? 0) === 0) {
    await db.prepare("UPDATE deals SET status = 'closed', updated_at = ? WHERE id = ? AND status = 'active'").bind(nowIso(), dl.deal_id).run();
    await addEvent(db, dl.deal_id, "closed");
    closed = true;
  }
  return { closed, deadline: { ...dl, done_at: dl.done_at ?? nowIso() } };
}

export function totalOf(data: DealInput) {
  return dealTotal(data);
}
