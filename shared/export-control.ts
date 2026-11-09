// Export-control / diversion screening of the goods and their route.
// Source: Common High Priority Items List (CHPL), BIS / EU / UK / Japan, version of 23 Feb 2024 —
// 50 HS codes of items found in Russian weapons; banks screen trade in them for diversion to Russia.
// Not a classification of dual-use goods: that needs the technical specs (flagged as "needs classification").
import type { CheckItem, DealInput } from "./types";

export const CHPL_VERSION = "CHPL 23.02.2024";

export const CHPL: { code: string; tier: string; desc: string }[] = [
  // Tier 1 — integrated circuits
  { code: "854231", tier: "1", desc: "processors and controllers" },
  { code: "854232", tier: "1", desc: "memory ICs" },
  { code: "854233", tier: "1", desc: "amplifier ICs" },
  { code: "854239", tier: "1", desc: "other ICs" },
  // Tier 2
  { code: "851762", tier: "2", desc: "data transmission / switching equipment" },
  { code: "852691", tier: "2", desc: "radio navigational aid apparatus" },
  { code: "853221", tier: "2", desc: "tantalum capacitors" },
  { code: "853224", tier: "2", desc: "multilayer ceramic capacitors" },
  { code: "854800", tier: "2", desc: "electrical parts of machinery n.e.s." },
  // Tier 3.A
  ...["847150", "850440", "851769", "852589", "852910", "852990", "853669", "853690", "854110", "854121", "854129", "854130", "854149", "854151", "854159", "854160"].map((code) => ({ code, tier: "3.A", desc: "electronic components" })),
  // Tier 3.B
  ...["848210", "848220", "848230", "848250"].map((code) => ({ code, tier: "3.B", desc: "bearings" })),
  { code: "880730", tier: "3.B", desc: "parts of aircraft / UAVs" },
  ...["901310", "901380", "901420", "901480"].map((code) => ({ code, tier: "3.B", desc: "optics / navigation instruments" })),
  // Tier 4.A
  ...["847180", "848610", "848620", "848640", "853400", "854320", "902750", "903020", "903032", "903039", "903082"].map((code) => ({ code, tier: "4.A", desc: "electronics manufacturing & test equipment" })),
  // Tier 4.B
  ...["845710", "845811", "845891", "845961", "846693"].map((code) => ({ code, tier: "4.B", desc: "CNC machine tools" })),
];

/** Countries where diversion of high-priority goods is a known concern. */
export const DIVERSION_DESTINATIONS = ["RU", "BY"];
/** Comprehensive embargoes. */
export const EMBARGO = ["IR", "KP", "SY", "CU"];
/** HS chapters with many dual-use / controlled items — classification by technical specs is needed. */
const CONTROLLED_CHAPTERS = ["84", "85", "88", "90", "93"];

export const hsDigits = (code: string) => (code || "").replace(/\D/g, "");

export function chplHits(deal: Pick<DealInput, "goods">) {
  return deal.goods
    .map((g) => ({ g, d: hsDigits(g.hs_code) }))
    .filter(({ d }) => d.length >= 6)
    .flatMap(({ g, d }) => CHPL.filter((c) => d.startsWith(c.code)).map((c) => ({ good: g.name, hs: g.hs_code, ...c })));
}

/** Goods in chapters 84/85/88/90/93 that are not on the CHPL still need a technical classification. */
export function needsClassification(deal: Pick<DealInput, "goods">): string[] {
  return deal.goods.filter((g) => CONTROLLED_CHAPTERS.includes(hsDigits(g.hs_code).slice(0, 2))).map((g) => g.name);
}

export function routeCountries(deal: Pick<DealInput, "route" | "counterparty">): string[] {
  const r = deal.route;
  return [...new Set([r?.origin, ...(r?.transit ?? []), r?.end_user_country].filter((c): c is string => Boolean(c)).map((c) => c.toUpperCase()))];
}

