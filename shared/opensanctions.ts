// Helpers for real sanctions data from OpenSanctions (https://www.opensanctions.org, CC BY-NC 4.0).
// Used by scripts/import-sanctions.mjs (CSV → D1) and by the Worker (candidate search via FTS5).
import { normalizeName } from "./compliance";
import type { SanctionsEntry } from "./sanctions-data";

export const OPENSANCTIONS_DATASETS: { dataset: string; list: string }[] = [
  { dataset: "us_ofac_sdn", list: "OFAC SDN" },
  { dataset: "eu_fsf", list: "EU" },
  { dataset: "gb_fcdo_sanctions", list: "UK" },
  { dataset: "gb_hmt_sanctions", list: "UK" },
];

export const csvUrl = (dataset: string) => `https://data.opensanctions.org/datasets/latest/${dataset}/targets.simple.csv`;

/** Counterparties are companies — individuals are not imported. */
const ORG_SCHEMAS = new Set(["Organization", "Company", "LegalEntity", "PublicBody"]);

/** RFC 4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface ImportedEntity extends SanctionsEntry {
  id: string;
}

/** Converts a targets.simple.csv into organisation entries for one list. */
export function csvToEntities(text: string, list: string): ImportedEntity[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (n: string) => header.indexOf(n);
  const [iId, iSchema, iName, iAliases, iCountries, iSanctions, iPrograms] =
    ["id", "schema", "name", "aliases", "countries", "sanctions", "program_ids"].map(col);
  const out: ImportedEntity[] = [];
  for (const r of rows) {
    if (!ORG_SCHEMAS.has(r[iSchema])) continue;
    const name = (r[iName] ?? "").trim();
    if (!name) continue;
    const aliases = (r[iAliases] ?? "").split(";").map((a) => a.trim()).filter((a) => a && a !== name).slice(0, 20);
    const program = (iPrograms >= 0 && r[iPrograms]) || (r[iSanctions] ?? "").split(";")[0] || "";
    out.push({
      id: r[iId],
      name,
      aliases,
      country: (r[iCountries] ?? "").split(";")[0]?.toUpperCase() ?? "",
      list,
      program: program.slice(0, 120),
    });
  }
  return out;
}

/** Very common words that would return thousands of candidates. */
const STOP = new Set([
  "trading", "trade", "international", "industrial", "industry", "industries", "technology", "technologies",
  "import", "export", "group", "holding", "holdings", "global", "general", "logistics", "services", "service",
  "investment", "development", "company", "enterprise", "enterprises", "corp", "china", "shenzhen", "guangzhou",
  "shanghai", "beijing", "hong", "kong", "istanbul", "dubai", "moscow", "new", "co", "ltd", "limited", "llc",
]);

/**
 * Builds an FTS5 MATCH expression from counterparty names: significant tokens OR-ed,
 * so the database returns a small candidate set that the JS fuzzy matcher then scores.
 */
export function ftsQuery(names: string[]): string | null {
  const tokens = new Set<string>();
  for (const n of names) {
    for (const t of normalizeName(n)) {
      const clean = t.replace(/["*^:()]/g, "");
      if (clean.length >= 3 && !STOP.has(clean)) tokens.add(clean);
      else if (/[一-鿿]/.test(clean) && clean.length >= 2) tokens.add(clean);
    }
  }
  const list = [...tokens].slice(0, 8);
  return list.length ? list.map((t) => `"${t}"`).join(" OR ") : null;
}

/** Text stored in the FTS index for one entity. */
export function ftsDocument(e: { name: string; aliases: string[] }): string {
  return [e.name, ...e.aliases].map((n) => normalizeName(n).join(" ")).join(" | ");
}
