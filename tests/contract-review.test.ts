import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateClaim } from "../shared/claim";
import { amendmentLetter, languageShares, numberDiscrepancies, parseAmount, reviewContract } from "../shared/contract-review";
import { SAMPLE_CONTRACT } from "../shared/contract-sample";
import { DEMO_COMPANY, sampleDeal } from "../shared/sample";
import { cleanOrderDetails, formatTenge, initialStatus, NEXT_STATUSES, serviceById, SERVICES } from "../shared/services";
import { adminLogins, isAdmin } from "../worker/lib/admin";
import { docxXmlToText } from "../src/lib/extractText";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/contract-${n}.txt`, import.meta.url), "utf8");
const byId = (r: ReturnType<typeof reviewContract>, id: string) => r.findings.find((f) => f.id === id);

describe("contract review: a one-page supplier contract", () => {
  const r = reviewContract(fixture("bad"), { deal: sampleDeal() });
  it("is rated dangerous", () => {
    expect(r.risk).toBe("red");
    expect(r.score).toBeLessThan(40);
  });
  it("finds the clauses that protect the money are missing", () => {
    for (const id of ["law", "disputes", "payment", "refund", "delivery"]) expect(byId(r, id)?.sev, id).toBe("risk");
    for (const id of ["penalty", "quality", "claims"]) expect(byId(r, id)?.sev, id).toBe("warn");
  });
  it("extracts the facts", () => {
    expect(r.facts).toMatchObject({ amount: 18400, currency: "USD", incoterm: "FOB", prepay_pct: 100, swift_country: "HK", forum: "seller_court", bilingual: true });
  });
  it("spots that the English and Chinese versions state a different prepayment", () => {
    const v = byId(r, "versions")!;
    expect(v.sev).toBe("risk");
    expect(v.text.ru).toContain("100%");
    expect(v.text.ru).toContain("50%");
  });
  it("flags a payee bank in another country and the equal-force language clause", () => {
    expect(byId(r, "bank")?.sev).toBe("warn"); // CN supplier paid in HK
    expect(byId(r, "language")?.sev).toBe("warn");
  });
  it("compares with the deal: amount matches, delivery basis differs", () => {
    expect(byId(r, "amount")?.sev).toBe("ok");
    expect(byId(r, "incoterms")?.sev).toBe("warn"); // FOB in the contract, FCA in the deal
  });
  it("quotes the contract and builds a letter to the supplier in two languages", () => {
    expect(byId(r, "disputes")?.quote).toContain("People's Court");
    const letter = amendmentLetter(r, "Guangzhou Textile");
    expect(letter.en).toMatch(/Dear Guangzhou Textile,[\s\S]*1\. Please add a governing law/);
    expect(letter.zh).toContain("请增加适用法律条款");
    expect(letter.en.match(/^\d+\. /gm)!.length).toBeGreaterThanOrEqual(8);
  });
  it("the built-in example equals the fixture", () => expect(reviewContract(SAMPLE_CONTRACT).score).toBe(reviewContract(fixture("bad")).score));
});

describe("contract review: a balanced bilingual contract", () => {
  const r = reviewContract(fixture("good"), { deal: sampleDeal() });
  it("is rated safe with no critical findings", () => {
    expect(r.risk).toBe("green");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.findings.filter((f) => f.sev === "risk" || f.sev === "warn")).toEqual([]);
  });
  it("reads the terms", () => {
    expect(r.facts).toMatchObject({ law: "KZ", forum: "AIFC IAC", prepay_pct: 30, delivery_days: 45, claim_days: 30, incoterm: "FCA", swift_country: "CN" });
    expect(byId(r, "language")?.title.ru).toBe("Главная версия — русская");
    expect(byId(r, "versions")?.sev).toBe("ok");
  });
});

describe("contract review: details", () => {
  it("parses amounts in Russian and English notation", () => {
    expect(parseAmount("18 400,00")).toBe(18400);
    expect(parseAmount("18,400.00")).toBe(18400);
    expect(parseAmount("1.250.000")).toBe(1250000);
    expect(parseAmount("0,1")).toBe(0.1);
  });
  it("measures the languages of the text", () => {
    const s = languageShares("Договор поставки товара 销售合同 销售合同");
    expect(s.ru).toBeGreaterThan(0.4);
    expect(s.zh).toBeGreaterThan(0.3);
    expect(s.en).toBe(0);
  });
  it("ignores account numbers, years and clause numbers when comparing versions", () => {
    const d = numberDiscrepancies("3.1. Цена 5000 USD, счёт 7700 1234 5678, Incoterms 2020, срок 45 дней\n3.1. 价格5000美元，交货期60天", ["ru", "zh"]);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]); // 45 and 60 are below the threshold for plain numbers
    const p = numberDiscrepancies("Предоплата 30%, сумма 5000\n预付款50%，金额5000", ["ru", "zh"]);
    expect(p.onlyA).toEqual(["30%"]);
    expect(p.onlyB).toEqual(["50%"]);
  });
  it("flags a mismatching amount and a supplier that is not in the contract", () => {
    const deal = sampleDeal();
    const text = fixture("good").replaceAll("18 400,00", "21 000,00").replaceAll("18,400.00", "21,000.00").replaceAll("Guangzhou Textile Co., Ltd.", "Foshan Trading Co., Ltd.");
    const r = reviewContract(text, { deal });
    expect(byId(r, "amount")?.sev).toBe("risk");
    expect(byId(r, "party")?.sev).toBe("risk");
  });
  it("warns when the text is not a contract", () => {
    expect(byId(reviewContract("Proforma invoice. ".repeat(40)), "not_contract")?.sev).toBe("warn");
  });
  it("reads paragraphs from DOCX xml", () => {
    expect(docxXmlToText('<w:p><w:r><w:t>Sales</w:t></w:r><w:r><w:t xml:space="preserve"> Contract &amp; Co</w:t></w:r></w:p><w:p><w:r><w:t>销售合同</w:t></w:r></w:p>')).toBe("Sales Contract & Co\n销售合同");
  });
});

describe("claim letter", () => {
  const ctx = { deal: sampleDeal("2026-10-05"), number: "KLS-001", company: DEMO_COMPANY };
  it("is bilingual and carries the deal data", () => {
    const doc = generateClaim(ctx, { kind: "non_delivery", demand: "refund", paid: 5520, response_days: 10, facts: "", facts_alt: "", date: "2026-11-14" });
    const text = JSON.stringify(doc.blocks);
    expect(doc.kind).toBe("claim");
    expect(text).toContain("ПРЕТЕНЗИЯ о непоставке товара");
    expect(text).toContain("索赔函");
    expect(text).toContain("KLS-001");
    expect(text).toContain("5 520.00 USD");
    expect(text).toContain("24.11.2026"); // 10 days to respond
    expect(text).toContain("广州纺织有限公司");
  });
  it("uses English for RU/EN deals and the claimed amount for a price reduction", () => {
    const deal = { ...ctx.deal, lang_pair: "ru-en" as const };
    const doc = generateClaim({ ...ctx, deal }, { kind: "defect", demand: "discount", paid: 18400, claimed: 3000, response_days: 14, facts: "Брак 15%", facts_alt: "15% defective", date: "2026-11-14" });
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain("CLAIM for non-conforming goods");
    expect(text).toContain("refund USD 3 000.00");
    expect(text).toContain("15% defective");
    expect(text).not.toContain("索赔");
  });
});

describe("services and orders", () => {
  it("fixed-price services wait for payment, quoted ones start as requests", () => {
    expect(initialStatus(serviceById("supplier_check")!)).toBe("awaiting_payment");
    expect(initialStatus(serviceById("lawyer_review")!)).toBe("awaiting_payment");
    expect(initialStatus(serviceById("turnkey_import")!)).toBe("new");
    expect(initialStatus(serviceById("safe_payment")!)).toBe("new");
    expect(serviceById("nope")).toBeUndefined();
  });
  it("every service has texts in three languages", () => {
    for (const s of SERVICES) for (const x of [s.title, s.short, s.result, ...s.includes, ...s.fields.map((f) => f.label)]) expect(Boolean(x.ru && x.en && x.kk), s.id).toBe(true);
  });
  it("validates the order form", () => {
    const s = serviceById("claim_support")!;
    expect(cleanOrderDetails(s, { supplier: "Acme" })).toEqual({ ok: false, field: "amount" });
    expect(cleanOrderDetails(s, { supplier: " Acme ", amount: "12 000 USD", comment: "Не отгрузили", extra: "x" })).toEqual({ ok: true, details: { supplier: "Acme", amount: "12 000 USD", comment: "Не отгрузили" } });
  });
  it("a finished order cannot be reopened, payment cannot be skipped backwards", () => {
    expect(NEXT_STATUSES.done).toEqual([]);
    expect(NEXT_STATUSES.payment_reported).toContain("in_progress");
    expect(NEXT_STATUSES.in_progress).not.toContain("awaiting_payment");
  });
  it("formats tenge", () => expect(formatTenge(25000)).toBe("25 000 ₸"));
  it("administrators come from ADMIN_LOGINS, phones are normalised", () => {
    const env = { ADMIN_LOGINS: "Boss@Mail.kz, 8 (701) 123-45-67" };
    expect(adminLogins(env)).toEqual(["boss@mail.kz", "+77011234567"]);
    expect(isAdmin(env, { login: "+77011234567" })).toBe(true);
    expect(isAdmin(env, { login: "user@mail.kz" })).toBe(false);
    expect(isAdmin({}, { login: "user@mail.kz" })).toBe(false);
  });
});

import { landedCost, VAT_RATE } from "../shared/landed-cost";
import { cleanOcr } from "../src/lib/extractText";

describe("import cost calculator", () => {
  it("adds duty on the customs value and VAT on value + duty", () => {
    const r = landedCost({ goods: 10_000, freight: 1_200, rate: 500, duty_pct: 10, declaration_fee: 20_000, broker: 80_000, units: 500 });
    expect(VAT_RATE).toBe(16);
    expect(r.customs_value).toBe(5_600_000);
    expect(r.duty).toBe(560_000);
    expect(r.vat).toBe(985_600); // (5 600 000 + 560 000) × 16%
    expect(r.customs_payments).toBe(1_565_600);
    expect(r.total).toBe(7_245_600);
    expect(r.per_unit).toBe(14_491);
    expect(r.markup_pct).toBe(44.9);
  });
  it("handles zero duty, missing units and bad input", () => {
    const r = landedCost({ goods: 1000, freight: 0, rate: 500, duty_pct: 0, declaration_fee: 0 });
    expect(r.total).toBe(580_000);
    expect(r.per_unit).toBeNull();
    expect(landedCost({ goods: NaN, freight: -5, rate: 500, duty_pct: 10, declaration_fee: 0 }).total).toBe(0);
  });
});

describe("OCR clean-up", () => {
  it("removes spaces between Chinese characters but keeps them in Latin text", () => {
    expect(cleanOcr("销 售 合 同   \nSales Contract 卖 方 ： 广 州\n\n\n\nEnd")).toBe("销售合同\nSales Contract 卖方：广州\n\nEnd");
  });
});
