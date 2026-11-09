// Deal Readiness Score: how ready the deal is to sign, pay and ship — 0..100, higher = safer.
// Transparent by design: five areas with fixed maximum points (25/25/20/15/15); every lost point
// has a reason and an action. A red check caps the score — one number never hides a blocker.
import { hasBeneficiary } from "./kyb";
import { checklistProgress, type ChecklistItem } from "./import-checklist";
import { chplHits, hsDigits } from "./export-control";
import type { ComplianceResult, DealInput, L10n, RiskLevel } from "./types";

type T3 = L10n & { kk: string };
const L = (ru: string, kk: string, en: string): T3 => ({ ru, kk, en });

export type AreaId = "counterparty" | "sanctions" | "contract" | "customs" | "currency";
export interface ScoreReason {
  area: AreaId;
  points: number; // points lost
  text: T3;
  action?: T3;
}
export interface Area {
  id: AreaId;
  title: T3;
  max: number;
  score: number;
}
export interface Readiness {
  score: number;
  level: RiskLevel; // green ≥ 85, yellow 60–84, red < 60 or any blocker
  label: T3;
  areas: Area[];
  reasons: ScoreReason[]; // sorted by points lost
  stages: { id: "sign" | "pay" | "ship"; title: T3; ready: boolean }[];
  computed_at: string;
}

export const AREAS: { id: AreaId; title: T3; max: number }[] = [
  { id: "counterparty", title: L("Надёжность контрагента", "Контрагенттің сенімділігі", "Counterparty reliability"), max: 25 },
  { id: "sanctions", title: L("Санкции и экспортный контроль", "Санкциялар және экспорттық бақылау", "Sanctions and export control"), max: 25 },
  { id: "contract", title: L("Условия договора", "Шарт талаптары", "Contract terms"), max: 20 },
  { id: "customs", title: L("Таможня и сертификация", "Кеден және сертификаттау", "Customs and certification"), max: 15 },
  { id: "currency", title: L("Валютный контроль и платежи", "Валюталық бақылау және төлемдер", "Currency control and payments"), max: 15 },
];

export interface ReadinessInput {
  deal: DealInput;
  check: ComplianceResult | null;
  checklist: ChecklistItem[];
  ucn: string;
  docsGenerated: boolean;
}

