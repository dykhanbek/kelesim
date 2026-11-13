// Landed cost of an import shipment into Kazakhstan: what the goods cost on the importer's
// warehouse after freight, customs duty, import VAT and the fees around them.
// The duty rate depends on the HS code and is entered by the user (EAEU Common Customs Tariff);
// VAT and the declaration fee are the 2026 values and can be changed in one place.

/** Import VAT, Kazakhstan Tax Code in force from 1 January 2026. */
export const VAT_RATE = 16;
/** Customs fee for a goods declaration, tenge (reference value — the broker confirms the exact amount). */
export const DECLARATION_FEE_KZT = 20_000;

export interface LandedCostInput {
  /** invoice value of the goods, in `currency` */
  goods: number;
  /** freight and insurance up to the EAEU border, in `currency` (included in the customs value) */
  freight: number;
  /** tenge per one unit of `currency` */
  rate: number;
  /** import duty, % of the customs value */
  duty_pct: number;
  /** excise, tenge (0 for most goods) */
  excise?: number;
  vat_pct?: number;
  declaration_fee?: number;
  /** tenge: customs broker, certification and marking, delivery inside Kazakhstan */
  broker?: number;
  certification?: number;
  local_delivery?: number;
  /** number of units, to show the cost per unit */
  units?: number;
}

export interface LandedCost {
  goods_kzt: number;
  freight_kzt: number;
  customs_value: number;
  duty: number;
  excise: number;
  vat: number;
  declaration_fee: number;
  /** paid to the state at clearance: duty + excise + VAT + fee */
  customs_payments: number;
  other: number;
  total: number;
  per_unit: number | null;
  /** how much more than the invoice the goods cost in the end, % */
  markup_pct: number;
}

const n = (v: number | undefined) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);
const round = (v: number) => Math.round(v);

export function landedCost(i: LandedCostInput): LandedCost {
  const rate = n(i.rate);
  const goods_kzt = n(i.goods) * rate;
  const freight_kzt = n(i.freight) * rate;
  const customs_value = goods_kzt + freight_kzt;
  const duty = (customs_value * n(i.duty_pct)) / 100;
  const excise = n(i.excise);
  // import VAT is charged on the customs value plus duty and excise
  const vat = ((customs_value + duty + excise) * (i.vat_pct ?? VAT_RATE)) / 100;
  const declaration_fee = i.declaration_fee === undefined ? DECLARATION_FEE_KZT : n(i.declaration_fee);
  const customs_payments = duty + excise + vat + declaration_fee;
  const other = n(i.broker) + n(i.certification) + n(i.local_delivery);
  const total = customs_value + customs_payments + other;
  const units = n(i.units);
  return {
    goods_kzt: round(goods_kzt), freight_kzt: round(freight_kzt), customs_value: round(customs_value), duty: round(duty), excise: round(excise), vat: round(vat),
    declaration_fee: round(declaration_fee), customs_payments: round(customs_payments), other: round(other), total: round(total),
    per_unit: units ? round(total / units) : null,
    markup_pct: goods_kzt ? Math.round(((total - goods_kzt) / goods_kzt) * 1000) / 10 : 0,
  };
}
