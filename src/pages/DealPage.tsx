import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { generatePackage } from "../../shared/documents";
import type { Company } from "../../shared/types";
import { api, HttpError, type Deadline, type DealFull, type ProofFile } from "../api";
import { DeadlineList } from "../components/Deadlines";
import { Field, Loading, RiskBadge, StatusBadge, useUi } from "../components/ui";
import { errText, useT, type TKey } from "../i18n";
import { dayMonth, dmy, money } from "../lib/format";
import { ResultItems, resultCopy } from "./Check";

type Tab = "overview" | "documents" | "check" | "deadlines" | "history";
const TABS: Tab[] = ["overview", "documents", "check", "deadlines", "history"];

interface DealResponse {
  deal: DealFull;
  deadlines: Deadline[];
  events: { id: number; ts: string; kind: string; detail: string }[];
  company: Company;
  files: ProofFile[];
}

export function DealPage() {
  const { t, lang } = useT();
  const { toast, confirm } = useUi();
  const { id } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.includes(sp.get("tab") as Tab) ? sp.get("tab") : "overview") as Tab;
  const [r, setR] = useState<DealResponse | null>(null);
  const [ucn, setUcn] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get<DealResponse>(`/deals/${id}`).then(setR).catch(() => nav("/app/deals", { replace: true }));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const docs = useMemo(() => (r ? generatePackage({ deal: r.deal.data, number: r.deal.number, company: r.company ?? ({} as Company), ucn: r.deal.ucn }) : []), [r]);
  if (!r) return <Loading />;
  const { deal, deadlines, events } = r;
  const open = deadlines.filter((d) => !d.done_at);
  const needsUcn = deal.check?.ucn_required && !deal.ucn && deal.status !== "draft";
  const lpLabel = deal.data.lang_pair === "ru-cn" ? "RU/CN" : "RU/EN";

  const saveUcn = async () => {
    setBusy(true);
    try {
      await api.post(`/deals/${id}/ucn`, { ucn });
      toast(t("deal.ucnSaved", { ucn }));
      setUcn("");
      await load();
    } catch (e) {
      toast(errText(t, e instanceof HttpError ? "required" : ""), "err");
    } finally {
      setBusy(false);
    }
  };
  const recheck = async () => {
    await api.post(`/deals/${id}/recheck`);
    toast(t("common.saved"));
    await load();
  };

  const evText = (e: DealResponse["events"][number]) => {
    const d = e.kind === "checked" ? t(`risk.${e.detail}` as TKey) : e.kind === "deadline_done" ? e.detail.replace(/^(\w+)/, (k) => t(`kind.${k}` as TKey)) : e.detail;
    const key = `deal.ev.${e.kind}` as TKey;
    return t(key, { d });
  };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / <Link to="/app/deals">{t("nav.deals")}</Link></div>
      <div className="page-head">
        <div>
          <h1>{deal.counterparty_name || deal.number}</h1>
          <p className="sub">{deal.number} · {money(deal.amount, deal.currency)} · {t(`ctype.${deal.contract_type}` as TKey)} · {lpLabel}{deal.ucn ? ` · УНК ${deal.ucn}` : ""}</p>
          <div className="row mt-16">
            <RiskBadge risk={deal.risk} ucn={needsUcn} />
            <StatusBadge status={deal.status} />
          </div>
        </div>
        <div className="row">
          {(deal.status === "draft" || deal.status === "checked") && (
            <button className="btn btn-secondary" onClick={async () => {
              if (!(await confirm({ title: t("deal.deleteDraftQ"), text: t("deal.deleteDraftT"), ok: t("common.delete"), danger: true }))) return;
              await api.del(`/deals/${id}`);
              toast(t("deal.deleted"));
              nav("/app/deals");
            }}>{t("deal.deleteDraft")}</button>
          )}
          <Link to={`/app/deals/new?from=${deal.id}`} className="btn btn-primary btn-wide">{t("deal.similar")}</Link>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setSp({ tab: k }, { replace: true })}>{t(`deal.tab.${k}` as TKey)}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="two-col">
          <div className="card">
            <h2 className="mb-16">{t("deal.next")}</h2>
            {deal.status === "draft" ? (
              <>
                <p className="result-text mb-24">{t("deal.draftT")}</p>
                <Link className="btn btn-primary btn-wide" to={`/app/deals/${id}/edit`}>{t("deal.continue")}</Link>
              </>
            ) : deal.status === "checked" ? (
              <>
                <p className="result-text mb-24">{deal.risk === "red" ? resultCopy(deal.check!, lang, t).text : t("deal.checkedT")}</p>
                <Link className="btn btn-primary btn-wide" to={deal.risk === "red" ? `/app/deals/${id}/edit?step=2` : `/app/deals/${id}/documents`}>{deal.risk === "red" ? t("chk.editData") : t("deal.toPackage")}</Link>
              </>
            ) : needsUcn ? (
              <>
                <p className="result-text mb-24">{t("deal.ucnT")}</p>
                <Field label={t("deal.ucnField")} help="hint.ucn">
                  <input className="input" value={ucn} onChange={(e) => setUcn(e.target.value)} placeholder={t("deal.ucnPh")} />
                </Field>
                <button className="btn btn-primary btn-wide" onClick={saveUcn} disabled={busy || ucn.trim().length < 4}>{t("deal.ucnSave")}</button>
              </>
            ) : open.length ? (
              <>
                <p className="result-text mb-24">{t("deal.nextDeadline", { kind: t(`kind.${open[0].kind}` as TKey).toLowerCase(), date: dayMonth(open[0].due_date, lang) })}</p>
                <button className="btn btn-primary btn-wide" onClick={() => setSp({ tab: "deadlines" })}>{t("deal.tab.deadlines")} →</button>
              </>
            ) : (
              <p className="result-text">{t("deal.allDone")}</p>
            )}
          </div>
          <div className="card card-mint">
            <h2 className="mb-16">{t("deal.upcoming")}</h2>
            {open.length === 0 ? <p>{t("deal.noDeadlines")}</p> : open.slice(0, 4).map((d) => (
              <p key={d.id} className="mb-16" style={{ fontSize: 17 }}>{dayMonth(d.due_date, lang)} · {t(`kind.${d.kind}` as TKey).toLowerCase()}</p>
            ))}
            <Link to="/app/calendar" className="btn btn-secondary mt-16">{t("deal.openCal")}</Link>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="card">
          {deal.status === "draft" ? <p className="muted">{t("deal.draftT")}</p> : (
            <>
              <table className="table responsive">
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.kind}>
                      <td><b style={{ fontWeight: 500 }}>{lang === "ru" ? d.title.a : d.title.b}</b></td>
                      <td className="muted">{d.number}</td>
                      <td className="muted">{lpLabel}</td>
                      <td className="muted small">{deal.docs_generated_at ? dmy(deal.docs_generated_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {deal.risk !== "red" && <Link to={`/app/deals/${id}/documents`} className="btn btn-primary mt-24">{t("deal.openDocs")}</Link>}
            </>
          )}
        </div>
      )}

      {tab === "check" && (
        <div className="card">
          {deal.check ? (
            <>
              <RiskBadge risk={deal.check.overall} ucn={deal.check.ucn_required && !deal.ucn} />
              <h2 className="mt-16">{resultCopy(deal.check, lang, t).head}</h2>
              <ResultItems items={deal.check.items} dealId={deal.id} dealStatus={deal.status} ucn={deal.ucn} onChanged={load} />
              <div className="row">
                <button className="btn btn-secondary" onClick={recheck}>{t("deal.recheck")}</button>
                <span className="small muted">{t("chk.checkedAt", { date: dmy(deal.check.checked_at), v: deal.check.rules_version })} · {t("chk.demoList", { v: deal.check.lists_version ?? "—" })}</span>
              </div>
            </>
          ) : <p className="muted">{t("deal.draftT")}</p>}
        </div>
      )}

      {tab === "deadlines" && (
        <div className="card">
          {deal.status === "closed" && <div className="alert alert-ok">{t("deal.closed")}</div>}
          {deadlines.length === 0 ? <p className="muted">{t("deal.noDeadlines")}</p> : <DeadlineList items={deadlines.map((d) => ({ ...d, counterparty_name: deal.counterparty_name }))} files={r.files} onChange={load} />}
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}><span className="muted small">{e.ts.replace("T", " ").slice(0, 16)}</span><span>{evText(e)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
