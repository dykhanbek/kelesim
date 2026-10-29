import { Hono } from "hono";
import { todayKz } from "../../shared/dates";
import type { AppEnv } from "../env";
import { getUser, randomToken, requireAuth } from "../lib/auth";
import { completeDeadline, type DeadlineRow } from "../lib/deals";
import { ApiError } from "../lib/http";
import { BOT_COMMANDS, deadlinesMessage, helpMessage, parseCommand, reminderMessage, telegramConfigured, tg, type DeadlineListRow } from "../lib/telegram";
import type { Env } from "../env";

export const telegram = new Hono<AppEnv>();

/** Fills the bot's command menu (RU + EN) — so nothing has to be set up in BotFather by hand. */
async function registerCommands(env: Env) {
  await tg(env, "setMyCommands", { commands: BOT_COMMANDS.ru });
  await tg(env, "setMyCommands", { commands: BOT_COMMANDS.en, language_code: "en" });
}

type Row = DeadlineRow & { number: string; data_json: string; amount: number; currency: string };

async function nearestReminder(db: D1Database, userId: string): Promise<Row | null> {
  return db
    .prepare(
      `SELECT d.*, dl.number AS number, dl.data_json AS data_json, dl.amount AS amount, dl.currency AS currency
         FROM deadlines d JOIN deals dl ON dl.id = d.deal_id
        WHERE d.user_id = ? AND d.done_at IS NULL ORDER BY d.due_date LIMIT 1`,
    )
    .bind(userId)
    .first<Row>();
}

telegram.get("/status", requireAuth, async (c) => {
  const user = c.get("user");
  const sample = await nearestReminder(c.env.DB, user.id);
  return c.json({
    configured: telegramConfigured(c.env),
    connected: Boolean(user.telegram_chat_id),
    bot_username: c.env.TELEGRAM_BOT_USERNAME || null,
    // Preview of what the bot sends — shown in Settings even when the bot is not configured
    preview: sample
      ? reminderMessage(c.env, { deadline: sample, dealNumber: sample.number, data: JSON.parse(sample.data_json), amount: sample.amount, currency: sample.currency, lang: user.lang })
      : null,
  });
});

/** Creates a one-time code and returns the t.me deep link (QR code on the frontend). */
telegram.post("/link", requireAuth, async (c) => {
  const user = c.get("user");
  if (!telegramConfigured(c.env)) throw new ApiError(409, "telegram_not_configured");
  const code = randomToken(8);
  await c.env.DB.prepare("UPDATE users SET telegram_link_code = ? WHERE id = ?").bind(code, user.id).run();
  c.executionCtx.waitUntil(registerCommands(c.env).catch(() => {}));
  return c.json({ url: `https://t.me/${c.env.TELEGRAM_BOT_USERNAME}?start=${code}` });
});

telegram.post("/unlink", requireAuth, async (c) => {
  await c.env.DB.prepare("UPDATE users SET telegram_chat_id = NULL, telegram_link_code = NULL WHERE id = ?").bind(c.get("user").id).run();
  return c.json({ ok: true });
});

telegram.post("/test", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user.telegram_chat_id || !telegramConfigured(c.env)) throw new ApiError(409, "telegram_not_connected");
  const r = await nearestReminder(c.env.DB, user.id);
  if (!r) throw new ApiError(404, "no_deadlines");
  await tg(c.env, "sendMessage", { chat_id: user.telegram_chat_id, ...reminderMessage(c.env, { deadline: r, dealNumber: r.number, data: JSON.parse(r.data_json), amount: r.amount, currency: r.currency, lang: user.lang }) });
  return c.json({ ok: true });
});

