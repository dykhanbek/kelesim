// Domain types shared by the Worker (API) and the React frontend.

export type Lang = "ru" | "en";
export type Plan = "free" | "basic" | "pro";
export type RiskLevel = "green" | "yellow" | "red";
export type ContractType = "supply" | "agency" | "services";
export type LangPair = "ru-cn" | "ru-en";
export type Currency = "USD" | "CNY" | "EUR" | "TRY" | "KZT" | "RUB";
export type PaymentTerm = "prepay100" | "prepay30" | "postpay";
export type DeadlineKind = "ucn" | "payment" | "delivery" | "repatriation";
export type DealStatus = "draft" | "checked" | "active" | "closed";

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const CURRENCIES: Currency[] = ["USD", "CNY", "EUR", "TRY", "KZT", "RUB"];

/** Bilingual string (interface languages). */
export interface L10n {
  ru: string;
  en: string;
}

export interface Company {
  bin: string;
  legal_form: string;
  name_ru: string;
  name_en: string;
  city: string;
  address: string;
  signatory: string;
  signatory_basis: string;
  bank_name: string;
  bik: string;
  iban: string;
}

export interface CounterpartyInput {
  id?: string;
  name: string;
  name_local: string;
  country: string; // ISO alpha-2
  address: string;
  bank_details: string;
}

export interface GoodsItem {
  name: string; // Russian description
  name_alt: string; // English / Chinese description for the second language
  hs_code: string;
  qty: number;
  unit: string; // "pcs" | "kg" | "set" ...
  price: number; // unit price
  net_kg: number; // per line, for packing list
  gross_kg: number;
  packages: number;
}

export interface DealTerms {
  incoterm: Incoterm;
  incoterm_place: string;
  payment: PaymentTerm;
  postpay_days: number; // used when payment === "postpay"
  sign_date: string; // YYYY-MM-DD
  delivery_date: string; // goods shipped/delivered by
  performance_date: string; // all obligations of the seller fulfilled by
  penalty_rate: number; // % per day of delay
  penalty_cap: number; // max % of contract value
  arbitration: "aifc" | "cietac" | "kz_court";
}

export interface DealInput {
  contract_type: ContractType;
  lang_pair: LangPair;
  counterparty: CounterpartyInput;
  goods: GoodsItem[];
  currency: Currency;
  batch_note: string;
  terms: DealTerms;
}

export interface SanctionsMatch {
  list: string; // "EU" | "OFAC SDN" | "UK OFSI"
  entry: string;
  program: string;
  score: number; // 0..1
}

export interface CheckItem {
  id: "sanctions" | "ucn" | "repatriation";
  status: RiskLevel;
  title: L10n;
  text: L10n;
  action?: L10n;
  meta?: Record<string, unknown>;
}

export interface ComplianceResult {
  overall: RiskLevel;
  items: CheckItem[];
  amount_usd: number;
  ucn_required: boolean;
  deadlines: { kind: DeadlineKind; due_date: string }[];
  checked_at: string; // ISO
  rules_version: string;
  lists_version?: string;
  rate?: { source: "nbrk" | "demo"; date: string; usd_kzt: number | null };
}

export interface ScreeningResult {
  status: RiskLevel;
  matches: SanctionsMatch[];
  country_risk: RiskLevel;
  checked_at: string;
  lists_version: string;
}
