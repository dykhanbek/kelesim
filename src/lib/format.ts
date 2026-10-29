import { diffDays, todayKz } from "../../shared/dates";
import type { Lang } from "../i18n";

const MONTHS_RU_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "14 октября" / "14 October" */
export function dayMonth(iso: string, lang: Lang): string {
  const [, m, d] = iso.split("-").map(Number);
  return lang === "ru" ? `${d} ${MONTHS_RU_GEN[m - 1]}` : `${d} ${MONTHS_EN[m - 1]}`;
}

export function monthTitle(year: number, month0: number, lang: Lang): string {
  return `${(lang === "ru" ? MONTHS_RU : MONTHS_EN)[month0]} ${year}`;
}

/** 07.10.2026 */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function money(v: number, currency?: string): string {
  const s = Math.round(v * 100) / 100;
  const str = s.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/ /g, " ");
  return currency ? `${str} ${currency}` : str;
}

export function daysLeft(iso: string): number {
  return diffDays(todayKz(), iso);
}

export function initials(name: string, login: string): string {
  const src = (name || login || "K").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
}
