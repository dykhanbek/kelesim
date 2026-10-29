import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { todayKz } from "../../shared/dates";
import { api, type Deadline, type DealSummary } from "../api";
import { DeadlineActions, DeadlineBadge } from "../components/Deadlines";
import { Loading } from "../components/ui";
import { useT, type TKey } from "../i18n";
import { dayMonth, daysLeft, dmy, money, monthTitle } from "../lib/format";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

function chipClass(d: Deadline) {
  if (d.done_at) return "chip-done";
  if (daysLeft(d.due_date) < 0) return "chip-overdue";
  return `chip-${d.kind}`;
}

export function CalendarPage() {
  const { t, lang } = useT();
  const [sp, setSp] = useSearchParams();
  const today = todayKz();
  const initial = sp.get("date") ?? today;
  const [ym, setYm] = useState(() => ({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 }));
  const [sel, setSel] = useState<string | null>(sp.get("date"));
  const [view, setView] = useState<"month" | "list">("month");
  const [deal, setDeal] = useState("");
  const [items, setItems] = useState<Deadline[] | null>(null);
  const [deals, setDeals] = useState<DealSummary[]>([]);

  const load = () => api.get<{ items: Deadline[] }>(`/deadlines${deal ? `?deal=${deal}` : ""}`).then((r) => setItems(r.items));
  useEffect(() => { void load(); }, [deal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get<{ items: DealSummary[] }>("/deals").then((r) => setDeals(r.items.filter((d) => d.status !== "draft"))); }, []);

  // Default selection: the nearest open deadline in view
  useEffect(() => {
    if (!items || sel) return;
    const firstOpen = items.find((d) => !d.done_at);
    if (firstOpen) setSel(firstOpen.due_date);
  }, [items, sel]);

  const byDay = useMemo(() => {
    const m = new Map<string, Deadline[]>();
    for (const d of items ?? []) m.set(d.due_date, [...(m.get(d.due_date) ?? []), d]);
    return m;
  }, [items]);

  if (!items) return <Loading />;

  const first = new Date(Date.UTC(ym.y, ym.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const daysIn = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const selItems = sel ? byDay.get(sel) ?? [] : [];
  const overdueSel = selItems.find((d) => !d.done_at && daysLeft(d.due_date) < 0);
  const pick = (date: string) => { setSel(date); setSp({ date }, { replace: true }); };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.calendar")}</div>
      <h1 className="mb-16">{overdueSel ? t("cal.overdueH") : t("cal.title")}</h1>

      {overdueSel && (
        <div className="card card-risk mb-24" style={{ boxShadow: "none", padding: "24px 24px 28px" }}>
          <b className="small">! {t("deal.overdueBy", { n: -daysLeft(overdueSel.due_date) })}</b>
          <h2 className="mt-16" style={{ fontSize: 28, lineHeight: "36px" }}>{t("cal.confirmH")}</h2>
          <p className="mt-8" style={{ fontSize: 18 }}>{t(`kind.${overdueSel.kind}` as TKey)} · {overdueSel.counterparty_name} · {dmy(overdueSel.due_date)}<br />{t("cal.overdueT")}</p>
        </div>
      )}

      <div className="row mb-16 cal-toolbar" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <h2 style={{ minWidth: 160 }}>{monthTitle(ym.y, ym.m, lang)}</h2>
          <button className="icon-btn" style={{ background: "none" }} onClick={() => shift(-1)} aria-label="Prev"><ChevronLeft /></button>
          <button className="icon-btn" style={{ background: "none" }} onClick={() => shift(1)} aria-label="Next"><ChevronRight /></button>
          <button className="btn btn-ghost" onClick={() => { setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); pick(today); }}>{t("cal.today")}</button>
        </div>
        <div className="row">
          <select className="select" style={{ height: 36, width: "auto", fontSize: 14 }} value={deal} onChange={(e) => setDeal(e.target.value)} aria-label={t("cal.allDeals")}>
            <option value="">{t("cal.allDeals")}</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.number} · {d.counterparty_name}</option>)}
          </select>
          <div className="mode-switch" style={{ marginBottom: 0 }}>
            <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>{t("cal.month")}</button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>{t("cal.list")}</button>
          </div>
        </div>
      </div>

      <div className="cal-wrap">
        <div className="card">
          {view === "month" ? (
            <>
              <div className="cal-grid">
                {t("cal.dow").split(",").map((d) => <div className="dow" key={d}>{d}</div>)}
                {cells.map((n, i) => {
                  if (!n) return <div key={i} className="cal-cell empty" />;
                  const date = iso(ym.y, ym.m, n);
                  const ds = byDay.get(date) ?? [];
                  return (
                    <button key={i} className={`cal-cell ${sel === date ? "sel" : ""}`} onClick={() => pick(date)} aria-label={date}>
                      <span className="n">{n}</span>
                      {date === today && <span className="cal-chip chip-today">{t("cal.today")}</span>}
                      {ds.map((d) => <span key={d.id} className={`cal-chip ${chipClass(d)}`} title={`${t(`kind.${d.kind}` as TKey)} · ${d.counterparty_name}`}>{t(`kind.${d.kind}` as TKey)}</span>)}
                    </button>
                  );
                })}
              </div>
              <div className="legend">
                <span><i style={{ background: "var(--mint-50)", border: "1px solid var(--mint)" }} />{t("kind.repatriation")}</span>
                <span><i style={{ background: "var(--warn-50)", border: "1px solid var(--warn)" }} />{t("kind.ucn")}</span>
                <span><i style={{ background: "var(--indigo-50)", border: "1px solid var(--indigo)" }} />{t("kind.payment")}</span>
                <span><i style={{ background: "var(--blue-50)", border: "1px solid var(--blue)" }} />{t("kind.delivery")}</span>
                <span><i style={{ background: "var(--risk-50)", border: "1px solid var(--risk)" }} />{t("deal.overdueBy", { n: "N" })}</span>
                <span><i style={{ background: "var(--muted-bg)", border: "1px solid var(--text-2)" }} />{t("cal.done")}</span>
              </div>
            </>
          ) : items.length === 0 ? <p className="muted">{t("cal.empty")}</p> : (
            <table className="table responsive">
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => { pick(d.due_date); setYm({ y: Number(d.due_date.slice(0, 4)), m: Number(d.due_date.slice(5, 7)) - 1 }); }}>
                    <td className="m-inline" style={{ fontWeight: 600, width: 130 }}>{dayMonth(d.due_date, lang)}</td>
                    <td className="m-inline">{t(`kind.${d.kind}` as TKey)}</td>
                    <td className="muted">{d.counterparty_name} · {d.deal_number}</td>
                    <td><DeadlineBadge d={d} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          {!sel ? <p className="muted">{t("cal.pick")}</p> : (
            <>
              <h2>{dayMonth(sel, lang)}</h2>
              {selItems.length === 0 && <p className="muted mt-16">{t("cal.none")}</p>}
              {selItems.map((d) => (
                <div key={d.id} className="mt-16" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 16 }}>
                  <DeadlineBadge d={d} />
                  <div className="mt-16" style={{ fontSize: 17, lineHeight: "28px" }}>
                    <div>{t(`kind.${d.kind}` as TKey)}</div>
                    <div className="muted">{d.counterparty_name}</div>
                    <div className="muted">{d.deal_number}</div>
                    <div className="muted">{money(d.amount ?? 0, d.currency)}</div>
                    {(d.files_count ?? 0) > 0 && <div className="small mt-8"><Link to={`/app/deals/${d.deal_id}?tab=deadlines`}>📎 {d.files_count}</Link></div>}
                  </div>
                  <div className="mt-16" style={{ display: "grid", gap: 10 }}>
                    <DeadlineActions d={d} onChange={load} compact />
                    <Link className="btn btn-secondary btn-block" to={`/app/deals/${d.deal_id}?tab=deadlines`}>{t("cal.openDeal")}</Link>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
