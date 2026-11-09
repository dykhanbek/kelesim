// Coerces untrusted JSON into a well-typed DealInput (server side), keeping drafts lenient.
import { CURRENCIES, INCOTERMS, type DealInput, type GoodsItem, type RelatedParty } from "./types";
import { emptyDeal } from "./sample";

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const n = (v: unknown) => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 10000) / 10000 : 0;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const iso2 = (v: unknown) => (typeof v === "string" && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : "");

/** Owners / beneficiary / director (KYB), max 10. */
export function sanitizeRelated(raw: unknown): RelatedParty[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((p: Record<string, unknown>) => {
    const share = n(p?.share);
    return {
      role: oneOf(p?.role, ["parent", "owner", "beneficiary", "director"] as const, "owner"),
      kind: oneOf(p?.kind, ["company", "person"] as const, "company"),
      name: s(p?.name, 200),
      country: iso2(p?.country),
      ...(share > 0 ? { share: Math.min(100, share) } : {}),
    };
  });
}

export function sanitizeDeal(raw: unknown): DealInput {
  const def = emptyDeal();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const cp = (r.counterparty ?? {}) as Record<string, unknown>;
  const t = (r.terms ?? {}) as Record<string, unknown>;
  const rt = (r.route ?? {}) as Record<string, any>;
  const goods: GoodsItem[] = (Array.isArray(r.goods) ? r.goods : def.goods).slice(0, 50).map((g: Record<string, unknown>) => ({
    name: s(g.name, 300),
    name_alt: s(g.name_alt, 300),
    hs_code: s(g.hs_code, 20),
    qty: n(g.qty),
    unit: s(g.unit, 10) || "pcs",
    price: n(g.price),
    net_kg: n(g.net_kg),
    gross_kg: n(g.gross_kg),
    packages: Math.round(n(g.packages)),
  }));
  return {
    contract_type: oneOf(r.contract_type, ["supply", "agency", "services"] as const, "supply"),
    lang_pair: oneOf(r.lang_pair, ["ru-cn", "ru-en"] as const, "ru-cn"),
    counterparty: {
      id: typeof cp.id === "string" && cp.id ? cp.id : undefined,
      name: s(cp.name, 200),
      name_local: s(cp.name_local, 200),
      country: s(cp.country, 2).toUpperCase() || "CN",
      address: s(cp.address, 400),
      bank_details: s(cp.bank_details, 400),
      related: sanitizeRelated(cp.related),
    },
    goods: goods.length ? goods : def.goods,
    currency: oneOf(r.currency, CURRENCIES, "USD"),
    batch_note: s(r.batch_note, 300),
    terms: {
      incoterm: oneOf(t.incoterm, INCOTERMS, "FCA"),
      incoterm_place: s(t.incoterm_place, 100),
      payment: oneOf(t.payment, ["prepay100", "prepay30", "postpay"] as const, "prepay100"),
      postpay_days: Math.min(365, Math.round(n(t.postpay_days))),
      sign_date: s(t.sign_date, 10) || def.terms.sign_date,
      delivery_date: s(t.delivery_date, 10) || def.terms.delivery_date,
      performance_date: s(t.performance_date, 10) || def.terms.performance_date,
      penalty_rate: Math.min(5, n(t.penalty_rate) || def.terms.penalty_rate),
      penalty_cap: Math.min(100, n(t.penalty_cap) || def.terms.penalty_cap),
      arbitration: oneOf(t.arbitration, ["aifc", "cietac", "kz_court"] as const, "aifc"),
      advance_guarantee: t.advance_guarantee === true,
    },
    route: {
      origin: iso2(rt.origin) || iso2(cp.country) || "CN",
      transit: Array.isArray(rt.transit) ? [...new Set(rt.transit.map(iso2).filter(Boolean))].slice(0, 6) : [],
      end_user_country: iso2(rt.end_user_country) || "KZ",
      end_user_name: s(rt.end_user_name, 200),
      reexport: rt.reexport === true,
    },
    for_children: r.for_children === true,
  };
}
