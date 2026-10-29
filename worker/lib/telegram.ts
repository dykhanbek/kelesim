// Telegram bot: deep-link account linking, reminder messages with inline buttons,
// and a daily cron that sends reminders 7, 3 and 1 day(s) before a deadline and on overdue.
import { addDays, diffDays, formatDate, todayKz } from "../../shared/dates";
import type { DealInput } from "../../shared/types";
import type { Env } from "../env";
import type { DeadlineRow } from "./deals";
import { emailConfigured, sendEmail } from "./email";

export const KIND_LABEL: Record<string, { ru: string; en: string }> = {
  ucn: { ru: "получения УНК", en: "obtaining the UCN" },
  payment: { ru: "оплаты", en: "payment" },
  delivery: { ru: "поставки", en: "delivery" },
  repatriation: { ru: "репатриации", en: "repatriation" },
};

export function telegramConfigured(env: Env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
}

export async function tg(env: Env, method: string, payload: unknown): Promise<unknown> {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export interface ReminderContext {
  deadline: DeadlineRow;
  dealNumber: string;
  data: DealInput;
  amount: number;
  currency: string;
  lang: "ru" | "en";
}

/** Builds the reminder text + inline keyboard (also used for the in-app bot preview). */
export function reminderMessage(env: Env, r: ReminderContext, today = todayKz()) {
  const left = diffDays(today, r.deadline.due_date);
  const kind = KIND_LABEL[r.deadline.kind] ?? { ru: r.deadline.kind, en: r.deadline.kind };
  const cp = r.data.counterparty.name;
  const amount = `${Math.round(r.amount).toLocaleString("ru-RU")} ${r.currency}`;
  const ru = left < 0
    ? `⚠️ Срок ${kind.ru} по сделке ${r.dealNumber} просрочен на ${-left} дн.\n${cp} · ${amount}\nПроверьте обязательство и откройте сделку для следующих действий.`
    : left === 0
      ? `⏰ Сегодня истекает срок ${kind.ru} по сделке ${r.dealNumber}.\n${cp} · ${amount}`
      : `Через ${left} дн. истекает срок ${kind.ru} (${formatDate(r.deadline.due_date)}) по сделке ${r.dealNumber}.\n${cp} · ${amount}`;
  const en = left < 0
    ? `⚠️ The ${kind.en} deadline for deal ${r.dealNumber} is ${-left} day(s) overdue.\n${cp} · ${amount}\nCheck the obligation and open the deal for next steps.`
    : left === 0
      ? `⏰ The ${kind.en} deadline for deal ${r.dealNumber} is today.\n${cp} · ${amount}`
      : `${left} day(s) left until the ${kind.en} deadline (${formatDate(r.deadline.due_date)}) for deal ${r.dealNumber}.\n${cp} · ${amount}`;
  const ruL = r.lang === "ru";
  return {
    text: ruL ? ru : en,
    reply_markup: {
      inline_keyboard: [
        [
          { text: ruL ? "Открыть сделку" : "Open deal", url: `${env.APP_URL}/app/deals/${r.deadline.deal_id}?tab=deadlines` },
        ],
        [
          { text: ruL ? "✅ Выполнено" : "✅ Done", callback_data: `done:${r.deadline.id}` },
          { text: ruL ? "Напомнить завтра" : "Remind me tomorrow", callback_data: `snooze:${r.deadline.id}` },
        ],
      ],
    },
  };
}

/** Which deadlines should be reminded today. */
export function shouldRemind(d: DeadlineRow, today: string): boolean {
  if (d.done_at) return false;
  if (d.last_notified === today) return false;
  if (d.snoozed_until && d.snoozed_until > today) return false;
  if (d.snoozed_until === today) return true;
  const left = diffDays(today, d.due_date);
  return left === 7 || left === 3 || left === 1 || left === 0 || left < 0;
}

/** Cron entry point: Telegram (Pro plan) and email reminders 7/3/1 days ahead and on overdue. */
export async function sendDueReminders(env: Env): Promise<number> {
  const today = todayKz();
  const rows = await env.DB.prepare(
    `SELECT d.*, u.telegram_chat_id AS chat_id, u.lang AS lang, u.plan AS plan, u.email AS email, u.email_reminders AS email_reminders,
            dl.number AS number, dl.data_json AS data_json, dl.amount AS amount, dl.currency AS currency
       FROM deadlines d
       JOIN users u ON u.id = d.user_id
       JOIN deals dl ON dl.id = d.deal_id
      WHERE d.done_at IS NULL AND d.due_date <= ?
        AND ((u.telegram_chat_id IS NOT NULL AND u.plan = 'pro') OR (u.email IS NOT NULL AND u.email_reminders = 1))`,
  )
    .bind(addDays(today, 7))
    .all<DeadlineRow & { chat_id: string | null; lang: "ru" | "en"; plan: string; email: string | null; email_reminders: number; number: string; data_json: string; amount: number; currency: string }>();
  let sent = 0;
  for (const r of rows.results) {
    if (!shouldRemind(r, today)) continue;
    const msg = reminderMessage(env, { deadline: r, dealNumber: r.number, data: JSON.parse(r.data_json), amount: r.amount, currency: r.currency, lang: r.lang }, today);
    let delivered = false;
    if (r.chat_id && r.plan === "pro" && telegramConfigured(env)) {
      await tg(env, "sendMessage", { chat_id: r.chat_id, ...msg });
      delivered = true;
    }
    if (r.email && r.email_reminders && emailConfigured(env)) {
      const subject = r.lang === "en" ? `Kelisim: deadline for deal ${r.number}` : `Kelisim: срок по сделке ${r.number}`;
      const url = `${env.APP_URL}/app/deals/${r.deal_id}?tab=deadlines`;
      delivered = (await sendEmail(env, r.email, subject, msg.text, { label: r.lang === "en" ? "Open deal" : "Открыть сделку", url })) || delivered;
    }
    if (delivered) {
      await env.DB.prepare("UPDATE deadlines SET last_notified = ? WHERE id = ?").bind(today, r.id).run();
      sent++;
    }
  }
  return sent;
}
