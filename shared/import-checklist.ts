// Import compliance checklist: documents and procedures for importing the deal's goods into Kazakhstan.
// Rules are keyed by HS (ТН ВЭД ЕАЭС) code prefixes. The checklist never states that a certificate is
// mandatory from the product name alone: without an HS code it says "classify the goods first", and
// with a code it says "check whether … applies", naming the regulation.
// Sources:
//  • Marking: list of goods subject to marking, order of the Minister of Trade and Integration of RK
//    No. 343-НК (27.09.2024) as amended by No. 330-НК (22.11.2025);
//  • Conformity assessment: EAEU (Customs Union) technical regulations (ТР ТС / ТР ЕАЭС).
import { hsDigits } from "./export-control";
import type { DealInput, L10n } from "./types";

export type ChecklistStatus = "done" | "todo" | "check" | "na";
export interface ChecklistItem {
  id: string;
  group: "docs" | "conformity" | "marking" | "permits" | "customs" | "export";
  title: L10n & { kk: string };
  why?: L10n & { kk: string };
  status: ChecklistStatus;
  /** the user can tick it off manually */
  manual: boolean;
  source?: string;
}

const L = (ru: string, kk: string, en: string) => ({ ru, kk, en });
const starts = (d: string, prefixes: string[]) => prefixes.some((p) => d.startsWith(p));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

// ── Mandatory digital marking in Kazakhstan (prefix → date) ──
export const MARKING: { prefixes: string[]; from: string; group: L10n & { kk: string } }[] = [
  { prefixes: ["6401", "6402", "6403", "6404", "6405"], from: "2021-11-01", group: L("обувь", "аяқ киім", "footwear") },
  { prefixes: ["420310", "4304", "6113", "6210", "621120", "621132", "621139", "621142", "621149", "6302"], from: "2026-12-01", group: L("товары лёгкой промышленности (1-й этап)", "жеңіл өнеркәсіп тауарлары (1-кезең)", "light-industry goods (stage 1)") },
  { prefixes: ["6106", "6110", "6201", "6202", "6205", "6206", "621133", "621143", "6214", "6215"], from: "2027-03-01", group: L("товары лёгкой промышленности (2-й этап)", "жеңіл өнеркәсіп тауарлары (2-кезең)", "light-industry goods (stage 2)") },
  { prefixes: ["6101", "6102", "6103", "6104", "6105", "611211", "611212", "611219", "611220", "6203", "6204"], from: "2027-10-01", group: L("товары лёгкой промышленности (3-й этап)", "жеңіл өнеркәсіп тауарлары (3-кезең)", "light-industry goods (stage 3)") },
  { prefixes: ["2402", "2403", "2404"], from: "2021-04-01", group: L("табачная и никотинсодержащая продукция", "темекі және құрамында никотин бар өнім", "tobacco and nicotine products") },
  { prefixes: ["3002", "3004"], from: "2024-07-01", group: L("лекарственные средства", "дәрілік заттар", "medicines") },
  { prefixes: ["220291", "2203"], from: "2026-02-01", group: L("пиво и пивные напитки", "сыра және сыра сусындары", "beer and beer drinks") },
  { prefixes: ["2710198", "34031", "340399"], from: "2026-02-01", group: L("моторные масла и смазочные материалы", "мотор майлары және жағармайлар", "motor oils and lubricants") },
  { prefixes: ["3819", "3820"], from: "2026-09-01", group: L("тормозные жидкости и антифризы", "тежегіш сұйықтықтары және антифриздер", "brake fluids and antifreeze") },
];

