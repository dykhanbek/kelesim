// Imports real sanctions lists (OFAC SDN, EU, UK) from OpenSanctions into D1.
//
//   npx tsx scripts/import-sanctions.ts --remote          # production (used by the daily GitHub Action)
//   npx tsx scripts/import-sanctions.ts --local           # local wrangler dev database
//   npx tsx scripts/import-sanctions.ts --local --from-dir ./data   # use pre-downloaded <dataset>.csv files
//   npx tsx scripts/import-sanctions.ts --dry-run          # download + parse only, print stats
//
// Data © OpenSanctions, CC BY-NC 4.0 (free for non-commercial use).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { csvToEntities, csvUrl, ftsDocument, OPENSANCTIONS_DATASETS, type ImportedEntity } from "../shared/opensanctions";

const args = process.argv.slice(2);
const target = args.includes("--remote") ? "--remote" : "--local";
const dryRun = args.includes("--dry-run");
const fromDir = args.includes("--from-dir") ? args[args.indexOf("--from-dir") + 1] : null;
const ROWS_PER_STATEMENT = 80; // keeps every SQL statement well under D1's 100 KB limit

const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function load(dataset: string): Promise<string | null> {
  if (fromDir) {
    const f = join(fromDir, `${dataset}.csv`);
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  }
  const res = await fetch(csvUrl(dataset), { headers: { "user-agent": "kelisim-mvp (non-commercial student project)" } });
  if (!res.ok) {
    console.warn(`  ! ${dataset}: HTTP ${res.status}, skipped`);
    return null;
  }
  return res.text();
}

const all = new Map<string, ImportedEntity>();
const perList: Record<string, number> = {};
for (const { dataset, list } of OPENSANCTIONS_DATASETS) {
  const text = await load(dataset);
  if (!text) continue;
  const entities = csvToEntities(text, list);
  let added = 0;
  for (const e of entities) if (!all.has(e.id)) { all.set(e.id, e); added++; }
  perList[list] = (perList[list] ?? 0) + added;
  console.log(`  ✓ ${dataset}: ${entities.length} organisations (${added} new)`);
}

if (all.size === 0) {
  console.error("No sanctions data downloaded — the existing data in D1 is kept.");
  process.exit(1);
}

const entities = [...all.values()];
const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [
  "DELETE FROM sanctions_entities;",
  "INSERT INTO sanctions_fts(sanctions_fts) VALUES('delete-all');",
];
for (let i = 0; i < entities.length; i += ROWS_PER_STATEMENT) {
  const chunk = entities.slice(i, i + ROWS_PER_STATEMENT);
  const vals = chunk.map((e, k) => `(${i + k + 1}, ${sql(e.id)}, ${sql(e.list)}, ${sql(e.name)}, ${sql(e.aliases.join(";"))}, ${sql(e.country)}, ${sql(e.program)})`);
  lines.push(`INSERT INTO sanctions_entities (rowid_ref, id, list, name, aliases, countries, program) VALUES ${vals.join(",")};`);
  const docs = chunk.map((e, k) => `(${i + k + 1}, ${sql(ftsDocument(e))})`);
  lines.push(`INSERT INTO sanctions_fts (rowid, names) VALUES ${docs.join(",")};`);
}
const lists = Object.entries(perList).map(([l, n]) => `${l} ${n}`).join(", ");
lines.push(
  `INSERT OR REPLACE INTO sanctions_meta (key, value) VALUES ('version', ${sql(`OpenSanctions ${today}`)}), ('count', '${entities.length}'), ('lists', ${sql(lists)}), ('updated_at', '${new Date().toISOString()}');`,
);

console.log(`Total: ${entities.length} organisations (${lists}).`);
if (dryRun) process.exit(0);

const file = join(mkdtempSync(join(tmpdir(), "kls-")), "sanctions.sql");
writeFileSync(file, lines.join("\n"));
execFileSync("npx", ["wrangler", "d1", "execute", "kelisim-db", target, "--yes", `--file=${file}`], { stdio: "inherit" });
console.log(`Imported into ${target === "--remote" ? "production" : "local"} D1.`);
