// Kelisim compliance engine — deterministic rules, no AI.
//
//  1. Sanctions screening of the counterparty (demo OFAC / EU / UK lists).
//  2. Is a contract registration number (UCN, «учётный номер контракта») required?
//     Rule: export/import contracts above 50,000 USD equivalent must be registered
//     with the servicing bank before either party starts performing
//     (NBRK currency-operations rules, p.10 & p.12). No amount → registration required.
//  3. Repatriation / payment deadlines derived from the deal terms.
//
// The engine is shared code: the Worker runs it for the authoritative result,
// unit tests run it directly (tests/compliance.test.ts).

import { addDays, diffDays, formatDate, isIsoDate, todayKz } from "./dates";
import { DEMO_RATES, toUsd, type RateTable } from "./fx";
import {
  EMBARGOED_COUNTRIES,
  ELEVATED_COUNTRIES,
  SANCTIONS_DEMO,
  SANCTIONS_LISTS_VERSION,
  type SanctionsEntry,
} from "./sanctions-data";
import type {
  CheckItem,
  ComplianceResult,
  CounterpartyInput,
  Currency,
  DealInput,
  DeadlineKind,
  RiskLevel,
  SanctionsMatch,
  ScreeningResult,
} from "./types";

export const RULES_VERSION = "2026.10-mvp";
export const UCN_THRESHOLD_USD = 50_000;
/** Above this many days between first payment and performance, banks ask for justification. */
export const LONG_REPATRIATION_DAYS = 180;
/** Days after signing within which a prepayment is scheduled by default. */
export const PREPAYMENT_DAYS_AFTER_SIGNING = 5;

export { toUsd } from "./fx";

export function dealTotal(deal: Pick<DealInput, "goods">): number {
  const total = deal.goods.reduce((s, g) => s + (Number(g.qty) || 0) * (Number(g.price) || 0), 0);
  return Math.round(total * 100) / 100;
}

// ───────────────────────── 1. Sanctions screening ─────────────────────────

const LEGAL_SUFFIXES = new Set([
  "co", "company", "ltd", "limited", "llc", "inc", "corp", "corporation", "plc", "gmbh",
  "as", "a s", "sti", "ltd sti", "jsc", "llp", "group", "the", "and", "of",
  "有限公司", "公司",
]);