export function exportItem(deal: DealInput): CheckItem | null {
  if (deal.contract_type === "services") return null;
  const hits = chplHits(deal);
  const countries = routeCountries(deal);
  const embargo = countries.filter((c) => EMBARGO.includes(c));
  const diversion = countries.filter((c) => DIVERSION_DESTINATIONS.includes(c));
  const endUser = (deal.route?.end_user_country || "KZ").toUpperCase();
  const reexport = Boolean(deal.route?.reexport);
  const codes = [...new Set(hits.map((h) => `${h.hs} (Tier ${h.tier})`))].join(", ");
  const noHs = deal.goods.some((g) => hsDigits(g.hs_code).length < 6);
  const meta = { chpl: hits, countries, version: CHPL_VERSION };

  if (embargo.length) {
    return {
      id: "export", status: "red",
      title: { ru: "Маршрут через страну под эмбарго", kk: "Эмбарго астындағы ел арқылы бағыт", en: "Route through an embargoed country" },
      text: { ru: `В маршруте указана страна под всеобъемлющими санкциями (${embargo.join(", ")}). Банки не проводят такие платежи.`, kk: `Бағытта жан-жақты санкциялар астындағы ел көрсетілген (${embargo.join(", ")}). Банктер мұндай төлемдерді өткізбейді.`, en: `The route includes a country under comprehensive sanctions (${embargo.join(", ")}). Banks do not process such payments.` },
      action: { ru: "Измените маршрут или откажитесь от сделки.", kk: "Бағытты өзгертіңіз немесе мәміледен бас тартыңыз.", en: "Change the route or decline the deal." },
      meta,
    };
  }
  if (hits.length && (diversion.length || (reexport && !deal.route?.end_user_name))) {
    return {
      id: "export", status: "red",
      title: { ru: "Высокий риск реэкспорта товаров приоритетного контроля", kk: "Басым бақылаудағы тауарларды реэкспорттау тәуекелі жоғары", en: "High diversion risk for high-priority goods" },
      text: {
        ru: `Товар входит в перечень CHPL (${codes}), а в маршруте или у конечного получателя — ${diversion.length ? diversion.join(", ") : "реэкспорт без указанного получателя"}. Такие поставки ЕС, США и Великобритания считают обходом санкций; банк откажет в платеже, участникам грозят вторичные санкции.`,
        kk: `Тауар CHPL тізіміне кіреді (${codes}), ал бағытта немесе түпкі алушыда — ${diversion.length ? diversion.join(", ") : "алушысы көрсетілмеген реэкспорт"}. ЕО, АҚШ және Ұлыбритания мұндай жеткізілімдерді санкцияларды айналып өту деп санайды; банк төлемнен бас тартады, қатысушыларға қосалқы санкциялар қаупі бар.`,
        en: `The goods are on the CHPL (${codes}) and the route or end user involves ${diversion.length ? diversion.join(", ") : "re-export without a named end user"}. The EU, US and UK treat such supplies as sanctions circumvention; the bank will refuse the payment and parties risk secondary sanctions.`,
      },
      action: { ru: "Не продолжайте без консультации с банком и юристом по санкциям.", kk: "Банкпен және санкциялар жөніндегі заңгермен кеңеспей жалғастырмаңыз.", en: "Do not proceed without consulting the bank and a sanctions lawyer." },
      meta,
    };
  }
  if (hits.length) {
    return {
      id: "export", status: "yellow",
      title: { ru: "Товар из перечня приоритетного контроля (CHPL)", kk: "Басым бақылау тізіміндегі тауар (CHPL)", en: "Goods on the Common High Priority List" },
      text: {
        ru: `Коды ${codes} входят в CHPL. Сам ввоз в Казахстан не запрещён, но банк запросит подтверждение конечного использования, а поставщик — гарантию, что товар не уйдёт в Россию или Беларусь.`,
        kk: `${codes} кодтары CHPL тізіміне кіреді. Қазақстанға әкелудің өзіне тыйым жоқ, бірақ банк түпкі пайдалануды растауды, ал жеткізуші тауардың Ресейге немесе Беларуське кетпейтініне кепілдік сұрайды.`,
        en: `Codes ${codes} are on the CHPL. Import into Kazakhstan is not prohibited, but the bank will ask for end-use confirmation and the supplier for a no-re-export-to-Russia/Belarus undertaking.`,
      },
      action: { ru: "Подготовьте заявление о конечном использовании (end-use statement) и включите в договор запрет реэкспорта.", kk: "Түпкі пайдалану туралы өтінішті (end-use statement) дайындап, шартқа реэкспортқа тыйым енгізіңіз.", en: "Prepare an end-use statement and add a no-re-export clause to the contract." },
      meta,
    };
  }
  if (diversion.length || (reexport && endUser !== "KZ")) {
    return {
      id: "export", status: "yellow",
      title: { ru: "Маршрут требует внимания банка", kk: "Бағыт банктің назарын қажет етеді", en: "The route will draw the bank's attention" },
      text: {
        ru: `В маршруте или у конечного получателя: ${(diversion.length ? diversion : [endUser]).join(", ")}. Банк проверит товар на ограничения ЕС/США и может запросить документы о конечном использовании.`,
        kk: `Бағытта немесе түпкі алушыда: ${(diversion.length ? diversion : [endUser]).join(", ")}. Банк тауарды ЕО/АҚШ шектеулеріне тексереді және түпкі пайдалану туралы құжаттарды сұрауы мүмкін.`,
        en: `Route or end user: ${(diversion.length ? diversion : [endUser]).join(", ")}. The bank will check the goods against EU/US restrictions and may ask for end-use documents.`,
      },
      action: { ru: "Укажите коды ТН ВЭД всех позиций и подготовьте документы о конечном получателе.", kk: "Барлық позициялардың СЭҚ ТН кодтарын көрсетіп, түпкі алушы туралы құжаттарды дайындаңыз.", en: "Enter HS codes for all items and prepare end-user documents." },
      meta,
    };
  }
  return {
    id: "export", status: "green",
    title: { ru: "Сигналов экспортного контроля нет", kk: "Экспорттық бақылау белгілері жоқ", en: "No export-control signals" },
    text: noHs
      ? { ru: "Маршрут без рисков. Для позиций без 6-значного кода ТН ВЭД проверка по перечню CHPL не выполнена.", kk: "Бағыт тәуекелсіз. 6 таңбалы СЭҚ ТН коды жоқ позициялар CHPL тізімі бойынша тексерілмеді.", en: "The route shows no risk. Items without a 6-digit HS code were not checked against the CHPL." }
      : { ru: "Товар не входит в перечень CHPL, маршрут без рисков.", kk: "Тауар CHPL тізіміне кірмейді, бағыт тәуекелсіз.", en: "The goods are not on the CHPL and the route shows no risk." },
    meta,
  };
}
