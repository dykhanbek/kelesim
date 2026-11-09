// Company lookup by BIN/IIN in the official statistical business register
// (Bureau of National Statistics, stat.gov.kz). Results are cached in D1 for 30 days;
// if the register is unreachable the demo registry is used, then manual entry.
import type { Company } from "../../shared/types";
import { DEMO_REGISTRY } from "../../shared/sample";
import type { Env } from "../env";

export type RegistryCompany = Pick<Company, "bin" | "legal_form" | "name_ru" | "name_en" | "city" | "address" | "signatory" | "signatory_basis">;
export interface LookupResult {
  found: boolean;
  company: Partial<RegistryCompany>;
  source: "stat.gov.kz" | "demo" | null;
  /** extra facts from the register, shown to the user */
  details?: { registered?: string; activity?: string; director?: string };
}

const ENDPOINTS = [
  (bin: string) => `https://old.stat.gov.kz/api/juridical/counter/api/?bin=${bin}&lang=ru`,
  (bin: string) => `https://stat.gov.kz/api/juridical/counter/api/?bin=${bin}&lang=ru`,
];
const CACHE_DAYS = 30;

const FORMS: [RegExp, Company["legal_form"], string][] = [
  [/^ТОВАРИЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ\s*/i, "ТОО", "ТОО"],
  [/^ТОО\s+/i, "ТОО", "ТОО"],
  [/^АКЦИОНЕРНОЕ ОБЩЕСТВО\s*/i, "АО", "АО"],
  [/^АО\s+/i, "АО", "АО"],
  [/^ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ\s*/i, "ИП", "ИП"],
  [/^ИП\s+/i, "ИП", "ИП"],
];

/** "НУРЛАНОВ ЕРЖАН БОЛАТОВИЧ" → "Нурланов Ержан Болатович" (handles hyphens). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-«"(])([a-zа-яёәғқңөұүһі])/g, (_, p, ch) => p + ch.toUpperCase()).trim();
}

/** City from a KATO address like "Г.АСТАНА, РАЙОН ЕСИЛЬ, ..." or "АЛМАТИНСКАЯ ОБЛАСТЬ, ..., Г.КОНАЕВ, ...". */
export function cityFromAddress(addr: string): string {
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts.find((p) => /^(Г\.|ГОРОД\s)/i.test(p)) ?? parts[0] ?? "";
  return titleCase(city.replace(/^(Г\.\s*|ГОРОД\s+)/i, ""));
}

/** Maps the stat.gov.kz JSON ({ success, obj: { bin, name, registerDate, okedName, katoAddress, fio, ip } }) to our company fields. */
export function parseStatGov(json: unknown): Omit<LookupResult, "source"> | null {
  const j = json as { success?: boolean; obj?: Record<string, unknown> } | null;
  const o = j?.obj;
  if (!j?.success || !o || typeof o.name !== "string" || !o.name.trim()) return null;
  const rawName = o.name.trim().replace(/\s+/g, " ");
  let legal_form: Company["legal_form"] = o.ip === true ? "ИП" : "ТОО";
  let short = "";
  let rest = rawName;
  for (const [re, form, abbr] of FORMS) {
    if (re.test(rawName)) {
      legal_form = form;
      short = abbr;
      rest = rawName.replace(re, "").trim();
      break;
    }
  }
  if (o.ip === true) { legal_form = "ИП"; short = "ИП"; }
  const core = rest.replace(/^[«"“']+|[»"”']+$/g, "").trim();
  const name_ru = core ? `${short || legal_form} «${core}»` : rawName;
  const address = typeof o.katoAddress === "string" ? o.katoAddress.trim() : "";
  const fio = typeof o.fio === "string" ? titleCase(o.fio) : "";
  const isIp = legal_form === "ИП";
  return {
    found: true,
    company: {
      bin: String(o.bin ?? ""),
      legal_form,
      name_ru,
      name_en: "",
      city: address ? cityFromAddress(address) : "",
      address,
      signatory: fio ? (isIp ? fio : `Директор ${fio}`) : "",
      signatory_basis: isIp ? "талона о регистрации ИП" : "Устава",
    },
    details: {
      registered: typeof o.registerDate === "string" ? o.registerDate.slice(0, 10) : undefined,
      activity: typeof o.okedName === "string" ? o.okedName : undefined,
      director: fio || undefined,
    },
  };
}

async function fetchStatGov(bin: string): Promise<Omit<LookupResult, "source"> | "notfound" | null> {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url(bin), { headers: { accept: "application/json", "user-agent": "Kelisim/1.0 (+company lookup)" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const parsed = parseStatGov(await res.json());
      return parsed ?? "notfound";
    } catch {
      /* try the next endpoint */
    }
  }
  return null; // register unreachable
}

export async function lookupCompany(env: Env, bin: string): Promise<LookupResult> {
  // The documented demo BINs (README, video script) always return the fictitious demo companies
  const demo = DEMO_REGISTRY[bin];
  if (demo) return { found: true, company: demo, source: "demo" };
  const db = env.DB;
  const cached = await db
    .prepare("SELECT data, fetched_at FROM registry_cache WHERE bin = ?")
    .bind(bin)
    .first<{ data: string; fetched_at: string }>();
  if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_DAYS * 86_400_000) {
    const data = JSON.parse(cached.data) as Omit<LookupResult, "source"> | null;
    if (data) return { ...data, source: "stat.gov.kz" };
  } else {
    const fresh = await fetchStatGov(bin);
    if (fresh !== null) {
      const data = fresh === "notfound" ? null : fresh;
      await db
        .prepare("INSERT INTO registry_cache (bin, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(bin) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at")
        .bind(bin, JSON.stringify(data), new Date().toISOString())
        .run();
      if (data) return { ...data, source: "stat.gov.kz" };
    }
  }
  return { found: false, company: { bin }, source: null };
}
