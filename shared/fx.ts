// Exchange rates for the UCN threshold. The rule requires the official NBRK rate on the
// contract signing date; the Worker fetches it from nationalbank.kz and caches it in D1.
// DEMO_RATES are only a fallback when the NBRK feed is unreachable (and for unit tests).
import type { Currency } from "./types";

export interface RateTable {
  /** KZT per 1 unit of currency (KZT itself = 1). */
  kzt: Partial<Record<string, number>>;
  date: string; // YYYY-MM-DD the rates are valid for
  source: "nbrk" | "demo";
}

export const DEMO_RATES: RateTable = {
  source: "demo",
  date: "2026-10-01",
  kzt: { KZT: 1, USD: 510, EUR: 551, CNY: 71.4, TRY: 14.8, RUB: 6.4 },
};

/** Converts an amount to USD using KZT cross rates. Falls back to the demo rate per currency. */
export function toUsd(amount: number, currency: Currency, rates: RateTable = DEMO_RATES): number {
  const kztPerUnit = rates.kzt[currency] ?? DEMO_RATES.kzt[currency] ?? 1;
  const kztPerUsd = rates.kzt.USD ?? DEMO_RATES.kzt.USD!;
  return Math.round(((amount * kztPerUnit) / kztPerUsd) * 100) / 100;
}

/**
 * Parses the NBRK RSS feed (https://nationalbank.kz/rss/get_rates.cfm?fdate=DD.MM.YYYY):
 * <rates><item><title>USD</title><description>481.5</description><quant>1</quant></item>…</rates>
 */
export function parseNbrkRates(xml: string): Record<string, number> {
  const out: Record<string, number> = { KZT: 1 };
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const item of items) {
    const tag = (n: string) => item.match(new RegExp(`<${n}>\\s*([^<]*?)\\s*</${n}>`))?.[1] ?? "";
    const code = tag("title").toUpperCase();
    const rate = parseFloat(tag("description").replace(",", "."));
    const quant = parseFloat(tag("quant")) || 1;
    if (/^[A-Z]{3}$/.test(code) && rate > 0) out[code] = Math.round((rate / quant) * 1e6) / 1e6;
  }
  return out;
}