// ── EAEU technical regulations (conformity assessment) ──
const APPAREL = [...range(61, 63).map((c) => c), "6401", "6402", "6403", "6404", "6405", "6501", "6502", "6504", "6505", "6506", "4202", "4203", "4303"];
export const REGULATIONS: { prefixes: string[]; children?: boolean; code: string; title: L10n & { kk: string } }[] = [
  { prefixes: APPAREL, children: true, code: "ТР ТС 007/2011", title: L("О безопасности продукции, предназначенной для детей и подростков", "Балалар мен жасөспірімдерге арналған өнімнің қауіпсіздігі туралы", "Safety of products for children and teenagers") },
  { prefixes: APPAREL, children: false, code: "ТР ТС 017/2011", title: L("О безопасности продукции лёгкой промышленности", "Жеңіл өнеркәсіп өнімінің қауіпсіздігі туралы", "Safety of light-industry products") },
  { prefixes: ["9503"], code: "ТР ТС 008/2011", title: L("О безопасности игрушек", "Ойыншықтардың қауіпсіздігі туралы", "Safety of toys") },
  { prefixes: ["3303", "3304", "3305", "3306", "3307", "3401"], code: "ТР ТС 009/2011", title: L("О безопасности парфюмерно-косметической продукции", "Парфюмерлік-косметикалық өнімнің қауіпсіздігі туралы", "Safety of perfumes and cosmetics") },
  { prefixes: range(2, 22).map((c) => c.padStart(2, "0")), code: "ТР ТС 021/2011, ТР ТС 022/2011", title: L("О безопасности пищевой продукции; маркировка пищевой продукции", "Тағам өнімінің қауіпсіздігі; тағам өнімін таңбалау", "Food safety; food labelling") },
  { prefixes: ["9401", "9403"], code: "ТР ТС 025/2012", title: L("О безопасности мебельной продукции", "Жиһаз өнімінің қауіпсіздігі туралы", "Safety of furniture") },
  { prefixes: ["85", "8415", "8418", "8422", "8450", "8451", "8471", "8508", "8509", "8510", "8516"], code: "ТР ТС 004/2011, ТР ТС 020/2011, ТР ЕАЭС 037/2016", title: L("Низковольтное оборудование, электромагнитная совместимость, ограничение опасных веществ — для электрических изделий", "Төмен вольтты жабдық, электромагниттік үйлесімділік, қауіпті заттарды шектеу — электр бұйымдары үшін", "Low-voltage equipment, EMC and hazardous substances — for electrical products") },
  { prefixes: ["84"], code: "ТР ТС 010/2011", title: L("О безопасности машин и оборудования", "Машиналар мен жабдықтардың қауіпсіздігі туралы", "Safety of machinery and equipment") },
  { prefixes: ["4011", "8703", "8704", "8711"], code: "ТР ТС 018/2011", title: L("О безопасности колёсных транспортных средств (включая шины)", "Дөңгелекті көлік құралдарының қауіпсіздігі туралы (шиналарды қоса)", "Safety of wheeled vehicles (incl. tyres)") },
];

// ── Permits and other controls ──
export const PERMITS: { prefixes: string[]; id: string; title: L10n & { kk: string } }[] = [
  { prefixes: ["8471", "8473", "8517", "8525", "8528", "8542"], id: "crypto", title: L("Нотификация о шифровальных (криптографических) средствах ЕАЭС — для устройств с функциями шифрования (Wi-Fi, Bluetooth, ПО)", "Шифрлау (криптографиялық) құралдары туралы ЕАЭО нотификациясы — шифрлау функциялары бар құрылғылар үшін (Wi-Fi, Bluetooth, БҚ)", "EAEU notification for encryption (cryptographic) features — for devices with Wi-Fi, Bluetooth, software") },
  { prefixes: range(1, 5).map((c) => c.padStart(2, "0")), id: "vet", title: L("Ветеринарный сертификат и ветеринарный контроль на границе", "Ветеринариялық сертификат және шекарадағы ветеринариялық бақылау", "Veterinary certificate and border veterinary control") },
  { prefixes: range(6, 14).map((c) => c.padStart(2, "0")), id: "phyto", title: L("Фитосанитарный сертификат и карантинный контроль", "Фитосанитариялық сертификат және карантиндік бақылау", "Phytosanitary certificate and quarantine control") },
  { prefixes: ["3002", "3003", "3004"], id: "pharma", title: L("Государственная регистрация лекарственного средства в РК", "Дәрілік затты ҚР-да мемлекеттік тіркеу", "State registration of the medicine in Kazakhstan") },
  { prefixes: ["2203", "2204", "2205", "2206", "2208"], id: "alcohol", title: L("Лицензия на импорт алкоголя и учётно-контрольные (акцизные) марки", "Алкогольді импорттауға лицензия және есепке алу-бақылау (акциз) маркалары", "Alcohol import licence and excise stamps") },
  { prefixes: ["93"], id: "arms", title: L("Лицензия на ввоз оружия и боеприпасов", "Қару мен оқ-дәрілерді әкелуге лицензия", "Licence for arms and ammunition") },
];

