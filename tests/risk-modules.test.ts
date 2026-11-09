import { describe, expect, it } from "vitest";
import { checkDeal } from "../shared/compliance";
import { chplHits, exportItem } from "../shared/export-control";
import { buildChecklist } from "../shared/import-checklist";
import { ownershipChain, personSimilarity, screenRelated } from "../shared/kyb";
import { csvToEntities } from "../shared/opensanctions";
import { computeReadiness } from "../shared/readiness";
import { sampleDeal } from "../shared/sample";
import { PERSONS_DEMO, SANCTIONS_DEMO } from "../shared/sanctions-data";
import type { DealInput } from "../shared/types";

const NOW = new Date("2026-11-09T06:00:00Z");
const deal = (patch: (d: DealInput) => void = () => {}) => {
  const d = sampleDeal("2026-11-09");
  patch(d);
  return d;
};

describe("KYB — ownership chain", () => {
  it("person names match regardless of order", () => {
    expect(personSimilarity("Li Wei", "Wei Li")).toBe(1);
    expect(personSimilarity("Viktor Redline", "Viktor Redlin")).toBeGreaterThan(0.9);
  });

  it("a sanctioned parent company makes the deal red even if the supplier is clean (A → B on a list)", () => {
    const d = deal((x) => {
      x.counterparty.related = [{ role: "parent", kind: "company", name: "Shenzhen Redline Electronics Co Ltd", country: "CN" }];
    });
    const r = checkDeal(d, NOW);
    const own = r.items.find((i) => i.id === "ownership")!;
    expect(own.status).toBe("red");
    expect(own.text.ru).toContain("Guangzhou Textile Co., Ltd. → Shenzhen Redline");
    expect(r.overall).toBe("red");
  });

  it("a sanctioned beneficiary (exact name + country) is red; a PEP is yellow, never red", () => {
    const hits = screenRelated(
      { related: [{ role: "beneficiary", kind: "person", name: "Redline Viktor", country: "HK" }, { role: "director", kind: "person", name: "Mark Demopolitik", country: "CN" }] },
      SANCTIONS_DEMO,
      PERSONS_DEMO,
    );
    expect(hits.find((h) => h.party.name === "Redline Viktor")?.status).toBe("red");
    const pep = hits.find((h) => h.pep)!;
    expect(pep.status).toBe("yellow");
  });

  it("same name in another country is only a possible match (namesake)", () => {
    const hits = screenRelated({ related: [{ role: "beneficiary", kind: "person", name: "Viktor Redline", country: "TR" }] }, [], PERSONS_DEMO);
    expect(hits[0].status).toBe("yellow");
  });

  it("no owners entered → no ownership item; chain text", () => {
    expect(checkDeal(deal((x) => { x.counterparty.related = []; }), NOW).items.some((i) => i.id === "ownership")).toBe(false);
    expect(ownershipChain("A Ltd", [{ role: "parent", kind: "company", name: "B Ltd", country: "" }, { role: "beneficiary", kind: "person", name: "C", country: "" }, { role: "director", kind: "person", name: "D", country: "" }])).toBe("A Ltd → B Ltd → C");
  });
});

describe("Export control — CHPL and route", () => {
  const chips = (route: Partial<NonNullable<DealInput["route"]>>) =>
    deal((x) => {
      x.goods = [{ name: "Микроконтроллеры", name_alt: "MCU", hs_code: "8542 31 900 0", qty: 1000, unit: "pcs", price: 3, net_kg: 5, gross_kg: 6, packages: 1 }];
      x.route = { origin: "CN", transit: [], end_user_country: "KZ", end_user_name: "", reexport: false, ...route };
    });

  it("finds CHPL codes by prefix (Tier 1 ICs)", () => {
    expect(chplHits(chips({}))[0]).toMatchObject({ code: "854231", tier: "1" });
  });
  it("CHPL goods for use in Kazakhstan → yellow with end-use statement", () => {
    const it = exportItem(chips({}))!;
    expect(it.status).toBe("yellow");
    expect(it.action!.ru).toContain("end-use");
  });
  it("CHPL goods with Russia in the route or end use → red", () => {
    expect(exportItem(chips({ transit: ["RU"] }))!.status).toBe("red");
    expect(exportItem(chips({ end_user_country: "BY" }))!.status).toBe("red");
    expect(exportItem(chips({ reexport: true }))!.status).toBe("red"); // re-export without a named end user
  });
  it("embargoed transit → red even for clothing; clean deal → green", () => {
    expect(exportItem(deal((x) => { x.route!.transit = ["IR"]; }))!.status).toBe("red");
    expect(exportItem(deal())!.status).toBe("green");
  });
  it("services contracts are not screened for goods", () => {
    expect(exportItem(deal((x) => { x.contract_type = "services"; }))).toBeNull();
  });
});

