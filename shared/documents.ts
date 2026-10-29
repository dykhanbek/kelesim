// Document generator: turns one deal form into a bilingual document package
// (contract, specification, invoice, packing list).
//
// The generator produces a neutral block model. The frontend renders it as an
// HTML preview (RU / second language / side-by-side) and exports it to DOCX
// (src/lib/docx.ts) or to PDF through the browser's print dialog.

import { countryName } from "./countries";
import { addDays, formatDate } from "./dates";
import { dealTotal, firstPaymentDate, isUcnRequired } from "./compliance";
import type { Company, ContractType, DealInput, GoodsItem } from "./types";

export const TEMPLATE_VERSION = "1.0 · 2026-10";

export type DocKind = "contract" | "specification" | "invoice" | "packing_list";
/** a = Russian, b = second language (Chinese or English). */
export interface Bi {
  a: string;
  b: string;
}

export type DocBlock =
  | { t: "title"; text: Bi }
  | { t: "meta"; text: Bi }
  | { t: "h"; text: Bi }
  | { t: "p"; text: Bi }
  | { t: "table"; head: Bi[]; rows: (string | Bi)[][]; foot?: (string | Bi)[]; align?: ("l" | "r" | "c")[] }
  | { t: "parties"; parties: Party[] };

export interface Party {
  role: Bi;
  name: string;
  lines: Bi[];
}

export interface GeneratedDoc {
  kind: DocKind;
  title: Bi; // short name for the document list
  number: string;
  blocks: DocBlock[];
}

export interface DocContext {
  deal: DealInput;
  number: string; // KLS-024
  company: Company;
  ucn?: string;
}

type Tri = { ru: string; en: string; zh: string };

// ───────────────────────── helpers ─────────────────────────

function pick(ctx: DocContext, t: Tri): Bi {
  return { a: t.ru, b: ctx.deal.lang_pair === "ru-cn" ? t.zh : t.en };
}
const second = (ctx: DocContext): "zh" | "en" => (ctx.deal.lang_pair === "ru-cn" ? "zh" : "en");