/** Webhook called by Telegram. Protected by the secret token header. */
telegram.post("/webhook", async (c) => {
  if (!c.env.TELEGRAM_WEBHOOK_SECRET || c.req.header("x-telegram-bot-api-secret-token") !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    throw new ApiError(403, "forbidden");
  }
  const update = (await c.req.json()) as any;
  const db = c.env.DB;

  if (update.message?.text) {
    const chatId = String(update.message.chat.id);
    const { cmd, arg } = parseCommand(String(update.message.text));
    // Telegram app language decides the reply language until the account is linked
    const tgLang: "ru" | "en" = String(update.message.from?.language_code ?? "ru").startsWith("en") ? "en" : "ru";

    // /start <code> — deep link from Settings: bind this chat to the account
    if (cmd === "/start" && arg) {
      const user = await db.prepare("SELECT id, lang FROM users WHERE telegram_link_code = ?").bind(arg).first<{ id: string; lang: "ru" | "en" }>();
      if (user) {
        await db.prepare("UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?").bind(chatId, user.id).run();
        await registerCommands(c.env);
        await tg(c.env, "sendMessage", {
          chat_id: chatId,
          text: (user.lang === "en" ? "✅ Kelisim is connected. I will remind you about deadlines 7, 3 and 1 day(s) in advance.\n\n" : "✅ Kelisim подключён. Я напомню о сроках за 7, 3 и 1 день.\n\n") + helpMessage(user.lang, true).split("\n").slice(2, 4).join("\n"),
        });
        return c.json({ ok: true });
      }
    }

    const linked = await db.prepare("SELECT id, lang FROM users WHERE telegram_chat_id = ?").bind(chatId).first<{ id: string; lang: "ru" | "en" }>();
    const lang = linked?.lang ?? tgLang;

    if ((cmd === "/deadlines" || cmd === "/sroki") && linked) {
      const rows = await db
        .prepare(
          `SELECT d.deal_id, d.kind, d.due_date, dl.number AS number,
                  COALESCE(json_extract(dl.data_json, '$.counterparty.name'), '') AS counterparty
             FROM deadlines d JOIN deals dl ON dl.id = d.deal_id
            WHERE d.user_id = ? AND d.done_at IS NULL
            ORDER BY d.due_date LIMIT 8`,
        )
        .bind(linked.id)
        .all<DeadlineListRow>();
      await tg(c.env, "sendMessage", { chat_id: chatId, ...deadlinesMessage(c.env, rows.results, lang) });
      return c.json({ ok: true });
    }

    // /help, /start without a valid code, unknown text, or /deadlines before linking
    await tg(c.env, "sendMessage", { chat_id: chatId, text: helpMessage(lang, Boolean(linked)) });
    return c.json({ ok: true });
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? "");
    const user = await db.prepare("SELECT id FROM users WHERE telegram_chat_id = ?").bind(chatId).first<{ id: string }>();
    const [action, id] = String(cq.data ?? "").split(":");
    if (!user || !id) {
      await tg(c.env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Аккаунт не найден" });
      return c.json({ ok: true });
    }
    const u = await getUser(db, user.id);
    const en = u?.lang === "en";
    let text = "";
    if (action === "done") {
      const r = await completeDeadline(db, user.id, id, "Telegram");
      text = r.closed
        ? (en ? "Deadline marked as done. All deadlines are met — the deal is closed." : "Срок отмечен как выполненный. Все сроки выполнены — сделка закрыта.")
        : (en ? "Deadline marked as done. Confirmation saved to the deal." : "Срок отмечен как выполненный. Подтверждение сохранено в сделке.");
    } else if (action === "snooze") {
      const tomorrow = new Date(Date.parse(todayKz() + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
      await db.prepare("UPDATE deadlines SET snoozed_until = ? WHERE id = ? AND user_id = ?").bind(tomorrow, id, user.id).run();
      text = en ? "OK, I will remind you tomorrow." : "Хорошо, напомню завтра.";
    }
    await tg(c.env, "answerCallbackQuery", { callback_query_id: cq.id, text });
    if (cq.message) await tg(c.env, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text}\n\n${text}` });
  }
  return c.json({ ok: true });
});
