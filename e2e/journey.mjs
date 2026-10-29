// End-to-end user journey (flows 5.1–5.5 from the design brief) against a running instance.
// Usage: BASE_URL=http://localhost:8787 node e2e/journey.mjs   (screenshots → e2e/screenshots)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU", acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
let n = 0;
const shot = async (name, p = page) => { await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); };
const step = (s) => console.log("✓", s);

// 1. Landing
await page.goto(BASE + "/");
await page.getByText("Создать договор бесплатно").first().waitFor();
await shot("landing");
step("landing");

// 2. Sign-up (+ duplicate login error path)
await page.goto(BASE + "/register");
const phone = `+7 70${Math.floor(10000000 + Math.random() * 89999999)}`;
await page.fill("#login", phone);
await page.fill("#name", "Айгерим");
await page.fill("#password", "secret123");
await page.getByRole("button", { name: "Создать аккаунт" }).click();
await page.getByText("Нужно принять условия").waitFor(); // error path: terms not accepted
await page.locator("input[type=checkbox]").check();
await page.getByRole("button", { name: "Создать аккаунт" }).click();
await page.getByText("Расскажите о компании").waitFor();
step("sign-up");

// 3. Onboarding: invalid BIN → error, valid BIN → found
await page.fill("input[inputmode=numeric]", "950312400128");
await page.getByRole("button", { name: "Найти" }).click();
await page.getByText("контрольной цифрой").waitFor();
await page.fill("input[inputmode=numeric]", "950312400129");
await page.getByRole("button", { name: "Найти" }).click();
await page.getByText("Мы нашли вашу компанию").waitFor();
await shot("onboarding-bin-found");
await page.getByRole("button", { name: "Далее: реквизиты" }).click();
await page.getByText("Банк и реквизиты").first().waitFor();
await page.getByPlaceholder("АО «Kaspi Bank»").fill("АО «Kaspi Bank»");
await page.getByPlaceholder("CASPKZKA").fill("CASPKZKA");
await page.getByPlaceholder("KZ00 0000 0000 0000 0000").fill("KZ86722S000012345678");
await page.getByRole("button", { name: "Далее: Telegram" }).click();
await page.getByRole("button", { name: "Пропустить" }).click();
await page.getByText("Здесь появятся ваши сделки").waitFor();
await shot("dashboard-empty");
step("onboarding → empty dashboard");

// 4. Deal wizard with validation error
await page.getByRole("link", { name: "+ Создать первую сделку" }).click();
await page.getByText("Выберите тип договора").waitFor();
await shot("wizard-1");
await page.getByRole("button", { name: "Далее" }).click();
await page.getByText("Кто ваш поставщик?").waitFor();
await page.getByRole("button", { name: "Далее" }).click();
await page.getByText("Исправьте отмеченные поля.").waitFor();
await shot("wizard-2-validation");
await page.getByRole("button", { name: "Заполнить примером" }).click();
await page.waitForTimeout(300);
await shot("wizard-2");
await page.getByRole("button", { name: "Далее" }).click();
await page.getByText("Что и на какую сумму?").waitFor();
await shot("wizard-3");
await page.getByRole("button", { name: "Далее" }).click();
await page.getByText("Согласуйте условия").waitFor();
await shot("wizard-4");
await page.getByRole("button", { name: "Проверить" }).click();
await page.getByText("Несколько секунд").waitFor();
await page.waitForTimeout(1500);
await shot("checking");
await page.getByText("Результат проверки").waitFor({ timeout: 15000 });
await shot("result-green");
step("wizard → check → green");

// 5. Package preview + DOCX download → deadlines added
await page.getByRole("button", { name: "Продолжить" }).click();
await page.getByText("Ваш пакет документов").waitFor();
await page.locator(".doc-paper").waitFor();
await shot("package-preview");
await page.getByRole("button", { name: /Скачать DOCX/ }).click();
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Весь пакет · DOCX" }).click()]);
await download.saveAs(OUT + "package.docx");
await page.getByText("Сроки добавлены").waitFor();
await shot("success-deadlines");
await page.getByRole("link", { name: "Позже" }).click();
await page.getByText("Следующий шаг").waitFor();
await shot("deal-page");
step("package → download → deal saved");

// 6. Clause change → package regenerated
await page.getByRole("link", { name: "Создать похожую" }).waitFor();
await page.goto(page.url() + "/documents");
await page.locator(".clause-panel select").nth(1).selectOption("prepay30");
await page.getByRole("button", { name: "Применить изменения" }).click();
await page.getByText("Пакет пересобран").waitFor();
step("clause edit → regenerated");

