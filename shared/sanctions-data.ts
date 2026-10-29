// DEMO sanctions dataset.
//
// IMPORTANT: every entity below is FICTITIOUS. The real lists (OFAC SDN, EU, UK)
// are imported daily from OpenSanctions into D1 (scripts/import-sanctions.ts).
// These demo entries are screened *in addition* so the red result can be shown
// in demos without naming a real company; set DEMO_SANCTIONS="off" to disable.

export interface SanctionsEntry {
  name: string;
  aliases: string[];
  country: string;
  list: string; // "OFAC SDN" | "EU" | "UK"
  program: string;
}

export const SANCTIONS_LISTS_VERSION = "demo-2026-10-01";

export const SANCTIONS_DEMO: SanctionsEntry[] = [
  {
    name: "Shenzhen Redline Electronics Co., Ltd.",
    aliases: ["Redline Electronics", "深圳红线电子有限公司"],
    country: "CN",
    list: "EU",
    program: "Regulation 833/2014 · Annex IV (demo)",
  },
  {
    name: "Pacific Dragon Logistics Limited",
    aliases: ["Pacific Dragon Logistics", "太平洋龙物流"],
    country: "HK",
    list: "OFAC SDN",
    program: "RUSSIA-EO14024 (demo)",
  },
  {
    name: "Bosphorus Dual Trade A.S.",
    aliases: ["Bosphorus Dual Trade", "Bosfor Dual Ticaret"],
    country: "TR",
    list: "UK OFSI",
    program: "Russia regime (demo)",
  },
  {
    name: "Ningbo Blackwater Machinery Co.",
    aliases: ["Blackwater Machinery Ningbo"],
    country: "CN",
    list: "OFAC SDN",
    program: "NPWMD (demo)",
  },
  {
    name: "Golden Crane Import Export Ltd",
    aliases: ["Golden Crane Trading"],
    country: "AE",
    list: "EU",
    program: "Circumvention (demo)",
  },
];

/** Jurisdictions under comprehensive embargoes — any deal is high risk. */
export const EMBARGOED_COUNTRIES = ["IR", "KP"];
/** Jurisdictions where banks typically ask for extra documents. */
export const ELEVATED_COUNTRIES = ["RU", "BY", "AF", "MM", "SY"];
