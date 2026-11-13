// Paid services around a cross-border deal. They are fulfilled by people (the Kelisim team and
// partner lawyers), the platform takes the order, shows how to pay and tracks the status.
// ⚠️ Prices are the launch defaults: change them here, the whole product reads this file.
import type { L10n } from "./types";

export type ServiceId = "lawyer_review" | "supplier_check" | "claim_support" | "turnkey_import" | "safe_payment";
export type OrderStatus = "new" | "awaiting_payment" | "payment_reported" | "in_progress" | "done" | "cancelled";

export interface ServiceField {
  key: string;
  label: L10n;
  placeholder?: L10n;
  required?: boolean;
  multiline?: boolean;
}

export interface Service {
  id: ServiceId;
  /** fixed price in tenge; null = quoted individually after the request */
  price: number | null;
  /** shown instead of a fixed price */
  priceNote?: L10n;
  /** working days to deliver */
  days: number | null;
  title: L10n;
  short: L10n;
  includes: L10n[];
  result: L10n;
  fields: ServiceField[];
  /** not launched yet: the request joins the waiting list */
  soon?: boolean;
}

const supplier: ServiceField = { key: "supplier", label: { ru: "Поставщик", en: "Supplier", kk: "Жеткізуші" }, placeholder: { ru: "Название компании, как в договоре или инвойсе", en: "Company name as in the contract or invoice", kk: "Шарттағы немесе инвойстағы компания атауы" }, required: true };
const comment: ServiceField = { key: "comment", label: { ru: "Комментарий", en: "Comment", kk: "Түсініктеме" }, placeholder: { ru: "Что важно учесть", en: "Anything we should know", kk: "Нені ескеру керек" }, multiline: true };