// 7. Calendar: mark done with proof
await page.goto(BASE + "/app/calendar");
await page.getByText("Календарь обязательств").waitFor();
await shot("calendar");
await page.getByRole("button", { name: "Отметить выполненным" }).first().click();
await page.getByPlaceholder(/Выписка банка/).fill("Выписка Kaspi № 4471");
await page.locator(".modal input[type=file]").setInputFiles({ name: "kaspi-statement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
await shot("proof-upload");
await page.getByRole("button", { name: "Подтвердить" }).click();
await page.getByText(/Выполнено/).first().waitFor();
await page.getByRole("link", { name: "📎 1" }).first().click();
await page.getByRole("link", { name: "kaspi-statement.pdf" }).waitFor();
step("calendar → deadline done + proof file");

// 8. Counterparty screening → red with source list
await page.goto(BASE + "/app/counterparties");
await page.getByRole("button", { name: "+ Добавить" }).click();
await page.locator(".modal input").nth(0).fill("Shenzhen Redline Electronics Co., Ltd.");
await page.locator(".modal input").nth(2).fill("Shenzhen, Guangdong, China");
await page.getByRole("button", { name: "Проверить и сохранить" }).click();
await page.getByText(/Найдено в списке EU/).waitFor();
await shot("counterparty-red");
step("counterparty screening → red");

// 9. Red deal: second deal with sanctioned supplier
await page.goto(BASE + "/app/deals/new");
await page.getByText("Выберите тип договора").waitFor();
await page.getByRole("button", { name: "Заполнить примером" }).click();
await page.getByRole("button", { name: "Далее" }).click();
await page.getByRole("button", { name: "Shenzhen Redline Electronics Co., Ltd." }).click();
for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Далее" }).click();
await page.getByRole("button", { name: "Проверить" }).click();
await page.getByRole("heading", { name: "Найдены признаки риска" }).waitFor({ timeout: 15000 });
await shot("result-red");
step("deal → red result");

// 10. Free plan: a third package hits the limit
await page.getByRole("button", { name: "Изменить данные" }).click();
await page.getByRole("button", { name: "Guangzhou Textile Co., Ltd." }).click();
for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Далее|Проверить/ }).last().click();
await page.getByText("Результат проверки").waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "Продолжить" }).click();
await page.getByRole("button", { name: /Скачать DOCX/ }).click();
await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Весь пакет · DOCX" }).click()]);
await page.getByText("Сроки добавлены").waitFor();
await page.goto(BASE + "/app/deals/new");
await page.getByText("Вы использовали бесплатный лимит").waitFor();
await shot("plan-limit");
step("free limit → pricing screen");

// 11. Demo account (Pro) — dashboard with overdue + UCN, English UI
const demo = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dp = await demo.newPage();
await dp.goto(BASE + "/login");
await dp.getByRole("button", { name: "Открыть демо-кабинет" }).click();
await dp.getByText("Активные сделки").first().waitFor();
await shot("demo-dashboard", dp);
await dp.goto(BASE + "/app/settings");
await dp.getByText("Пример сообщения бота").waitFor();
await shot("settings-telegram", dp);
await dp.goto(BASE + "/app/settings?tab=language");
await dp.getByRole("button", { name: "Тёмная", exact: true }).click();
await dp.goto(BASE + "/app");
await dp.getByText("Активные сделки").first().waitFor();
await shot("demo-dashboard-dark", dp);
await dp.goto(BASE + "/app/settings?tab=language");
await dp.getByRole("button", { name: "Светлая", exact: true }).click();
await dp.getByRole("button", { name: "Language" }).click();
await dp.goto(BASE + "/app");
await dp.getByText("Active deals").first().waitFor();
await shot("demo-dashboard-en", dp);
step("demo account + EN");

// 12. Mobile
const mob = await browser.newContext({ viewport: { width: 375, height: 780 }, isMobile: true, hasTouch: true, storageState: await demo.storageState() });
const mp = await mob.newPage();
await mp.goto(BASE + "/app");
await mp.getByText("Active deals").first().waitFor();
await shot("mobile-dashboard", mp);
await mp.goto(BASE + "/app/calendar");
await mp.getByText("Obligations calendar").or(mp.getByText("Deadline needs attention")).first().waitFor();
await shot("mobile-calendar", mp);
await mp.getByRole("button", { name: "Navigation" }).click();
await shot("mobile-menu", mp);
step("mobile");

await browser.close();
if (errors.length) { console.error("Console errors:\n" + errors.join("\n")); process.exit(1); }
console.log(`All steps passed. Screenshots: ${OUT}`);
