import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDeal, screenCounterparty } from "../shared/compliance";
import { DEMO_RATES, parseNbrkRates, toUsd, type RateTable } from "../shared/fx";
import { csvToEntities, ftsDocument, ftsQuery, parseCsv } from "../shared/opensanctions";
import { sampleDeal } from "../shared/sample";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

describe("OpenSanctions CSV import", () => {
  it("parses quoted fields, escaped quotes and semicolon lists", () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("keeps organisations only and splits aliases", () => {
    const e = csvToEntities(fx("us_ofac_sdn.csv"), "OFAC SDN");
    expect(e.map((x) => x.id)).toEqual(["ofac-1001", "ofac-1003"]); // the Person row is skipped
    expect(e[0].aliases).toContain("示例轨道航运有限公司");
    expect(e[0].country).toBe("CN");
    expect(e[0].program).toBe("TEST-EO1");
  });
  it("handles escaped quotes inside names", () => {
    const [e] = csvToEntities(fx("eu_fsf.csv"), "EU");
    expect(e.name).toBe('Sample Northern Trading "Polar" JSC');
  });
});

describe("FTS candidate query", () => {
  it("drops legal forms and very common words", () => {
    expect(ftsQuery(["Shenzhen Orbital Trading Co., Ltd."])).toBe('"orbital"');
  });
  it("returns null when nothing significant is left", () => {
    expect(ftsQuery(["Trading Co. Ltd"])).toBeNull();
  });
  it("indexes name and aliases in normalized form", () => {
    expect(ftsDocument({ name: "Example Orbital Shipping Co., Ltd.", aliases: ["Orbital Shipping"] })).toBe("example orbital shipping | orbital shipping");
  });
  it("real entries found by FTS are matched by the fuzzy screener", () => {
    const list = csvToEntities(fx("us_ofac_sdn.csv"), "OFAC SDN");
    const r = screenCounterparty({ name: "EXAMPLE ORBITAL SHIPPING LIMITED", name_local: "", country: "CN" }, list);
    expect(r.status).toBe("red");
    expect(r.matches[0]).toMatchObject({ list: "OFAC SDN", program: "TEST-EO1" });
  });
});

describe("NBRK exchange rates", () => {
  const rates = parseNbrkRates(fx("rates.xml"));
  it("parses the RSS feed and divides by quant", () => {
    expect(rates.USD).toBe(481.5);
    expect(rates.CNY).toBe(67.45);
    expect(rates.JPY).toBe(3.172);
    expect(rates.KZT).toBe(1);
  });
  it("converts to USD via KZT cross rates", () => {
    const t: RateTable = { source: "nbrk", date: "2026-10-28", kzt: rates };
    expect(toUsd(481.5, "KZT", t)).toBe(1);
    expect(toUsd(1000, "CNY", t)).toBeCloseTo(140.08, 2);
  });
  it("the UCN check uses the official rate and says so", () => {
    const deal = sampleDeal("2026-10-28");
    deal.currency = "CNY";
    deal.goods = [{ ...deal.goods[0], qty: 1, price: 360_000 }]; // 360k CNY ≈ 50.4k USD at 67.45/481.5
    const t: RateTable = { source: "nbrk", date: "2026-10-28", kzt: rates };
    const r = checkDeal(deal, new Date("2026-10-28T06:00:00Z"), { rates: t });
    expect(r.ucn_required).toBe(true);
    expect(r.rate).toMatchObject({ source: "nbrk", usd_kzt: 481.5 });
    expect(r.items.find((i) => i.id === "ucn")!.text.ru).toContain("курс НБРК на 28.10.2026");
    // with the demo fallback (71.4/510 = 0.14) the same amount is also above 50k
    expect(checkDeal(deal, new Date("2026-10-28T06:00:00Z"), { rates: DEMO_RATES }).items[1].text.ru).toContain("демо-курс");
  });
});
