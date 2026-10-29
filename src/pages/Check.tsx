import { AlertTriangle, ArrowRight, Check as CheckIcon, CircleAlert, Circle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CheckItem, ComplianceResult } from "../../shared/types";
import { api, HttpError } from "../api";
import { UcnModal } from "../components/UcnModal";
import { useUi } from "../components/ui";
import { useT, type TKey } from "../i18n";
import { dmy } from "../lib/format";

const PHASES: { run: TKey; done: TKey }[] = [
  { run: "chk.c1", done: "chk.c1done" },
  { run: "chk.c2", done: "chk.c2done" },
  { run: "chk.c3", done: "chk.c3done" },
];
const PHASE_MS = 1300; // three checks one after another, ~4 s in total (brief: 3–5 s)

export function StatusIcon({ s, size = 20 }: { s: string; size?: number }) {
  if (s === "red") return <CircleAlert size={size} className="ic-red" />;
  if (s === "yellow") return <AlertTriangle size={size} className="ic-yellow" />;
  return <CheckIcon size={size} className="ic-green" />;
}

/**
 * Check items with clickable recommended actions:
 *  - UCN required → "how to get a UCN" dialog with a field for the number from the bank
 *  - sanctions / country risk → edit the supplier (wizard step 2)
 *  - repatriation term → edit the dates (wizard step 4, or the clause panel for saved deals)
 */
export function ResultItems({ items, dealId, dealStatus, ucn, onChanged }: { items: CheckItem[]; dealId?: string; dealStatus?: string; ucn?: string; onChanged?: () => void }) {
  const { t, lang } = useT();
  const nav = useNavigate();
  const [ucnOpen, setUcnOpen] = useState(false);
  const saved = dealStatus === "active" || dealStatus === "closed";
  const actionFor = (i: CheckItem): (() => void) | null => {
    if (!dealId || i.status === "green") return null;
    if (i.id === "ucn") return () => setUcnOpen(true);
    if (i.id === "sanctions") return () => nav(saved ? `/app/deals/${dealId}?tab=check` : `/app/deals/${dealId}/edit?step=2`);
    if (i.id === "repatriation") return () => nav(saved ? `/app/deals/${dealId}/documents` : `/app/deals/${dealId}/edit?step=4`);
    return null;
  };
  return (
    <div className="result-items">
      {items.map((i) => {
        const act = actionFor(i);
        const done = i.id === "ucn" && !!ucn && i.status !== "green";
        return (
          <div className="result-item" key={i.id}>
            <StatusIcon s={done ? "green" : i.status} />
            <div>
              <div className="t">{i.title[lang]}</div>
              <div className="d">{i.text[lang]}</div>
              {done ? (
                <div className="a ok">✓ {t("deal.ucnSaved", { ucn: ucn! })}</div>
              ) : i.action && act ? (
                <button type="button" className="a action-link" onClick={act}>{i.action[lang]} <ArrowRight size={14} /></button>
              ) : i.action ? (
                <div className="a">→ {i.action[lang]}</div>
              ) : null}
            </div>
          </div>
        );
      })}
      {ucnOpen && dealId && <UcnModal dealId={dealId} current={ucn} onClose={() => setUcnOpen(false)} onSaved={() => onChanged?.()} />}
    </div>
  );
}

/** Headline + plain-language explanation for the traffic light (red / yellow / green). */
export function resultCopy(r: ComplianceResult, lang: "ru" | "en", t: (k: TKey) => string) {
  const worst = r.items.find((i) => i.status === r.overall) ?? r.items[0];
  if (r.overall === "green") return { badge: t("risk.green"), head: t("chk.greenH"), text: t("chk.greenT") };
  if (r.overall === "red") return { badge: t("risk.red"), head: t("chk.redH"), text: worst.text[lang] + (worst.action ? " " + worst.action[lang] : "") };
  return { badge: t("risk.yellow"), head: worst.title[lang], text: worst.text[lang] };
}

export function CheckScreen() {
  const { t, lang } = useT();
  const { openSupport } = useUi();
  const { id } = useParams();
  const nav = useNavigate();
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [ucn, setUcn] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const anim = new Promise<void>((resolve) => {
      let p = 0;
      const iv = window.setInterval(() => {
        p += 1;
        setPhase(p);
        if (p >= PHASES.length) { window.clearInterval(iv); resolve(); }
      }, PHASE_MS);
    });
    const call = api.post<{ result: ComplianceResult }>(`/deals/${id}/check`);
    Promise.all([anim, call])
      .then(([, r]) => setResult(r.result))
      .catch((e) => {
        if (e instanceof HttpError && e.code === "validation") {
          const keys = Object.keys(e.details ?? {});
          const step = keys.some((k) => k.startsWith("counterparty")) ? 2 : keys.some((k) => k.startsWith("goods") || k === "total") ? 3 : keys.some((k) => k.startsWith("terms")) ? 4 : 1;
          nav(`/app/deals/${id}/edit?step=${step}`, { replace: true });
        } else nav(`/app/deals/${id}`, { replace: true });
      });
  }, [id, nav]);

  if (!result) {
    return (
      <>
        <div className="crumbs">{t("shell.account")} / {t("nav.deals")}</div>
        <h1>{t("chk.title")}</h1>
        <div className="card center-card">
          <h2 style={{ fontSize: 30, lineHeight: "38px" }}>{t("chk.h")}</h2>
          <ul className="check-list" aria-live="polite">
            {PHASES.map((p, i) => (
              <li key={p.run} className={i > phase ? "pending" : ""}>
                {i < phase ? <CheckIcon className="ic-green" /> : i === phase ? <Loader2 className="spin" color="var(--indigo)" /> : <Circle />}
                {i < phase ? t(p.done) : t(p.run)}
              </li>
            ))}
          </ul>
          <div className="progress"><div style={{ width: `${Math.min(100, ((phase + 0.5) / PHASES.length) * 100)}%` }} /></div>
          <p className="small muted mt-16">{t("chk.stay")}</p>
        </div>
      </>
    );
  }

  const c = resultCopy(result, lang, t);
  const cls = result.overall === "green" ? "badge-green" : result.overall === "yellow" ? "badge-yellow" : "badge-red";
  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.deals")}</div>
      <h1>{t("chk.resultTitle")}</h1>
      <div className="card center-card">
        <span className={`badge ${cls}`}><StatusIcon s={result.overall} size={14} />{c.badge}</span>
        <h2 className="result-head">{c.head}</h2>
        <p className="result-text">{c.text}</p>
        <ResultItems items={result.items} dealId={id} dealStatus="checked" ucn={ucn} onChanged={() => api.get<{ deal: { ucn: string } }>(`/deals/${id}`).then((r) => setUcn(r.deal.ucn))} />
        <div className="row">
          {result.overall === "red" ? (
            <>
              <button className="btn btn-primary btn-wide" onClick={() => nav(`/app/deals/${id}/edit?step=2`)}>{t("chk.editData")}</button>
              <button className="btn btn-secondary btn-wide" onClick={openSupport}>{t("chk.support")}</button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-wide" onClick={() => nav(`/app/deals/${id}/documents`)}>{t("chk.continue")}</button>
              <button className="btn btn-secondary btn-wide" onClick={() => nav(`/app/deals/${id}/edit?step=4`)}>{t("chk.backToForm")}</button>
            </>
          )}
        </div>
        <p className="small muted mt-24">{t("chk.checkedAt", { date: dmy(result.checked_at), v: result.rules_version })} · {t("chk.demoList", { v: result.lists_version ?? "—" })}</p>
      </div>
    </>
  );
}
