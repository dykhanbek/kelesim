import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CLAIM_DEMANDS, CLAIM_KINDS, generateClaim, type ClaimDemand, type ClaimKind } from "../../shared/claim";
import { dealTotal } from "../../shared/compliance";
import type { Company } from "../../shared/types";
import type { DealFull } from "../api";
import { useS } from "../i18n.services";
import { docToHtml, printDocs, type ViewMode } from "../lib/docHtml";
import { Field } from "./ui";

/** Deal tab: review of the supplier's own contract + claim letter + hand-over of a failed deal. */
export function ProtectionPanel({ deal, company }: { deal: DealFull; company: Company }) {
  const s = useS();
  const total = dealTotal(deal.data);
  const prepayShare = deal.data.terms.payment === "prepay100" ? 1 : deal.data.terms.payment === "prepay30" ? 0.3 : 0;
  const [kind, setKind] = useState<ClaimKind>("non_delivery");
  const [demand, setDemand] = useState<ClaimDemand>("refund");
  const [paid, setPaid] = useState(String(Math.round(total * (prepayShare || 1) * 100) / 100));
  const [claimed, setClaimed] = useState("");
  const [days, setDays] = useState("10");
  const [facts, setFacts] = useState("");
  const [factsAlt, setFactsAlt] = useState("");
  const [mode, setMode] = useState<ViewMode>("both");
  const [show, setShow] = useState(false);
  const zh = deal.data.lang_pair === "ru-cn";
  const second = zh ? "中文" : "EN";

  const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;
  const doc = useMemo(
    () => generateClaim({ deal: deal.data, number: deal.number, company, ucn: deal.ucn }, { kind, demand, paid: num(paid), claimed: claimed.trim() ? num(claimed) : undefined, response_days: Math.min(60, Math.max(1, Math.round(num(days)) || 10)), facts, facts_alt: factsAlt }),
    [deal, company, kind, demand, paid, claimed, days, facts, factsAlt],
  );
  const base = `${deal.number}_claim_${deal.data.lang_pair}`;
  const docx = async () => {
    const { docsToDocxBlob, downloadBlob } = await import("../lib/docx");
    downloadBlob(await docsToDocxBlob([doc], mode), `${base}.docx`);
  };
  const pickKind = (k: ClaimKind) => { setKind(k); setDemand(CLAIM_DEMANDS[k][0]); };

  return (
    <>
      <div className="card mb-24 row" style={{ justifyContent: "space-between", gap: 20 }}>
        <div style={{ maxWidth: 620 }}>
          <h3>{s("pt.reviewH")}</h3>
          <p className="muted mt-8">{s("pt.reviewT")}</p>
        </div>
        <Link className="btn btn-secondary" to={`/app/contracts?deal=${deal.id}`}>{s("pt.reviewBtn")}</Link>
      </div>

      <div className="card">
        <h3>{s("pt.claimH")}</h3>
        <p className="muted mt-8 mb-24" style={{ maxWidth: 720 }}>{s("pt.claimT")}</p>
        <div className="grid-2">
          <Field label={s("pt.kind")}>
            <select className="select" value={kind} onChange={(e) => pickKind(e.target.value as ClaimKind)}>
              {CLAIM_KINDS.map((k) => <option key={k} value={k}>{s(`pt.kind.${k}`)}</option>)}
            </select>
          </Field>
          <Field label={s("pt.demand")}>
            <select className="select" value={demand} onChange={(e) => setDemand(e.target.value as ClaimDemand)}>
              {CLAIM_DEMANDS[kind].map((d) => <option key={d} value={d}>{s(`pt.demand.${d}`)}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-3">
          <Field label={s("pt.paid", { cur: deal.data.currency })}><input className="input" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
          <Field label={s("pt.claimed", { cur: deal.data.currency })}><input className="input" inputMode="decimal" value={claimed} placeholder={paid} onChange={(e) => setClaimed(e.target.value)} /></Field>
          <Field label={s("pt.days")}><input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        </div>
        <div className="grid-2">
          <Field label={s("pt.facts")}><textarea className="textarea" value={facts} placeholder={s("pt.factsPh")} onChange={(e) => setFacts(e.target.value)} /></Field>
          <Field label={s("pt.factsAlt", { lang: s(zh ? "pt.lang.zh" : "pt.lang.en") })}><textarea className="textarea" value={factsAlt} onChange={(e) => setFactsAlt(e.target.value)} /></Field>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => setShow((v) => !v)} aria-expanded={show}>{s("pt.preview")}</button>
          <button className="btn btn-secondary" onClick={docx}>{s("pt.docx")}</button>
          <button className="btn btn-secondary" onClick={() => printDocs([doc], mode, base)}>{s("pt.pdf")}</button>
          <div className="mode-switch" role="tablist" style={{ margin: 0 }}>
            {(["a", "b", "both"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "a" ? "RU" : m === "b" ? second : `RU + ${second}`}</button>
            ))}
          </div>
        </div>
        {show && <div className="doc-paper mt-24" dangerouslySetInnerHTML={{ __html: docToHtml(doc, mode) }} />}
      </div>

      <div className="card card-indigo mt-24 row" style={{ justifyContent: "space-between", gap: 20, boxShadow: "none" }}>
        <div style={{ maxWidth: 620 }}>
          <h3>{s("pt.supportH")}</h3>
          <p className="muted mt-8">{s("pt.supportT")}</p>
        </div>
        <Link className="btn btn-primary" to={`/app/services?service=claim_support&deal=${deal.id}`}>{s("pt.supportBtn")}</Link>
      </div>
    </>
  );
}
