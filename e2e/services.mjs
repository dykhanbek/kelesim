// End-to-end: public contract check → sign-up → full review → lawyer order → payment → admin closes the order;
// supplier check order; claim letter on a demo deal.
// Usage: BASE_URL=http://localhost:8787 node e2e/services.mjs   (needs ADMIN_LOGINS=admin@test.kz in .dev.vars)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const COOKIE_OK = () => localStorage.setItem("kls_cookie_consent", "2026-11-09|e2e");
const errors = [];
const newCtx = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU", acceptDownloads: true, ...opts });
  await ctx.addInitScript(COOKIE_OK);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return { ctx, page };
};
let n = 0;
const shot = async (name, p) => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}s${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); };
const step = (s) => console.log("✓", s);
const stamp = Date.now().toString().slice(-7);

// 1. Public check without an account
const { page } = await newCtx();
await page.goto(BASE + "/");
await page.getByRole("link", { name: "Проверить договор бесплатно" }).click();
await page.getByRole("heading", { name: "Проверьте договор поставщика до оплаты" }).waitFor();
await page.getByRole("button", { name: "Проверить договор" }).click();
await page.getByText("Текста слишком мало").waitFor();
await page.getByRole("button", { name: "Попробовать на примере" }).click();
await page.getByRole("button", { name: "Проверить договор" }).click();
await page.getByRole("heading", { name: "Платить по такому договору опасно" }).waitFor();
if ((await page.locator(".finding").count()) !== 3) throw new Error("teaser must show exactly 3 findings");
await shot("public-check", page);
step("public contract check (teaser)");

// 2. Sign-up continues to the full review without onboarding
await page.getByRole("link", { name: "Получить полный разбор бесплатно" }).click();
await page.locator('input[autocomplete="username"], input[name="login"], input[type="text"]').first().fill(`7701${stamp}`);
await page.locator('input[type="password"]').first().fill("Test-pass-2026");
for (const cb of await page.locator('input[type="checkbox"]').all()) await cb.check().catch(() => {});
await page.getByRole("button", { name: /Создать аккаунт|Зарегистрироваться/ }).click();
await page.waitForURL(/\/app\/contracts\/[0-9a-f-]+/);
await page.getByRole("heading", { name: "Платить по такому договору опасно" }).waitFor();
await page.getByText("100% предоплата").first().waitFor();
await page.getByText("Числа в языковых версиях расходятся").waitFor();
await page.getByRole("heading", { name: "Письмо поставщику с правками" }).waitFor();
await page.getByRole("button", { name: "中文" }).click();
await page.getByText("感谢贵司提供的合同草案").waitFor();
await shot("review-full", page);
step("sign-up → full review, letter in EN/中文");

// 3. Lawyer review order → payment reported
await page.getByRole("link", { name: /Заказать проверку юристом/ }).click();
await page.getByRole("button", { name: "Оформить заказ" }).click();
await page.getByText("Заполните поле").first().waitFor(); // supplier is required
await page.getByPlaceholder("Название компании, как в договоре или инвойсе").fill("Guangzhou Textile Co., Ltd.");
await shot("order-form", page);
await page.getByRole("button", { name: "Оформить заказ" }).click();
await page.getByText("Ожидает оплаты").waitFor();
await page.getByText("+7 700 000 00 00").waitFor();
await shot("order-awaiting-payment", page);
await page.getByRole("button", { name: "Я оплатил" }).click();
await page.getByText("Оплата проверяется").first().waitFor();
step("lawyer order → awaiting payment → payment reported");

// 4. Request-type service (no fixed price)
await page.locator(".svc-card", { hasText: "Импорт под ключ" }).getByRole("button", { name: "Оставить заявку" }).click();
await page.getByPlaceholder("Товар, количество, вес или объём").fill("Детская одежда, 800 шт., 450 кг");
await page.getByPlaceholder("Например, 20 000 USD").fill("18 400 USD");
await page.getByPlaceholder("Гуанчжоу → Алматы").fill("Гуанчжоу → Алматы");
await page.getByRole("button", { name: "Отправить заявку" }).click();
await page.getByText("Заявка принята").first().waitFor();
await shot("services", page);
step("turnkey request");

