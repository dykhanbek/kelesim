import { describe, expect, it } from "vitest";
import { generatePackage, money } from "../shared/documents";
import { DEMO_COMPANY, sampleDeal } from "../shared/sample";

const ctx = (pair: "ru-cn" | "ru-en", type: "supply" | "agency" | "services" = "supply") => {
  const deal = sampleDeal("2026-10-15");
  deal.lang_pair = pair;
  deal.contract_type = type;
  return { deal, number: "KLS-024", company: DEMO_COMPANY };
};

const allText = (docs: ReturnType<typeof generatePackage>) => JSON.stringify(docs);

describe("document package", () => {
  it("supply deal → contract, specification, invoice, packing list", () => {
    const docs = generatePackage(ctx("ru-cn"));
    expect(docs.map((d) => d.kind)).toEqual(["contract", "specification", "invoice", "packing_list"]);
  });
  it("services deal has no packing list", () => {
    expect(generatePackage(ctx("ru-en", "services")).map((d) => d.kind)).not.toContain("packing_list");
  });
  it("RU/CN contract contains Russian and Chinese text, and the parties", () => {
    const [contract] = generatePackage(ctx("ru-cn"));
    const json = JSON.stringify(contract);
    expect(json).toContain("ДОГОВОР ПОСТАВКИ № KLS-024");
    expect(json).toContain("供货合同");
    expect(json).toContain("Guangzhou Textile Co., Ltd.");
    expect(json).toContain("ИП «Aigerim Store»");
    expect(json).toContain("FCA Guangzhou");
  });
  it("RU/EN contract clauses have no Chinese text", () => {
    const [contract] = generatePackage(ctx("ru-en"));
    const clauses = contract.blocks.filter((b) => b.t === "p" || b.t === "h");
    expect(JSON.stringify(contract)).toContain("SUPPLY CONTRACT No. KLS-024");
    expect(JSON.stringify(clauses)).not.toMatch(/[\u4e00-\u9fff]{2}/);
  });
  it("uses correct Russian case forms (no 'покупателья')", () => {
    const text = allText(generatePackage(ctx("ru-cn")));
    expect(text).toContain("в собственность покупателя");
    expect(text).not.toContain("покупателья");
  });
  it("invoice total equals the sum of goods", () => {
    const inv = generatePackage(ctx("ru-en"))[2];
    const table = inv.blocks.find((b) => b.t === "table");
    expect(table && table.t === "table" && table.foot?.at(-1)).toBe(`${money(18_400)} USD`);
  });
  it("formats money with thin grouping", () => {
    expect(money(18400.5)).toBe("18 400.50");
  });
});