export interface ChecklistContext {
  docsGenerated: boolean;
  ucnRequired: boolean;
  ucn: string;
  chplHit: boolean;
  /** manual statuses saved by the user: item id → done | na */
  manual?: Record<string, "done" | "na">;
  today?: string;
}

const fmt = (iso: string) => iso.split("-").reverse().join(".");

export function buildChecklist(deal: DealInput, ctx: ChecklistContext): ChecklistItem[] {
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  const codes = deal.goods.map((g) => hsDigits(g.hs_code));
  const known = codes.filter((d) => d.length >= 4);
  const allCoded = deal.goods.length > 0 && codes.every((d) => d.length >= 6);
  const docs = ctx.docsGenerated ? "done" : "todo";
  const m = ctx.manual ?? {};
  const manual = (id: string, def: ChecklistStatus): ChecklistStatus => m[id] ?? def;
  const out: ChecklistItem[] = [];
  const goodsOnly = deal.contract_type !== "services";

  // 1. Deal documents — produced by Kelisim
  out.push(
    { id: "contract", group: "docs", title: L("Внешнеторговый договор", "Сыртқы сауда шарты", "Foreign trade contract"), status: docs, manual: false },
    { id: "spec", group: "docs", title: L("Спецификация", "Спецификация", "Specification"), status: docs, manual: false },
    { id: "invoice", group: "docs", title: L("Инвойс", "Инвойс", "Commercial invoice"), status: docs, manual: false },
  );
  if (goodsOnly) out.push({ id: "packing", group: "docs", title: L("Упаковочный лист", "Орау парағы", "Packing list"), status: docs, manual: false });
  if (ctx.ucnRequired) {
    out.push({ id: "ucn", group: "docs", title: L("Учётный номер контракта (УНК) в банке", "Банктегі келісімшарттың есептік нөмірі (УНК)", "Contract registration number (UCN) at the bank"), status: ctx.ucn ? "done" : "todo", manual: false });
  }
  if (!goodsOnly) return out;

  // 2. Classification
  out.push({
    id: "hs", group: "customs",
    title: L("Код ТН ВЭД для каждой позиции", "Әр позиция үшін СЭҚ ТН коды", "HS code for every item"),
    why: allCoded ? undefined : L("От кода зависят пошлина, сертификация, маркировка и экспортный контроль. Уточните у поставщика или таможенного представителя.", "Кодқа баж, сертификаттау, таңбалау және экспорттық бақылау байланысты. Жеткізушіден немесе кеден өкілінен нақтылаңыз.", "Duty, certification, marking and export control depend on the code. Confirm it with the supplier or a customs broker."),
    status: allCoded ? "done" : "todo", manual: false,
  });

  // 3. Conformity assessment (EAEU technical regulations)
  const regs = REGULATIONS.filter((r) => known.some((d) => starts(d, r.prefixes)) && (r.children === undefined || r.children === Boolean(deal.for_children)));
  for (const r of regs) {
    out.push({
      id: `tr:${r.code}`, group: "conformity",
      title: L(`Сертификат или декларация соответствия: ${r.code}`, `Сәйкестік сертификаты немесе декларациясы: ${r.code}`, `Certificate or declaration of conformity: ${r.code}`),
      why: L(`«${r.title.ru}». Проверьте, попадает ли товар в перечень продукции регламента по коду и характеристикам; документ оформляет аккредитованный орган или заявитель до выпуска товара.`, `«${r.title.kk}». Тауардың код пен сипаттамалар бойынша регламент тізбесіне кіретінін тексеріңіз; құжатты тауар шығарылғанға дейін аккредиттелген орган немесе өтініш беруші ресімдейді.`, `"${r.title.en}". Check whether the product falls under the regulation by code and characteristics; the document is issued by an accredited body or the applicant before release.`),
      status: manual(`tr:${r.code}`, "check"), manual: true, source: "ТР ТС / ТР ЕАЭС",
    });
  }
  if (!known.length) {
    out.push({ id: "tr:unknown", group: "conformity", title: L("Оценка соответствия ЕАЭС", "ЕАЭО сәйкестігін бағалау", "EAEU conformity assessment"), why: L("Нельзя определить без кода ТН ВЭД: необходимость сертификата зависит от точной классификации, а не от названия товара.", "СЭҚ ТН кодынсыз анықтау мүмкін емес: сертификат қажеттілігі тауар атауына емес, нақты жіктеуге байланысты.", "Cannot be determined without an HS code: the need for a certificate depends on the exact classification, not the product name."), status: "check", manual: false });
  }

  // 4. Mandatory marking in Kazakhstan
  const marks = MARKING.filter((mk) => known.some((d) => starts(d, mk.prefixes)));
  for (const mk of marks) {
    const active = mk.from <= today;
    out.push({
      id: `mark:${mk.from}:${mk.prefixes[0]}`, group: "marking",
      title: L(`Цифровая маркировка: ${mk.group.ru}`, `Цифрлық таңбалау: ${mk.group.kk}`, `Digital marking: ${mk.group.en}`),
      why: active
        ? L(`Обязательна с ${fmt(mk.from)}. Коды маркировки заказываются в информационной системе маркировки (ИС МПТ) и наносятся до ввоза или до продажи.`, `${fmt(mk.from)} бастап міндетті. Таңбалау кодтары таңбалау ақпараттық жүйесінде (ТҚБАЖ) тапсырыс беріліп, әкелгенге немесе сатқанға дейін жапсырылады.`, `Mandatory since ${fmt(mk.from)}. Codes are ordered in the national marking system and applied before import or sale.`)
        : L(`Станет обязательной с ${fmt(mk.from)}. Если товар будет в продаже после этой даты, заложите маркировку уже сейчас.`, `${fmt(mk.from)} бастап міндетті болады. Тауар осы күннен кейін сатылатын болса, таңбалауды қазірден қарастырыңыз.`, `Becomes mandatory on ${fmt(mk.from)}. If the goods will be on sale after that date, plan the marking now.`),
      status: manual(`mark:${mk.from}:${mk.prefixes[0]}`, "check"), manual: true, source: "Приказ МТИ РК № 343-НК (ред. № 330-НК)",
    });
  }

  // 5. Permits
  for (const p of PERMITS.filter((p) => known.some((d) => starts(d, p.prefixes)))) {
    out.push({ id: `permit:${p.id}`, group: "permits", title: p.title, status: manual(`permit:${p.id}`, "check"), manual: true });
  }

  // 6. Export control (from the export check)
  if (ctx.chplHit) {
    out.push({ id: "enduse", group: "export", title: L("Заявление о конечном использовании (end-use statement) и оговорка о запрете реэкспорта", "Түпкі пайдалану туралы өтініш (end-use statement) және реэкспортқа тыйым туралы ескертпе", "End-use statement and no-re-export clause"), status: manual("enduse", "todo"), manual: true, source: "CHPL" });
  }

  // 7. Shipping and customs
  out.push(
    { id: "transport", group: "customs", title: L("Транспортные документы (CMR, коносамент, ж/д накладная)", "Көлік құжаттары (CMR, коносамент, т/ж жүкқұжаты)", "Transport documents (CMR, bill of lading, rail waybill)"), status: manual("transport", "todo"), manual: true },
    { id: "origin", group: "customs", title: L("Сертификат происхождения", "Шығу тегі сертификаты", "Certificate of origin"), why: L("Нужен, если заявляете тарифную преференцию или этого требуют ограничительные меры.", "Тарифтік преференция мәлімдесеңіз немесе шектеу шаралары талап етсе қажет.", "Needed if you claim a tariff preference or restrictive measures require it."), status: manual("origin", "check"), manual: true },
    { id: "declaration", group: "customs", title: L("Декларация на товары (ДТ) и уплата пошлин и НДС", "Тауарларға декларация (ТД) және баж бен ҚҚС төлеу", "Customs declaration and payment of duties and VAT"), why: L("Оформляется при ввозе, обычно через таможенного представителя.", "Әкелу кезінде, әдетте кеден өкілі арқылы ресімделеді.", "Filed on import, usually via a customs broker."), status: manual("declaration", "todo"), manual: true },
  );
  return out;
}

/** Share of the import checklist that is resolved (done or not applicable), 0..1. */
export function checklistProgress(items: ChecklistItem[]): { resolved: number; total: number; open: ChecklistItem[] } {
  const relevant = items.filter((i) => i.group !== "docs");
  const open = relevant.filter((i) => i.status === "todo" || i.status === "check");
  return { resolved: relevant.length - open.length, total: relevant.length, open };
}
