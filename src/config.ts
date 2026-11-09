// Product-level settings for the frontend.

/** Support address shown in the "Contact us" modal. Replace before a public launch. */
export const SUPPORT_EMAIL = "support@kelisim.kz";

/**
 * Operator (the legal entity that runs Kelisim) — used in the legal documents.
 * ⚠️ Fill in real details before a public launch: the documents are not valid with placeholders.
 */
export const OPERATOR = {
  name: "[Наименование ИП / ТОО]",
  bin: "[БИН / ИИН]",
  address: "[Юридический адрес, город, Республика Казахстан]",
  bank: "[Банк, БИК, IBAN — для оплаты по счёту]",
  email: SUPPORT_EMAIL,
  phone: "[Телефон]",
  site: "https://kelisim.erseit-aid.workers.dev",
};

/** True while OPERATOR still contains placeholders — the legal pages show a warning. */
export const OPERATOR_INCOMPLETE = Object.values(OPERATOR).some((v) => v.startsWith("["));
