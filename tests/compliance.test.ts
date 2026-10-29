import { describe, expect, it } from "vitest";
import {
  buildDeadlines,
  checkDeal,
  dealTotal,
  isUcnRequired,
  nameSimilarity,
  screenCounterparty,
  toUsd,
  validateDeal,
} from "../shared/compliance";
import { addDays } from "../shared/dates";
import { isValidBin } from "../shared/bin";
import { sampleDeal } from "../shared/sample";
import type { DealInput } from "../shared/types";

const NOW = new Date("2026-10-15T06:00:00Z");
const TODAY = "2026-10-15";

function deal(patch: (d: DealInput) => void = () => {}): DealInput {
  const d = sampleDeal(TODAY);
  patch(d);
  return d;
}

describe("UCN rule (contract registration number)", () => {
  it("is not required at or below 50,000 USD", () => {
    expect(isUcnRequired(50_000, "USD")).toBe(false);
    expect(isUcnRequired(18_400, "USD")).toBe(false);
  });
  it("is required above 50,000 USD equivalent", () => {
    expect(isUcnRequired(50_000.01, "USD")).toBe(true);
    expect(isUcnRequired(400_000, "CNY")).toBe(true); // ≈ 56,000 USD
    expect(isUcnRequired(300_000, "CNY")).toBe(false); // ≈ 42,000 USD
  });
  it("is required when the contract has no amount", () => {
    expect(isUcnRequired(0, "USD")).toBe(true);
  });
  it("converts currencies to USD", () => {
    expect(toUsd(510, "KZT")).toBe(1);
  });
});

describe("sanctions screening", () => {
  it("ignores legal-form words and punctuation", () => {
    expect(nameSimilarity("Shenzhen Redline Electronics Co., Ltd.", "SHENZHEN REDLINE ELECTRONICS LIMITED")).toBe(1);
  });
  it("returns red for a listed entity (also by its Chinese alias)", () => {
    const r = screenCounterparty({ name: "Shenzhen Redline Electronics", name_local: "", country: "CN" }, undefined, NOW);
    expect(r.status).toBe("red");
    expect(r.matches[0].list).toBe("EU");
    const zh = screenCounterparty({ name: "Some trading", name_local: "深圳红线电子有限公司", country: "CN" }, undefined, NOW);
    expect(zh.status).toBe("red");
  });
  it("returns yellow for a similar but not identical name", () => {
    const r = screenCounterparty({ name: "Pacific Dragon Logistic Group", name_local: "", country: "CN" }, undefined, NOW);
    expect(["yellow", "red"]).toContain(r.status);
    expect(r.matches.length).toBeGreaterThan(0);
  });
  it("returns green for a clean supplier", () => {
    const r = screenCounterparty({ name: "Guangzhou Textile Co.", name_local: "广州纺织有限公司", country: "CN" }, undefined, NOW);
    expect(r.status).toBe("green");
    expect(r.matches).toHaveLength(0);
  });
  it("flags embargoed countries red and elevated ones yellow", () => {
    expect(screenCounterparty({ name: "Tehran Carpets", name_local: "", country: "IR" }).status).toBe("red");
    expect(screenCounterparty({ name: "Minsk Tools", name_local: "", country: "BY" }).status).toBe("yellow");
  });
});

describe("deadlines", () => {
  it("prepayment: UCN before payment, payment 5 days after signing, repatriation on performance date", () => {
    const d = deal();
    const list = buildDeadlines(d, true);
    expect(list.map((x) => x.kind)).toEqual(["ucn", "payment", "delivery", "repatriation"]);
    expect(list.find((x) => x.kind === "payment")!.due_date).toBe(addDays(TODAY, 5));
    expect(list.find((x) => x.kind === "repatriation")!.due_date).toBe(d.terms.performance_date);
  });
  it("post-payment: no repatriation, payment after delivery", () => {
    const d = deal((x) => { x.terms.payment = "postpay"; x.terms.postpay_days = 30; });
    const list = buildDeadlines(d, false);
    expect(list.some((x) => x.kind === "repatriation")).toBe(false);
    expect(list.find((x) => x.kind === "payment")!.due_date).toBe(addDays(d.terms.delivery_date, 30));
  });
});

describe("checkDeal traffic light", () => {
  it("green for the sample deal (18,400 USD, clean supplier)", () => {
    const r = checkDeal(deal(), NOW);
    expect(dealTotal(deal())).toBe(18_400);
    expect(r.overall).toBe("green");
    expect(r.ucn_required).toBe(false);
  });
  it("yellow when the amount needs a UCN", () => {
    const r = checkDeal(deal((x) => { x.goods[0].qty = 5000; }), NOW);
    expect(r.overall).toBe("yellow");
    expect(r.items.find((i) => i.id === "ucn")!.status).toBe("yellow");
  });
  it("yellow when repatriation term is longer than 180 days", () => {
    const r = checkDeal(deal((x) => { x.terms.delivery_date = addDays(TODAY, 150); x.terms.performance_date = addDays(TODAY, 220); }), NOW);
    expect(r.items.find((i) => i.id === "repatriation")!.status).toBe("yellow");
  });
  it("red when the supplier is sanctioned, whatever else is fine", () => {
    const r = checkDeal(deal((x) => { x.counterparty.name = "Bosphorus Dual Trade A.S."; x.counterparty.name_local = ""; x.counterparty.country = "TR"; }), NOW);
    expect(r.overall).toBe("red");
    expect(r.items[0].text.en).toContain("UK OFSI");
  });
});

describe("UCN obtained", () => {
  it("turns the UCN item green and recomputes the traffic light", async () => {
    const { applyUcn } = await import("../shared/compliance");
    const r = checkDeal(deal((x) => { x.goods[0].qty = 5000; }), NOW);
    expect(r.overall).toBe("yellow");
    const after = applyUcn(r, "28102026/1910/0003");
    expect(after.overall).toBe("green");
    expect(after.items.find((i) => i.id === "ucn")!.text.ru).toContain("28102026/1910/0003");
  });
});

describe("validation", () => {
  it("rejects a zero amount on step 3 with the mockup message", () => {
    const e = validateDeal(deal((x) => { x.goods = [{ ...x.goods[0], qty: 1, price: 0 }]; }), 3);
    expect(e.total.ru).toBe("Введите сумму больше нуля.");
  });
  it("rejects delivery before signing", () => {
    const e = validateDeal(deal((x) => { x.terms.delivery_date = addDays(TODAY, -1); }), 4);
    expect(e["terms.delivery_date"]).toBeDefined();
  });
  it("accepts the sample deal", () => {
    expect(validateDeal(deal())).toEqual({});
  });
});

describe("BIN checksum", () => {
  it("accepts valid and rejects invalid BINs", () => {
    expect(isValidBin("950312400129")).toBe(true);
    expect(isValidBin("950312400128")).toBe(false);
    expect(isValidBin("12345")).toBe(false);
  });
});
