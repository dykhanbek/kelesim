// Deal Readiness: score 0–100 by five areas, reasons, stages, import checklist and the
// KYB / route editors for a saved deal.
import { Check, ChevronDown, ChevronUp, CircleDashed, MinusCircle, ShieldCheck, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CHPL_VERSION } from "../../shared/export-control";
import { buildChecklist, type ChecklistItem } from "../../shared/import-checklist";
import { chplInDeal, computeReadiness, type Readiness } from "../../shared/readiness";
import type { DealInput } from "../../shared/types";
import { api, HttpError, type DealFull } from "../api";
import { errText, loc, useT, type TKey } from "../i18n";
import { dmy } from "../lib/format";
import { EMPTY_ROUTE, RelatedEditor, RouteEditor } from "./RiskEditors";
import { useUi } from "./ui";

type DealWithChecklist = DealFull & { checklist?: Record<string, "done" | "na"> };

export function useReadiness(deal: DealWithChecklist) {
  return useMemo(() => {
    const checklist = buildChecklist(deal.data, {
      docsGenerated: Boolean(deal.docs_generated_at),
      ucnRequired: Boolean(deal.check?.ucn_required),
      ucn: deal.ucn,
      chplHit: chplInDeal(deal.data),
      manual: deal.checklist ?? {},
    });
    const readiness = computeReadiness({ deal: deal.data, check: deal.check, checklist, ucn: deal.ucn, docsGenerated: Boolean(deal.docs_generated_at) });
    return { checklist, readiness };
  }, [deal]);
}

/** Ring with the score. */
export function ScoreRing({ r, size = 120 }: { r: Readiness; size?: number }) {
  const stroke = 10;
  const rad = (size - stroke) / 2;
  const len = 2 * Math.PI * rad;
  const color = r.level === "green" ? "var(--mint-strong)" : r.level === "yellow" ? "var(--warn)" : "var(--risk-strong)";
  return (
    <svg className="score-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${r.score}/100`}>
      <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(len * r.score) / 100} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="score-arc" />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="score-num">{r.score}</text>
      <text x="50%" y="68%" textAnchor="middle" className="score-of">/ 100</text>
    </svg>
  );
}

/** Compact card for the check result and the deal overview. */
export function ReadinessMini({ deal, to }: { deal: DealWithChecklist; to: string }) {
  const { t, lang } = useT();
  const { readiness: r } = useReadiness(deal);
  return (
    <div className={`card readiness-mini lvl-${r.level}`}>
      <ScoreRing r={r} size={84} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="caps">{t("rd.title")}</div>
        <h3>{loc(r.label, lang)}</h3>
        {r.reasons[0] && <p className="small muted">{loc(r.reasons[0].text, lang)}{r.reasons.length > 1 ? ` · ${t("rd.more", { n: r.reasons.length - 1 })}` : ""}</p>}
      </div>
      <Link className="btn btn-secondary btn-sm" to={to}>{t("rd.open")}</Link>
    </div>
  );
}

