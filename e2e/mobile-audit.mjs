// Screenshots of every screen at phone width (375×812) for visual review.
// Usage: BASE_URL=http://localhost:8787 node e2e/mobile-audit.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const OUT = process.argv[2] ?? new URL("./mobile/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" });
const p = await ctx.newPage();
const shot = async (name) => { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}${name}.png`, fullPage: true }); };
const overflow = async (name) => {
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  if (w > 376) console.log(`⚠ horizontal overflow on ${name}: ${w}px`);
};
const visit = async (path, name, wait) => { await p.goto(BASE + path); if (wait) await p.locator("h1, h2").filter({ hasText: wait }).first().or(p.locator("h1").first()).first().waitFor(); await p.waitForLoadState("networkidle"); await overflow(name); await shot(name); };

await visit("/", "01-landing", "Создать договор бесплатно");
await visit("/register", "02-register", "Создайте аккаунт");
await visit("/login", "03-login", "Войти в Kelisim");
await p.getByRole("button", { name: "Открыть демо-кабинет" }).click();
await p.getByText("Активные сделки").first().waitFor();
await overflow("04-dashboard"); await shot("04-dashboard");
await p.getByRole("button", { name: "Навигация" }).click(); await shot("05-menu");
await visit("/app/deals", "06-deals", "Сделки");
const dealId = await p.evaluate(async () => (await (await fetch("/api/deals")).json()).items[0].id);
await visit(`/app/deals/${dealId}`, "07-deal", "Создать похожую");
await visit(`/app/deals/${dealId}/documents`, "08-package", "Ваш пакет документов");
await visit("/app/calendar", "09-calendar", "Октябрь");
await visit("/app/counterparties", "10-counterparties", "Ваши поставщики");
await visit("/app/documents", "11-documents", "Архив");
await visit("/app/company", "12-company", "Компания");
await visit("/app/settings", "13-settings", "Telegram");
await visit("/app/settings?tab=plan", "14-plans", "Базовый");
await visit("/app/help", "15-help", "Глоссарий");
await p.goto(BASE + "/app/deals/new");
await p.getByText("Выберите тип договора").waitFor(); await overflow("16-wizard-1"); await shot("16-wizard-1");
await p.getByRole("button", { name: "Заполнить примером" }).click();
await p.getByRole("button", { name: "Далее" }).click(); await p.getByText("Кто ваш поставщик?").waitFor(); await shot("17-wizard-2");
await p.getByRole("button", { name: "Далее" }).click(); await p.getByText("Что и на какую сумму?").waitFor(); await overflow("18-wizard-3"); await shot("18-wizard-3");
await p.getByRole("button", { name: "Далее" }).click(); await p.getByText("Согласуйте условия").waitFor(); await overflow("19-wizard-4"); await shot("19-wizard-4");
await p.getByRole("button", { name: "Проверить" }).click(); await p.getByText("Несколько секунд").waitFor(); await p.waitForTimeout(1500); await shot("20-checking");
await p.getByText("Результат проверки").waitFor({ timeout: 15000 }); await overflow("21-result"); await shot("21-result");
await browser.close();
console.log("done", OUT);
