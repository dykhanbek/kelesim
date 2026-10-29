import { ChevronDown, Download, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TEMPLATE_VERSION, generatePackage } from "../../shared/documents";
import { INCOTERMS, type Company, type DealInput } from "../../shared/types";
import { api, HttpError, type Deadline, type DealFull } from "../api";
import { useAuth } from "../auth";
import { Field, Loading, Modal, useUi } from "../components/ui";
import { errText, useT, type TKey } from "../i18n";
import { docToHtml, printDocs, type ViewMode } from "../lib/docHtml";
import { dayMonth } from "../lib/format";

export function PackagePreview() {
  const { t, lang } = useT();
  const { toast } = useUi();
  const { me } = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [terms, setTerms] = useState<DealInput["terms"] | null>(null);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<ViewMode>("both");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<Deadline[] | null>(null);

  const load = async () => {
    const r = await api.get<{ deal: DealFull; company: Company }>(`/deals/${id}`);
    if (r.deal.risk === "red" || !r.deal.check) { nav(`/app/deals/${id}/check`, { replace: true }); return; }
    setDeal(r.deal);
    setCompany(r.company);
    setTerms(r.deal.data.terms);
  };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const docs = useMemo(
    () => (deal && company ? generatePackage({ deal: deal.data, number: deal.number, company, ucn: deal.ucn }) : []),
    [deal, company],
  );
  if (!deal || !company || !terms) return <Loading />;
  const doc = docs[Math.min(active, docs.length - 1)];
  const secondLabel = deal.data.lang_pair === "ru-cn" ? "CN" : "EN";

  /** Clause panel → package is regenerated (and re-checked) */
  const apply = async () => {
    setBusy(true);
    try {
      const data = { ...deal.data, terms };
      await api.put(`/deals/${id}`, { data });
      const r = await api.post<{ result: { overall: string } }>(`/deals/${id}/recheck`);
      if (r.result.overall === "red") { toast(t("pkg.becameRed"), "err"); nav(`/app/deals/${id}/check`); return; }
      await load();
      toast(t("pkg.applied"));
    } finally {
      setBusy(false);
    }
  };

  /** Download = deal saved + deadlines added (counts against the Free plan the first time). */
  const download = async (kind: "allDocx" | "oneDocx" | "onePdf" | "allPdf") => {
    setMenu(false);
    setBusy(true);
    try {
      const r = await api.post<{ first_time: boolean; deadlines: Deadline[] }>(`/deals/${id}/generate`);
      const set = kind.startsWith("all") ? docs : [doc];
      const base = `${deal.number}_${kind.startsWith("all") ? "package" : doc.kind}_${deal.data.lang_pair}`;
      if (kind.endsWith("Docx")) {
        const { docsToDocxBlob, downloadBlob } = await import("../lib/docx"); // lazy: keeps the main bundle small
        downloadBlob(await docsToDocxBlob(set, mode), `${base}.docx`);
      }
      else printDocs(set, mode, base);
      if (r.first_time) setSuccess(r.deadlines);
      else void load();
    } catch (e) {
      if (e instanceof HttpError && e.code === "plan_limit") nav(`/app/limit?deal=${id}`);
      else toast(errText(t, e instanceof HttpError ? e.code : ""), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.documents")} · {deal.number}</div>
      <div className="page-head">
        <h1>{t("pkg.title")}</h1>
        <div style={{ position: "relative" }}>
          <button className="btn btn-primary btn-wide" style={{ minWidth: 196 }} onClick={() => setMenu((m) => !m)} disabled={busy} aria-haspopup="menu">
            <Download size={16} />{t("pkg.download")}<ChevronDown size={16} />
          </button>
          {menu && (
            <div className="popover" role="menu" style={{ minWidth: 240 }}>
              {(["allDocx", "oneDocx", "onePdf", "allPdf"] as const).map((k) => (
                <button key={k} className="item" role="menuitem" onClick={() => download(k)}>{t(`pkg.${k}` as TKey)}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="preview">
        <div className="card doc-list">
          <h3>{t("pkg.count", { n: docs.length })}</h3>
          {docs.map((d, i) => (
            <button key={d.kind} className={i === active ? "on" : ""} onClick={() => setActive(i)}>{lang === "ru" ? d.title.a : deal.data.lang_pair === "ru-en" ? d.title.b : d.title.a}</button>
          ))}
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="mode-switch" role="tablist">
            {(["a", "b", "both"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                {m === "a" ? "RU" : m === "b" ? secondLabel : <><span className="hide-mobile">RU / {secondLabel} / {t("pkg.mode.both")}</span><span className="mobile-only">RU + {secondLabel}</span></>}
              </button>
            ))}
          </div>
          <div className="doc-paper" dangerouslySetInnerHTML={{ __html: docToHtml(doc, mode) }} />
          <p className="small mt-16" style={{ color: "var(--mint)" }}>{deal.docs_generated_at ? t("pkg.footerSaved") : t("pkg.footer")}</p>
        </div>

        <div className="card clause-panel">
          <h3>{t("pkg.terms")}</h3>
          {deal.data.contract_type !== "services" && (
            <div className="grid-2" style={{ gridTemplateColumns: "90px 1fr" }}>
              <Field label={t("wiz.incoterm")} help="hint.incoterms">
                <select className="select" value={terms.incoterm} onChange={(e) => setTerms({ ...terms, incoterm: e.target.value as typeof terms.incoterm })}>
                  {INCOTERMS.map((i) => <option key={i}>{i}</option>)}
                </select>
              </Field>
              <Field label={t("wiz.place")}>
                <input className="input" value={terms.incoterm_place} onChange={(e) => setTerms({ ...terms, incoterm_place: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label={t("wiz.payment")}>
            <select className="select" value={terms.payment} onChange={(e) => setTerms({ ...terms, payment: e.target.value as typeof terms.payment })}>
              {(["prepay100", "prepay30", "postpay"] as const).map((p) => <option key={p} value={p}>{t(`pay.${p}` as TKey)}</option>)}
            </select>
          </Field>
          <Field label={t("wiz.deliveryDate")}>
            <input type="date" className="input" value={terms.delivery_date} onChange={(e) => setTerms({ ...terms, delivery_date: e.target.value })} />
          </Field>
          <Field label={t("wiz.performanceDate")} help="hint.repatriation">
            <input type="date" className="input" value={terms.performance_date} onChange={(e) => setTerms({ ...terms, performance_date: e.target.value })} />
          </Field>
          <div className="grid-2" style={{ gap: "0 10px" }}>
            <Field label={t("wiz.penalty")}><input className="input" inputMode="decimal" value={terms.penalty_rate} onChange={(e) => setTerms({ ...terms, penalty_rate: Number(e.target.value.replace(",", ".")) || 0 })} /></Field>
            <Field label={t("wiz.cap")}><input className="input" inputMode="decimal" value={terms.penalty_cap} onChange={(e) => setTerms({ ...terms, penalty_cap: Number(e.target.value.replace(",", ".")) || 0 })} /></Field>
          </div>
          <Field label={t("wiz.arbitration")}>
            <select className="select" value={terms.arbitration} onChange={(e) => setTerms({ ...terms, arbitration: e.target.value as typeof terms.arbitration })}>
              {(["aifc", "cietac", "kz_court"] as const).map((a) => <option key={a} value={a}>{t(`arb.${a}` as TKey)}</option>)}
            </select>
          </Field>
          <button className="btn btn-primary btn-block" onClick={apply} disabled={busy}>{t("pkg.apply")}</button>
          <p className="trust-note"><b>{t("pkg.templateVersion", { v: TEMPLATE_VERSION })}</b><br />{t("pkg.disclaimer")}</p>
        </div>
      </div>

      {success && (
        <Modal title={t("pkg.successH")} onClose={() => nav(`/app/deals/${id}`)}>
          <p className="muted">{t("pkg.successT")}</p>
          <ul style={{ paddingLeft: 18, margin: "10px 0 18px" }}>
            {success.map((d) => <li key={d.id}><b>{dayMonth(d.due_date, lang)}</b> · {t(`kind.${d.kind}` as TKey)}</li>)}
          </ul>
          {me?.telegram_connected ? (
            <Link className="btn btn-primary btn-block" to={`/app/deals/${id}`}>{t("pkg.toDeal")}</Link>
          ) : (
            <>
              <p className="row" style={{ gap: 10 }}><Send size={18} color="var(--indigo)" />{t("pkg.successTg")}</p>
              <div className="row mt-24">
                <Link className="btn btn-primary" to="/app/settings">{t("pkg.connect")}</Link>
                <Link className="btn btn-secondary" to={`/app/deals/${id}`}>{t("pkg.later")}</Link>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
