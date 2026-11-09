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

/** later contexts: cookie notice already accepted (so the banner doesn't cover buttons) */
const COOKIE_OK = () => localStorage.setItem("kls_cookie_consent", "2026-11-09|e2e");

// 1. Landing + cookie banner (shown on first visit, gone after "Принять", remembered)
await page.goto(BASE + "/");
await page.getByText("Создать договор бесплатно").first().waitFor();
await page.locator(".cookie-banner").waitFor();
await shot("landing");
await page.locator(".cookie-banner").getByRole("link", { name: "Политика cookie" }).click();
await page.getByRole("heading", { name: "Политика использования cookie" }).waitFor();
await shot("legal-cookies");
await page.locator(".cookie-banner").getByRole("button", { name: "Принять" }).click();
await page.locator(".cookie-banner").waitFor({ state: "detached" });
await page.reload();
await page.getByRole("heading", { name: "Политика использования cookie" }).waitFor();
if (await page.locator(".cookie-banner").count()) throw new Error("cookie banner shown again after accept");
for (const [path, title] of [["/legal/privacy", "Политика сбора и обработки"], ["/legal/consent", "Согласие на сбор"], ["/legal/marketing", "рекламных материалов"], ["/legal/offer", "Публичная оферта"], ["/legal/terms", "Пользовательское соглашение"]]) {
  await page.goto(BASE + path);
  await page.locator(".legal-doc h2").filter({ hasText: title }).waitFor();
}
await shot("legal-offer");
step("landing + cookie banner + legal pages");

// 2. Sign-up (+ duplicate login error path)
await page.goto(BASE + "/register");
const phone = `+7 70${Math.floor(10000000 + Math.random() * 89999999)}`;
await page.fill("#login", phone);
await page.fill("#name", "Айгерим");
await page.fill("#password", "secret123");
await page.getByRole("button", { name: "Создать аккаунт" }).click();
await page.getByText("Нужно принять Пользовательское соглашение").waitFor(); // error path: terms not accepted
const consents = page.locator(".consents input[type=checkbox]");
if (await consents.count() !== 3) throw new Error("expected 3 consent checkboxes");
for (let i = 0; i < 3; i++) if (await consents.nth(i).isChecked()) throw new Error("consent pre-ticked");
await consents.nth(0).check();
await page.getByRole("button", { name: "Создать аккаунт" }).click();
await page.getByText("Нужно согласие на сбор и обработку").waitFor(); // personal-data consent is separate and required
await shot("register-consents");
await consents.nth(1).check(); // marketing (nth 2) stays unticked — optional
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

// 3b. Phone confirmation via Telegram contact sharing (webhook simulated, secret from .dev.vars)
const WEBHOOK_SECRET = process.env.TG_SECRET ?? "e2e-secret";
await page.getByText("Подтвердите номер телефона").waitFor();
await page.locator(".verify-banner").getByRole("button", { name: "Подтвердить" }).click();
await page.getByRole("button", { name: "Подтвердить через Telegram" }).click();
const tgLink = await page.getByRole("link", { name: "Открыть Telegram" }).getAttribute("href");
const token = new URL(tgLink).searchParams.get("start");
await shot("verify-telegram");
const hook = (message) => fetch(BASE + "/api/telegram/webhook", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
  body: JSON.stringify({ message }),
}).then((r) => { if (!r.ok) throw new Error("webhook " + r.status); });
const digits = phone.replace(/\D/g, "");
await hook({ chat: { id: 5551 }, from: { id: 5551, language_code: "ru" }, text: `/start ${token}` });
await hook({ chat: { id: 5551 }, from: { id: 5551 }, contact: { phone_number: "77019999999", user_id: 5551 } }); // wrong number → still unverified
await hook({ chat: { id: 5551 }, from: { id: 5551 }, contact: { phone_number: digits, user_id: 5551 } });
await page.getByText("Контакт подтверждён").waitFor();
await page.locator(".verify-banner").waitFor({ state: "detached" });
step("phone confirmed via Telegram contact");

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
// Telegram is already linked by the phone confirmation, so the modal offers only "Open deal"
await page.getByRole("link", { name: "Открыть сделку" }).click();
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

// 10b. Data & privacy: consents shown, marketing on/off, export, delete account (= consent withdrawal)
await page.goto(BASE + "/app/settings?tab=privacy");
await page.getByText("Ваши согласия").waitFor();
if ((await page.getByText(/^Дано /).count()) < 2) throw new Error("consent dates missing");
const mk = page.getByRole("checkbox", { name: "Новости и предложения" });
if (await mk.isChecked()) throw new Error("marketing should be off");
await mk.check();
await page.getByText("Подписка на новости включена").waitFor();
await shot("settings-privacy");
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Скачать данные (JSON)" }).click()]);
const exported = JSON.parse(await (await import("node:fs/promises")).readFile(await dl.path(), "utf8"));
if (!exported.profile || exported.deals.length < 1 || !exported.consents.some((x) => x.kind === "marketing" && x.granted === 1)) throw new Error("export incomplete");
if ("password_hash" in exported.profile) throw new Error("export leaks password hash");
await page.locator(".danger-zone input[type=password]").fill("wrong-pass");
await page.getByRole("button", { name: "Удалить аккаунт и все данные" }).click();
await page.getByRole("button", { name: "Удалить навсегда" }).click();
await page.getByText("Неверный пароль").waitFor();
await page.locator(".danger-zone input[type=password]").fill("secret123");
await page.getByRole("button", { name: "Удалить аккаунт и все данные" }).click();
await page.getByRole("button", { name: "Удалить навсегда" }).click();
await page.getByText("Аккаунт и все данные удалены").waitFor();
await page.goto(BASE + "/login");
await page.fill("#login", phone);
await page.fill("#password", "secret123");
await page.getByRole("button", { name: "Войти", exact: true }).click();
await page.getByText("Неверный логин или пароль").waitFor();
step("privacy: consents, marketing, export, delete account");

// 11. Demo account (Pro) — dashboard with overdue + UCN, English UI
const demo = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await demo.addInitScript(COOKIE_OK);
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
await dp.getByRole("button", { name: "Language" }).first().click();
await dp.getByRole("menuitemradio", { name: "Қазақша" }).click();
await dp.goto(BASE + "/app");
await dp.getByText("Белсенді мәмілелер").first().waitFor();
await shot("demo-dashboard-kk", dp);
await dp.goto(BASE + "/app/deals");
await dp.getByRole("heading", { name: "Мәмілелер" }).waitFor();
await dp.getByRole("button", { name: "Language" }).first().click();
await dp.getByRole("menuitemradio", { name: "English" }).click();
await dp.goto(BASE + "/app");
await dp.getByText("Active deals").first().waitFor();
await shot("demo-dashboard-en", dp);
step("demo account + KK + EN");

// 12. Mobile
const mob = await browser.newContext({ viewport: { width: 375, height: 780 }, isMobile: true, hasTouch: true, storageState: await demo.storageState() });
await mob.addInitScript(COOKIE_OK);
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