export function money(v: number): string {
  const [i, f] = (Math.round(v * 100) / 100).toFixed(2).split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${f}`;
}

function d(ctx: DocContext, iso: string): Bi {
  return { a: formatDate(iso, "ru"), b: formatDate(iso, second(ctx)) };
}

const UNITS: Record<string, Tri> = {
  pcs: { ru: "шт.", en: "pcs", zh: "件" },
  kg: { ru: "кг", en: "kg", zh: "千克" },
  set: { ru: "компл.", en: "set", zh: "套" },
  m: { ru: "м", en: "m", zh: "米" },
  pair: { ru: "пар", en: "pairs", zh: "双" },
  box: { ru: "кор.", en: "boxes", zh: "箱" },
  service: { ru: "усл.", en: "service", zh: "项" },
};
export const UNIT_CODES = Object.keys(UNITS);
export function unitLabel(code: string, lang: "ru" | "en" | "zh"): string {
  return UNITS[code]?.[lang] ?? code;
}

function goodsName(g: GoodsItem): Bi {
  return { a: g.name, b: g.name_alt || g.name };
}

interface Roles {
  buyer: Tri;
  seller: Tri;
  title: Tri;
  /** Russian case forms: buyer genitive / instrumental, seller genitive / dative. */
  bGen: string;
  bIns: string;
  sGen: string;
  sDat: string;
}
const ROLES: Record<ContractType, Roles> = {
  supply: {
    buyer: { ru: "Покупатель", en: "Buyer", zh: "买方" },
    seller: { ru: "Продавец", en: "Seller", zh: "卖方" },
    title: { ru: "ДОГОВОР ПОСТАВКИ", en: "SUPPLY CONTRACT", zh: "供货合同" },
    bGen: "покупателя", bIns: "покупателем", sGen: "продавца", sDat: "продавцу",
  },
  agency: {
    buyer: { ru: "Принципал", en: "Principal", zh: "委托方" },
    seller: { ru: "Агент", en: "Agent", zh: "代理方" },
    title: { ru: "АГЕНТСКИЙ ДОГОВОР", en: "AGENCY AGREEMENT", zh: "代理协议" },
    bGen: "принципала", bIns: "принципалом", sGen: "агента", sDat: "агенту",
  },
  services: {
    buyer: { ru: "Заказчик", en: "Customer", zh: "委托方" },
    seller: { ru: "Исполнитель", en: "Contractor", zh: "服务方" },
    title: { ru: "ДОГОВОР ОКАЗАНИЯ УСЛУГ", en: "SERVICES AGREEMENT", zh: "服务合同" },
    bGen: "заказчика", bIns: "заказчиком", sGen: "исполнителя", sDat: "исполнителю",
  },
};

function buyerName(c: Company): string {
  return c.name_ru || c.name_en || "—";
}
function buyerNameAlt(c: Company): string {
  return c.name_en || c.name_ru || "—";
}
function sellerName(ctx: DocContext): Bi {
  const cp = ctx.deal.counterparty;
  return { a: cp.name, b: second(ctx) === "zh" && cp.name_local ? `${cp.name_local}（${cp.name}）` : cp.name };
}

// ───────────────────────── Contract ─────────────────────────

function contract(ctx: DocContext): GeneratedDoc {
  const { deal, company } = ctx;
  const t = deal.terms;
  const r = ROLES[deal.contract_type];
  const B = r.buyer, S = r.seller;
  const total = money(dealTotal(deal));
  const cur = deal.currency;
  const place = t.incoterm_place;
  const sel = sellerName(ctx);
  const cpCountry = { ru: countryName(deal.counterparty.country, "ru"), en: countryName(deal.counterparty.country, "en"), zh: countryName(deal.counterparty.country, "zh") };
  const dd = d(ctx, t.delivery_date);
  const pd = d(ctx, t.performance_date);
  const ucn = isUcnRequired(dealTotal(deal), deal.currency);
  const secondLangName: Tri = deal.lang_pair === "ru-cn"
    ? { ru: "китайском", en: "Chinese", zh: "中文" }
    : { ru: "английском", en: "English", zh: "英文" };

  const blocks: DocBlock[] = [];
  blocks.push({ t: "title", text: pick(ctx, { ru: `${r.title.ru} № ${ctx.number}`, en: `${r.title.en} No. ${ctx.number}`, zh: `${r.title.zh} 编号：${ctx.number}` }) });
  const city = company.city || "Алматы";
  blocks.push({ t: "meta", text: { a: `г. ${city}, ${formatDate(t.sign_date, "ru")}`, b: second(ctx) === "zh" ? `${city}，${formatDate(t.sign_date, "zh")}` : `${city}, ${formatDate(t.sign_date, "en")}` } });

  const sig = company.signatory || "—";
  const basis = company.signatory_basis || (company.legal_form === "ИП" ? "свидетельства о регистрации" : "Устава");
  blocks.push({
    t: "p",
    text: {
      a: `${buyerName(company)}, в лице ${sig}, действующего на основании ${basis}, ${company.legal_form === "ИП" ? "именуемый" : "именуемое"} в дальнейшем «${B.ru}», с одной стороны, и ${sel.a} (${cpCountry.ru}), именуемая в дальнейшем «${S.ru}», с другой стороны, заключили настоящий договор о нижеследующем.`,
      b: second(ctx) === "zh"
        ? `${buyerNameAlt(company)}（以下简称“${B.zh}”），由${sig}代表，为一方；${sel.b}（${cpCountry.zh}）（以下简称“${S.zh}”），为另一方；双方经协商一致，签订本合同，条款如下：`
        : `${buyerNameAlt(company)}, represented by ${sig}, hereinafter the "${B.en}", on the one part, and ${sel.b} (${cpCountry.en}), hereinafter the "${S.en}", on the other part, have concluded this Contract as follows.`,
    },
  });

  const clause = (n: number, title: Tri, body: Tri) => {
    blocks.push({ t: "h", text: pick(ctx, { ru: `${n}. ${title.ru}`, en: `${n}. ${title.en}`, zh: `${n}. ${title.zh}` }) });
    blocks.push({ t: "p", text: pick(ctx, body) });
  };

  // 1. Subject
  const subject: Record<ContractType, Tri> = {
    supply: {
      ru: `${S.ru} обязуется передать в собственность ${r.bGen} товар, а ${B.ru} — принять и оплатить его. Наименование, количество, цена и ассортимент товара указаны в Спецификации (Приложение № 1), являющейся неотъемлемой частью договора.`,
      en: `The ${S.en} shall transfer the goods into the ownership of the ${B.en}, and the ${B.en} shall accept and pay for them. The name, quantity, price and assortment of the goods are set out in the Specification (Appendix No. 1), which forms an integral part of this Contract.`,
      zh: `${S.zh}应将货物所有权转移给${B.zh}，${B.zh}应接收货物并支付货款。货物的名称、数量、价格及品种详见规格表（附件1），该附件为本合同不可分割的组成部分。`,
    },
    agency: {
      ru: `${S.ru} обязуется по поручению ${r.bGen} за вознаграждение совершать от своего имени, но за счёт ${r.bGen} действия по закупке, проверке и отправке товара, указанного в Спецификации (Приложение № 1).`,
      en: `The ${S.en} undertakes, on the instructions of the ${B.en} and for a fee, to purchase, inspect and ship in its own name but at the ${B.en}'s expense the goods listed in the Specification (Appendix No. 1).`,
      zh: `${S.zh}受${B.zh}委托，以自己的名义、由${B.zh}承担费用，采购、检验并发运规格表（附件1）所列货物，并收取代理报酬。`,
    },
    services: {
      ru: `${S.ru} обязуется оказать услуги, указанные в Спецификации (Приложение № 1), а ${B.ru} — принять и оплатить их.`,
      en: `The ${S.en} shall render the services listed in the Specification (Appendix No. 1), and the ${B.en} shall accept and pay for them.`,
      zh: `${S.zh}应提供规格表（附件1）所列服务，${B.zh}应验收并支付服务费用。`,
    },
  };
  let n = 1;
  clause(n++, { ru: "Предмет договора", en: "Subject of the Contract", zh: "合同标的" }, subject[deal.contract_type]);

  // 2. Price
  clause(n++, { ru: "Цена и общая сумма", en: "Price and total amount", zh: "价格与总金额" },
    deal.contract_type === "services"
      ? {
          ru: `Общая стоимость услуг составляет ${total} ${cur}. Стоимость включает все расходы ${r.sGen}, связанные с оказанием услуг.`,
          en: `The total cost of the services is ${total} ${cur}. It includes all of the ${S.en}'s expenses related to the services.`,
          zh: `服务总费用为 ${total} ${cur}，包括${S.zh}提供服务的全部费用。`,
        }
      : {
          ru: `Общая сумма договора составляет ${total} ${cur}. Цены установлены в ${cur} на условиях ${t.incoterm} ${place} (Инкотермс 2020) и включают стоимость упаковки и маркировки.`,
          en: `The total amount of the Contract is ${total} ${cur}. Prices are set in ${cur} on ${t.incoterm} ${place} terms (Incoterms 2020) and include packaging and marking.`,
          zh: `本合同总金额为 ${total} ${cur}。价格以${cur}计价，按照《2020年国际贸易术语解释通则》${t.incoterm} ${place} 条件确定，包括包装和标记费用。`,
        });

  // 3. Delivery
  clause(n++, deal.contract_type === "services"
    ? { ru: "Сроки оказания услуг", en: "Service period", zh: "服务期限" }
    : { ru: "Условия поставки", en: "Delivery terms", zh: "交货条件" },
    deal.contract_type === "services"
      ? {
          ru: `Услуги оказываются не позднее ${dd.a}. Факт оказания услуг подтверждается актом, подписанным сторонами.`,
          en: `The services shall be rendered no later than ${formatDate(t.delivery_date, "en")}. Completion is confirmed by an acceptance certificate signed by both parties.`,
          zh: `服务应不迟于${formatDate(t.delivery_date, "zh")}完成。服务完成以双方签署的验收单为准。`,
        }
      : {
          ru: `Поставка осуществляется на условиях ${t.incoterm} ${place} (Инкотермс 2020) не позднее ${dd.a}. Датой поставки считается дата передачи товара в соответствии с согласованным базисом поставки.`,
          en: `Delivery is made on ${t.incoterm} ${place} terms (Incoterms 2020) no later than ${formatDate(t.delivery_date, "en")}. The delivery date is the date the goods are handed over in accordance with the agreed Incoterms rule.`,
          zh: `按照${t.incoterm} ${place}（2020年国际贸易术语解释通则）条件交货，交货期限不迟于${formatDate(t.delivery_date, "zh")}。交货日期以按约定贸易术语交付货物之日为准。`,
        });

  // 4. Payment
  const pay: Record<string, Tri> = {
    prepay100: {
      ru: `${B.ru} производит 100% предоплату банковским переводом в течение 5 (пяти) банковских дней с даты подписания договора.`,
      en: `The ${B.en} makes a 100% prepayment by bank transfer within 5 (five) banking days of signing the Contract.`,
      zh: `${B.zh}应在本合同签订之日起5个银行工作日内以电汇方式支付100%预付款。`,
    },
    prepay30: {
      ru: `${B.ru} производит предоплату 30% в течение 5 (пяти) банковских дней с даты подписания договора; оставшиеся 70% — в течение 5 (пяти) банковских дней после уведомления о готовности товара к отгрузке.`,
      en: `The ${B.en} pays 30% in advance within 5 (five) banking days of signing; the remaining 70% within 5 (five) banking days of notice that the goods are ready for shipment.`,
      zh: `${B.zh}应在合同签订之日起5个银行工作日内支付30%预付款，余款70%在接到货物备妥待运通知后5个银行工作日内支付。`,
    },
    postpay: {
      ru: `${B.ru} оплачивает 100% стоимости в течение ${t.postpay_days} дней с даты поставки.`,
      en: `The ${B.en} pays 100% of the price within ${t.postpay_days} days of delivery.`,
      zh: `${B.zh}应在交货之日起${t.postpay_days}日内支付100%款项。`,
    },
  };
  const payCommon: Tri = {
    ru: ` Банковские расходы в стране ${r.bGen} несёт ${B.ru}, за её пределами — ${S.ru}.`,
    en: ` Bank charges in the ${B.en}'s country are borne by the ${B.en}, outside it by the ${S.en}.`,
    zh: `${B.zh}所在国境内的银行费用由${B.zh}承担，境外银行费用由${S.zh}承担。`,
  };
  const p = pay[t.payment];
  clause(n++, { ru: "Условия оплаты", en: "Payment terms", zh: "付款条件" }, { ru: p.ru + payCommon.ru, en: p.en + payCommon.en, zh: p.zh + payCommon.zh });

  if (deal.contract_type !== "services") {
    clause(n++, { ru: "Качество и упаковка", en: "Quality and packaging", zh: "质量与包装" }, {
      ru: "Качество товара должно соответствовать Спецификации и стандартам страны-производителя и подтверждаться сертификатом качества производителя. Упаковка должна обеспечивать сохранность товара при транспортировке.",
      en: "The quality of the goods shall comply with the Specification and the standards of the country of manufacture and be confirmed by the manufacturer's quality certificate. Packaging shall keep the goods safe during transportation.",
      zh: "货物质量应符合规格表及生产国标准，并以生产商的质量证书为证。包装应保证货物在运输过程中完好无损。",
    });
  }
  clause(n++, { ru: "Приёмка", en: "Acceptance", zh: "验收" }, {
    ru: `Приёмка по количеству и качеству производится ${r.bIns} в течение 10 дней после получения. Претензии направляются ${r.sDat} в письменной форме с приложением акта.`,
    en: `The ${B.en} checks quantity and quality within 10 days of receipt. Claims are sent to the ${S.en} in writing with a supporting report.`,
    zh: `${B.zh}应在收货后10日内对数量和质量进行验收。如有异议，应以书面形式并附检验报告向${S.zh}提出。`,
  });

  // Currency control
  const repTri: Tri = t.payment === "postpay"
    ? {
        ru: `Срок исполнения обязательств по договору — не позднее ${pd.a}.`,
        en: `All obligations under the Contract shall be fulfilled no later than ${formatDate(t.performance_date, "en")}.`,
        zh: `合同义务履行期限不迟于${formatDate(t.performance_date, "zh")}。`,
      }
    : {
        ru: `${S.ru} обязуется исполнить обязательства либо вернуть полученную предоплату не позднее ${pd.a} (срок репатриации).`,
        en: `The ${S.en} shall perform its obligations or return the prepayment received no later than ${formatDate(t.performance_date, "en")} (repatriation term).`,
        zh: `${S.zh}应不迟于${formatDate(t.performance_date, "zh")}履行合同义务或退还已收预付款（汇回期限）。`,
      };
  const ucnTri: Tri = ucn
    ? {
        ru: ` ${B.ru} получает учётный номер контракта в обслуживающем банке до начала исполнения обязательств${ctx.ucn ? ` (УНК ${ctx.ucn})` : ""}.`,
        en: ` The ${B.en} obtains a contract registration number (UCN) from its servicing bank before performance begins${ctx.ucn ? ` (UCN ${ctx.ucn})` : ""}.`,
        zh: `${B.zh}应在履行合同义务前，在其服务银行取得合同登记号（UCN）${ctx.ucn ? `（${ctx.ucn}）` : ""}。`,
      }
    : { ru: "", en: "", zh: "" };
  clause(n++, { ru: "Валютный контроль", en: "Currency control", zh: "外汇管制" }, {
    ru: `Договор заключается с соблюдением валютного законодательства Республики Казахстан. ${repTri.ru}${ucnTri.ru}`,
    en: `The Contract is concluded in compliance with the currency legislation of the Republic of Kazakhstan. ${repTri.en}${ucnTri.en}`,
    zh: `本合同依照哈萨克斯坦共和国外汇法律订立。${repTri.zh}${ucnTri.zh}`,
  });

  clause(n++, { ru: "Ответственность сторон", en: "Liability", zh: "违约责任" }, {
    ru: `За просрочку исполнения ${S.ru} уплачивает пеню ${t.penalty_rate}% от стоимости неисполненных обязательств за каждый день просрочки, но не более ${t.penalty_cap}% от суммы договора. За просрочку оплаты ${B.ru} уплачивает пеню в том же размере.`,
    en: `For late performance the ${S.en} pays a penalty of ${t.penalty_rate}% of the value of unfulfilled obligations per day of delay, up to ${t.penalty_cap}% of the Contract amount. The ${B.en} pays the same penalty for late payment.`,
    zh: `${S.zh}延迟履行的，每延迟一日应按未履行部分价值的${t.penalty_rate}%支付违约金，但总额不超过合同金额的${t.penalty_cap}%。${B.zh}延迟付款的，按同等标准支付违约金。`,
  });
  clause(n++, { ru: "Форс-мажор", en: "Force majeure", zh: "不可抗力" }, {
    ru: "Стороны освобождаются от ответственности за неисполнение обязательств, вызванное обстоятельствами непреодолимой силы, при условии письменного уведомления другой стороны в течение 10 дней с момента их наступления.",
    en: "The parties are released from liability for non-performance caused by force majeure, provided the other party is notified in writing within 10 days of its occurrence.",
    zh: "因不可抗力导致未能履行义务的，双方免除责任，但应在不可抗力发生之日起10日内书面通知对方。",
  });
  clause(n++, { ru: "Санкционная оговорка", en: "Sanctions compliance", zh: "制裁合规" }, {
    ru: `${S.ru} заверяет, что он, его бенефициары и обслуживающий банк не включены в санкционные списки ООН, ЕС, Великобритании и США. При выявлении обратного ${B.ru} вправе в одностороннем порядке расторгнуть договор и потребовать возврата уплаченных сумм.`,
    en: `The ${S.en} represents that neither it, its beneficial owners nor its bank are on the UN, EU, UK or US sanctions lists. If the contrary is found, the ${B.en} may terminate the Contract unilaterally and demand a refund of all amounts paid.`,
    zh: `${S.zh}保证其本身、其最终受益人及其开户银行均未被列入联合国、欧盟、英国或美国的制裁名单。如发现情况不符，${B.zh}有权单方解除本合同并要求退还已付全部款项。`,
  });
  const disputes: Record<string, Tri> = {
    aifc: {
      ru: "Споры разрешаются в Международном арбитражном центре МФЦА (г. Астана) в соответствии с его регламентом. Применимое право — право Республики Казахстан.",
      en: "Disputes are settled by the AIFC International Arbitration Centre (Astana) under its rules. The governing law is the law of the Republic of Kazakhstan.",
      zh: "争议应提交阿斯塔纳国际金融中心国际仲裁中心，按照其仲裁规则解决。本合同适用哈萨克斯坦共和国法律。",
    },
    cietac: {
      ru: "Споры разрешаются в Китайской международной экономической и торговой арбитражной комиссии (CIETAC, г. Пекин) в соответствии с её регламентом. Применимое право — право Республики Казахстан.",
      en: "Disputes are settled by the China International Economic and Trade Arbitration Commission (CIETAC, Beijing) under its rules. The governing law is the law of the Republic of Kazakhstan.",
      zh: "争议应提交中国国际经济贸易仲裁委员会（北京），按照其仲裁规则解决。本合同适用哈萨克斯坦共和国法律。",
    },
    kz_court: {
      ru: `Споры рассматриваются специализированным межрайонным экономическим судом по месту нахождения ${r.bGen}. Применимое право — право Республики Казахстан.`,
      en: `Disputes are heard by the specialised inter-district economic court at the ${B.en}'s location. The governing law is the law of the Republic of Kazakhstan.`,
      zh: `争议由${B.zh}所在地的专门跨区经济法院管辖。本合同适用哈萨克斯坦共和国法律。`,
    },
  };
  clause(n++, { ru: "Разрешение споров", en: "Dispute resolution", zh: "争议解决" }, disputes[t.arbitration] ?? disputes.aifc);
  clause(n++, { ru: "Язык договора и заключительные положения", en: "Language and final provisions", zh: "合同语言及其他条款" }, {
    ru: `Договор составлен на русском и ${secondLangName.ru} языках в двух экземплярах, оба текста имеют одинаковую силу. При расхождении приоритет имеет текст на русском языке. Договор вступает в силу с даты подписания и действует до полного исполнения обязательств.`,
    en: `The Contract is made in Russian and ${secondLangName.en} in two copies; both texts are equally authentic. In case of discrepancy the Russian text prevails. The Contract enters into force on signing and remains valid until all obligations are fulfilled.`,
    zh: `本合同以俄文和${secondLangName.zh}书就，一式两份，两种文本具有同等效力。如有歧义，以俄文文本为准。本合同自签订之日起生效，至双方义务全部履行完毕时终止。`,
  });

  blocks.push({ t: "h", text: pick(ctx, { ru: `${n}. Реквизиты и подписи сторон`, en: `${n}. Details and signatures`, zh: `${n}. 双方信息及签字` }) });
  blocks.push({ t: "parties", parties: parties(ctx) });

  return { kind: "contract", title: pick(ctx, { ru: capital(r.title.ru), en: capital(r.title.en), zh: r.title.zh }), number: ctx.number, blocks };
}