export function computeReadiness({ deal, check, checklist, ucn, docsGenerated }: ReadinessInput): Readiness {
  const reasons: ScoreReason[] = [];
  const lose = (area: AreaId, points: number, text: T3, action?: T3) => points > 0 && reasons.push({ area, points, text, action });
  const item = (id: string) => check?.items.find((i) => i.id === id);
  const goods = deal.contract_type !== "services";

  // ── Counterparty (25) ──
  const related = (deal.counterparty.related ?? []).filter((p) => p.name.trim());
  if (!hasBeneficiary(deal.counterparty))
    lose("counterparty", 10, L("Не указан конечный бенефициар поставщика", "Жеткізушінің түпкілікті бенефициары көрсетілмеген", "The supplier's ultimate beneficial owner is not specified"), L("Запросите у поставщика выписку из реестра и структуру владения, внесите владельцев в карточку.", "Жеткізушіден тізілімнен үзінді мен иелік құрылымын сұратып, иелерін карточкаға енгізіңіз.", "Request a registry extract and ownership structure; add the owners to the card."));
  if (!related.some((p) => p.role === "director"))
    lose("counterparty", 3, L("Не указан руководитель поставщика", "Жеткізуші басшысы көрсетілмеген", "The supplier's director is not specified"));
  if (!deal.counterparty.bank_details.trim())
    lose("counterparty", 4, L("Нет банковских реквизитов поставщика", "Жеткізушінің банк деректемелері жоқ", "No supplier bank details"), L("Сверьте реквизиты с официальным письмом поставщика — это защищает от подмены счёта.", "Деректемелерді жеткізушінің ресми хатымен салыстырыңыз — бұл шотты ауыстырудан қорғайды.", "Verify the bank details against an official letter from the supplier — protects against invoice fraud."));
  const own = item("ownership");
  if (own?.status === "yellow") lose("counterparty", 8, L("В структуре владения есть лицо, требующее проверки (PEP или похожее имя)", "Иелік құрылымында тексеруді қажет ететін тұлға бар (PEP немесе ұқсас атау)", "The ownership structure includes a person needing review (PEP or similar name)"));
  if (own?.status === "red") lose("counterparty", 25, own.title as T3, own.action as T3);

  // ── Sanctions & export (25) ──
  const sanc = item("sanctions");
  if (!check) lose("sanctions", 25, L("Проверка ещё не выполнена", "Тексеру әлі орындалмаған", "The check has not been run yet"), L("Запустите проверку сделки.", "Мәміле тексеруін іске қосыңыз.", "Run the deal check."));
  else {
    if (sanc?.status === "red") lose("sanctions", 15, sanc.title as T3, sanc.action as T3);
    else if (sanc?.status === "yellow") lose("sanctions", 7, sanc.title as T3, sanc.action as T3);
    const exp = item("export");
    if (exp?.status === "red") lose("sanctions", 10, exp.title as T3, exp.action as T3);
    else if (exp?.status === "yellow") lose("sanctions", 5, exp.title as T3, exp.action as T3);
    else if (goods && !exp) lose("sanctions", 3, L("Экспортный контроль не проверен — перезапустите проверку", "Экспорттық бақылау тексерілмеген — тексеруді қайта іске қосыңыз", "Export control not checked — re-run the check"));
  }

  // ── Contract terms (20) ──
  if (deal.terms.payment === "prepay100" && !deal.terms.advance_guarantee)
    lose("contract", 10, L("100% предоплата без обеспечения возврата аванса", "Аванс қайтарылуын қамтамасыз етусіз 100% алдын ала төлем", "100% prepayment without security for the advance"), L("Разделите оплату на этапы (например, 30/70) или запросите банковскую гарантию возврата аванса.", "Төлемді кезеңдерге бөліңіз (мысалы, 30/70) немесе аванс қайтарылуына банк кепілдігін сұратыңыз.", "Split the payment (e.g. 30/70) or ask for an advance-payment bank guarantee."));
  else if (deal.terms.payment === "prepay30" && !deal.terms.advance_guarantee)
    lose("contract", 3, L("Аванс 30% без банковской гарантии", "Банк кепілдігінсіз 30% аванс", "30% advance without a bank guarantee"));
  if (!(deal.terms.penalty_rate > 0))
    lose("contract", 4, L("Не установлена неустойка за просрочку поставки", "Жеткізуді кешіктіргені үшін тұрақсыздық айыбы белгіленбеген", "No late-delivery penalty"), L("Добавьте пеню (например, 0,1% в день, не более 10%).", "Өсімпұл қосыңыз (мысалы, күніне 0,1%, 10%-дан аспайтын).", "Add a penalty (e.g. 0.1% per day, capped at 10%)."));
  if (!docsGenerated) lose("contract", 2, L("Пакет документов ещё не сформирован", "Құжаттар пакеті әлі қалыптастырылмаған", "The document package has not been generated yet"));

  // ── Customs & certification (15) ──
  if (goods) {
    const coded = deal.goods.every((g) => hsDigits(g.hs_code).length >= 6);
    if (!coded) lose("customs", 5, L("Не у всех позиций указан код ТН ВЭД (6+ знаков)", "Барлық позицияларда СЭҚ ТН коды (6+ таңба) көрсетілмеген", "Not every item has an HS code (6+ digits)"), L("Уточните коды у поставщика или таможенного представителя — от них зависят сертификаты, маркировка и пошлина.", "Кодтарды жеткізушіден немесе кеден өкілінен нақтылаңыз — сертификаттар, таңбалау және баж соларға байланысты.", "Confirm the codes with the supplier or a customs broker — certificates, marking and duty depend on them."));
    const conf = checklist.filter((i) => i.group === "conformity" || i.group === "marking" || i.group === "permits" || i.group === "export");
    const open = conf.filter((i) => i.status === "check" || i.status === "todo");
    if (conf.length && open.length) {
      const pts = Math.round((10 * open.length) / conf.length);
      lose("customs", pts, L(`Не подтверждены требования к товару: ${open.length} из ${conf.length} (сертификация, маркировка, разрешения)`, `Тауарға қойылатын талаптар расталмаған: ${conf.length}-тің ${open.length} (сертификаттау, таңбалау, рұқсаттар)`, `Product requirements not confirmed: ${open.length} of ${conf.length} (certification, marking, permits)`), L("Откройте чек-лист импорта и отметьте, что выполнено или не требуется.", "Импорт чек-парағын ашып, не орындалғанын немесе қажет емесін белгілеңіз.", "Open the import checklist and mark what is done or not applicable."));
    }
  }

  // ── Currency control (15) ──
  if (check?.ucn_required && !ucn)
    lose("currency", 10, L("Нужен учётный номер контракта, он ещё не получен", "Келісімшарттың есептік нөмірі қажет, ол әлі алынбаған", "A UCN is required and not yet obtained"), L("Подайте договор в банк до первого платежа.", "Шартты алғашқы төлемге дейін банкке тапсырыңыз.", "Submit the contract to the bank before the first payment."));
  const rep = item("repatriation");
  if (rep && rep.status !== "green") lose("currency", 5, rep.title as T3, rep.action as T3);

  // ── Totals ──
  const areas: Area[] = AREAS.map((a) => {
    const lost = reasons.filter((r) => r.area === a.id).reduce((s, r) => s + r.points, 0);
    return { id: a.id, title: a.title, max: a.max, score: Math.max(0, a.max - lost) };
  });
  let score = areas.reduce((s, a) => s + a.score, 0);
  const blocker = check?.overall === "red";
  if (blocker) score = Math.min(score, 40);
  const level: RiskLevel = blocker || score < 60 ? "red" : score < 85 ? "yellow" : "green";
  const label =
    level === "green" ? L("Сделка готова", "Мәміле дайын", "Deal is ready")
      : level === "yellow" ? L("Требует внимания", "Назар аударуды қажет етеді", "Needs attention")
        : blocker ? L("Есть блокирующий риск", "Бұғаттаушы тәуекел бар", "Blocking risk") : L("Не готово к оплате", "Төлеуге дайын емес", "Not ready for payment");

  const noRed = !blocker;
  const conformityOpen = checklistProgress(checklist).open.filter((i) => i.group !== "customs").length;
  const stages = [
    { id: "sign" as const, title: L("Подписание", "Қол қою", "Signing"), ready: noRed && Boolean(check) },
    { id: "pay" as const, title: L("Оплата", "Төлем", "Payment"), ready: noRed && Boolean(check) && !(check?.ucn_required && !ucn) && item("sanctions")?.status === "green" && (item("ownership")?.status ?? "green") === "green" },
    { id: "ship" as const, title: L("Отгрузка и ввоз", "Жөнелту және әкелу", "Shipping and import"), ready: noRed && Boolean(check) && (!goods || conformityOpen === 0) },
  ];

  reasons.sort((a, b) => b.points - a.points);
  return { score, level, label, areas, reasons, stages, computed_at: new Date().toISOString() };
}

export const chplInDeal = (deal: DealInput) => chplHits(deal).length > 0;
