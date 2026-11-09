import { describe, expect, it } from "vitest";
import type { ImportedEntity } from "../shared/opensanctions";
import { planSync, planToSql, type StoredEntity } from "../shared/sanctions-sync";

const ent = (id: string, name: string, extra: Partial<ImportedEntity> = {}): ImportedEntity => ({ id, name, aliases: [], country: "CN", list: "OFAC SDN", program: "P", kind: "org", ...extra });
const stored = (rowid_ref: number, e: ImportedEntity): StoredEntity => ({ rowid_ref, id: e.id, list: e.list, name: e.name, aliases: e.aliases.join(";"), countries: e.country, program: e.program, kind: e.kind });

describe("incremental sanctions sync (stays under D1's 100k rows/day)", () => {
  const a = ent("a", "Alpha Co");
  const b = ent("b", "Beta Co", { aliases: ["Beta Ltd"] });
  const c = ent("c", "Gamma Person", { kind: "person" });

  it("nothing changed → no writes", () => {
    const p = planSync([stored(1, a), stored(2, b)], [a, b]);
    expect(p.deletes.length + p.inserts.length).toBe(0);
    expect(p.unchanged).toBe(2);
  });

  it("writes only the difference: new, changed (same rowid) and removed", () => {
    const b2 = { ...b, aliases: ["Beta Ltd", "Beta HK"] };
    const p = planSync([stored(1, a), stored(2, b)], [b2, c]);
    expect(p.deletes.map((d) => d.id).sort()).toEqual(["a", "b"]); // a removed, b changed
    expect(p.inserts.map((i) => [i.e.id, i.rowid])).toEqual([["b", 2], ["c", 3]]);
    expect([p.orgs, p.persons]).toEqual([1, 1]);
  });

  it("respects the daily budget and leaves the rest for the next run", () => {
    const many = Array.from({ length: 10 }, (_, i) => ent(`n${i}`, `New ${i}`));
    const first = planSync([], many, 4);
    expect(first.inserts.length).toBe(4);
    expect(first.pending).toBe(6);
    const afterFirst = first.inserts.map(({ rowid, e }) => stored(rowid, e));
    const second = planSync(afterFirst, many, 4);
    expect(second.inserts.map((i) => i.e.id)).toEqual(["n4", "n5", "n6", "n7"]);
    expect(second.inserts[0].rowid).toBe(5); // rowids continue after the stored ones
  });

  it("removals go first within the budget", () => {
    const p = planSync([stored(1, a), stored(2, b)], [c], 2);
    expect(p.deletes.length).toBe(2);
    expect(p.inserts.length).toBe(0);
    expect(p.pending).toBe(1);
  });

  it("deletes contentless FTS rows with the original document", () => {
    const sql = planToSql(planSync([stored(7, b)], []));
    expect(sql[0]).toBe("DELETE FROM sanctions_entities WHERE rowid_ref IN (7);");
    expect(sql[1]).toContain("('delete', 7, 'beta | beta')"); // legal suffixes are dropped by normalizeName
  });
});
