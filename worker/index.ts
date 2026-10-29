// Kelisim Worker entry: JSON API under /api, static React app from Workers Assets, daily cron.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { ApiError } from "./lib/http";
import { cleanup } from "./lib/cleanup";
import { ratesFor } from "./lib/external";
import { sendDueReminders } from "./lib/telegram";
import { todayKz } from "../shared/dates";
import { account } from "./routes/account";
import { auth } from "./routes/auth";
import { counterparties } from "./routes/counterparties";
import { deals } from "./routes/deals";
import { files } from "./routes/files";
import { telegram } from "./routes/telegram";
import { tracker } from "./routes/tracker";

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
});

app.get("/api/health", (c) => c.json({ ok: true, service: "kelisim", time: new Date().toISOString() }));
app.route("/api/auth", auth);
app.route("/api/account", account);
app.route("/api/counterparties", counterparties);
app.route("/api/deals", deals);
app.route("/api/telegram", telegram);
app.route("/api", tracker);
app.route("/api", files);

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not_found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.code, details: err.details ?? null }, err.status);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error("Unhandled error", err);
  return c.json({ error: "internal_error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Refresh today's official NBRK rates, then send reminders
    ctx.waitUntil(ratesFor(env, todayKz()).then((r) => console.log(`Rates: ${r.source} ${r.date}`)));
    ctx.waitUntil(sendDueReminders(env).then((n) => console.log(`Reminders sent: ${n}`)));
    // Housekeeping: old demo accounts, expired sessions, stale rate-limit buckets
    ctx.waitUntil(cleanup(env).then((r) => console.log("Cleanup", JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