export const SERVICES: Service[] = [
  {
    id: "supplier_check",
    price: 15_000,
    days: 2,
    title: { ru: "Проверка поставщика в Китае", en: "Supplier check in China", kk: "Қытайдағы жеткізушіні тексеру" },
    short: { ru: "Узнайте, существует ли фабрика и можно ли ей платить, до перевода предоплаты.", en: "Find out whether the factory exists and can be paid before you send the advance.", kk: "Алдын ала төлем жібермес бұрын фабриканың бар-жоғын біліңіз." },
    includes: [
      { ru: "Выписка из государственного реестра КНР: дата регистрации, уставный капитал, статус, вид деятельности", en: "Extract from the PRC state registry: registration date, capital, status, business scope", kk: "ҚХР мемлекеттік тізілімінен үзінді: тіркелген күні, жарғылық капиталы, мәртебесі" },
      { ru: "Владельцы и директор, их проверка по санкционным спискам", en: "Owners and director, screened against sanctions lists", kk: "Иелері мен директоры, санкциялық тізімдер бойынша тексеру" },
      { ru: "Судебные дела, штрафы и отметки о нарушениях", en: "Court cases, fines and violation records", kk: "Сот істері, айыппұлдар және бұзушылық белгілері" },
      { ru: "Сверка названия, адреса и банковских реквизитов с вашим договором или инвойсом", en: "Name, address and bank details compared with your contract or invoice", kk: "Атауын, мекенжайын және банк деректемелерін шартыңызбен салыстыру" },
      { ru: "Вывод: можно платить, нужны уточнения или платить нельзя", en: "Verdict: safe to pay, needs clarification, or do not pay", kk: "Қорытынды: төлеуге болады, нақтылау керек немесе төлеуге болмайды" },
    ],
    result: { ru: "Отчёт на русском языке на 2–3 страницы", en: "A 2–3 page report in Russian", kk: "Орыс тіліндегі 2–3 беттік есеп" },
    fields: [
      supplier,
      { key: "supplier_cn", label: { ru: "Название на китайском или единый код (USCC)", en: "Chinese name or unified code (USCC)", kk: "Қытайша атауы немесе бірыңғай код (USCC)" }, placeholder: { ru: "广州纺织有限公司 или 18 знаков с печати", en: "广州纺织有限公司 or the 18 characters from the chop", kk: "广州纺织有限公司 немесе мөрдегі 18 таңба" } },
      { key: "link", label: { ru: "Ссылка на поставщика", en: "Link to the supplier", kk: "Жеткізушіге сілтеме" }, placeholder: { ru: "Alibaba, 1688, сайт фабрики", en: "Alibaba, 1688, factory website", kk: "Alibaba, 1688, фабрика сайты" } },
      comment,
    ],
  },
  {
    id: "lawyer_review",
    price: 25_000,
    days: 1,
    title: { ru: "Проверка договора юристом", en: "Contract review by a lawyer", kk: "Шартты заңгердің тексеруі" },
    short: { ru: "Юрист по внешнеторговым сделкам читает договор поставщика целиком и пишет, что изменить до подписания.", en: "A cross-border trade lawyer reads the supplier's contract in full and writes what to change before you sign.", kk: "Сыртқы сауда заңгері жеткізушінің шартын толық оқып, қол қоймас бұрын нені өзгерту керегін жазады." },
    includes: [
      { ru: "Разбор всех условий: оплата, сроки, ответственность, споры, возврат денег", en: "All terms reviewed: payment, deadlines, liability, disputes, refund", kk: "Барлық шарттарды талдау: төлем, мерзімдер, жауапкершілік, даулар" },
      { ru: "Сверка русской и иностранной версий по смыслу", en: "The Russian and foreign versions compared for meaning", kk: "Орысша және шетелдік нұсқаларды мағынасы бойынша салыстыру" },
      { ru: "Соответствие требованиям валютного контроля Казахстана", en: "Compliance with Kazakhstan currency control", kk: "Қазақстанның валюталық бақылау талаптарына сәйкестігі" },
      { ru: "Готовые формулировки правок на английском для поставщика", en: "Ready wording of amendments in English for the supplier", kk: "Жеткізушіге арналған ағылшын тіліндегі дайын түзетулер" },
    ],
    result: { ru: "Заключение с правками в течение одного рабочего дня", en: "An opinion with amendments within one working day", kk: "Бір жұмыс күні ішінде түзетулері бар қорытынды" },
    fields: [supplier, comment],
  },
  {
    id: "claim_support",
    price: null,
    priceNote: { ru: "10% от возвращённой суммы, без предоплаты", en: "10% of the amount recovered, nothing upfront", kk: "Қайтарылған соманың 10%-ы, алдын ала төлемсіз" },
    days: null,
    title: { ru: "Возврат денег от поставщика", en: "Recovering money from a supplier", kk: "Жеткізушіден ақшаны қайтару" },
    short: { ru: "Поставщик не отгрузил товар, сорвал сроки или прислал брак. Ведём претензию и переговоры до возврата денег.", en: "The supplier did not ship, missed the deadline or sent defective goods. We run the claim and the negotiation until the money is back.", kk: "Жеткізуші тауарды жөнелтпеді, мерзімді бұзды немесе ақауы бар тауар жіберді." },
    includes: [
      { ru: "Оценка шансов по вашим документам — бесплатно", en: "Assessment of your chances from the documents — free", kk: "Құжаттарыңыз бойынша мүмкіндікті бағалау — тегін" },
      { ru: "Претензия на китайском и английском языках", en: "A claim letter in Chinese and English", kk: "Қытай және ағылшын тілдеріндегі талап хат" },
      { ru: "Переговоры с поставщиком и жалоба на торговую площадку", en: "Negotiation with the supplier and a complaint to the marketplace", kk: "Жеткізушімен келіссөздер және сауда алаңына шағым" },
      { ru: "Передача дела партнёрскому юристу в Китае, если поставщик не отвечает", en: "Handover to a partner lawyer in China if the supplier does not respond", kk: "Жеткізуші жауап бермесе, істі Қытайдағы серіктес заңгерге беру" },
    ],
    result: { ru: "Вы платите только с возвращённых денег", en: "You pay only out of the money recovered", kk: "Тек қайтарылған ақшадан төлейсіз" },
    fields: [
      supplier,
      { key: "amount", label: { ru: "Сколько вы заплатили и в какой валюте", en: "How much you paid and in what currency", kk: "Қанша және қандай валютада төледіңіз" }, placeholder: { ru: "Например, 12 000 USD", en: "For example, 12,000 USD", kk: "Мысалы, 12 000 USD" }, required: true },
      { key: "comment", label: { ru: "Что произошло", en: "What happened", kk: "Не болды" }, placeholder: { ru: "Когда платили, что обещал поставщик, что он отвечает сейчас", en: "When you paid, what was promised, what the supplier says now", kk: "Қашан төледіңіз, жеткізуші не уәде етті, қазір не дейді" }, required: true, multiline: true },
    ],
  },
  {
    id: "turnkey_import",
    price: null,
    priceNote: { ru: "Расчёт за один рабочий день, от 3% от стоимости партии", en: "A quote within one working day, from 3% of the shipment value", kk: "Бір жұмыс күнінде есептеу, партия құнының 3%-ынан бастап" },
    days: null,
    title: { ru: "Импорт под ключ", en: "Turnkey import", kk: "Толық импорт қызметі" },
    short: { ru: "Одна цена за доставку, таможню, сертификаты и маркировку. Товар приходит на ваш склад с полным пакетом документов.", en: "One price for freight, customs, certificates and marking. The goods arrive at your warehouse with a full set of documents.", kk: "Жеткізу, кеден, сертификаттар және таңбалау үшін бір баға." },
    includes: [
      { ru: "Расчёт полной стоимости до оплаты: перевозка, пошлина, НДС, сертификация", en: "Full landed cost before you pay: freight, duty, VAT, certification", kk: "Төлемге дейін толық құнды есептеу: тасымал, баж, ҚҚС, сертификаттау" },
      { ru: "Перевозка и таможенное оформление через лицензированных партнёров", en: "Freight and customs clearance through licensed partners", kk: "Лицензиясы бар серіктестер арқылы тасымалдау және кедендік рәсімдеу" },
      { ru: "Сертификаты и декларации по техрегламентам ЕАЭС, маркировка", en: "Certificates and declarations under EAEU regulations, marking", kk: "ЕАЭО техрегламенттері бойынша сертификаттар мен декларациялар, таңбалау" },
      { ru: "Таможенная декларация на ваше имя и документы для бухгалтера", en: "A customs declaration in your name and documents for your accountant", kk: "Сіздің атыңызға кедендік декларация және бухгалтерге құжаттар" },
    ],
    result: { ru: "Расчёт и условия — после заявки", en: "Quote and terms after the request", kk: "Есептеу мен шарттар — өтінімнен кейін" },
    fields: [
      { key: "goods", label: { ru: "Что везёте", en: "What you import", kk: "Не әкелесіз" }, placeholder: { ru: "Товар, количество, вес или объём", en: "Goods, quantity, weight or volume", kk: "Тауар, саны, салмағы немесе көлемі" }, required: true, multiline: true },
      { key: "amount", label: { ru: "Стоимость партии", en: "Shipment value", kk: "Партия құны" }, placeholder: { ru: "Например, 20 000 USD", en: "For example, 20,000 USD", kk: "Мысалы, 20 000 USD" }, required: true },
      { key: "route", label: { ru: "Откуда и куда", en: "From and to", kk: "Қайдан және қайда" }, placeholder: { ru: "Гуанчжоу → Алматы", en: "Guangzhou → Almaty", kk: "Гуанчжоу → Алматы" }, required: true },
      comment,
    ],
  },
  {
    id: "safe_payment",
    soon: true,
    price: null,
    priceNote: { ru: "Запускаем с банком-партнёром. Оставьте заявку — сообщим первым", en: "Launching with a partner bank. Leave a request and we will tell you first", kk: "Серіктес банкпен іске қосамыз. Өтінім қалдырыңыз — бірінші хабарлаймыз" },
    days: null,
    title: { ru: "Безопасная оплата поставщику", en: "Safe payment to a supplier", kk: "Жеткізушіге қауіпсіз төлем" },
    short: { ru: "Деньги лежат на счёте в банке и уходят поставщику только после подтверждения отгрузки.", en: "The money stays in a bank account and goes to the supplier only after shipment is confirmed.", kk: "Ақша банк шотында тұрады және жөнелту расталғаннан кейін ғана жеткізушіге кетеді." },
    includes: [
      { ru: "Счёт открывает банк с лицензией, а не Kelisim", en: "The account is opened by a licensed bank, not by Kelisim", kk: "Шотты Kelisim емес, лицензиясы бар банк ашады" },
      { ru: "Поставщик видит, что деньги зарезервированы, и начинает производство", en: "The supplier sees the money is reserved and starts production", kk: "Жеткізуші ақшаның сақталғанын көріп, өндірісті бастайды" },
      { ru: "Оплата после проверки товара перед отгрузкой", en: "Payment after a pre-shipment inspection", kk: "Жөнелту алдындағы тексеруден кейін төлеу" },
    ],
    result: { ru: "Услуга ещё не запущена: собираем заявки", en: "Not launched yet: we are collecting requests", kk: "Қызмет әлі іске қосылған жоқ: өтінімдер жинаймыз" },
    fields: [
      { key: "amount", label: { ru: "Примерная сумма одной оплаты", en: "Approximate amount of one payment", kk: "Бір төлемнің шамамен сомасы" }, placeholder: { ru: "Например, 15 000 USD", en: "For example, 15,000 USD", kk: "Мысалы, 15 000 USD" }, required: true },
      comment,
    ],
  },
];

