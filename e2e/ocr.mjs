// Scanned contract: a photo-like PNG of the sample contract is recognised in the browser (OCR) and reviewed.
// Usage: BASE_URL=http://localhost:8787 node e2e/ocr.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem("kls_cookie_consent", "2026-11-09|e2e"));

// 1. Make the "scan": the fixture rendered as an image
const text = readFileSync(new URL("../tests/fixtures/contract-bad.txt", import.meta.url), "utf8");
const paper = await ctx.newPage();
await paper.setContent(`<body style="margin:60px;font:22px/1.5 'Times New Roman','Noto Serif CJK SC',serif;white-space:pre-wrap;background:#fff">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body>`);
const png = await paper.screenshot({ fullPage: true });
await paper.close();

// 2. Upload it to the public check
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE + "/check-contract");
await page.locator('input[type="file"]').setInputFiles({ name: "contract-scan.png", mimeType: "image/png", buffer: png });
await page.getByText(/Распознаём текст: страница 1 из 1/).waitFor({ timeout: 30_000 });
const t0 = Date.now();
await page.getByText("Текст распознан со скана").waitFor({ timeout: 180_000 });
const recognised = await page.locator("textarea").inputValue();
console.log(`✓ OCR finished in ${Math.round((Date.now() - t0) / 1000)} s, ${recognised.length} characters`);
for (const must of ["SALES CONTRACT", "100% T/T in advance", "People's Court", "销售合同", "人民法院"]) {
  if (!recognised.includes(must)) throw new Error(`OCR missed: ${must}\n---\n${recognised}`);
}
await page.getByRole("button", { name: "Проверить договор" }).click();
await page.getByRole("heading", { name: "Платить по такому договору опасно" }).waitFor();
await page.getByText("100% предоплата").waitFor();
await page.screenshot({ path: new URL("./screenshots/s12-ocr.png", import.meta.url).pathname, fullPage: true });
console.log("✓ scanned contract reviewed");
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