// ordinary users do not see the admin area
const forbidden = await page.request.get(BASE + "/api/admin/orders");
if (forbidden.status() !== 404) throw new Error("admin API must be hidden from users, got " + forbidden.status());
if (await page.getByRole("link", { name: "Заказы клиентов" }).count()) throw new Error("admin link visible to a user");

// 5. Administrator processes the order
const a = await newCtx();
const reg = await a.page.request.post(BASE + "/api/auth/register", { data: { login: "admin@test.kz", password: "Admin-pass-2026", accept: true, pd_consent: true, marketing: false, name: "Admin", lang: "ru" } });
if (!reg.ok()) await a.page.request.post(BASE + "/api/auth/login", { data: { login: "admin@test.kz", password: "Admin-pass-2026", remember: true } });
await a.page.goto(BASE + "/app/admin");
await a.page.getByRole("heading", { name: "Заказы клиентов" }).waitFor();
await a.page.getByText("Выручка").waitFor();
await shot("admin-list", a.page);
await a.page.locator("tbody tr", { hasText: "Проверка договора юристом" }).first().click();
await a.page.getByText("Текст договора").waitFor();
await a.page.getByRole("button", { name: "→ В работе" }).click();
await a.page.getByRole("button", { name: "→ Готово" }).waitFor();
await a.page.getByRole("button", { name: "→ Готово" }).click();
await a.page.getByText("Чтобы закрыть заказ, добавьте результат").waitFor();
await a.page.getByPlaceholder("Текст заключения или краткий вывод").fill("Договор подписывать нельзя: 100% предоплата, нет срока поставки и возврата аванса. Правки — в письме.");
await shot("admin-order", a.page);
await a.page.getByRole("button", { name: "→ Готово" }).click();
await a.page.locator(".modal .badge", { hasText: "Готово" }).waitFor();
step("admin: in progress → done with a result");

// 6. The customer sees the result
await page.reload();
await page.getByText("Договор подписывать нельзя").waitFor();
await shot("order-done", page);
step("customer sees the result");

// 7. Claim letter on a demo deal + mobile views
const d = await newCtx();
await d.page.goto(BASE + "/demo");
await d.page.waitForURL(/\/app/);
await d.page.goto(BASE + "/app/deals");
await d.page.locator("tbody tr", { hasText: "Guangzhou Textile" }).first().click();
await d.page.getByRole("tab", { name: "Защита" }).click();
await d.page.getByRole("heading", { name: "Претензия поставщику" }).waitFor();
await d.page.getByRole("button", { name: "Предпросмотр" }).click();
await d.page.locator(".doc-paper").getByText("ПРЕТЕНЗИЯ о непоставке товара").waitFor();
await d.page.locator(".doc-paper").getByText("索赔函").waitFor();
await shot("claim", d.page);
const [dl] = await Promise.all([d.page.waitForEvent("download"), d.page.getByRole("button", { name: "Скачать DOCX" }).click()]);
if (!dl.suggestedFilename().endsWith(".docx")) throw new Error("claim DOCX not downloaded");
await d.page.getByRole("link", { name: "Проверить договор поставщика" }).click();
await d.page.getByRole("button", { name: "Попробовать на примере" }).click();
await d.page.getByRole("button", { name: "Проверить договор" }).click();
await d.page.waitForURL(/\/app\/contracts\/[0-9a-f-]+/);
await d.page.getByText(/Банк получателя в другой стране/).waitFor();
await d.page.getByRole("button", { name: /Что в порядке/ }).click();
await d.page.getByText("Сумма совпадает со сделкой").waitFor();
step("claim letter (preview + DOCX), review compared with the deal");

const m = await newCtx({ viewport: { width: 375, height: 780 }, isMobile: true, hasTouch: true, storageState: await d.ctx.storageState() });
await m.page.goto(d.page.url());
await m.page.getByText("100% предоплата").first().waitFor();
await shot("mobile-review", m.page);
await m.page.goto(BASE + "/app/services");
await m.page.getByRole("heading", { name: "Услуги" }).waitFor();
await shot("mobile-services", m.page);
const wide = await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (wide) throw new Error("horizontal scroll on mobile services page");
step("mobile");

await browser.close();
if (errors.length) { console.error("Console errors:\n" + errors.join("\n")); process.exit(1); }
console.log("All steps passed.");