/** Lower-case, strip punctuation and legal-form words. */
export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[.,'"()«»\-_/&]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !LEGAL_SUFFIXES.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Similarity 0..1 combining token overlap and edit distance. */
export function nameSimilarity(a: string, b: string): number {
  const ta = normalizeName(a);
  const tb = normalizeName(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  const jaccard = inter / new Set([...sa, ...sb]).size;
  const ja = ta.join(" ");
  const jb = tb.join(" ");
  const edit = 1 - levenshtein(ja, jb) / Math.max(ja.length, jb.length);
  return Math.round(Math.max(jaccard, edit) * 100) / 100;
}

export const MATCH_THRESHOLD = 0.85; // red: confirmed match
export const POSSIBLE_MATCH_THRESHOLD = 0.65; // yellow: needs manual review

export function screenCounterparty(
  cp: Pick<CounterpartyInput, "name" | "name_local" | "country">,
  list: SanctionsEntry[] = SANCTIONS_DEMO,
  now: Date = new Date(),
  listsVersion: string = SANCTIONS_LISTS_VERSION,
): ScreeningResult {
  const names = [cp.name, cp.name_local].filter(Boolean);
  const matches: SanctionsMatch[] = [];
  for (const entry of list) {
    let best = 0;
    for (const n of names) {
      for (const candidate of [entry.name, ...entry.aliases]) {
        best = Math.max(best, nameSimilarity(n, candidate));
      }
    }
    if (best >= POSSIBLE_MATCH_THRESHOLD) {
      matches.push({ list: entry.list, entry: entry.name, program: entry.program, score: best });
    }
  }
  matches.sort((a, b) => b.score - a.score);

  const country = (cp.country || "").toUpperCase();
  const country_risk: RiskLevel = EMBARGOED_COUNTRIES.includes(country)
    ? "red"
    : ELEVATED_COUNTRIES.includes(country)
      ? "yellow"
      : "green";

  let status: RiskLevel = "green";
  if (matches.some((m) => m.score >= MATCH_THRESHOLD) || country_risk === "red") status = "red";
  else if (matches.length || country_risk === "yellow") status = "yellow";

  return { status, matches, country_risk, checked_at: now.toISOString(), lists_version: listsVersion };
}

function sanctionsItem(s: ScreeningResult): CheckItem {
  const top = s.matches[0];
  if (s.status === "red" && top && top.score >= MATCH_THRESHOLD) {
    return {
      id: "sanctions",
      status: "red",
      title: { ru: "Найдены признаки риска", en: "Risk indicators found" },
      text: {
        ru: `Контрагент найден в санкционном списке ${top.list} (${top.entry}, совпадение ${Math.round(top.score * 100)}%). Платёж, скорее всего, будет заблокирован.`,
        en: `The counterparty was found on the ${top.list} sanctions list (${top.entry}, ${Math.round(top.score * 100)}% match). The payment will most likely be blocked.`,
      },
      action: {
        ru: "Проверьте данные или выберите другого поставщика.",
        en: "Check the data or choose another supplier.",
      },
      meta: { matches: s.matches, lists_version: s.lists_version },
    };
  }
  if (s.status === "red") {
    return {
      id: "sanctions",
      status: "red",
      title: { ru: "Страна под эмбарго", en: "Embargoed country" },
      text: {
        ru: "Страна контрагента находится под всеобъемлющими санкциями. Банки не проводят такие платежи.",
        en: "The counterparty's country is under comprehensive sanctions. Banks do not process such payments.",
      },
      action: { ru: "Выберите поставщика из другой страны.", en: "Choose a supplier from another country." },
      meta: { country_risk: s.country_risk },
    };
  }
  if (s.status === "yellow") {
    return {
      id: "sanctions",
      status: "yellow",
      title: { ru: "Нужна ручная проверка контрагента", en: "Counterparty needs a manual review" },
      text: top
        ? {
            ru: `Название похоже на запись в списке ${top.list} (${top.entry}, ${Math.round(top.score * 100)}%). Скорее всего, это другая компания, но банк может запросить пояснения.`,
            en: `The name resembles an entry on the ${top.list} list (${top.entry}, ${Math.round(top.score * 100)}%). It is probably a different company, but the bank may ask for clarification.`,
          }
        : {
            ru: "Банки дополнительно проверяют платежи в эту страну. Подготовьте подтверждение происхождения товара.",
            en: "Banks apply extra checks to payments to this country. Prepare proof of the goods' origin.",
          },
      action: {
        ru: "Запросите у поставщика регистрационные документы и сверьте адрес.",
        en: "Ask the supplier for registration documents and verify the address.",
      },
      meta: { matches: s.matches },
    };
  }
  return {
    id: "sanctions",
    status: "green",
    title: { ru: "Контрагент проверен", en: "Counterparty screened" },
    text: {
      ru: "Совпадений в санкционных списках OFAC, EU и UK не найдено.",
      en: "No matches on the OFAC, EU or UK sanctions lists.",
    },
  };
}

// ───────────────────────── 2. UCN requirement ─────────────────────────

export function isUcnRequired(amount: number, currency: Currency, rates: RateTable = DEMO_RATES): boolean {
  if (!(amount > 0)) return true; // contract without an amount must be registered
  return toUsd(amount, currency, rates) > UCN_THRESHOLD_USD;
}

// ───────────────────────── 3. Deadlines ─────────────────────────

/** Date of the (first) payment to the supplier. */
export function firstPaymentDate(deal: DealInput): string {
  const t = deal.terms;
  if (t.payment === "postpay") return addDays(t.delivery_date, t.postpay_days || 0);
  return addDays(t.sign_date, PREPAYMENT_DAYS_AFTER_SIGNING);
}

export function buildDeadlines(deal: DealInput, ucnRequired: boolean): { kind: DeadlineKind; due_date: string }[] {
  const t = deal.terms;
  const pay = firstPaymentDate(deal);
  const list: { kind: DeadlineKind; due_date: string }[] = [];
  // UCN must be obtained before anyone starts performing: before the first payment
  // (prepayment) or before shipment (post-payment), whichever comes first.
  if (ucnRequired) list.push({ kind: "ucn", due_date: pay < t.delivery_date ? pay : t.delivery_date });
  list.push({ kind: "payment", due_date: pay });
  list.push({ kind: "delivery", due_date: t.delivery_date });
  // Repatriation applies when money leaves Kazakhstan before the goods arrive:
  // the goods must be imported (or the prepayment returned) by the performance date.
  if (t.payment !== "postpay") list.push({ kind: "repatriation", due_date: t.performance_date });
  return list.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

// ───────────────────────── Validation ─────────────────────────

export type FieldErrors = Record<string, L10nMsg>;
type L10nMsg = { ru: string; en: string };

export function validateDeal(deal: DealInput, step?: 1 | 2 | 3 | 4): FieldErrors {
  const e: FieldErrors = {};
  const want = (s: number) => !step || step === s;
  if (want(1)) {
    if (!["supply", "agency", "services"].includes(deal.contract_type))
      e.contract_type = { ru: "Выберите тип договора.", en: "Choose a contract type." };
    if (!["ru-cn", "ru-en"].includes(deal.lang_pair))
      e.lang_pair = { ru: "Выберите языки документов.", en: "Choose the document languages." };
  }
  if (want(2)) {
    const cp = deal.counterparty;
    if (!cp.name || cp.name.trim().length < 2)
      e["counterparty.name"] = { ru: "Укажите название компании.", en: "Enter the company name." };
    if (!cp.country) e["counterparty.country"] = { ru: "Выберите страну.", en: "Choose a country." };
    if (!cp.address || cp.address.trim().length < 5)
      e["counterparty.address"] = { ru: "Укажите адрес поставщика.", en: "Enter the supplier's address." };
  }
  if (want(3)) {
    if (!deal.goods.length) e.goods = { ru: "Добавьте хотя бы один товар.", en: "Add at least one item." };
    deal.goods.forEach((g, i) => {
      if (!g.name || !g.name.trim()) e[`goods.${i}.name`] = { ru: "Опишите товар.", en: "Describe the goods." };
      if (!(Number(g.qty) > 0)) e[`goods.${i}.qty`] = { ru: "Количество больше нуля.", en: "Quantity must be above zero." };
      if (!(Number(g.price) > 0)) e[`goods.${i}.price`] = { ru: "Цена больше нуля.", en: "Price must be above zero." };
    });
    if (!(dealTotal(deal) > 0)) e.total = { ru: "Введите сумму больше нуля.", en: "Enter an amount above zero." };
  }
  if (want(4)) {
    const t = deal.terms;
    if (!t.incoterm_place || !t.incoterm_place.trim())
      e["terms.incoterm_place"] = { ru: "Укажите место по Инкотермс.", en: "Enter the Incoterms place." };
    if (!isIsoDate(t.sign_date)) e["terms.sign_date"] = { ru: "Укажите дату подписания.", en: "Enter the signing date." };
    if (!isIsoDate(t.delivery_date)) e["terms.delivery_date"] = { ru: "Укажите дату поставки.", en: "Enter the delivery date." };
    if (!isIsoDate(t.performance_date))
      e["terms.performance_date"] = { ru: "Укажите дату исполнения.", en: "Enter the performance date." };
    if (isIsoDate(t.sign_date) && isIsoDate(t.delivery_date) && t.delivery_date < t.sign_date)
      e["terms.delivery_date"] = { ru: "Поставка не может быть раньше подписания.", en: "Delivery cannot be before signing." };
    if (isIsoDate(t.delivery_date) && isIsoDate(t.performance_date) && t.performance_date < t.delivery_date)
      e["terms.performance_date"] = {
        ru: "Исполнение не может быть раньше поставки.",
        en: "Performance cannot be before delivery.",
      };
    if (t.payment === "postpay" && !(t.postpay_days >= 0 && t.postpay_days <= 365))
      e["terms.postpay_days"] = { ru: "От 0 до 365 дней.", en: "From 0 to 365 days." };
  }
  return e;
}

// ───────────────────────── Full check ─────────────────────────

export interface CheckOptions {
  /** Sanctions entries to screen against (real-list candidates + optional demo entries). */
  sanctions?: SanctionsEntry[];
  listsVersion?: string;
  /** Official NBRK rates on the signing date. */
  rates?: RateTable;
}

export function checkDeal(deal: DealInput, now: Date = new Date(), opts: CheckOptions = {}): ComplianceResult {
  const rates = opts.rates ?? DEMO_RATES;
  const total = dealTotal(deal);
  const amount_usd = toUsd(total, deal.currency, rates);
  const screening = screenCounterparty(deal.counterparty, opts.sanctions ?? SANCTIONS_DEMO, now, opts.listsVersion);
  const ucn_required = isUcnRequired(total, deal.currency, rates);
  const rateNote = rates.source === "nbrk"
    ? { ru: ` (курс НБРК на ${formatDate(rates.date)})`, en: ` (NBRK rate of ${formatDate(rates.date)})` }
    : { ru: " (демо-курс: курс НБРК недоступен)", en: " (demo rate: NBRK feed unavailable)" };
  const deadlines = buildDeadlines(deal, ucn_required);

  const items: CheckItem[] = [sanctionsItem(screening)];

  items.push(
    ucn_required
      ? {
          id: "ucn",
          status: "yellow",
          title: { ru: "Нужен учётный номер контракта", en: "A contract registration number (UCN) is required" },
          text: {
            ru: `Сумма договора ≈ ${fmtUsd(amount_usd)}${rateNote.ru} — больше порога 50 000 USD. Оформите УНК в банке до первого платежа, иначе платёж могут задержать.`,
            en: `The contract amount ≈ ${fmtUsd(amount_usd)}${rateNote.en} exceeds the 50,000 USD threshold. Obtain the UCN at your bank before the first payment, otherwise the payment may be delayed.`,
          },
          action: {
            ru: "Подайте договор в обслуживающий банк и внесите номер в карточку сделки.",
            en: "Submit the contract to your servicing bank and enter the number on the deal page.",
          },
          meta: { amount_usd, threshold: UCN_THRESHOLD_USD, rate_source: rates.source, rate_date: rates.date },
        }
      : {
          id: "ucn",
          status: "green",
          title: { ru: "УНК не требуется", en: "No UCN required" },
          text: {
            ru: `Сумма договора ≈ ${fmtUsd(amount_usd)}${rateNote.ru} — в пределах порога 50 000 USD.`,
            en: `The contract amount ≈ ${fmtUsd(amount_usd)}${rateNote.en} is within the 50,000 USD threshold.`,
          },
          meta: { amount_usd, threshold: UCN_THRESHOLD_USD, rate_source: rates.source, rate_date: rates.date },
        },
  );

  const rep = deadlines.find((d) => d.kind === "repatriation");
  const pay = firstPaymentDate(deal);
  if (rep) {
    const span = diffDays(pay, rep.due_date);
    const today = todayKz(now);
    const tooLong = span > LONG_REPATRIATION_DAYS;
    const inPast = rep.due_date < today;
    items.push({
      id: "repatriation",
      status: tooLong || inPast ? "yellow" : "green",
      title: tooLong
        ? { ru: "Длинный срок репатриации", en: "Long repatriation term" }
        : inPast
          ? { ru: "Срок репатриации уже прошёл", en: "Repatriation date is already in the past" }
          : { ru: "Сроки исполнения в норме", en: "Performance terms look fine" },
      text: tooLong
        ? {
            ru: `Между предоплатой и исполнением ${span} дней. Банк может запросить обоснование срока больше ${LONG_REPATRIATION_DAYS} дней.`,
            en: `There are ${span} days between prepayment and performance. The bank may ask to justify a term longer than ${LONG_REPATRIATION_DAYS} days.`,
          }
        : inPast
          ? {
              ru: "Дата исполнения раньше сегодняшней. Проверьте даты в анкете.",
              en: "The performance date is before today. Check the dates in the form.",
            }
          : {
              ru: `Товар должен быть ввезён или предоплата возвращена до ${rep.due_date.split("-").reverse().join(".")} (${span} дн. после оплаты). Kelisim напомнит заранее.`,
              en: `Goods must be imported or the prepayment returned by ${rep.due_date.split("-").reverse().join(".")} (${span} days after payment). Kelisim will remind you in advance.`,
            },
      action:
        tooLong || inPast
          ? { ru: "Сократите срок или подготовьте обоснование.", en: "Shorten the term or prepare a justification." }
          : undefined,
      meta: { repatriation_date: rep.due_date, days: span },
    });
  } else {
    items.push({
      id: "repatriation",
      status: "green",
      title: { ru: "Репатриация не требуется", en: "No repatriation control" },
      text: {
        ru: "Оплата после поставки: деньги уходят после получения товара. Kelisim отследит срок оплаты.",
        en: "Payment after delivery: money leaves after the goods arrive. Kelisim will track the payment date.",
      },
    });
  }

  const overall: RiskLevel = items.some((i) => i.status === "red")
    ? "red"
    : items.some((i) => i.status === "yellow")
      ? "yellow"
      : "green";

  return {
    overall, items, amount_usd, ucn_required, deadlines,
    checked_at: now.toISOString(),
    rules_version: RULES_VERSION,
    lists_version: screening.lists_version,
    rate: { source: rates.source, date: rates.date, usd_kzt: rates.kzt.USD ?? null },
  };
}

function fmtUsd(v: number): string {
  return `${Math.round(v).toLocaleString("en-US").replace(/,/g, " ")} USD`;
}

/** Once the bank has assigned the UCN, the UCN item is resolved and the traffic light is recomputed. */
export function applyUcn(r: ComplianceResult, ucn: string): ComplianceResult {
  if (!ucn || !r.ucn_required) return r;
  const items = r.items.map((i) =>
    i.id === "ucn"
      ? {
          ...i,
          status: "green" as RiskLevel,
          title: { ru: "Учётный номер контракта получен", en: "Contract registration number obtained" },
          text: { ru: `УНК ${ucn} внесён в сделку и в договор.`, en: `UCN ${ucn} is recorded in the deal and the contract.` },
          action: undefined,
        }
      : i,
  );
  const overall: RiskLevel = items.some((i) => i.status === "red") ? "red" : items.some((i) => i.status === "yellow") ? "yellow" : "green";
  return { ...r, items, overall };
}