export function ReadinessPanel({ deal, onChanged }: { deal: DealWithChecklist; onChanged: () => Promise<unknown> | void }) {
  const { t, lang } = useT();
  const { toast } = useUi();
  const { checklist, readiness: r } = useReadiness(deal);
  const [kybOpen, setKybOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [draft, setDraft] = useState<DealInput>(deal.data);
  const [busy, setBusy] = useState(false);
  const goods = deal.data.contract_type !== "services";

  const setItem = async (item: ChecklistItem, status: "done" | "na" | null) => {
    try {
      await api.put(`/deals/${deal.id}/checklist`, { item: item.id, status });
      await onChanged();
    } catch (e) {
      toast(errText(t, e instanceof HttpError ? e.code : ""), "err");
    }
  };
  const saveAndRecheck = async (patch: Partial<DealInput>) => {
    setBusy(true);
    try {
      const data = { ...deal.data, ...patch, counterparty: { ...deal.data.counterparty, ...(patch.counterparty ?? {}) } };
      await api.put(`/deals/${deal.id}`, { data });
      await api.post(`/deals/${deal.id}/recheck`);
      await onChanged();
      toast(t("rd.rechecked"));
    } catch (e) {
      toast(errText(t, e instanceof HttpError ? e.code : ""), "err");
    } finally {
      setBusy(false);
    }
  };

  const groups: { id: ChecklistItem["group"]; key: TKey }[] = [
    { id: "docs", key: "cl.g.docs" },
    { id: "conformity", key: "cl.g.conformity" },
    { id: "marking", key: "cl.g.marking" },
    { id: "permits", key: "cl.g.permits" },
    { id: "export", key: "cl.g.export" },
    { id: "customs", key: "cl.g.customs" },
  ];

  return (
    <>
      <div className={`card readiness-card lvl-${r.level}`}>
        <div className="readiness-head">
          <ScoreRing r={r} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="caps">{t("rd.score")}</div>
            <h2>{loc(r.label, lang)}</h2>
            <div className="stages">
              {r.stages.map((s) => (
                <span key={s.id} className={`stage ${s.ready ? "ok" : ""}`}>{s.ready ? <Check size={14} /> : <CircleDashed size={14} />}{loc(s.title, lang)}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="areas">
          {r.areas.map((a) => (
            <div className="area" key={a.id}>
              <div className="row" style={{ justifyContent: "space-between" }}><span>{loc(a.title, lang)}</span><b>{a.score}/{a.max}</b></div>
              <div className="bar"><span style={{ width: `${(a.score / a.max) * 100}%` }} className={a.score === a.max ? "full" : a.score < a.max / 2 ? "low" : ""} /></div>
            </div>
          ))}
        </div>
        {r.reasons.length > 0 && (
          <>
            <h3 className="mt-24 mb-8">{t("rd.why")}</h3>
            <ul className="reasons">
              {r.reasons.map((x, i) => (
                <li key={i}>
                  <span className="pts">−{x.points}</span>
                  <div>
                    <div>{loc(x.text, lang)}</div>
                    {x.action && <div className="small muted">→ {loc(x.action, lang)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="small muted mt-16">{t("rd.disclaimer", { date: deal.check ? dmy(deal.check.checked_at) : "—", chpl: CHPL_VERSION })}</p>
      </div>

      <div className="card mt-24">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>{t("cl.title")}</h2>
            <p className="muted mt-8">{t("cl.sub")}</p>
          </div>
        </div>
        {groups.map((g) => {
          const items = checklist.filter((i) => i.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="cl-group">
              <div className="caps mt-24 mb-8">{t(g.key)}</div>
              {items.map((i) => (
                <div className={`cl-item st-${i.status}`} key={i.id}>
                  <span className="cl-ico">{i.status === "done" ? <Check size={16} /> : i.status === "na" ? <MinusCircle size={16} /> : <CircleDashed size={16} />}</span>
                  <div className="cl-body">
                    <div className="cl-title">{loc(i.title, lang)}</div>
                    {i.why && <div className="small muted">{loc(i.why, lang)}</div>}
                    {i.source && <div className="small muted">{t("cl.source")}: {i.source}</div>}
                  </div>
                  <span className={`cl-status st-${i.status}`}>{t(`cl.st.${i.status}` as TKey)}</span>
                  {i.manual && (
                    <div className="cl-actions">
                      {i.status === "done" || i.status === "na" ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setItem(i, null)} aria-label={t("deal.undo")}><Undo2 size={14} /></button>
                      ) : (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => setItem(i, "done")}>{t("cl.done")}</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setItem(i, "na")}>{t("cl.na")}</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="card mt-24">
        <button className="details-toggle" style={{ marginBottom: 0 }} onClick={() => setKybOpen((o) => !o)}>
          {kybOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}<ShieldCheck size={16} />{t("kyb.title")}
        </button>
        {kybOpen && (
          <div className="mt-16">
            <p className="muted mb-16">{t("kyb.sub")}</p>
            <RelatedEditor value={draft.counterparty.related ?? []} onChange={(related) => setDraft({ ...draft, counterparty: { ...draft.counterparty, related } })} />
            <button className="btn btn-primary mt-16" disabled={busy} onClick={() => saveAndRecheck({ counterparty: { ...deal.data.counterparty, related: draft.counterparty.related } })}>{t("rd.saveRecheck")}</button>
          </div>
        )}
      </div>

      {goods && (
        <div className="card mt-24">
          <button className="details-toggle" style={{ marginBottom: 0 }} onClick={() => setRouteOpen((o) => !o)}>
            {routeOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{t("route.title")}
          </button>
          {routeOpen && (
            <div className="mt-16">
              <RouteEditor value={draft.route ?? EMPTY_ROUTE} onChange={(route) => setDraft({ ...draft, route })} />
              <button className="btn btn-primary" disabled={busy} onClick={() => saveAndRecheck({ route: draft.route })}>{t("rd.saveRecheck")}</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
