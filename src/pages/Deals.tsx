import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { addDays, diffDays, todayKz } from "../../shared/dates";
import { emptyDeal } from "../../shared/sample";
import type { DealInput } from "../../shared/types";
import { api, HttpError, type Counterparty, type DealFull, type DealSummary } from "../api";
import { Loading, RiskBadge, StatusBadge, useUi } from "../components/ui";
import { errText, useT, type TKey } from "../i18n";
import { dmy, money } from "../lib/format";

export function DealsList() {
  const { t } = useT();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState<DealSummary[] | null>(null);
  const [cps, setCps] = useState<Counterparty[]>([]);
  const status = sp.get("status") ?? "";
  const risk = sp.get("risk") ?? "";
  const cp = sp.get("counterparty") ?? "";

  useEffect(() => {
    api.get<{ items: Counterparty[] }>("/counterparties").then((r) => setCps(r.items));
  }, []);
  useEffect(() => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (risk) q.set("risk", risk);
    if (cp) q.set("counterparty", cp);
    api.get<{ items: DealSummary[] }>(`/deals?${q}`).then((r) => setItems(r.items));
  }, [status, risk, cp]);

  const setFilter = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    setSp(n, { replace: true });
  };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.deals")}</div>
      <div className="page-head">
        <h1>{t("deals.title")}</h1>
        <Link to="/app/deals/new" className="btn btn-primary btn-wide">{t("dash.newDeal")}</Link>
      </div>
      <div className="filters">
        <select className="select" value={status} onChange={(e) => setFilter("status", e.target.value)} aria-label={t("deals.status")}>
          <option value="">{t("deals.status")}: {t("common.all")}</option>
          {["draft", "checked", "active", "closed"].map((s) => <option key={s} value={s}>{t(`status.${s}` as TKey)}</option>)}
        </select>
        <select className="select" value={risk} onChange={(e) => setFilter("risk", e.target.value)} aria-label={t("deals.risk")}>
          <option value="">{t("deals.risk")}: {t("common.all")}</option>
          {["green", "yellow", "red"].map((s) => <option key={s} value={s}>{t(`risk.${s}` as TKey)}</option>)}
        </select>
        <select className="select" value={cp} onChange={(e) => setFilter("counterparty", e.target.value)} aria-label={t("deals.cp")}>
          <option value="">{t("deals.cp")}: {t("common.all")}</option>
          {cps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="card">
        {!items ? <Loading variant="inline" /> : items.length === 0 ? <p className="muted">{t("deals.empty")}</p> : (
          <table className="table responsive">
            <thead><tr><th>{t("dash.colCp")}</th><th>{t("deals.number")}</th><th>{t("dash.colSum")}</th><th>{t("dash.colCheck")}</th><th>{t("dash.colStage")}</th><th>{t("deals.created")}</th></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} className="clickable" onClick={() => nav(x.status === "draft" ? `/app/deals/${x.id}/edit` : `/app/deals/${x.id}`)}>
                  <td><b style={{ fontWeight: 600 }}>{x.counterparty_name || "—"}</b><span className="muted small m-block mobile-only">{x.number} · {dmy(x.created_at)}</span></td>
                  <td className="hide-mobile">{x.number}</td>
                  <td className="m-num">{money(x.amount, x.currency)}</td>
                  <td className="m-inline"><RiskBadge risk={x.risk} /></td>
                  <td className="m-inline"><StatusBadge status={x.status} /></td>
                  <td className="muted small hide-mobile">{dmy(x.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/** "Create similar": same parties and goods, dates shifted to today keeping the same durations. */
function similarFrom(src: DealInput): DealInput {
  const today = todayKz();
  const t = src.terms;
  const toDelivery = Math.max(1, diffDays(t.sign_date, t.delivery_date));
  const toPerformance = Math.max(toDelivery, diffDays(t.sign_date, t.performance_date));
  return {
    ...src,
    terms: { ...t, sign_date: today, delivery_date: addDays(today, toDelivery), performance_date: addDays(today, toPerformance) },
  };
}

/** Creates a draft (or hits the Free plan limit → pricing screen) and opens the wizard. */
export function NewDeal() {
  const { t } = useT();
  const { toast } = useUi();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const from = sp.get("from");
        let data = emptyDeal();
        if (from) data = similarFrom((await api.get<{ deal: DealFull }>(`/deals/${from}`)).deal.data);
        const r = await api.post<{ id: string }>("/deals", { data, source: from ? "similar" : "" });
        nav(`/app/deals/${r.id}/edit?step=${from ? 3 : 1}`, { replace: true });
      } catch (e) {
        if (e instanceof HttpError && e.code === "plan_limit") nav("/app/limit", { replace: true });
        else { toast(errText(t, e instanceof HttpError ? e.code : ""), "err"); nav("/app", { replace: true }); }
      }
    })();
  }, [nav, sp, t, toast]);
  return <Loading />;
}
