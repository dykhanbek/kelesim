// Claim letter (претензия) to the supplier: non-delivery, delay, defects or shortage.
// Built from the deal, so the contract number, the parties and the amounts are already right.
// Output uses the same block model as the document package (preview, DOCX, PDF).
import { countryName } from "./countries";
import { dealTotal } from "./compliance";
import { addDays, formatDate, todayKz } from "./dates";
import { money, type Bi, type DocBlock, type DocContext, type GeneratedDoc } from "./documents";

export type ClaimKind = "non_delivery" | "delay" | "defect" | "shortage";
export type ClaimDemand = "refund" | "deliver" | "replace" | "discount";

export interface ClaimInput {
  kind: ClaimKind;
  demand: ClaimDemand;
  /** amount already paid to the supplier, in the deal currency */
  paid: number;
  /** amount claimed (refund / price reduction); defaults to `paid` */
  claimed?: number;
  /** days given to the supplier to comply */
  response_days: number;
  /** free text: what exactly happened (Russian) and the same for the supplier (English / Chinese) */
  facts: string;
  facts_alt: string;
  date?: string;
}

export const CLAIM_KINDS: ClaimKind[] = ["non_delivery", "delay", "defect", "shortage"];
export const CLAIM_DEMANDS: Record<ClaimKind, ClaimDemand[]> = {
  non_delivery: ["refund", "deliver"],
  delay: ["deliver", "refund"],
  defect: ["replace", "refund", "discount"],
  shortage: ["deliver", "refund", "discount"],
};

type Tri = { ru: string; en: string; zh: string };