describe("Import checklist", () => {
  const base = { docsGenerated: true, ucnRequired: false, ucn: "", chplHit: false, today: "2026-11-09" };

  it("children's clothing: TR CU 007/2011, light-industry marking from 01.03.2027 for 6202", () => {
    const items = buildChecklist(deal(), base);
    expect(items.some((i) => i.id === "tr:ТР ТС 007/2011")).toBe(true);
    expect(items.some((i) => i.id === "tr:ТР ТС 017/2011")).toBe(false);
    const mark = items.find((i) => i.group === "marking")!;
    expect(mark.why!.ru).toContain("01.03.2027");
    expect(items.find((i) => i.id === "invoice")!.status).toBe("done");
  });
  it("adult clothing → TR CU 017/2011; footwear marking already mandatory", () => {
    const items = buildChecklist(deal((x) => { x.for_children = false; x.goods[0].hs_code = "6403 99"; }), base);
    expect(items.some((i) => i.id === "tr:ТР ТС 017/2011")).toBe(true);
    expect(items.find((i) => i.id.startsWith("mark:2021"))!.why!.ru).toContain("Обязательна с 01.11.2021");
  });
  it("without HS codes it does not guess a certificate", () => {
    const items = buildChecklist(deal((x) => x.goods.forEach((g) => (g.hs_code = ""))), base);
    expect(items.find((i) => i.id === "hs")!.status).toBe("todo");
    expect(items.find((i) => i.id === "tr:unknown")!.why!.ru).toContain("не от названия");
    expect(items.some((i) => i.group === "marking")).toBe(false);
  });
  it("electronics: EAEU encryption notification; user statuses are applied", () => {
    const items = buildChecklist(deal((x) => { x.goods[0].hs_code = "8517 62"; }), { ...base, manual: { "permit:crypto": "na" } });
    expect(items.find((i) => i.id === "permit:crypto")!.status).toBe("na");
  });
});

describe("Deal readiness score", () => {
  it("explains every lost point and caps the score on a blocker", () => {
    const d = deal((x) => { x.terms.payment = "prepay100"; x.counterparty.related = []; });
    const check = checkDeal(d, NOW);
    const r = computeReadiness({ deal: d, check, checklist: buildChecklist(d, { docsGenerated: true, ucnRequired: false, ucn: "", chplHit: false, today: "2026-11-09" }), ucn: "", docsGenerated: true });
    expect(r.areas.map((a) => a.max)).toEqual([25, 25, 20, 15, 15]);
    expect(r.score).toBe(r.areas.reduce((s, a) => s + a.score, 0));
    expect(r.reasons[0].points).toBeGreaterThanOrEqual(r.reasons[r.reasons.length - 1].points);
    expect(r.reasons.some((x) => x.text.ru.includes("100% предоплата"))).toBe(true);
    expect(r.reasons.some((x) => x.text.ru.includes("бенефициар"))).toBe(true);

    const red = deal((x) => { x.counterparty.name = "Shenzhen Redline Electronics Co., Ltd."; });
    const rr = computeReadiness({ deal: red, check: checkDeal(red, NOW), checklist: [], ucn: "", docsGenerated: false });
    expect(rr.score).toBeLessThanOrEqual(40);
    expect(rr.level).toBe("red");
    expect(rr.stages.every((s) => !s.ready)).toBe(true);
  });

  it("a well-prepared deal scores high", () => {
    const d = deal((x) => { x.terms.payment = "postpay"; });
    const check = checkDeal(d, NOW);
    const manual = { "tr:ТР ТС 007/2011": "done", "mark:2027-03-01:6106": "done", transport: "done", origin: "na", declaration: "done" } as const;
    const checklist = buildChecklist(d, { docsGenerated: true, ucnRequired: false, ucn: "", chplHit: false, manual, today: "2026-11-09" });
    const r = computeReadiness({ deal: d, check, checklist, ucn: "", docsGenerated: true });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.level).toBe("green");
  });
});

describe("OpenSanctions — PEP import filter", () => {
  it("keeps persons from selected countries only", () => {
    const csv = 'id,schema,name,aliases,countries,sanctions\nq1,Person,Zhang San,,cn,\nq2,Person,John Smith,,us,\nq3,Company,Some Co,,cn,\n';
    const e = csvToEntities(csv, "PEP", { pep: true, pepCountries: new Set(["cn"]) });
    expect(e.map((x) => x.id)).toEqual(["q1"]);
    expect(e[0]).toMatchObject({ kind: "person", list: "PEP", program: "Politically exposed person" });
  });
});
