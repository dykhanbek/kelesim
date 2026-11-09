// KYB-lite: screens the counterparty's ownership chain and director entered by the user
// (parent companies → ultimate beneficial owner) against sanctions lists (OFAC, EU, UK, UN)
// and politically-exposed-person (PEP) data. A sanctioned owner makes the deal red even
// when the supplier itself is not listed; a PEP is not a prohibition but needs enhanced checks.
import { MATCH_THRESHOLD, nameSimilarity, normalizeName, POSSIBLE_MATCH_THRESHOLD } from "./compliance";
import type { SanctionsEntry } from "./sanctions-data";
import type { CheckItem, CounterpartyInput, L10n, RelatedParty, RiskLevel } from "./types";

export interface PartyHit {
  party: RelatedParty;
  list: string;
  entry: string;
  program: string;
  score: number;
  status: RiskLevel;
  pep: boolean;
}

/** Person names: order-insensitive ("Li Wei" = "Wei Li"); otherwise the usual similarity. */
export function personSimilarity(a: string, b: string): number {
  const ta = normalizeName(a).sort().join(" ");
  const tb = normalizeName(b).sort().join(" ");
  if (!ta || !tb) return 0;
  if (ta === tb) return 1;
  return nameSimilarity(ta, tb);
}

export function screenParty(p: RelatedParty, orgs: SanctionsEntry[], persons: SanctionsEntry[]): PartyHit[] {
  const hits: PartyHit[] = [];
  const country = (p.country || "").toUpperCase();
  if (p.kind === "company") {
    for (const e of orgs) {
      const score = Math.max(...[e.name, ...e.aliases].map((n) => nameSimilarity(p.name, n)));
      if (score >= POSSIBLE_MATCH_THRESHOLD) hits.push({ party: p, list: e.list, entry: e.name, program: e.program, score, status: score >= MATCH_THRESHOLD ? "red" : "yellow", pep: false });
    }
  } else {
    for (const e of persons) {
      const score = Math.max(...[e.name, ...e.aliases].map((n) => personSimilarity(p.name, n)));
      if (score < 0.9) continue;
      const pep = e.list === "PEP";
      // Same name is not proof for people (namesakes): red only for an exact name AND matching country.
      const sameCountry = !country || !e.country || e.country.split(";").includes(country);
      const status: RiskLevel = pep ? "yellow" : score === 1 && sameCountry ? "red" : "yellow";
      hits.push({ party: p, list: e.list, entry: e.name, program: e.program, score, status, pep });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function screenRelated(cp: Pick<CounterpartyInput, "related">, orgs: SanctionsEntry[], persons: SanctionsEntry[]): PartyHit[] {
  return (cp.related ?? []).filter((p) => p.name.trim()).flatMap((p) => screenParty(p, orgs, persons));
}

const ROLE: Record<RelatedParty["role"], L10n & { kk: string }> = {
  parent: { ru: "материнская компания", kk: "бас компания", en: "parent company" },
  owner: { ru: "владелец", kk: "иесі", en: "owner" },
  beneficiary: { ru: "конечный бенефициар", kk: "түпкілікті бенефициар", en: "ultimate beneficial owner" },
  director: { ru: "руководитель", kk: "басшы", en: "director" },
};

/** "Supplier → Parent Ltd → John Doe" (ownership order as entered; director is not part of the chain). */
export function ownershipChain(cpName: string, related: RelatedParty[] = []): string {
  const chain = related.filter((p) => p.role !== "director" && p.name.trim()).map((p) => p.name.trim());
  return [cpName, ...chain].join(" → ");
}

export const hasBeneficiary = (cp: Pick<CounterpartyInput, "related">) =>
  (cp.related ?? []).some((p) => p.role === "beneficiary" && p.kind === "person" && p.name.trim());

/** Check item for the ownership chain; null when the user entered no related parties. */
export function ownershipItem(cp: CounterpartyInput, hits: PartyHit[]): CheckItem | null {
  const related = (cp.related ?? []).filter((p) => p.name.trim());
  if (!related.length) return null;
  const chain = ownershipChain(cp.name, related);
  const red = hits.find((h) => h.status === "red");
  const pep = hits.find((h) => h.pep);
  const maybe = hits.find((h) => h.status === "yellow" && !h.pep);
  const meta = { hits: hits.map((h) => ({ name: h.party.name, role: h.party.role, list: h.list, entry: h.entry, score: h.score, status: h.status, pep: h.pep })), chain };
  if (red) {
    const r = ROLE[red.party.role];
    return {
      id: "ownership",
      status: "red",
      title: { ru: "Санкционный риск в цепочке владения", kk: "Иелік тізбегінде санкциялық тәуекел", en: "Sanctions risk in the ownership chain" },
      text: {
        ru: `${chain}. ${capital(r.ru)} «${red.party.name}» совпадает с записью списка ${red.list} (${red.entry}). Компания, принадлежащая лицу под санкциями, обычно тоже считается подсанкционной (правило 50% OFAC/ЕС) — банк, скорее всего, заблокирует платёж.`,
        kk: `${chain}. ${capital(r.kk)} «${red.party.name}» ${red.list} тізіміндегі жазбаға сәйкес келеді (${red.entry}). Санкциядағы тұлғаға тиесілі компания әдетте де санкциялық деп саналады (OFAC/ЕО 50% ережесі) — банк төлемді бұғаттауы ықтимал.`,
        en: `${chain}. The ${r.en} "${red.party.name}" matches a ${red.list} entry (${red.entry}). A company owned by a sanctioned party is usually treated as sanctioned too (OFAC/EU 50% rule) — the bank will most likely block the payment.`,
      },
      action: { ru: "Не платите до проверки: запросите у поставщика выписку из реестра и структуру владения.", kk: "Тексергенге дейін төлемеңіз: жеткізушіден тізілімнен үзінді мен иелік құрылымын сұратыңыз.", en: "Do not pay before verification: request a registry extract and ownership structure from the supplier." },
      meta,
    };
  }
  if (pep || maybe) {
    const h = (pep ?? maybe)!;
    const r = ROLE[h.party.role];
    return {
      id: "ownership",
      status: "yellow",
      title: pep
        ? { ru: "В структуре есть политически значимое лицо", kk: "Құрылымда саяси маңызды тұлға бар", en: "A politically exposed person in the structure" }
        : { ru: "Возможное совпадение в цепочке владения", kk: "Иелік тізбегінде ықтимал сәйкестік", en: "Possible match in the ownership chain" },
      text: pep
        ? {
            ru: `${chain}. ${capital(r.ru)} «${h.party.name}» похож на запись базы PEP (${h.entry}, ${h.program}). Это не запрет, но банк проведёт углублённую проверку.`,
            kk: `${chain}. ${capital(r.kk)} «${h.party.name}» PEP базасындағы жазбаға ұқсас (${h.entry}, ${h.program}). Бұл тыйым емес, бірақ банк тереңдетілген тексеру жүргізеді.`,
            en: `${chain}. The ${r.en} "${h.party.name}" resembles a PEP record (${h.entry}, ${h.program}). Not a prohibition, but the bank will apply enhanced due diligence.`,
          }
        : {
            ru: `${chain}. ${capital(r.ru)} «${h.party.name}» похож на запись списка ${h.list} (${h.entry}, ${Math.round(h.score * 100)}%). Возможно, это однофамилец или другая компания.`,
            kk: `${chain}. ${capital(r.kk)} «${h.party.name}» ${h.list} тізіміндегі жазбаға ұқсас (${h.entry}, ${Math.round(h.score * 100)}%). Бұл аттас тұлға немесе басқа компания болуы мүмкін.`,
            en: `${chain}. The ${r.en} "${h.party.name}" resembles a ${h.list} entry (${h.entry}, ${Math.round(h.score * 100)}%). It may be a namesake or a different company.`,
          },
      action: { ru: "Запросите паспортные данные / дату рождения владельца и выписку из реестра поставщика.", kk: "Иесінің төлқұжат деректерін / туған күнін және жеткізуші тізілімінен үзінді сұратыңыз.", en: "Request the owner's ID details / date of birth and a registry extract of the supplier." },
      meta,
    };
  }
  return {
    id: "ownership",
    status: "green",
    title: { ru: "Владельцы и руководитель проверены", kk: "Иелері мен басшысы тексерілді", en: "Owners and director screened" },
    text: {
      ru: `${chain}. Совпадений в санкционных списках и базе PEP не найдено.`,
      kk: `${chain}. Санкциялық тізімдер мен PEP базасында сәйкестік табылмады.`,
      en: `${chain}. No matches on sanctions lists or in the PEP data.`,
    },
    meta,
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
