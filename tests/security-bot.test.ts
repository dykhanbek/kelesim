import { describe, expect, it } from "vitest";
import { retryAfter, RULES } from "../worker/lib/ratelimit";
import { deadlinesMessage, helpMessage, parseCommand, shouldRemind } from "../worker/lib/telegram";

describe("rate limiting (brute-force protection)", () => {
  const rule = RULES.loginAccount; // 5 per 15 min
  const t0 = Date.parse("2026-10-29T10:00:00Z");

  it("allows when there is no history", () => {
    expect(retryAfter(null, rule, t0)).toBe(0);
  });

  it("allows below the limit", () => {
    expect(retryAfter({ count: 4, window_start: t0 }, rule, t0 + 60_000)).toBe(0);
  });

  it("blocks at the limit and says how long to wait", () => {
    const wait = retryAfter({ count: 5, window_start: t0 }, rule, t0 + 5 * 60_000);
    expect(wait).toBe(10 * 60); // 10 minutes left of the 15-minute window
  });

  it("unblocks once the window has passed", () => {
    expect(retryAfter({ count: 50, window_start: t0 }, rule, t0 + rule.windowMs)).toBe(0);
  });

  it("is stricter per account than per IP", () => {
    expect(RULES.loginAccount.limit).toBeLessThan(RULES.loginIp.limit);
  });
});

describe("telegram bot commands", () => {
  it("parses commands with bot mention and argument", () => {
    expect(parseCommand("/Deadlines@kelisim_bot")).toEqual({ cmd: "/deadlines", arg: "" });
    expect(parseCommand("/start abc123")).toEqual({ cmd: "/start", arg: "abc123" });
    expect(parseCommand("  привет  ")).toEqual({ cmd: "привет", arg: "" });
  });

  it("help explains how to connect when the chat is not linked", () => {
    expect(helpMessage("ru", false)).toContain("Подключить Telegram");
    expect(helpMessage("ru", true)).toContain("подключён");
    expect(helpMessage("en", false)).toContain("/deadlines");
  });

  const env = { APP_URL: "https://kelisim.example" };
  const rows = [
    { deal_id: "d1", kind: "ucn", due_date: "2026-10-27", number: "KLS-001", counterparty: "Guangzhou Kids Co." },
    { deal_id: "d1", kind: "payment", due_date: "2026-10-29", number: "KLS-001", counterparty: "Guangzhou Kids Co." },
    { deal_id: "d2", kind: "delivery", due_date: "2026-11-05", number: "KLS-002", counterparty: "Istanbul Tekstil" },
  ];

  it("lists deadlines with overdue / today / days left", () => {
    const m = deadlinesMessage(env, rows, "ru", "2026-10-29");
    expect(m.text).toContain("Получить УНК");
    expect(m.text).toContain("просрочено на 2 дн.");
    expect(m.text).toContain("сегодня");
    expect(m.text).toContain("через 7 дн.");
    expect(m.text).toContain("KLS-002 · Istanbul Tekstil");
    expect(m.reply_markup?.inline_keyboard[0][0].url).toBe("https://kelisim.example/app/calendar");
  });

  it("has a friendly empty state", () => {
    expect(deadlinesMessage(env, [], "en", "2026-10-29").text).toContain("No open deadlines");
  });

  it("reminds 7/3/1/0 days ahead and on overdue, once a day", () => {
    const d = (due: string, extra = {}) => ({ id: "x", deal_id: "d", user_id: "u", kind: "payment", due_date: due, done_at: null, proof_note: "", snoozed_until: null, last_notified: null, ...extra }) as any;
    const today = "2026-10-29";
    expect(shouldRemind(d("2026-11-05"), today)).toBe(true); // 7
    expect(shouldRemind(d("2026-11-04"), today)).toBe(false); // 6
    expect(shouldRemind(d("2026-10-29"), today)).toBe(true); // today
    expect(shouldRemind(d("2026-10-20"), today)).toBe(true); // overdue
    expect(shouldRemind(d("2026-11-05", { last_notified: today }), today)).toBe(false);
  });
});
