import { ChevronDown, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { amendmentLetter, type Finding, type ReviewResult, type Severity } from "../../shared/contract-review";
import { formatTenge, serviceById } from "../../shared/services";
import { loc, useT } from "../i18n";
import { useS } from "../i18n.services";
import { ScoreRing } from "./Readiness";
import { useUi } from "./ui";

const ICON: Record<Severity, React.ReactNode> = {
  risk: <CircleAlert size={18} />,
  warn: <TriangleAlert size={18} />,
  info: <Info size={18} />,
  ok: <CircleCheck size={18} />,
};

export function FindingCard({ f }: { f: Finding }) {
  const { lang } = useT();
  const s = useS();
  return (
    <div className={`finding sev-${f.sev}`}>
      <span className="finding-ico">{ICON[f.sev]}</span>
      <div>
        <div className="finding-head"><b>{loc(f.title, lang)}</b><span className={`badge sev-badge-${f.sev}`}>{s(`rr.sev.${f.sev}`)}</span></div>
        <p>{loc(f.text, lang)}</p>
        {f.quote && <blockquote><span className="small muted">{s("rr.quote")}:</span> {f.quote}</blockquote>}
      </div>
    </div>
  );
}

export function ReviewSummary({ r }: { r: ReviewResult }) {
  const s = useS();
  const n = (sev: Severity) => r.findings.filter((f) => f.sev === sev).length;
  return (
    <div className={`card review-head lvl-${r.risk}`}>
      <ScoreRing r={{ score: r.score, level: r.risk }} size={104} />
      <div>
        <h2>{s(`rr.risk.${r.risk}`)}</h2>
        <p className="muted">{s("rr.summary", { risk: n("risk"), warn: n("warn"), ok: n("ok") })}</p>
      </div>
    </div>
  );
}

function Facts({ r }: { r: ReviewResult }) {
  const s = useS();
  const f = r.facts;
  const langs = (["ru", "en", "zh"] as const).filter((l) => f.langs[l] >= 0.15).map((l) => ({ ru: "RU", en: "EN", zh: "中文" })[l]).join(" + ");
  const rows: [string, string][] = [];
  if (langs) rows.push([s("rr.f.lang"), langs]);
  if (f.amount) rows.push([s("rr.f.amount"), `${f.amount.toLocaleString("ru-RU")} ${f.currency ?? ""}`]);
  if (f.prepay_pct !== undefined) rows.push([s("rr.f.prepay"), `${f.prepay_pct}%`]);
  if (f.incoterm) rows.push([s("rr.f.incoterm"), f.incoterm]);
  if (f.delivery_days) rows.push([s("rr.f.delivery"), s("rr.days", { n: f.delivery_days })]);
  if (f.swift) rows.push([s("rr.f.bank"), `SWIFT ${f.swift}`]);
  if (!rows.length) return null;
  return (
    <div className="facts">
      {rows.map(([k, v]) => <div key={k}><span className="small muted">{k}</span><b>{v}</b></div>)}
    </div>
  );
}

/** Full review: summary, findings by severity, letter to the supplier, lawyer offer. */
export function ReviewView({ r, reviewId, dealId, supplier }: { r: ReviewResult; reviewId?: string; dealId?: string | null; supplier?: string }) {
  const s = useS();
  const { toast } = useUi();
  const [showOk, setShowOk] = useState(false);
  const [letterLang, setLetterLang] = useState<"en" | "zh">("en");
  const issues = r.findings.filter((f) => f.sev !== "ok");
  const fine = r.findings.filter((f) => f.sev === "ok");
  const letter = useMemo(() => amendmentLetter(r, supplier), [r, supplier]);
  const hasAsks = r.findings.some((f) => f.ask && f.sev !== "ok");
  const lawyer = serviceById("lawyer_review")!;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(letter[letterLang]);
      toast(s("rr.copied"));
    } catch { /* clipboard blocked: the text stays selectable */ }
  };
  return (
    <>
      <ReviewSummary r={r} />
      <Facts r={r} />
      <div className="findings">
        {issues.map((f) => <FindingCard key={f.id} f={f} />)}
      </div>
      {fine.length > 0 && (
        <>
          <button className="ok-toggle" onClick={() => setShowOk((v) => !v)} aria-expanded={showOk}>
            <ChevronDown size={16} style={{ transform: showOk ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />{s("rr.okToggle", { n: fine.length })}
          </button>
          {showOk && <div className="findings">{fine.map((f) => <FindingCard key={f.id} f={f} />)}</div>}
        </>
      )}

      {hasAsks && (
        <div className="card mt-24">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>{s("rr.letterH")}</h3>
            <div className="seg">
              <button className={letterLang === "en" ? "on" : ""} onClick={() => setLetterLang("en")}>English</button>
              <button className={letterLang === "zh" ? "on" : ""} onClick={() => setLetterLang("zh")}>中文</button>
            </div>
          </div>
          <p className="muted small mt-8 mb-16">{s("rr.letterT")}</p>
          <pre className="letter">{letter[letterLang]}</pre>
          <button className="btn btn-secondary btn-sm mt-16" onClick={copy}>{s("rr.copy")}</button>
        </div>
      )}

      {reviewId && (
        <div className="card card-indigo mt-24" style={{ boxShadow: "none" }}>
          <h3>{s("rr.lawyerH")}</h3>
          <p className="muted mt-8 mb-16">{s("rr.lawyerT")}</p>
          <Link className="btn btn-primary" to={`/app/services?service=lawyer_review&review=${reviewId}${dealId ? `&deal=${dealId}` : ""}`}>{s("rr.lawyerBtn", { price: formatTenge(lawyer.price!) })}</Link>
        </div>
      )}
      <p className="small muted mt-24">{s("rr.disclaimer", { v: r.version })}</p>
    </>
  );
}
