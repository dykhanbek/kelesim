// Syncs real sanctions lists (OFAC SDN, EU, UK, UN) and PEPs (Wikidata, selected countries)
// from OpenSanctions into D1. Organisations screen the counterparty; persons screen its owners/director.
//
// INCREMENTAL: reads what is already stored, writes only additions / changes / removals, and at most
// `--budget` operations per run (default 8000 ≈ 40k D1 rows written incl. the full-text index).
// D1's free plan allows 100,000 rows written per day — a full rewrite every night would exceed it.
// What does not fit is left for the next run, so a large first load spreads over several nights.
//
//   npx tsx scripts/import-sanctions.ts --remote                 # production (daily GitHub Action)
//   npx tsx scripts/import-sanctions.ts --local --budget 0       # local dev DB, no limit
//   npx tsx scripts/import-sanctions.ts --local --from-dir ./data  # use pre-downloaded <dataset>.csv
//   npx tsx scripts/import-sanctions.ts --dry-run                # download + plan only, print stats
//
// Data © OpenSanctions, CC BY-NC 4.0 (free for non-commercial use).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { csvToEntities, csvUrl, OPENSANCTIONS_DATASETS, PEP_COUNTRIES, type ImportedEntity } from "../shared/opensanctions";
import { planSync, planToSql, type StoredEntity } from "../shared/sanctions-sync";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const target = args.includes("--remote") ? "--remote" : "--local";
const dryRun = args.includes("--dry-run");
const fromDir = arg("--from-dir") ?? null;
const budget = Number(arg("--budget") ?? process.env.SANCTIONS_DAILY_BUDGET ?? 8000);
const PAGE = 5000;

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

function d1Query<T>(command: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "kelisim-db", target, "--json", "--command", command], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const json = JSON.parse(out.slice(out.indexOf("[")));
  return (json[0]?.results ?? []) as T[];
}

/** Everything already stored, paged by rowid (reads are cheap: 5M/day on the free plan). */
function readStored(): StoredEntity[] {
  const rows: StoredEntity[] = [];
  let after = 0;
  for (;;) {
    const page = d1Query<StoredEntity>(`SELECT rowid_ref, id, list, name, aliases, countries, program, kind FROM sanctions_entities WHERE rowid_ref > ${after} ORDER BY rowid_ref LIMIT ${PAGE}`);
    rows.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].rowid_ref;
  }
  return rows;
}

// ── 1. Download and parse ──
const all = new Map<string, ImportedEntity>();
const perList: Record<string, number> = {};
for (const { dataset, list, pep } of OPENSANCTIONS_DATASETS) {
  const text = await load(dataset);
  if (!text) continue;
  const entities = csvToEntities(text, list, { pep, pepCountries: PEP_COUNTRIES });
  let added = 0;
  // A sanctioned person who is also a PEP keeps the sanctions entry (sanctions datasets come first)
  for (const e of entities) if (!all.has(e.id)) { all.set(e.id, e); added++; }
  perList[list] = (perList[list] ?? 0) + added;
  const persons = entities.filter((e) => e.kind === "person").length;
  console.log(`  ✓ ${dataset}: ${entities.length - persons} organisations, ${persons} persons (${added} new)`);
}
if (all.size === 0) {
  console.error("No sanctions data downloaded — the existing data in D1 is kept.");
  process.exit(1);
}
const incoming = [...all.values()];
const lists = Object.entries(perList).map(([l, n]) => `${l} ${n}`).join(", ");
console.log(`Downloaded: ${incoming.length} entities (${lists}).`);

// ── 2. Compare with what is stored ──
const stored = dryRun && !args.includes("--read") ? [] : readStored();
const plan = planSync(stored, incoming, budget);
console.log(
  `Stored: ${stored.length}. Plan: ${plan.deletes.length} deletions, ${plan.inserts.length} insertions, ${plan.unchanged} unchanged` +
    (plan.pending ? `, ${plan.pending} operations left for the next run (budget ${budget})` : "") + ".",
);
if (dryRun) process.exit(0);

// ── 3. Write only the difference + meta ──
const today = new Date().toISOString().slice(0, 10);
const lines = planToSql(plan);
lines.push(
  `INSERT OR REPLACE INTO sanctions_meta (key, value) VALUES ('version', ${sql(`OpenSanctions ${today}`)}), ('count', '${plan.orgs}'), ('persons', '${plan.persons}'), ('lists', ${sql(lists)}), ('pending', '${plan.pending}'), ('updated_at', '${new Date().toISOString()}');`,
);
const file = join(mkdtempSync(join(tmpdir(), "kls-")), "sanctions.sql");
writeFileSync(file, lines.join("\n"));
execFileSync("npx", ["wrangler", "d1", "execute", "kelisim-db", target, "--yes", `--file=${file}`], { stdio: "inherit" });
console.log(`Synced into ${target === "--remote" ? "production" : "local"} D1: ${plan.orgs} organisations, ${plan.persons} persons${plan.pending ? `; ${plan.pending} operations continue tomorrow` : ""}.`);