export function generateClaim(ctx: DocContext, input: ClaimInput): GeneratedDoc {
  const { deal, company } = ctx;
  const zh = deal.lang_pair === "ru-cn";
  const pick = (t: Tri): Bi => ({ a: t.ru, b: zh ? t.zh : t.en });
  const L = zh ? "zh" : "en";
  const today = input.date ?? todayKz();
  const due = addDays(today, Math.max(1, input.response_days));
  const cur = deal.currency;
  const total = money(dealTotal(deal));
  const paid = money(input.paid);
  const claimed = money(input.claimed ?? input.paid);
  const cp = deal.counterparty;
  const seller = zh && cp.name_local ? `${cp.name_local}（${cp.name}）` : cp.name;
  const buyerRu = company.name_ru || company.name_en || "—";
  const buyerAlt = company.name_en || company.name_ru || "—";
  const signRu = formatDate(deal.terms.sign_date, "ru");
  const signAlt = formatDate(deal.terms.sign_date, L);
  const delRu = formatDate(deal.terms.delivery_date, "ru");
  const delAlt = formatDate(deal.terms.delivery_date, L);
  const penalty = deal.terms.penalty_rate > 0;

  const VIOLATION: Record<ClaimKind, Tri> = {
    non_delivery: {
      ru: `Покупатель перечислил Продавцу ${paid} ${cur}. По Договору товар должен быть отгружен не позднее ${delRu}. На дату настоящей претензии товар не отгружен, документы об отгрузке Покупателю не переданы.`,
      en: `The Buyer has paid the Seller ${cur} ${paid}. Under the Contract the goods were to be shipped no later than ${delAlt}. As of the date of this claim the goods have not been shipped and no shipping documents have been provided to the Buyer.`,
      zh: `买方已向卖方支付${paid}${cur}。根据合同，货物应不迟于${delAlt}发运。截至本函出具之日，货物尚未发运，卖方亦未向买方提供任何装运单据。`,
    },
    delay: {
      ru: `По Договору товар должен быть отгружен не позднее ${delRu}. Срок нарушен: на дату настоящей претензии обязательство по поставке не исполнено. Покупатель оплатил ${paid} ${cur}.`,
      en: `Under the Contract the goods were to be shipped no later than ${delAlt}. This deadline has been missed: as of the date of this claim the delivery obligation has not been performed. The Buyer has paid ${cur} ${paid}.`,
      zh: `根据合同，货物应不迟于${delAlt}发运。卖方已逾期：截至本函出具之日，交货义务仍未履行。买方已支付${paid}${cur}。`,
    },
    defect: {
      ru: `Покупатель оплатил ${paid} ${cur} и получил товар. При приёмке установлено, что товар не соответствует условиям Договора, спецификации и согласованному образцу.`,
      en: `The Buyer has paid ${cur} ${paid} and received the goods. On acceptance it was established that the goods do not conform to the Contract, the specification and the approved sample.`,
      zh: `买方已支付${paid}${cur}并已收到货物。验收时发现货物不符合合同、规格书及确认样品的要求。`,
    },
    shortage: {
      ru: `Покупатель оплатил ${paid} ${cur} и получил товар. При приёмке установлена недостача по сравнению с количеством, указанным в Договоре, инвойсе и упаковочном листе.`,
      en: `The Buyer has paid ${cur} ${paid} and received the goods. On acceptance a shortage was found against the quantity stated in the Contract, the invoice and the packing list.`,
      zh: `买方已支付${paid}${cur}并已收到货物。验收时发现实际数量少于合同、发票及装箱单所列数量。`,
    },
  };
  const DEMAND: Record<ClaimDemand, Tri> = {
    refund: {
      ru: `вернуть Покупателю ${claimed} ${cur} на счёт, с которого поступила оплата`,
      en: `refund ${cur} ${claimed} to the Buyer, to the account from which the payment was made`,
      zh: `将${claimed}${cur}退还至买方原付款账户`,
    },
    deliver: {
      ru: "отгрузить товар в полном объёме и передать Покупателю документы об отгрузке",
      en: "ship the goods in full and provide the Buyer with the shipping documents",
      zh: "全部发运货物并向买方提供装运单据",
    },
    replace: {
      ru: "за свой счёт заменить товар ненадлежащего качества на товар, соответствующий Договору",
      en: "replace the non-conforming goods with goods that conform to the Contract, at the Seller's expense",
      zh: "由卖方承担费用，将不合格货物更换为符合合同要求的货物",
    },
    discount: {
      ru: `уменьшить цену товара и вернуть Покупателю ${claimed} ${cur}`,
      en: `reduce the price of the goods and refund ${cur} ${claimed} to the Buyer`,
      zh: `降低货物价格并向买方退还${claimed}${cur}`,
    },
  };
  const TITLE: Record<ClaimKind, Tri> = {
    non_delivery: { ru: "о непоставке товара и возврате предоплаты", en: "for non-delivery of the goods and refund of the advance payment", zh: "关于未交货及退还预付款" },
    delay: { ru: "о нарушении срока поставки", en: "for late delivery", zh: "关于逾期交货" },
    defect: { ru: "о поставке товара ненадлежащего качества", en: "for non-conforming goods", zh: "关于货物质量不符" },
    shortage: { ru: "о недостаче товара", en: "for short delivery", zh: "关于货物短少" },
  };

  const blocks: DocBlock[] = [];
  blocks.push({ t: "title", text: pick({ ru: `ПРЕТЕНЗИЯ ${TITLE[input.kind].ru}`, en: `CLAIM ${TITLE[input.kind].en}`, zh: `索赔函：${TITLE[input.kind].zh}` }) });
  const city = company.city || "Алматы";
  blocks.push({ t: "meta", text: { a: `г. ${city}, ${formatDate(today, "ru")}`, b: zh ? `${city}，${formatDate(today, "zh")}` : `${city}, ${formatDate(today, "en")}` } });
  blocks.push({
    t: "p",
    text: {
      a: `Кому: ${cp.name}${cp.name_local ? ` / ${cp.name_local}` : ""}, ${countryName(cp.country, "ru")}${cp.address ? `, ${cp.address}` : ""}`,
      b: zh ? `致：${seller}，${countryName(cp.country, "zh")}${cp.address ? `，${cp.address}` : ""}` : `To: ${cp.name}, ${countryName(cp.country, "en")}${cp.address ? `, ${cp.address}` : ""}`,
    },
  });
  blocks.push({
    t: "p",
    text: {
      a: `От кого: ${buyerRu}, Республика Казахстан${company.address ? `, ${[company.city, company.address].filter(Boolean).join(", ")}` : ""}`,
      b: zh ? `发函人：${buyerAlt}，哈萨克斯坦共和国` : `From: ${buyerAlt}, Republic of Kazakhstan`,
    },
  });

  blocks.push({ t: "h", text: pick({ ru: "1. Основание", en: "1. Background", zh: "一、事实依据" }) });
  blocks.push({
    t: "p",
    text: pick({
      ru: `Между сторонами заключён договор № ${ctx.number} от ${signRu} (далее — Договор) на сумму ${total} ${cur}, условия поставки ${deal.terms.incoterm} ${deal.terms.incoterm_place}.`,
      en: `The parties concluded Contract No. ${ctx.number} dated ${signAlt} (the "Contract") for ${cur} ${total}, delivery terms ${deal.terms.incoterm} ${deal.terms.incoterm_place}.`,
      zh: `双方于${signAlt}签订了编号为${ctx.number}的合同（以下简称“合同”），合同金额为${total}${cur}，交货条件为${deal.terms.incoterm} ${deal.terms.incoterm_place}。`,
    }),
  });
  blocks.push({ t: "p", text: pick(VIOLATION[input.kind]) });
  if (input.facts.trim() || input.facts_alt.trim()) blocks.push({ t: "p", text: { a: input.facts.trim() || input.facts_alt.trim(), b: input.facts_alt.trim() || input.facts.trim() } });

  blocks.push({ t: "h", text: pick({ ru: "2. Требование", en: "2. Demand", zh: "二、要求" }) });
  blocks.push({
    t: "p",
    text: pick({
      ru: `На основании Договора Покупатель требует в срок до ${formatDate(due, "ru")} (${input.response_days} календарных дней с даты настоящей претензии): ${DEMAND[input.demand].ru}.`,
      en: `Under the Contract the Buyer demands that the Seller, by ${formatDate(due, "en")} (${input.response_days} calendar days from the date of this claim): ${DEMAND[input.demand].en}.`,
      zh: `依据合同，买方要求卖方于${formatDate(due, "zh")}之前（自本函出具之日起${input.response_days}个日历日内）：${DEMAND[input.demand].zh}。`,
    }),
  });
  if (penalty && (input.kind === "non_delivery" || input.kind === "delay")) {
    blocks.push({
      t: "p",
      text: pick({
        ru: `Кроме того, Покупатель требует уплатить неустойку за просрочку поставки, предусмотренную Договором: ${deal.terms.penalty_rate}% от стоимости непоставленного товара за каждый день просрочки, но не более ${deal.terms.penalty_cap}%.`,
        en: `In addition, the Buyer demands the contractual penalty for late delivery: ${deal.terms.penalty_rate}% of the value of the undelivered goods per day of delay, up to ${deal.terms.penalty_cap}%.`,
        zh: `此外，买方要求卖方按合同约定支付逾期交货违约金：每逾期一日按未交付货物金额的${deal.terms.penalty_rate}%计算，最高不超过${deal.terms.penalty_cap}%。`,
      }),
    });
  }

  blocks.push({ t: "h", text: pick({ ru: "3. Последствия", en: "3. Consequences", zh: "三、后果" }) });
  blocks.push({
    t: "p",
    text: pick({
      ru: "Если требование не будет исполнено в указанный срок, Покупатель обратится за разрешением спора в порядке, предусмотренном Договором, и потребует возмещения убытков, неустойки и расходов на юристов. Покупатель также оставляет за собой право сообщить о нарушении торговой площадке, банку Продавца и компетентным органам.",
      en: "If the demand is not met within this period, the Buyer will refer the dispute for resolution as provided in the Contract and will claim damages, penalties and legal costs. The Buyer also reserves the right to report the breach to the trading platform, the Seller's bank and the competent authorities.",
      zh: "如卖方未在上述期限内履行，买方将按合同约定的方式提请解决争议，并要求赔偿损失、支付违约金及律师费用。买方同时保留向交易平台、卖方开户银行及主管机关反映该违约行为的权利。",
    }),
  });
  blocks.push({
    t: "p",
    text: pick({
      ru: "Просим направить письменный ответ на настоящую претензию по электронной почте. Приложения: копия Договора, документы об оплате, переписка сторон.",
      en: "Please reply to this claim in writing by email. Attachments: a copy of the Contract, proof of payment, correspondence between the parties.",
      zh: "请以电子邮件书面答复本函。附件：合同复印件、付款凭证、双方往来函件。",
    }),
  });
  blocks.push({
    t: "p",
    text: {
      a: `${buyerRu}\n${company.signatory || "—"}\n\nПодпись: ______________`,
      b: zh ? `${buyerAlt}\n${company.signatory || "—"}\n\n签字：______________` : `${buyerAlt}\n${company.signatory || "—"}\n\nSignature: ______________`,
    },
  });

  return { kind: "claim", title: pick({ ru: "Претензия", en: "Claim letter", zh: "索赔函" }), number: `${ctx.number}-CL`, blocks };
}
