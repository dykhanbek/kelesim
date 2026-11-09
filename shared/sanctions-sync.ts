// Incremental sync of the sanctions / PEP lists into D1.
// D1's free plan allows 100,000 rows written per day; rewriting ~tens of thousands of entities
// plus their full-text index every night exceeds it. Instead the importer reads what is already
// stored (reads are cheap), compares, and writes only the difference — within a daily budget.
// Anything over the budget is simply left for the next run, so a large first load spreads over
// several nights and the daily limit is never hit.
import { ftsDocument, type ImportedEntity } from "./opensanctions";

export interface StoredEntity {
  rowid_ref: number;
  id: string;
  list: string;
  name: string;
  aliases: string; // ";"-separated, as stored
  countries: string;
  program: string;
  kind: string;
}

export interface SyncPlan {
  /** rows to remove (no longer listed, or changed — re-inserted below with the same rowid) */
  deletes: StoredEntity[];
  inserts: { rowid: number; e: ImportedEntity }[];
  unchanged: number;
  /** operations left for the next run because of the budget */
  pending: number;
  /** final counts after this run */
  orgs: number;
  persons: number;
}

const fingerprint = (x: { list: string; name: string; aliases: string; countries: string; program: string; kind: string }) =>
  [x.list, x.name, x.aliases, x.countries, x.program, x.kind].join("\u0001");

export const storedFingerprint = (s: StoredEntity) => fingerprint(s);
export const incomingFingerprint = (e: ImportedEntity) => fingerprint({ ...e, aliases: e.aliases.join(";"), countries: e.country });

/**
 * Plans the writes. `budget` = max delete + insert operations (0 = unlimited).
 * Priority: removals and changes first (keeps data correct), then new entries in incoming order
 * (sanctions lists come before PEPs, so the critical data loads first).
 */
export function planSync(stored: StoredEntity[], incoming: ImportedEntity[], budget = 0): SyncPlan {
  const byId = new Map(stored.map((s) => [s.id, s]));
  const incomingIds = new Set(incoming.map((e) => e.id));
  let nextRowid = stored.reduce((m, s) => Math.max(m, s.rowid_ref), 0) + 1;
  const limit = budget > 0 ? budget : Infinity;
  let ops = 0;
  let pending = 0;
  const deletes: StoredEntity[] = [];
  const inserts: SyncPlan["inserts"] = [];
  let unchanged = 0;

  // 1. Removed from the lists
  for (const s of stored) {
    if (incomingIds.has(s.id)) continue;
    if (ops < limit) { deletes.push(s); ops++; } else pending++;
  }
  // 2. Changed (delete + insert with the same rowid) and 3. new
  const changed: { s: StoredEntity; e: ImportedEntity }[] = [];
  const fresh: ImportedEntity[] = [];
  for (const e of incoming) {
    const s = byId.get(e.id);
    if (!s) fresh.push(e);
    else if (storedFingerprint(s) !== incomingFingerprint(e)) changed.push({ s, e });
    else unchanged++;
  }
  for (const { s, e } of changed) {
    if (ops + 2 <= limit) { deletes.push(s); inserts.push({ rowid: s.rowid_ref, e }); ops += 2; } else { pending += 2; unchanged++; }
  }
  for (const e of fresh) {
    if (ops < limit) { inserts.push({ rowid: nextRowid++, e }); ops++; } else pending++;
  }

  // Final composition after this run
  const removedIds = new Set(deletes.map((d) => d.id));
  const kinds = new Map<string, string>();
  for (const s of stored) if (!removedIds.has(s.id)) kinds.set(s.id, s.kind);
  for (const { e } of inserts) kinds.set(e.id, e.kind);
  let orgs = 0;
  let persons = 0;
  for (const k of kinds.values()) k === "person" ? persons++ : orgs++;
  return { deletes, inserts, unchanged, pending, orgs, persons };
}

const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** SQL statements for a plan; contentless FTS rows are deleted with the original document. */
export function planToSql(plan: SyncPlan, rowsPerStatement = 50): string[] {
  const lines: string[] = [];
  for (let i = 0; i < plan.deletes.length; i += rowsPerStatement) {
    const chunk = plan.deletes.slice(i, i + rowsPerStatement);
    lines.push(`DELETE FROM sanctions_entities WHERE rowid_ref IN (${chunk.map((d) => d.rowid_ref).join(",")});`);
    const docs = chunk.map((d) => `('delete', ${d.rowid_ref}, ${sql(ftsDocument({ name: d.name, aliases: d.aliases ? d.aliases.split(";") : [] }))})`);
    lines.push(`INSERT INTO sanctions_fts (sanctions_fts, rowid, names) VALUES ${docs.join(",")};`);
  }
  for (let i = 0; i < plan.inserts.length; i += rowsPerStatement) {
    const chunk = plan.inserts.slice(i, i + rowsPerStatement);
    const vals = chunk.map(({ rowid, e }) => `(${rowid}, ${sql(e.id)}, ${sql(e.list)}, ${sql(e.name)}, ${sql(e.aliases.join(";"))}, ${sql(e.country)}, ${sql(e.program)}, ${sql(e.kind)})`);
    lines.push(`INSERT INTO sanctions_entities (rowid_ref, id, list, name, aliases, countries, program, kind) VALUES ${vals.join(",")};`);
    lines.push(`INSERT INTO sanctions_fts (rowid, names) VALUES ${chunk.map(({ rowid, e }) => `(${rowid}, ${sql(ftsDocument(e))})`).join(",")};`);
  }
  return lines;
}
