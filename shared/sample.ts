// Sample data used by the demo account seed, the "Fill with example" button and tests.
import { addDays, todayKz } from "./dates";
import type { Company, DealInput } from "./types";

export const DEMO_COMPANY: Company = {
  bin: "950312400129",
  legal_form: "ИП",
  name_ru: "ИП «Aigerim Store»",
  name_en: "IE Aigerim Store",
  city: "Алматы",
  address: "пр. Абая, 150, офис 12",
  signatory: "Сейткали Айгерим",
  signatory_basis: "талона о регистрации ИП",
  bank_name: "АО «Kaspi Bank»",
  bik: "CASPKZKA",
  iban: "KZ86722S000012345678",
};

/** Demo company registry used for "BIN → autofill" during onboarding. */
export const DEMO_REGISTRY: Record<string, Pick<Company, "bin" | "legal_form" | "name_ru" | "name_en" | "city" | "address" | "signatory" | "signatory_basis">> = {
  "950312400129": {
    bin: "950312400129", legal_form: "ИП", name_ru: "ИП «Aigerim Store»", name_en: "IE Aigerim Store",
    city: "Алматы", address: "пр. Абая, 150, офис 12", signatory: "Сейткали Айгерим", signatory_basis: "талона о регистрации ИП",
  },
  "140540005313": {
    bin: "140540005313", legal_form: "ТОО", name_ru: "ТОО «Строй Импорт Астана»", name_en: "Stroy Import Astana LLP",
    city: "Астана", address: "ул. Кенесары, 40", signatory: "директора Ержана Нурланова", signatory_basis: "Устава",
  },
  "181140007622": {
    bin: "181140007622", legal_form: "ТОО", name_ru: "ТОО «Dinara Accounting»", name_en: "Dinara Accounting LLP",
    city: "Караганда", address: "пр. Бухар-Жырау, 66", signatory: "директора Динары Ахметовой", signatory_basis: "Устава",
  },
};

export function sampleDeal(today = todayKz()): DealInput {
  return {
    contract_type: "supply",
    lang_pair: "ru-cn",
    counterparty: {
      name: "Guangzhou Textile Co., Ltd.",
      name_local: "广州纺织有限公司",
      country: "CN",
      address: "No. 88 Zhongshan Road, Yuexiu District, Guangzhou, Guangdong, China",
      bank_details: "Bank of China, Guangzhou Branch · SWIFT BKCHCNBJ400 · A/C 7700 1234 5678",
    },
    goods: [
      { name: "Детская куртка демисезонная", name_alt: "儿童春秋外套", hs_code: "6202 40", qty: 500, unit: "pcs", price: 24, net_kg: 300, gross_kg: 330, packages: 25 },
      { name: "Детский костюм трикотажный", name_alt: "儿童针织套装", hs_code: "6111 20", qty: 320, unit: "set", price: 20, net_kg: 120, gross_kg: 135, packages: 12 },
    ],
    currency: "USD",
    batch_note: "Коллекция осень / зима",
    terms: {
      incoterm: "FCA",
      incoterm_place: "Guangzhou",
      payment: "prepay100",
      postpay_days: 30,
      sign_date: today,
      delivery_date: addDays(today, 45),
      performance_date: addDays(today, 60),
      penalty_rate: 0.1,
      penalty_cap: 10,
      arbitration: "aifc",
    },
  };
}

export function emptyDeal(today = todayKz()): DealInput {
  return {
    contract_type: "supply",
    lang_pair: "ru-cn",
    counterparty: { name: "", name_local: "", country: "CN", address: "", bank_details: "" },
    goods: [{ name: "", name_alt: "", hs_code: "", qty: 0, unit: "pcs", price: 0, net_kg: 0, gross_kg: 0, packages: 0 }],
    currency: "USD",
    batch_note: "",
    terms: {
      incoterm: "FCA",
      incoterm_place: "",
      payment: "prepay100",
      postpay_days: 30,
      sign_date: today,
      delivery_date: addDays(today, 45),
      performance_date: addDays(today, 60),
      penalty_rate: 0.1,
      penalty_cap: 10,
      arbitration: "aifc",
    },
  };
}