export const serviceById = (id: string): Service | undefined => SERVICES.find((s) => s.id === id);

export const ORDER_STATUSES: OrderStatus[] = ["new", "awaiting_payment", "payment_reported", "in_progress", "done", "cancelled"];

export const STATUS_LABEL: Record<OrderStatus, L10n> = {
  new: { ru: "Заявка принята", en: "Request received", kk: "Өтінім қабылданды" },
  awaiting_payment: { ru: "Ожидает оплаты", en: "Awaiting payment", kk: "Төлем күтілуде" },
  payment_reported: { ru: "Оплата проверяется", en: "Payment being verified", kk: "Төлем тексерілуде" },
  in_progress: { ru: "В работе", en: "In progress", kk: "Жұмыста" },
  done: { ru: "Готово", en: "Done", kk: "Дайын" },
  cancelled: { ru: "Отменён", en: "Cancelled", kk: "Тоқтатылды" },
};

/** Allowed status changes by the administrator. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  new: ["awaiting_payment", "in_progress", "cancelled"],
  awaiting_payment: ["in_progress", "cancelled"],
  payment_reported: ["in_progress", "awaiting_payment", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: ["new"],
};

/** Status right after the customer places the order. */
export const initialStatus = (s: Service): OrderStatus => (s.price !== null && !s.soon ? "awaiting_payment" : "new");

export function formatTenge(v: number): string {
  return `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;
}

/** Validates the order form; returns cleaned details or the first missing field. */
export function cleanOrderDetails(s: Service, raw: Record<string, unknown>): { ok: true; details: Record<string, string> } | { ok: false; field: string } {
  const details: Record<string, string> = {};
  for (const f of s.fields) {
    const v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim().slice(0, f.multiline ? 3000 : 300) : "";
    if (f.required && v.length < 2) return { ok: false, field: f.key };
    if (v) details[f.key] = v;
  }
  return { ok: true, details };
}
