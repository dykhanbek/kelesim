import { Hono } from "hono";
import type { CounterpartyInput } from "../../shared/types";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { screenAndSave, upsertCounterparty } from "../lib/deals";
import { ApiError, readJson, str } from "../lib/http";

export const counterparties = new Hono<AppEnv>();
counterparties.use("*", requireAuth);

function parse(body: Record<string, unknown>): CounterpartyInput {
  const cp: CounterpartyInput = {
    name: str(body.name, 200),
    name_local: str(body.name_local, 200),
    country: str(body.country, 2).toUpperCase(),
    address: str(body.address, 400),
    bank_details: str(body.bank_details, 400),
  };
  const errors: Record<string, string> = {};
  if (cp.name.length < 2) errors.name = "required";
  if (!/^[A-Z]{2}$/.test(cp.country)) errors.country = "required";
  if (cp.address.length < 5) errors.address = "required";
  if (Object.keys(errors).length) throw new ApiError(422, "validation", errors);
  return cp;
}

counterparties.get("/", async (c) => {
  const q = `%${(c.req.query("q") ?? "").trim().toLowerCase()}%`;
  const rows = await c.env.DB.prepare(
    `SELECT cp.*, (SELECT COUNT(*) FROM deals d WHERE d.counterparty_id = cp.id) AS deals_count
       FROM counterparties cp
      WHERE cp.user_id = ? AND (lower(cp.name) LIKE ? OR lower(cp.name_local) LIKE ? OR lower(cp.country) LIKE ?)
      ORDER BY cp.created_at DESC`,
  )
    .bind(c.get("user").id, q, q, q)
    .all();
  return c.json({ items: rows.results.map(withCheck) });
});

counterparties.get("/:id", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM counterparties WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first();
  if (!row) throw new ApiError(404, "not_found");
  const deals = await c.env.DB.prepare("SELECT id, number, status, risk, amount, currency, created_at FROM deals WHERE counterparty_id = ? ORDER BY created_at DESC")
    .bind(row.id)
    .all();
  return c.json({ item: withCheck(row), deals: deals.results });
});

/** Add a counterparty and screen it immediately (flow 5.4). */
counterparties.post("/", async (c) => {
  const user = c.get("user");
  const cp = parse(await readJson(c));
  const id = await upsertCounterparty(c.env.DB, user.id, cp);
  const screening = await screenAndSave(c.env, id, cp);
  return c.json({ id, screening }, 201);
});

counterparties.put("/:id", async (c) => {
  const user = c.get("user");
  const cp = { ...parse(await readJson(c)), id: c.req.param("id") };
  const exists = await c.env.DB.prepare("SELECT id FROM counterparties WHERE id = ? AND user_id = ?").bind(cp.id, user.id).first();
  if (!exists) throw new ApiError(404, "not_found");
  await upsertCounterparty(c.env.DB, user.id, cp);
  const screening = await screenAndSave(c.env, cp.id, cp);
  return c.json({ id: cp.id, screening });
});

/** "Check again" */
counterparties.post("/:id/check", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM counterparties WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<CounterpartyInput & { id: string }>();
  if (!row) throw new ApiError(404, "not_found");
  const screening = await screenAndSave(c.env, row.id, row);
  return c.json({ screening });
});

counterparties.delete("/:id", async (c) => {
  const user = c.get("user");
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM deals WHERE counterparty_id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<{ n: number }>();
  if ((used?.n ?? 0) > 0) throw new ApiError(409, "counterparty_in_use");
  await c.env.DB.prepare("DELETE FROM counterparties WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

function withCheck(row: Record<string, unknown>) {
  const { check_json, ...rest } = row;
  return { ...rest, check: check_json ? JSON.parse(String(check_json)) : null };
}
