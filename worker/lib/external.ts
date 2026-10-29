// Real-world data for the compliance engine: sanctions candidates from D1 (OpenSanctions import)
// and official NBRK exchange rates (fetched once per date and cached in D1).
import { addDays, todayKz } from "../../shared/dates";
import { DEMO_RATES, parseNbrkRates, type RateTable } from "../../shared/fx";
import { ftsQuery } from "../../shared/opensanctions";
import { SANCTIONS_DEMO, SANCTIONS_LISTS_VERSION, type SanctionsEntry } from "../../shared/sanctions-data";
import type { CounterpartyInput } from "../../shared/types";
import type { Env } from "../env";

export interface SanctionsSource {
  entries: SanctionsEntry[];
  version: string;
}

const demoOn = (env: Env) => env.DEMO_SANCTIONS !== "off";

/** Candidate entries for one counterparty: FTS search in the imported lists + (optionally) demo entries. */
export async function sanctionsFor(env: Env, cp: Pick<CounterpartyInput, "name" | "name_local">): Promise<SanctionsSource> {
  const demo = demoOn(env) ? SANCTIONS_DEMO : [];
  try {
    const meta = await env.DB.prepare("SELECT key, value FROM sanctions_meta").all<{ key: string; value: string }>();
    const m = Object.fromEntries(meta.results.map((r) => [r.key, r.value]));
    if (!m.version) return { entries: SANCTIONS_DEMO, version: SANCTIONS_LISTS_VERSION };
    const q = ftsQuery([cp.name, cp.name_local].filter(Boolean));
    let real: SanctionsEntry[] = [];
    if (q) {
      const rows = await env.DB.prepare(
        `SELECT e.list, e.name, e.aliases, e.countries, e.program
           FROM sanctions_fts JOIN sanctions_entities e ON e.rowid_ref = sanctions_fts.rowid
          WHERE sanctions_fts MATCH ? LIMIT 200`,
      )
        .bind(q)
        .all<{ list: string; name: string; aliases: string; countries: string; program: string }>();
      real = rows.results.map((r) => ({ list: r.list, name: r.name, aliases: r.aliases ? r.aliases.split(";") : [], country: r.countries, program: r.program }));
    }
    return {
      entries: [...real, ...demo],
      version: `${m.version} · ${Number(m.count).toLocaleString("ru-RU")} orgs${demo.length ? " + demo" : ""}`,
    };
  } catch (e) {
    console.warn("sanctions lookup failed, using demo list", e);
    return { entries: SANCTIONS_DEMO, version: SANCTIONS_LISTS_VERSION };
  }
}

const ddmmyyyy = (iso: string) => iso.split("-").reverse().join(".");

async function fetchNbrk(date: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`https://nationalbank.kz/rss/get_rates.cfm?fdate=${ddmmyyyy(date)}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const rates = parseNbrkRates(await res.text());
    return rates.USD ? rates : null;
  } catch {
    return null;
  }
}

/** Official NBRK rates on `date` (signing date; future dates use today). Falls back to demo rates. */
export async function ratesFor(env: Env, date: string): Promise<RateTable> {
  const today = todayKz();
  const effective = date && date < today ? date : today;
  try {
    // Cached rate for that date, or the last published one within a week (weekends / holidays)
    const cached = await env.DB.prepare(
      "SELECT date, code, kzt FROM fx_rates WHERE date = (SELECT MAX(date) FROM fx_rates WHERE date <= ? AND date >= ?)",
    )
      .bind(effective, addDays(effective, -7))
      .all<{ date: string; code: string; kzt: number }>();
    if (cached.results.length && cached.results[0].date === effective) return toTable(cached.results);
    const fresh = await fetchNbrk(effective);
    if (fresh) {
      await env.DB.batch(
        Object.entries(fresh).map(([code, kzt]) => env.DB.prepare("INSERT OR REPLACE INTO fx_rates (date, code, kzt) VALUES (?, ?, ?)").bind(effective, code, kzt)),
      );
      return { source: "nbrk", date: effective, kzt: fresh };
    }
    if (cached.results.length) return toTable(cached.results);
  } catch (e) {
    console.warn("rates lookup failed", e);
  }
  return DEMO_RATES;
}

function toTable(rows: { date: string; code: string; kzt: number }[]): RateTable {
  return { source: "nbrk", date: rows[0].date, kzt: Object.fromEntries(rows.map((r) => [r.code, r.kzt])) };
}
