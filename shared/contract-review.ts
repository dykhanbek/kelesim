// Review of a supplier's contract: a deterministic rule engine (no AI needed).
// It reads the text the importer received from the supplier (Russian / English / Chinese, often
// bilingual), finds the clauses that protect the buyer's money, and compares the two language
// versions and the deal entered in Kelisim. Every finding carries the fragment it is based on.
//
// This is a first-pass screening, not legal advice: it finds what is missing or unusual so that
// the importer knows what to ask the supplier (or a lawyer) before paying.
import { dealTotal } from "./compliance";
import type { DealInput, L10n, RiskLevel } from "./types";

export const REVIEW_VERSION = "2026.11";
export const REVIEW_MIN_CHARS = 400;
export const REVIEW_MAX_CHARS = 120_000;

export type Severity = "ok" | "info" | "warn" | "risk";

export interface Finding {
  id: string;
  sev: Severity;
  title: L10n;
  text: L10n;
  /** fragment of the contract the finding is based on */
  quote?: string;
  /** what to ask the supplier to change (English + Chinese, ready to send) */
  ask?: { en: string; zh: string };
}

export interface ReviewFacts {
  /** share of each language in the text, 0..1 */
  langs: { ru: number; en: number; zh: number };
  bilingual: boolean;
  amount?: number;
  currency?: string;
  incoterm?: string;
  prepay_pct?: number;
  law?: string;
  forum?: string;
  swift?: string;
  swift_country?: string;
  delivery_days?: number;
  claim_days?: number;
}

export interface ReviewResult {
  version: string;
  score: number; // 0..100
  risk: RiskLevel;
  findings: Finding[];
  facts: ReviewFacts;
  chars: number;
}

export interface ReviewContext {
  deal?: DealInput;
}

// ───────────────────────── text helpers ─────────────────────────

/** Normalizes whitespace and full-width characters so that patterns match PDF / DOCX extractions. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // full-width → ASCII
    .replace(/[  -​　]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REVIEW_MAX_CHARS);
}

interface Hit {
  index: number;
  match: string;
}
function find(text: string, patterns: RegExp[]): Hit | null {
  let best: Hit | null = null;
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, match: m[0] };
  }
  return best;
}
/** ≈160 characters around a position, on one line. */
function quoteAt(text: string, index: number, before = 40, after = 130): string {
  const s = Math.max(0, index - before);
  const e = Math.min(text.length, index + after);
  return (s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : "");
}
const windowAfter = (text: string, index: number, size = 260) => text.slice(index, index + size);

const CYR = /[Ѐ-ӿ]/g;
const LAT = /[A-Za-z]/g;
const CJK = /[一-鿿]/g;

export function languageShares(text: string): ReviewFacts["langs"] {
  const ru = (text.match(CYR) ?? []).length;
  const en = (text.match(LAT) ?? []).length;
  // one Chinese character carries roughly as much as 2.5 letters
  const zh = (text.match(CJK) ?? []).length * 2.5;
  const total = ru + en + zh || 1;
  const r = (v: number) => Math.round((v / total) * 100) / 100;
  return { ru: r(ru), en: r(en), zh: r(zh) };
}

/** "50 000,00" / "50,000.00" / "50000" → number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /,\d{3}(,|$)/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s.replace(/[.,]$/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/USD|US\$|долл|美元|美金/i, "USD"],
  [/CNY|RMB|юан|人民币/i, "CNY"],
  [/EUR|евро|欧元/i, "EUR"],
  [/KZT|тенге|坚戈/i, "KZT"],
  [/RUB|рубл|卢布/i, "RUB"],
  [/TRY|лир/i, "TRY"],
];
function currencyOf(s: string): string | undefined {
  for (const [re, code] of CURRENCY_WORDS) if (re.test(s)) return code;
  return undefined;
}

const COUNTRY_NAMES: [RegExp, string, L10n][] = [
  [/казахстан|kazakhstan|哈萨克斯坦/i, "KZ", { ru: "Казахстана", en: "Kazakhstan", kk: "Қазақстан" }],
  [/гонконг|hong\s?kong|香港/i, "HK", { ru: "Гонконга", en: "Hong Kong", kk: "Гонконг" }],
  [/кита[йя]|\bкнр\b|china|p\.?\s?r\.?\s?c\b|中华人民共和国|中国/i, "CN", { ru: "Китая", en: "China", kk: "Қытай" }],
  [/англи[ия]|england|english law|英国/i, "GB", { ru: "Англии", en: "England", kk: "Англия" }],
  [/росси|russia|俄罗斯/i, "RU", { ru: "России", en: "Russia", kk: "Ресей" }],
  [/турци|turkey|türkiye|土耳其/i, "TR", { ru: "Турции", en: "Türkiye", kk: "Түркия" }],
  [/сингапур|singapore|新加坡/i, "SG", { ru: "Сингапура", en: "Singapore", kk: "Сингапур" }],
];
function countryIn(s: string): { code: string; name: L10n } | null {
  let best: { code: string; name: L10n; at: number } | null = null;
  for (const [re, code, name] of COUNTRY_NAMES) {
    const m = re.exec(s);
    if (m && (best === null || m.index < best.at)) best = { code, name, at: m.index };
  }
  return best;
}

const DAYS = [
  /в течение\s+(\d{1,3})\s*(?:\([^)]{0,40}\)\s*)?(?:календарн\w+\s+|рабоч\w+\s+|банковск\w+\s+)?дн/i,
  /не позднее\s+(\d{1,3})\s*(?:\([^)]{0,40}\)\s*)?(?:календарн\w+\s+|рабоч\w+\s+|банковск\w+\s+)?дн/i,
  /within\s+(\d{1,3})\s*(?:\([^)]{0,40}\)\s*)?(?:calendar\s+|working\s+|business\s+|banking\s+)?days/i,
  /(\d{1,3})\s*(?:calendar\s+|working\s+|business\s+)?days\s+(?:after|from|of)/i,
  /(\d{1,3})\s*个?(?:工作|自然)?[天日]\s*(?:之)?内/,
  /后\s*(\d{1,3})\s*个?(?:工作|自然)?[天日]/,
];
function daysIn(s: string): number | undefined {
  for (const re of DAYS) {
    const m = re.exec(s);
    if (m) return Number(m[1]);
  }
  return undefined;
}

// ───────────────────────── two language versions ─────────────────────────

/**
 * Numbers that appear in one language version only. Each number is attributed to the script of the
 * nearest word, so side-by-side and paragraph-by-paragraph layouts both work.
 */