function capital(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function parties(ctx: DocContext): Party[] {
  const { company: c, deal } = ctx;
  const r = ROLES[deal.contract_type];
  const cp = deal.counterparty;
  const L = (ru: string, en: string, zh: string, v: string): Bi => ({ a: `${ru}: ${v || "—"}`, b: `${ctx.deal.lang_pair === "ru-cn" ? zh : en}: ${v || "—"}` });
  return [
    {
      role: pick(ctx, r.buyer),
      name: buyerName(c),
      lines: [
        L("БИН", "BIN", "商业识别号", c.bin),
        L("Адрес", "Address", "地址", [c.city, c.address].filter(Boolean).join(", ")),
        L("Банк", "Bank", "开户行", c.bank_name),
        L("БИК", "BIC", "银行识别码", c.bik),
        L("IBAN", "IBAN", "账号", c.iban),
        L("Подписант", "Signatory", "签字人", c.signatory),
      ],
    },
    {
      role: pick(ctx, r.seller),
      name: cp.name_local ? `${cp.name} / ${cp.name_local}` : cp.name,
      lines: [
        { a: `Страна: ${countryName(cp.country, "ru")}`, b: ctx.deal.lang_pair === "ru-cn" ? `国家：${countryName(cp.country, "zh")}` : `Country: ${countryName(cp.country, "en")}` },
        L("Адрес", "Address", "地址", cp.address),
        L("Банковские реквизиты", "Bank details", "银行信息", cp.bank_details),
      ],
    },
  ];
}

// ───────────────────────── Specification ─────────────────────────

function head(ctx: DocContext, cols: Tri[]): Bi[] {
  return cols.map((c) => pick(ctx, c));
}

const COL = {
  n: { ru: "№", en: "No.", zh: "序号" },
  name: { ru: "Наименование", en: "Description", zh: "品名" },
  hs: { ru: "Код ТН ВЭД", en: "HS code", zh: "海关编码" },
  qty: { ru: "Кол-во", en: "Qty", zh: "数量" },
  unit: { ru: "Ед.", en: "Unit", zh: "单位" },
  price: { ru: "Цена", en: "Unit price", zh: "单价" },
  sum: { ru: "Сумма", en: "Amount", zh: "金额" },
  pk: { ru: "Мест", en: "Packages", zh: "件数" },
  net: { ru: "Нетто, кг", en: "Net, kg", zh: "净重(千克)" },
  gross: { ru: "Брутто, кг", en: "Gross, kg", zh: "毛重(千克)" },
};

function unitBi(ctx: DocContext, code: string): Bi {
  return { a: unitLabel(code, "ru"), b: unitLabel(code, second(ctx)) };
}

function specification(ctx: DocContext): GeneratedDoc {
  const { deal } = ctx;
  const t = deal.terms;
  const cur = deal.currency;
  const blocks: DocBlock[] = [
    { t: "title", text: pick(ctx, { ru: "СПЕЦИФИКАЦИЯ № 1", en: "SPECIFICATION No. 1", zh: "规格表 第1号" }) },
    { t: "meta", text: pick(ctx, {
      ru: `к договору № ${ctx.number} от ${formatDate(t.sign_date, "ru")}`,
      en: `to Contract No. ${ctx.number} dated ${formatDate(t.sign_date, "en")}`,
      zh: `合同编号 ${ctx.number}（签订日期：${formatDate(t.sign_date, "zh")}）之附件`,
    }) },
    {
      t: "table",
      head: head(ctx, [COL.n, COL.name, COL.hs, COL.qty, COL.unit, { ...COL.price, ru: `Цена, ${cur}`, en: `Unit price, ${cur}`, zh: `单价(${cur})` }, { ...COL.sum, ru: `Сумма, ${cur}`, en: `Amount, ${cur}`, zh: `金额(${cur})` }]),
      rows: deal.goods.map((g, i) => [String(i + 1), goodsName(g), g.hs_code || "—", String(g.qty), unitBi(ctx, g.unit), money(g.price), money(g.qty * g.price)]),
      foot: ["", pick(ctx, { ru: "Итого", en: "Total", zh: "合计" }), "", "", "", "", money(dealTotal(deal))],
      align: ["c", "l", "c", "r", "c", "r", "r"],
    },
  ];
  if (deal.batch_note) blocks.push({ t: "p", text: { a: `Партия: ${deal.batch_note}`, b: second(ctx) === "zh" ? `批次：${deal.batch_note}` : `Batch: ${deal.batch_note}` } });
  if (deal.contract_type !== "services") {
    blocks.push({ t: "p", text: pick(ctx, {
      ru: `Условия поставки: ${t.incoterm} ${t.incoterm_place} (Инкотермс 2020). Срок поставки: не позднее ${formatDate(t.delivery_date, "ru")}.`,
      en: `Delivery terms: ${t.incoterm} ${t.incoterm_place} (Incoterms 2020). Delivery: no later than ${formatDate(t.delivery_date, "en")}.`,
      zh: `交货条件：${t.incoterm} ${t.incoterm_place}（2020年国际贸易术语解释通则）。交货期限：不迟于${formatDate(t.delivery_date, "zh")}。`,
    }) });
  }
  blocks.push({ t: "parties", parties: parties(ctx).map((p) => ({ ...p, lines: [] })) });
  return { kind: "specification", title: pick(ctx, { ru: "Спецификация", en: "Specification", zh: "规格表" }), number: `${ctx.number}/1`, blocks };
}

// ───────────────────────── Invoice ─────────────────────────

function invoice(ctx: DocContext): GeneratedDoc {
  const { deal } = ctx;
  const t = deal.terms;
  const cur = deal.currency;
  const no = `INV-${ctx.number}`;
  const total = dealTotal(deal);
  const due = t.payment === "postpay" ? firstPaymentDate(deal) : addDays(t.sign_date, 5);
  const payNote: Record<string, Tri> = {
    prepay100: { ru: "100% предоплата", en: "100% prepayment", zh: "100%预付款" },
    prepay30: { ru: "30% предоплата, 70% перед отгрузкой", en: "30% prepayment, 70% before shipment", zh: "30%预付款，70%发货前支付" },
    postpay: { ru: `Оплата в течение ${t.postpay_days} дней после поставки`, en: `Payment within ${t.postpay_days} days after delivery`, zh: `交货后${t.postpay_days}日内付款` },
  };
  const blocks: DocBlock[] = [
    { t: "title", text: pick(ctx, { ru: `ИНВОЙС (СЧЁТ-ФАКТУРА) № ${no}`, en: `COMMERCIAL INVOICE No. ${no}`, zh: `商业发票 编号：${no}` }) },
    { t: "meta", text: pick(ctx, {
      ru: `Дата: ${formatDate(t.sign_date, "ru")} · Договор № ${ctx.number}`,
      en: `Date: ${formatDate(t.sign_date, "en")} · Contract No. ${ctx.number}`,
      zh: `日期：${formatDate(t.sign_date, "zh")} · 合同编号：${ctx.number}`,
    }) },
    { t: "parties", parties: parties(ctx).reverse() },
    {
      t: "table",
      head: head(ctx, [COL.n, COL.name, COL.qty, COL.unit, { ...COL.price, ru: `Цена, ${cur}`, en: `Unit price, ${cur}`, zh: `单价(${cur})` }, { ...COL.sum, ru: `Сумма, ${cur}`, en: `Amount, ${cur}`, zh: `金额(${cur})` }]),
      rows: deal.goods.map((g, i) => [String(i + 1), goodsName(g), String(g.qty), unitBi(ctx, g.unit), money(g.price), money(g.qty * g.price)]),
      foot: ["", pick(ctx, { ru: "Итого к оплате", en: "Total due", zh: "应付总额" }), "", "", "", `${money(total)} ${cur}`],
      align: ["c", "l", "r", "c", "r", "r"],
    },
    { t: "p", text: pick(ctx, {
      ru: `Условия оплаты: ${payNote[t.payment].ru}. Срок оплаты: до ${formatDate(due, "ru")}. Базис поставки: ${t.incoterm} ${t.incoterm_place}.`,
      en: `Payment terms: ${payNote[t.payment].en}. Due date: ${formatDate(due, "en")}. Delivery basis: ${t.incoterm} ${t.incoterm_place}.`,
      zh: `付款条件：${payNote[t.payment].zh}。付款期限：${formatDate(due, "zh")}前。交货条件：${t.incoterm} ${t.incoterm_place}。`,
    }) },
  ];
  return { kind: "invoice", title: pick(ctx, { ru: "Инвойс", en: "Invoice", zh: "商业发票" }), number: no, blocks };
}

// ───────────────────────── Packing list ─────────────────────────

function packingList(ctx: DocContext): GeneratedDoc {
  const { deal } = ctx;
  const no = `PL-${ctx.number}`;
  const sum = (f: (g: GoodsItem) => number) => deal.goods.reduce((s, g) => s + (Number(f(g)) || 0), 0);
  const blocks: DocBlock[] = [
    { t: "title", text: pick(ctx, { ru: `УПАКОВОЧНЫЙ ЛИСТ № ${no}`, en: `PACKING LIST No. ${no}`, zh: `装箱单 编号：${no}` }) },
    { t: "meta", text: pick(ctx, {
      ru: `к инвойсу № INV-${ctx.number} · договор № ${ctx.number}`,
      en: `to Invoice No. INV-${ctx.number} · Contract No. ${ctx.number}`,
      zh: `对应发票 INV-${ctx.number} · 合同编号 ${ctx.number}`,
    }) },
    { t: "parties", parties: parties(ctx).reverse().map((p) => ({ ...p, lines: p.lines.slice(0, 2) })) },
    {
      t: "table",
      head: head(ctx, [COL.n, COL.name, COL.pk, COL.qty, COL.unit, COL.net, COL.gross]),
      rows: deal.goods.map((g, i) => [String(i + 1), goodsName(g), String(g.packages || 0), String(g.qty), unitBi(ctx, g.unit), money(g.net_kg || 0), money(g.gross_kg || 0)]),
      foot: ["", pick(ctx, { ru: "Итого", en: "Total", zh: "合计" }), String(sum((g) => g.packages)), "", "", money(sum((g) => g.net_kg)), money(sum((g) => g.gross_kg))],
      align: ["c", "l", "r", "r", "c", "r", "r"],
    },
    { t: "p", text: pick(ctx, {
      ru: `Маркировка: ${ctx.number} / ${ctx.company.city || "Алматы"}, Казахстан.`,
      en: `Shipping marks: ${ctx.number} / ${ctx.company.city || "Almaty"}, Kazakhstan.`,
      zh: `唛头：${ctx.number} / ${ctx.company.city || "阿拉木图"}，哈萨克斯坦。`,
    }) },
  ];
  return { kind: "packing_list", title: pick(ctx, { ru: "Упаковочный лист", en: "Packing list", zh: "装箱单" }), number: no, blocks };
}

// ───────────────────────── Package ─────────────────────────

export function generatePackage(ctx: DocContext): GeneratedDoc[] {
  const docs = [contract(ctx), specification(ctx), invoice(ctx)];
  if (ctx.deal.contract_type !== "services") docs.push(packingList(ctx));
  return docs;
}