export function numberDiscrepancies(text: string, pair: ["ru" | "en" | "zh", "ru" | "en" | "zh"]): { onlyA: string[]; onlyB: string[]; counted: number } {
  const script: string[] = new Array(text.length).fill("");
  const mark = (re: RegExp, s: string, on: boolean) => {
    if (!on) return;
    for (const m of text.matchAll(re)) for (let i = m.index; i < m.index + m[0].length; i++) script[i] = s;
  };
  mark(/[Ѐ-ӿ]{3,}/g, "ru", pair.includes("ru"));
  mark(/[A-Za-z]{4,}/g, "en", pair.includes("en"));
  mark(/[一-鿿]+/g, "zh", pair.includes("zh"));

  // A line written mostly in one language decides for all its numbers (Latin codes such as
  // "FOB" or "USD" inside a Russian or Chinese line do not make it English).
  const lineLang: string[] = new Array(text.length).fill("");
  let pos = 0;
  for (const line of text.split("\n")) {
    const w = { ru: (line.match(CYR) ?? []).length, en: (line.match(LAT) ?? []).length, zh: (line.match(CJK) ?? []).length * 2.5 };
    const [x, y] = pair;
    const top = w[x] >= w[y] ? x : y;
    const other = top === x ? y : x;
    // Latin letters are present in every version, so English needs a clear majority
    const clear = top === "en" ? w.en > 0 && w[other] * 4 <= w.en : w[top] > 0 && (other === "en" ? w[top] * 2 >= w.en : w[other] * 4 <= w[top]);
    if (clear) for (let i = pos; i < pos + line.length; i++) lineLang[i] = top;
    pos += line.length + 1;
  }

  const joined = text.replace(/(\d) (?=\d{3}(?!\d))/g, "$1\u2009"); // "50 000" stays one token, same length
  const sets: Record<string, Map<string, number>> = { ru: new Map(), en: new Map(), zh: new Map() };
  let counted = 0;
  for (const m of joined.matchAll(/\d[\d\u2009]*(?:[.,]\d+)*\s?%?/g)) {
    const end = m.index + m[0].trimEnd().length;
    // account numbers, SWIFT codes, article numbers: digits glued to letters or hyphens
    if (/[A-Za-z\-\/#№]/.test(joined[m.index - 1] ?? "") || /[A-Za-z\-\/]/.test(joined[end] ?? "")) continue;
    // long digit groups in a row ("7700 1234 5678") are account numbers
    if (/\d{4} $/.test(joined.slice(Math.max(0, m.index - 5), m.index)) || /^ \d{4}/.test(joined.slice(end, end + 5))) continue;
    const raw = m[0].replace(/\u2009/g, "").trim();
    const pct = raw.endsWith("%");
    const body = raw.replace(/\s?%$/, "");
    // dates like 14.11.2026 and clause numbers like 3.2 are not amounts
    const parts = (body.match(/[.,]/g) ?? []).length >= 2 && !/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(body) ? body.split(/[.,]/) : [body];
    for (const part of parts) {
      if (!pct && /^\d{1,2}[.,]\d{1,2}$/.test(part)) continue; // clause number
      const n = parseAmount(part);
      if (n === null) continue;
      if (!pct && (n < 100 || (n >= 1990 && n <= 2100 && Number.isInteger(n)))) continue; // numbering, years
      const key = pct ? `${n}%` : String(Math.round(n * 100) / 100);
      let side = lineLang[m.index];
      // mixed line (two languages side by side): the nearest word decides
      for (let d = 1; d <= 60 && !side; d++) {
        side = script[m.index - d] || script[end - 1 + d] || "";
      }
      if (!side) continue;
      sets[side].set(key, (sets[side].get(key) ?? 0) + 1);
      counted++;
    }
  }
  const [a, b] = pair;
  const only = (x: Map<string, number>, y: Map<string, number>) => [...x.keys()].filter((k) => !y.has(k));
  return { onlyA: only(sets[a], sets[b]), onlyB: only(sets[b], sets[a]), counted };
}

// ───────────────────────── the review ─────────────────────────

const LANG_NAME: Record<string, L10n> = {
  ru: { ru: "русской", en: "Russian", kk: "орыс" },
  en: { ru: "английской", en: "English", kk: "ағылшын" },
  zh: { ru: "китайской", en: "Chinese", kk: "қытай" },
};

const WEIGHT: Record<Severity, number> = { ok: 0, info: 2, warn: 6, risk: 13 };

const normName = (s: string) =>
  s.toLowerCase().replace(/\b(co|ltd|llc|limited|inc|corp|company|тоо|ооо|ип)\b\.?/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function reviewContract(raw: string, ctx: ReviewContext = {}): ReviewResult {
  const text = normalizeText(raw);
  const findings: Finding[] = [];
  const facts: ReviewFacts = { langs: languageShares(text), bilingual: false };
  const present = (["ru", "en", "zh"] as const).filter((l) => facts.langs[l] >= 0.15);
  facts.bilingual = present.length >= 2;
  const add = (f: Finding) => findings.push(f);
  const deal = ctx.deal;

  // 0. Is it a contract at all
  if (!/договор|контракт|соглашени|contract|agreement|合同|协议/i.test(text)) {
    add({
      id: "not_contract", sev: "warn",
      title: { ru: "Похоже, это не договор", en: "This does not look like a contract", kk: "Бұл шарт емес сияқты" },
      text: { ru: "В тексте нет слов «договор», «контракт» или их аналогов на английском и китайском. Если это инвойс или коммерческое предложение, попросите у поставщика полноценный договор: без него вернуть предоплату через суд гораздо труднее.", en: "The text has no words like “contract” or “agreement”. If this is an invoice or an offer, ask the supplier for a proper contract: without one, recovering a prepayment is much harder." },
    });
  }

  // 1. Governing law
  const law = find(text, [
    /применим\w+\s+(?:к\s+\S+\s+){0,3}прав\w+/i, /материальн\w+\s+прав\w+/i, /регулиру\w+\s+(?:\S+\s+){0,3}(?:законодательств\w+|правом)/i, /в соответствии с\s+(?:действующим\s+)?законодательством/i,
    /governing law/i, /governed by/i, /applicable law/i, /construed in accordance with/i,
    /适用法律/, /适用[^。\n]{0,14}法律/, /受[^。\n]{1,20}法律管辖/, /依据[^。\n]{1,14}法律/,
  ]);
  if (!law) {
    add({
      id: "law", sev: "risk",
      title: { ru: "Не указано применимое право", en: "No governing law", kk: "Қолданылатын құқық көрсетілмеген" },
      text: { ru: "В договоре не сказано, по праву какой страны он толкуется. При споре стороны сначала будут спорить о том, чьи законы применять. Это затягивает и удорожает возврат денег.", en: "The contract does not say which country's law governs it. In a dispute the parties will first argue about that, which delays and raises the cost of recovery." },
      ask: { en: "Please add a governing law clause (we propose the law of the Republic of Kazakhstan, or a neutral law agreed by both parties).", zh: "请增加适用法律条款（我方建议适用哈萨克斯坦共和国法律，或双方同意的中立法律）。" },
    });
  } else {
    const c = countryIn(windowAfter(text, law.index));
    facts.law = c?.code;
    if (c?.code === "KZ") {
      add({ id: "law", sev: "ok", quote: quoteAt(text, law.index), title: { ru: "Применимое право: Казахстан", en: "Governing law: Kazakhstan", kk: "Қолданылатын құқық: Қазақстан" }, text: { ru: "Договор подчинён праву Казахстана. Вашему юристу не придётся разбираться в иностранном законодательстве.", en: "The contract is governed by Kazakhstan law, so your lawyer works in a familiar system." } });
    } else if (c) {
      add({
        id: "law", sev: "warn", quote: quoteAt(text, law.index),
        title: { ru: `Применимое право: право ${c.name.ru}`, en: `Governing law: ${c.name.en}`, kk: `Қолданылатын құқық: ${c.name.kk ?? c.name.ru}` },
        text: { ru: `Договор подчинён праву ${c.name.ru}. При споре понадобится юрист, который знает это право. Для небольшой сделки расходы могут оказаться сопоставимы с суммой спора.`, en: `The contract is governed by the law of ${c.name.en}. A dispute will need a lawyer qualified in that law, which may cost as much as a small claim is worth.` },
      });
    } else {
      add({ id: "law", sev: "warn", quote: quoteAt(text, law.index), title: { ru: "Применимое право указано неясно", en: "Governing law is unclear", kk: "Қолданылатын құқық анық емес" }, text: { ru: "Оговорка о применимом праве есть, но страну определить не удалось. Убедитесь, что страна названа прямо.", en: "There is a governing-law clause, but the country could not be identified. Make sure it is named explicitly." } });
    }
  }

  // 2. Disputes
  const FORUMS: [RegExp, string, Severity][] = [
    [/人民法院|народн\w+ суд|people'?s court|по месту нахождения продавца|по месту нахождения поставщика|seller'?s (?:location|domicile|place of business)|卖方所在地/i, "seller_court", "risk"],
    [/cietac|китайск\w+ международн\w+ экономическ\w+ и торгов\w+ арбитраж|中国国际经济贸易仲裁委员会|贸仲/i, "CIETAC", "warn"],
    [/hkiac|гонконгск\w+ международн\w+ арбитраж|香港国际仲裁中心/i, "HKIAC", "warn"],
    [/\bsiac\b|сингапурск\w+ международн\w+ арбитраж|新加坡国际仲裁中心/i, "SIAC", "warn"],
    [/мфца|\baifc\b|international arbitration centre|международн\w+ арбитражн\w+ центр/i, "AIFC IAC", "ok"],
    [/казахстанск\w+ международн\w+ арбитраж|\bkia\b|атамекен|смэс|специализированн\w+ межрайонн\w+ экономическ\w+ суд|суд\w* республики казахстан|courts? of (?:the republic of )?kazakhstan|哈萨克斯坦[^。\n]{0,12}(?:法院|仲裁)/i, "KZ", "ok"],
    [/\bicc\b|международн\w+ торгов\w+ палат|国际商会/i, "ICC", "warn"],
  ];
  const disputes = find(text, [/арбитраж/i, /разрешени\w+\s+споров/i, /спор\w*[^.\n]{0,60}(?:рассматрива|разреша|переда)/i, /arbitration/i, /dispute resolution/i, /disputes?[^.\n]{0,60}(?:settled|resolved|submitted|referred)/i, /仲裁/, /争议解决/, /争议[^。\n]{0,24}(?:提交|解决)/]);
  const forum = FORUMS.map(([re, name, sev]) => ({ m: re.exec(text), name, sev })).filter((x) => x.m).sort((a, b) => a.m!.index - b.m!.index)[0];
  if (!disputes && !forum) {
    add({
      id: "disputes", sev: "risk",
      title: { ru: "Не указано, где решаются споры", en: "No dispute resolution clause", kk: "Дауларды шешу орны көрсетілмеген" },
      text: { ru: "В договоре нет арбитражной оговорки и не назван суд. Если поставщик не отгрузит товар, вам придётся судиться по месту его нахождения, на его языке.", en: "There is no arbitration clause and no court is named. If the supplier does not ship, you will have to sue where the supplier is, in its language." },
      ask: { en: "Please add a dispute resolution clause: arbitration at the International Arbitration Centre of the AIFC (Astana), or another neutral arbitration institution, one arbitrator, in English.", zh: "请增加争议解决条款：提交阿斯塔纳国际金融中心国际仲裁中心（AIFC IAC）或其他中立仲裁机构仲裁，独任仲裁员，仲裁语言为英语。" },
    });
  } else if (forum) {
    facts.forum = forum.name;
    const q = quoteAt(text, forum.m!.index);
    if (forum.sev === "risk") {
      add({
        id: "disputes", sev: "risk", quote: q,
        title: { ru: "Споры — в суде по месту нахождения поставщика", en: "Disputes go to the supplier's local court", kk: "Даулар — жеткізушінің орналасқан жеріндегі сотта" },
        text: { ru: "Судиться придётся в стране поставщика: на его языке, с местным юристом и по местным правилам. Для сделки до нескольких десятков тысяч долларов это обычно означает, что возвращать деньги невыгодно.", en: "You would have to litigate in the supplier's country, in its language, with a local lawyer. For a deal of a few tens of thousands of dollars that usually makes recovery uneconomic." },
        ask: { en: "Please replace the court clause with neutral arbitration (for example, AIFC International Arbitration Centre in Astana or HKIAC), in English.", zh: "请将法院管辖条款改为中立仲裁（例如阿斯塔纳AIFC国际仲裁中心或香港国际仲裁中心），仲裁语言为英语。" },
      });
    } else if (forum.sev === "ok") {
      add({ id: "disputes", sev: "ok", quote: q, title: { ru: `Споры: ${forum.name === "KZ" ? "Казахстан" : forum.name}`, en: `Disputes: ${forum.name === "KZ" ? "Kazakhstan" : forum.name}`, kk: `Даулар: ${forum.name === "KZ" ? "Қазақстан" : forum.name}` }, text: { ru: "Спор будет рассматриваться в Казахстане. Учтите: решение потом нужно признать и исполнить в стране поставщика. Арбитражные решения исполняются по Нью-Йоркской конвенции 1958 года.", en: "The dispute is heard in Kazakhstan. The award still has to be enforced in the supplier's country; arbitral awards are enforceable under the 1958 New York Convention." } });
    } else {
      add({ id: "disputes", sev: "warn", quote: q, title: { ru: `Споры: арбитраж ${forum.name}`, en: `Disputes: ${forum.name} arbitration`, kk: `Даулар: ${forum.name} төрелігі` }, text: { ru: `${forum.name} — признанный международный арбитраж, его решения исполняются в Китае и Казахстане. Но разбирательство там стоит дорого: для небольшой сделки сборы и юристы могут превысить сумму спора.`, en: `${forum.name} is a recognised arbitration institution and its awards are enforceable in China and Kazakhstan. But proceedings are expensive: for a small deal the fees may exceed the amount in dispute.` } });
    }
  } else {
    add({ id: "disputes", sev: "warn", quote: quoteAt(text, disputes!.index), title: { ru: "Порядок споров описан неясно", en: "Dispute resolution is unclear", kk: "Дауларды шешу тәртібі анық емес" }, text: { ru: "Раздел о спорах есть, но конкретный суд или арбитраж определить не удалось. Неточное название арбитража делает оговорку неисполнимой.", en: "There is a disputes section, but no specific court or arbitration institution could be identified. An imprecise name can make the clause unenforceable." } });
  }

  // 3. Payment
  const payClause = find(text, [/оплат/i, /платеж|платёж/i, /payment/i, /付款|支付/]);
  const lc = find(text, [/аккредитив/i, /letter of credit/i, /\bL\/C\b/, /信用证/]);
  let prepay: { pct: number; index: number } | null = null;
  const prePatterns: RegExp[] = [
    /(\d{1,3})\s?%[^.\n。;；]{0,40}?(?:предоплат|аванс|prepayment|advance|deposit|预付|定金|订金)/gi,
    /(?:предоплат\w*|аванс\w*|prepayment|advance payment|deposit|预付款?|定金|订金)[^.\n。;；]{0,60}?(\d{1,3})\s?%/gi,
    /(\d{1,3})\s?%\s*(?:T\/T|TT)\s*in advance/gi,
  ];
  for (const re of prePatterns) for (const m of text.matchAll(re)) {
    const pct = Number(m[1]);
    if (pct > 0 && pct <= 100 && (!prepay || pct > prepay.pct)) prepay = { pct, index: m.index };
  }
  const full = find(text, [/полн\w+\s+предоплат/i, /full\s+(?:pre)?payment in advance/i, /full prepayment/i, /全额预付|全款|款到发货/]);
  if (full && (!prepay || prepay.pct < 100)) prepay = { pct: 100, index: full.index };
  if (prepay) facts.prepay_pct = prepay.pct;
  if (lc) {
    add({ id: "payment", sev: "ok", quote: quoteAt(text, lc.index), title: { ru: "Оплата аккредитивом", en: "Payment by letter of credit", kk: "Аккредитивпен төлеу" }, text: { ru: "Аккредитив защищает оплату: банк переводит деньги поставщику только против документов об отгрузке.", en: "A letter of credit protects the payment: the bank pays the supplier only against shipping documents." } });
  } else if (prepay && prepay.pct >= 100) {
    add({
      id: "payment", sev: "risk", quote: quoteAt(text, prepay.index),
      title: { ru: "100% предоплата", en: "100% prepayment", kk: "100% алдын ала төлем" },
      text: { ru: "Вы платите всю сумму до отгрузки. Если поставщик не отгрузит товар или пришлёт брак, у вас не останется рычагов, кроме суда.", en: "You pay the full amount before shipment. If the supplier does not ship or ships defective goods, you have no leverage short of a lawsuit." },
      ask: { en: "Please change the payment terms to 30% advance and 70% against a copy of the bill of lading (or after pre-shipment inspection).", zh: "请将付款条件改为30%预付款，70%见提单副本后支付（或装运前检验合格后支付）。" },
    });
  } else if (prepay && prepay.pct >= 50) {
    add({
      id: "payment", sev: "warn", quote: quoteAt(text, prepay.index),
      title: { ru: `Предоплата ${prepay.pct}%`, en: `${prepay.pct}% prepayment`, kk: `Алдын ала төлем ${prepay.pct}%` },
      text: { ru: "Больше половины суммы уходит до отгрузки. Обычная практика с китайскими фабриками — 30% аванс и 70% против копии коносамента.", en: "More than half is paid before shipment. The usual practice with Chinese factories is 30% in advance and 70% against a copy of the bill of lading." },
      ask: { en: "Please reduce the advance payment to 30%, with the balance against a copy of the bill of lading.", zh: "请将预付款降至30%，余款见提单副本后支付。" },
    });
  } else if (prepay) {
    add({ id: "payment", sev: "ok", quote: quoteAt(text, prepay.index), title: { ru: `Предоплата ${prepay.pct}%`, en: `${prepay.pct}% prepayment`, kk: `Алдын ала төлем ${prepay.pct}%` }, text: { ru: "Аванс в пределах обычной практики. Остаток лучше платить против документов об отгрузке.", en: "The advance is within normal practice. Pay the balance against shipping documents." } });
  } else if (!payClause) {
    add({ id: "payment", sev: "risk", title: { ru: "Не найдены условия оплаты", en: "No payment terms found", kk: "Төлем шарттары табылмады" }, text: { ru: "В договоре не описано, когда и какими частями вы платите. Без этого банк не сможет рассчитать срок репатриации, а спор об оплате решить будет трудно.", en: "The contract does not say when and in what instalments you pay. Without it the bank cannot calculate the repatriation term and a payment dispute is hard to resolve." } });
  } else {
    add({ id: "payment", sev: "info", quote: quoteAt(text, payClause.index), title: { ru: "Размер предоплаты определить не удалось", en: "Prepayment share not identified", kk: "Алдын ала төлем мөлшері анықталмады" }, text: { ru: "Условия оплаты есть, но долю аванса в процентах мы не нашли. Проверьте сами, какую часть вы платите до отгрузки.", en: "Payment terms are present, but no advance percentage was found. Check what share you pay before shipment." } });
  }

  // 4. Refund of the advance
  const refund = find(text, [/возвра\w+\s+(?:\S+\s+){0,5}(?:предоплат|аванс|денежн|уплаченн|сумм|средств)/i, /верн\w+\s+(?:\S+\s+){0,4}(?:предоплат|аванс|денежн|уплаченн|сумм|средств)/i, /refund/i, /return\s+(?:of\s+)?(?:the\s+)?(?:advance|prepayment|payment|deposit|amount)/i, /退还|返还|退款|退回/]);
  if (refund) {
    add({ id: "refund", sev: "ok", quote: quoteAt(text, refund.index), title: { ru: "Возврат предоплаты предусмотрен", en: "Refund of the advance is covered", kk: "Алдын ала төлемді қайтару қарастырылған" }, text: { ru: "В договоре есть условие о возврате денег. Проверьте, что в нём назван конкретный срок возврата в днях.", en: "The contract has a refund clause. Check that it names a specific refund period in days." } });
  } else if (!lc) {
    add({
      id: "refund", sev: "risk",
      title: { ru: "Нет условия о возврате предоплаты", en: "No refund clause", kk: "Алдын ала төлемді қайтару шарты жоқ" },
      text: { ru: "Договор не обязывает поставщика вернуть деньги, если товар не отгружен. Это главный пункт для защиты аванса. Он же нужен банку: по нему считают срок репатриации при валютном контроле.", en: "The contract does not oblige the supplier to return the money if the goods are not shipped. This is the key clause protecting your advance, and the bank uses it to calculate the repatriation term." },
      ask: { en: "Please add: if the goods are not shipped within the agreed time, the Seller shall refund the advance payment in full within 10 banking days from the Buyer's written request.", zh: "请增加：如卖方未在约定期限内发货，卖方应在收到买方书面要求后10个银行工作日内全额退还预付款。" },
    });
  }

  // 5. Delivery time
  const delivery = find(text, [/срок\w*\s+(?:поставки|отгрузки|изготовления|производства)/i, /(?:поставк|отгрузк|отгруз)\w+\s+(?:\S+\s+){0,6}в течение\s+\d+/i, /дата\s+(?:поставки|отгрузки)/i, /delivery (?:time|date|period|term)/i, /time of (?:delivery|shipment)/i, /(?:ship|deliver)\w*\s+(?:\S+\s+){0,6}within\s+\d+/i, /lead time/i, /交货期|交货时间|交货日期|发货时间|发货日期|装运期|交付期限/]);
  if (!delivery) {
    add({
      id: "delivery", sev: "risk",
      title: { ru: "Не указан срок поставки", en: "No delivery time", kk: "Жеткізу мерзімі көрсетілмеген" },
      text: { ru: "В договоре нет срока отгрузки. Пока его нет, просрочки формально не существует: вы не можете требовать ни неустойку, ни возврат денег.", en: "There is no shipment deadline. Without one there is formally no delay, so you can claim neither a penalty nor a refund." },
      ask: { en: "Please state the shipment date: the goods shall be shipped within __ calendar days from receipt of the advance payment.", zh: "请明确发货期限：卖方应在收到预付款后__个日历日内发货。" },
    });
  } else {
    facts.delivery_days = daysIn(windowAfter(text, delivery.index, 220));
    add({ id: "delivery", sev: "ok", quote: quoteAt(text, delivery.index), title: { ru: facts.delivery_days ? `Срок поставки: ${facts.delivery_days} дн.` : "Срок поставки указан", en: facts.delivery_days ? `Delivery time: ${facts.delivery_days} days` : "Delivery time is stated", kk: facts.delivery_days ? `Жеткізу мерзімі: ${facts.delivery_days} күн` : "Жеткізу мерзімі көрсетілген" }, text: { ru: "Срок есть. Проверьте, от какого события он считается: от подписания, от аванса или от согласования образцов.", en: "A deadline is present. Check what it runs from: signing, the advance, or sample approval." } });
  }

  // 6. Penalty for delay
  const penalty = find(text, [/неустойк/i, /\bпен[яиюе]\b/i, /штраф/i, /penalt/i, /liquidated damages/i, /违约金|滞纳金|罚金|罚款/]);
  if (!penalty) {
    add({
      id: "penalty", sev: "warn",
      title: { ru: "Нет неустойки за просрочку", en: "No penalty for delay", kk: "Кешіктіргені үшін тұрақсыздық айыбы жоқ" },
      text: { ru: "За срыв сроков поставщик ничем не рискует. Неустойка дисциплинирует сильнее любых обещаний в переписке.", en: "The supplier risks nothing for missing the deadline. A penalty disciplines better than any promise in a chat." },
      ask: { en: "Please add a penalty for late shipment: 0.1% of the value of the delayed goods per day, up to 10%.", zh: "请增加逾期发货违约金条款：每逾期一日按逾期货物金额的0.1%支付，最高不超过10%。" },
    });
  } else {
    add({ id: "penalty", sev: "ok", quote: quoteAt(text, penalty.index), title: { ru: "Неустойка предусмотрена", en: "Penalty is provided", kk: "Тұрақсыздық айыбы қарастырылған" }, text: { ru: "Проверьте, что неустойка действует в обе стороны и относится именно к просрочке поставки, а не только к вашей оплате.", en: "Check that the penalty works both ways and covers late delivery, not only your payment." } });
  }

  // 7. Incoterms
  const inc = /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DAT)\b/.exec(text);
  if (!inc) {
    add({ id: "incoterms", sev: "warn", title: { ru: "Не указан базис поставки (Инкотермс)", en: "No Incoterms basis", kk: "Жеткізу базисі (Инкотермс) көрсетілмеген" }, text: { ru: "Без базиса неясно, кто платит за перевозку и страховку и в какой момент риск потери товара переходит к вам.", en: "Without a basis it is unclear who pays freight and insurance and when the risk of loss passes to you." }, ask: { en: "Please state the delivery basis under Incoterms 2020 (for example, FOB Guangzhou or DAP Almaty).", zh: "请注明Incoterms 2020贸易术语（例如FOB广州或DAP阿拉木图）。" } });
  } else {
    facts.incoterm = inc[1];
    const early = ["EXW", "FCA", "FAS", "FOB", "CFR", "CPT"].includes(inc[1]);
    const mismatch = deal && deal.terms.incoterm !== inc[1];
    add({
      id: "incoterms", sev: mismatch ? "warn" : early ? "info" : "ok", quote: quoteAt(text, inc.index),
      title: { ru: `Базис поставки: ${inc[1]}`, en: `Delivery basis: ${inc[1]}`, kk: `Жеткізу базисі: ${inc[1]}` },
      text: mismatch
        ? { ru: `В договоре ${inc[1]}, а в сделке Kelisim указано ${deal!.terms.incoterm}. Уточните, какой базис верный: от него зависят расходы на перевозку и таможенная стоимость.`, en: `The contract says ${inc[1]} but the Kelisim deal says ${deal!.terms.incoterm}. Clarify which is right: it changes freight costs and the customs value.` }
        : early
          ? { ru: `При ${inc[1]} риск потери или повреждения товара переходит к вам ещё в стране отправления. Застрахуйте груз и закажите проверку перед отгрузкой.`, en: `Under ${inc[1]} the risk of loss or damage passes to you in the country of departure. Insure the cargo and order a pre-shipment inspection.` }
          : { ru: `При ${inc[1]} поставщик отвечает за товар до места назначения.`, en: `Under ${inc[1]} the supplier bears the risk up to the destination.` },
    });
  }

  // 8. Quality and inspection
  const quality = find(text, [/качеств/i, /инспекц/i, /при[её]мк/i, /quality/i, /inspection/i, /acceptance/i, /质量|检验|验收|品质/]);
  if (!quality) {
    add({ id: "quality", sev: "warn", title: { ru: "Нет условий о качестве и приёмке", en: "No quality and acceptance terms", kk: "Сапа мен қабылдау шарттары жоқ" }, text: { ru: "Не описано, какому стандарту или образцу должен соответствовать товар и как он принимается. Доказать брак будет нечем.", en: "The contract does not say what standard or sample the goods must match or how they are accepted. You would have nothing to prove a defect with." }, ask: { en: "Please add: the goods shall conform to the approved sample and specification; the Buyer may order a pre-shipment inspection by an independent company.", zh: "请增加：货物应符合确认样品及规格书；买方有权委托独立机构进行装运前检验。" } });
  } else {
    add({ id: "quality", sev: "ok", quote: quoteAt(text, quality.index), title: { ru: "Качество и приёмка описаны", en: "Quality and acceptance are covered", kk: "Сапа мен қабылдау сипатталған" }, text: { ru: "Раздел есть. Надёжнее всего привязать качество к утверждённому образцу и спецификации.", en: "The section is present. It is safest to tie quality to an approved sample and specification." } });
  }

  // 9. Claims
  const claim = find(text, [/претензи/i, /рекламаци/i, /\bclaims?\b/i, /索赔|异议/]);
  if (!claim) {
    add({ id: "claims", sev: "warn", title: { ru: "Нет порядка и срока претензий", en: "No claims procedure", kk: "Талап қою тәртібі мен мерзімі жоқ" }, text: { ru: "Не указано, в какой срок после получения вы можете заявить о браке или недостаче и что поставщик обязан сделать.", en: "The contract does not say how long after receipt you can report defects or shortage, or what the supplier must do." }, ask: { en: "Please add: the Buyer may file a claim for quality or quantity within 30 days after the goods arrive at the destination; the Seller shall reply within 10 days.", zh: "请增加：买方可在货物到达目的地后30日内就质量或数量提出索赔，卖方应在10日内答复。" } });
  } else {
    const days = daysIn(windowAfter(text, claim.index, 240));
    facts.claim_days = days;
    if (days !== undefined && days <= 7) {
      add({ id: "claims", sev: "warn", quote: quoteAt(text, claim.index), title: { ru: `Срок претензий всего ${days} дн.`, en: `Claims period is only ${days} days`, kk: `Талап қою мерзімі небәрі ${days} күн` }, text: { ru: "За такой срок трудно успеть растаможить, распаковать и проверить партию. Просите не меньше 30 дней с даты прибытия товара.", en: "That is hardly enough to clear customs, unpack and check the batch. Ask for at least 30 days from arrival." }, ask: { en: "Please extend the claims period to 30 days after the goods arrive at the destination.", zh: "请将索赔期限延长至货物到达目的地后30日。" } });
    } else {
      add({ id: "claims", sev: "ok", quote: quoteAt(text, claim.index), title: { ru: days ? `Срок претензий: ${days} дн.` : "Порядок претензий описан", en: days ? `Claims period: ${days} days` : "Claims procedure is covered", kk: days ? `Талап қою мерзімі: ${days} күн` : "Талап қою тәртібі сипатталған" }, text: { ru: "Проверьте, что срок считается с даты получения товара вами, а не с даты отгрузки.", en: "Check that the period runs from your receipt of the goods, not from shipment." } });
    }
  }

  // 10. Which language prevails
  if (facts.bilingual) {
    const prevail = find(text, [/преимущественн\w+\s+сил/i, /име\w+\s+приоритет/i, /приоритет\w*\s+име/i, /shall prevail/i, /\bprevails?\b/i, /以[^。\n]{1,10}(?:文本?|版本?)为准/]);
    const equal = find(text, [/равн\w+\s+юридическ\w+\s+сил/i, /одинаков\w+\s+юридическ\w+\s+сил/i, /equally (?:authentic|valid|binding)/i, /equal legal (?:force|effect)/i, /同等(?:的)?法律效力/]);
    if (prevail) {
      // only the sentence that contains the rule ("…the Russian text shall prevail")
      const from = Math.max(text.lastIndexOf(".", prevail.index), text.lastIndexOf("\n", prevail.index), text.lastIndexOf("。", prevail.index), text.lastIndexOf("，", prevail.index - 14)) + 1;
      const stops = [".", "\n", "。"].map((ch) => text.indexOf(ch, prevail.index + prevail.match.length)).filter((i) => i >= 0);
      const w = text.slice(from, stops.length ? Math.min(...stops) : text.length);
      const which = /китайск|chinese|中文|汉语/i.test(w) ? "zh" : /английск|english|英文/i.test(w) ? "en" : /русск|russian|俄文|俄语/i.test(w) ? "ru" : null;
      if (which === "ru") add({ id: "language", sev: "ok", quote: quoteAt(text, prevail.index), title: { ru: "Главная версия — русская", en: "The Russian version prevails", kk: "Негізгі нұсқа — орысша" }, text: { ru: "При расхождениях действует русский текст — тот, который вы читаете.", en: "In case of discrepancy the Russian text governs — the one you can read." } });
      else add({ id: "language", sev: "warn", quote: quoteAt(text, prevail.index), title: { ru: which ? `Главная версия — ${which === "zh" ? "китайская" : "английская"}` : "Главная версия указана неясно", en: which ? `The ${LANG_NAME[which].en} version prevails` : "Prevailing version is unclear", kk: which ? `Негізгі нұсқа — ${which === "zh" ? "қытайша" : "ағылшынша"}` : "Негізгі нұсқа анық емес" }, text: { ru: "При расхождениях действует текст, который вы, возможно, не можете прочитать. Сверьте обе версии целиком или попросите сделать главной русскую или английскую.", en: "In case of discrepancy the governing text is one you may not be able to read. Compare both versions in full or ask for Russian or English to prevail." }, ask: { en: "Please agree that in case of discrepancies the English version shall prevail.", zh: "请同意：如各语言文本不一致，以英文文本为准。" } });
    } else {
      add({ id: "language", sev: "warn", quote: equal ? quoteAt(text, equal.index) : undefined, title: { ru: "Не указано, какая языковая версия главная", en: "No prevailing language", kk: "Қай тілдегі нұсқа негізгі екені көрсетілмеген" }, text: { ru: equal ? "Обе версии имеют равную силу, но не сказано, какая действует при расхождении. Любая неточность перевода превращается в спор." : "Договор на двух языках, но не сказано, какая версия действует при расхождении. Любая неточность перевода превращается в спор.", en: "The contract is in two languages but does not say which governs if they differ. Any translation inaccuracy becomes a dispute." }, ask: { en: "Please add: in case of discrepancies between the language versions, the English version shall prevail.", zh: "请增加：如各语言文本不一致，以英文文本为准。" } });
    }

    // 11. Numbers that differ between the two versions
    const pair = [...present].sort((a, b) => facts.langs[b] - facts.langs[a]).slice(0, 2) as ["ru" | "en" | "zh", "ru" | "en" | "zh"];
    const diff = numberDiscrepancies(text, pair);
    if (diff.counted >= 4 && (diff.onlyA.length || diff.onlyB.length)) {
      const list = (xs: string[]) => xs.slice(0, 8).join(", ") + (xs.length > 8 ? "…" : "");
      const partsRu = [diff.onlyA.length ? `только в ${LANG_NAME[pair[0]].ru} версии: ${list(diff.onlyA)}` : "", diff.onlyB.length ? `только в ${LANG_NAME[pair[1]].ru} версии: ${list(diff.onlyB)}` : ""].filter(Boolean).join("; ");
      const partsEn = [diff.onlyA.length ? `only in the ${LANG_NAME[pair[0]].en} version: ${list(diff.onlyA)}` : "", diff.onlyB.length ? `only in the ${LANG_NAME[pair[1]].en} version: ${list(diff.onlyB)}` : ""].filter(Boolean).join("; ");
      add({ id: "versions", sev: diff.onlyA.length + diff.onlyB.length >= 3 || [...diff.onlyA, ...diff.onlyB].some((k) => k.endsWith("%")) ? "risk" : "warn", title: { ru: "Числа в языковых версиях расходятся", en: "Numbers differ between the language versions", kk: "Тілдік нұсқалардағы сандар сәйкес келмейді" }, text: { ru: `Суммы, проценты или сроки, которые есть в одной версии и отсутствуют в другой — ${partsRu}. Сверьте эти места: расхождение может быть ошибкой перевода или другим условием.`, en: `Amounts, percentages or periods present in one version and absent in the other — ${partsEn}. Compare these places: it may be a translation error or a different term.` } });
    } else if (diff.counted >= 4) {
      add({ id: "versions", sev: "ok", title: { ru: "Числа в языковых версиях совпадают", en: "Numbers match across the language versions", kk: "Тілдік нұсқалардағы сандар сәйкес келеді" }, text: { ru: "Суммы, проценты и сроки в обеих версиях одинаковые. Это не проверка перевода формулировок: её делает юрист или переводчик.", en: "Amounts, percentages and periods are the same in both versions. This does not verify the wording itself — that takes a lawyer or a translator." } });
    }
  }

  // 12. Bank details
  const swift = /(?:SWIFT|BIC|СВИФТ)[^A-Z0-9\n]{0,24}([A-Z]{4}([A-Z]{2})[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/.exec(text);
  const supplierCountry = deal?.counterparty.country;
  if (swift) {
    facts.swift = swift[1];
    facts.swift_country = swift[2];
    if (supplierCountry && swift[2] !== supplierCountry) {
      const soft = (supplierCountry === "CN" && swift[2] === "HK") || (supplierCountry === "HK" && swift[2] === "CN");
      add({ id: "bank", sev: soft ? "warn" : "risk", quote: quoteAt(text, swift.index), title: { ru: `Банк получателя в другой стране (${swift[2]})`, en: `Beneficiary bank is in another country (${swift[2]})`, kk: `Алушының банкі басқа елде (${swift[2]})` }, text: { ru: `Поставщик зарегистрирован в ${supplierCountry}, а деньги уходят в банк в ${swift[2]}. Ваш банк спросит, почему. Убедитесь, что получатель платежа — та же компания, что подписывает договор, и запросите письмо об этом на бланке поставщика.`, en: `The supplier is registered in ${supplierCountry} but the money goes to a bank in ${swift[2]}. Your bank will ask why. Make sure the payee is the same company that signs the contract and request a letter confirming it.` }, ask: { en: "Please confirm in writing, on your letterhead, that the bank account in the contract belongs to the same company that signs the contract.", zh: "请以贵司抬头纸书面确认：合同中的银行账户属于签署本合同的同一公司。" } });
    } else {
      add({ id: "bank", sev: "ok", quote: quoteAt(text, swift.index), title: { ru: `Реквизиты указаны (SWIFT ${swift[1]})`, en: `Bank details present (SWIFT ${swift[1]})`, kk: `Деректемелер көрсетілген (SWIFT ${swift[1]})` }, text: { ru: "Перед оплатой сверьте реквизиты в договоре и в инвойсе. Письмо «у нас сменился счёт» — самая частая схема мошенничества: перезвоните поставщику по известному номеру.", en: "Before paying, compare the details in the contract and the invoice. An email saying “our account has changed” is the most common fraud: call the supplier on a known number." } });
    }
  } else {
    add({ id: "bank", sev: "warn", title: { ru: "Не найдены банковские реквизиты поставщика", en: "Supplier's bank details not found", kk: "Жеткізушінің банк деректемелері табылмады" }, text: { ru: "В договоре нет SWIFT-кода банка поставщика. Реквизиты должны быть в самом договоре: платёж на счёт, которого нет в договоре, банк может не провести.", en: "The contract has no SWIFT code of the supplier's bank. The details must be in the contract itself: the bank may refuse a payment to an account that is not in it." } });
  }

  // 13. Currency control (Kazakhstan)
  const repat = find(text, [/репатриац/i, /repatriation/i]);
  if (repat) {
    add({ id: "repatriation", sev: "ok", quote: quoteAt(text, repat.index), title: { ru: "Срок репатриации указан", en: "Repatriation term is stated", kk: "Репатриация мерзімі көрсетілген" }, text: { ru: "Банку будет проще поставить договор на учёт и присвоить учётный номер.", en: "The bank can register the contract and assign an account number more easily." } });
  } else {
    add({ id: "repatriation", sev: refund && delivery ? "info" : "warn", title: { ru: "Срок репатриации придётся считать самим", en: "The repatriation term has to be derived", kk: "Репатриация мерзімін өзіңіз есептеуіңіз керек" }, text: { ru: "В договоре нет прямого срока репатриации. Казахстанский банк рассчитает его по срокам поставки и возврата предоплаты. Если этих сроков нет, банк попросит дополнительное соглашение.", en: "There is no explicit repatriation term. A Kazakhstan bank derives it from the delivery and refund deadlines; if those are missing, the bank will ask for an addendum." } });
  }

  // 14. Amount and currency
  const total = /(?:общая\s+(?:сумма|стоимость)|сумма\s+(?:договора|контракта)|стоимость\s+(?:договора|контракта|товара)|total\s+(?:amount|value|price|contract)|contract\s+(?:amount|value|price|sum)|合同总?(?:金额|价)|总金额|总价|总计)[^0-9\n]{0,48}(\d[\d\s.,]{2,22}\d)\s*([^\s\d.,;:()]{0,12})/i.exec(text);
  if (total) {
    const amount = parseAmount(total[1]);
    const cur = currencyOf(total[0]) ?? currencyOf(windowAfter(text, total.index, 120));
    if (amount) facts.amount = amount;
    if (cur) facts.currency = cur;
    if (deal && amount) {
      const dealAmount = dealTotal(deal);
      const off = Math.abs(amount - dealAmount) / Math.max(dealAmount, 1) > 0.01;
      const curOff = cur !== undefined && cur !== deal.currency;
      if (off || curOff) add({ id: "amount", sev: "risk", quote: quoteAt(text, total.index), title: { ru: "Сумма в договоре не совпадает со сделкой", en: "Contract amount differs from the deal", kk: "Шарттағы сома мәмілемен сәйкес келмейді" }, text: { ru: `В договоре ${amount} ${cur ?? ""}, в сделке Kelisim ${dealAmount} ${deal.currency}. Банк сверяет сумму договора с инвойсом и платёжным поручением: расхождение остановит платёж.`, en: `The contract says ${amount} ${cur ?? ""}, the Kelisim deal says ${dealAmount} ${deal.currency}. The bank compares the contract with the invoice and the payment order: a mismatch stops the payment.` } });
      else add({ id: "amount", sev: "ok", quote: quoteAt(text, total.index), title: { ru: "Сумма совпадает со сделкой", en: "Amount matches the deal", kk: "Сома мәмілемен сәйкес келеді" }, text: { ru: `В договоре и в сделке ${amount} ${cur ?? deal.currency}.`, en: `Both the contract and the deal say ${amount} ${cur ?? deal.currency}.` } });
    }
  } else {
    add({ id: "amount", sev: "info", title: { ru: "Общая сумма договора не найдена", en: "Total contract amount not found", kk: "Шарттың жалпы сомасы табылмады" }, text: { ru: "Мы не нашли строку с общей суммой. Если цена указана только в спецификации или инвойсе, убедитесь, что договор на них ссылается.", en: "No total amount line was found. If the price is only in a specification or an invoice, make sure the contract refers to them." } });
  }

  // 15. Is the supplier from the deal named in the contract
  if (deal?.counterparty.name) {
    const hay = normName(text);
    const names = [deal.counterparty.name, deal.counterparty.name_local].filter(Boolean).map(normName).filter((n) => n.length >= 3);
    if (names.length && !names.some((n) => hay.includes(n))) {
      add({ id: "party", sev: "risk", title: { ru: "В договоре не найден поставщик из сделки", en: "The supplier from the deal is not in the contract", kk: "Шартта мәміледегі жеткізуші табылмады" }, text: { ru: `Вы проверяли «${deal.counterparty.name}», но в тексте договора этого названия нет. Возможно, договор подписывает другая компания: её тоже нужно проверить по санкционным спискам.`, en: `You screened “${deal.counterparty.name}”, but that name is not in the contract. Another company may be signing: it must be screened too.` } });
    }
  }

  // 16–18. Smaller clauses
  if (!find(text, [/форс-?мажор/i, /непреодолим\w+\s+сил/i, /force majeure/i, /不可抗力/])) {
    add({ id: "force_majeure", sev: "info", title: { ru: "Нет оговорки о форс-мажоре", en: "No force majeure clause", kk: "Форс-мажор туралы ескертпе жоқ" }, text: { ru: "Не описано, что происходит при обстоятельствах вне контроля сторон и через сколько дней можно расторгнуть договор и вернуть деньги.", en: "The contract does not say what happens in events beyond the parties' control, or after how many days the contract can be terminated and the money returned." } });
  }
  if (!find(text, [/санкци/i, /sanction/i, /制裁/])) {
    add({ id: "sanctions_clause", sev: "info", title: { ru: "Нет санкционной оговорки", en: "No sanctions clause", kk: "Санкциялық ескертпе жоқ" }, text: { ru: "Если поставщик или его банк попадут под санкции после оплаты, оговорка позволяет расторгнуть договор и требовать возврат денег.", en: "If the supplier or its bank becomes sanctioned after you pay, the clause lets you terminate and demand a refund." }, ask: { en: "Please add a sanctions clause: each party confirms it is not subject to sanctions; if this changes, the other party may terminate the contract and the advance shall be refunded.", zh: "请增加制裁条款：双方确认未受制裁；如情况变化，另一方有权解除合同，预付款应予退还。" } });
  }
  if (!find(text, [/подпис/i, /печат/i, /signature/i, /signed by/i, /\bseal\b/i, /stamp/i, /签字|盖章|签章|签署/])) {
    add({ id: "signature", sev: "info", title: { ru: "Не найден блок подписей", en: "No signature block found", kk: "Қол қою бөлімі табылмады" }, text: { ru: "Китайская компания скрепляет договор круглой красной печатью с названием компании на китайском. Договор без такой печати оспорить проще.", en: "A Chinese company seals a contract with its round red company chop bearing the Chinese name. A contract without it is easier to challenge." } });
  }

  // Score
  const order: Record<Severity, number> = { risk: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  const lost = findings.reduce((s, f) => s + WEIGHT[f.sev], 0);
  const score = Math.max(5, Math.min(100, 100 - lost));
  const risks = findings.filter((f) => f.sev === "risk").length;
  const warns = findings.filter((f) => f.sev === "warn").length;
  const risk: RiskLevel = risks >= 2 || score < 50 ? "red" : risks === 1 || warns >= 2 ? "yellow" : "green";
  return { version: REVIEW_VERSION, score, risk, findings, facts, chars: text.length };
}

/** Message to the supplier listing the requested changes (English + Chinese). */
export function amendmentLetter(result: ReviewResult, supplierName = ""): { en: string; zh: string } {
  const asks = result.findings.filter((f) => f.ask && f.sev !== "ok");
  const en = [`Dear ${supplierName || "Partner"},`, "", "Thank you for the draft contract. Before we sign and arrange the payment, our bank and compliance team ask for the following changes:", "", ...asks.map((f, i) => `${i + 1}. ${f.ask!.en}`), "", "Please send us the updated draft. We are ready to sign as soon as these points are reflected.", "", "Best regards"].join("\n");
  const zh = [`${supplierName || "合作伙伴"}，您好：`, "", "感谢贵司提供的合同草案。在签署并安排付款之前，我方银行及合规部门要求作如下修改：", "", ...asks.map((f, i) => `${i + 1}. ${f.ask!.zh}`), "", "请发送修改后的合同文本。上述内容确认后，我方即可签署。", "", "此致 敬礼"].join("\n");
  return { en, zh };
}
