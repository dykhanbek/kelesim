import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { countryName, COUNTRIES } from "../../shared/countries";
import type { ScreeningResult } from "../../shared/types";
import { api, HttpError, type Counterparty } from "../api";
import { Field, Loading, Modal, RiskBadge, StatusBadge, useUi } from "../components/ui";
import { errText, useT } from "../i18n";
import { dmy, money } from "../lib/format";
import { StatusIcon } from "./Check";

/** Plain-language screening result: red shows the source list, green shows the check date (flow 5.4). */
export function ScreeningText({ s }: { s: ScreeningResult }) {
  const { t } = useT();
  const top = s.matches[0];
  if (s.status === "green") return <>{t("cp.resultGreen", { date: dmy(s.checked_at) })}</>;
  if (s.status === "red" && top && top.score >= 0.85) return <>{t("cp.resultRed", { list: top.list, entry: top.entry, program: top.program })}</>;
  if (s.status === "red") return <>{t("err.deal_is_red")}</>;
  return <>{t("cp.resultYellow", { reason: top ? `${top.list}: ${top.entry} (${Math.round(top.score * 100)}%)` : t("cp.countryRisk") })}</>;
}

function CheckBadge({ c }: { c: Counterparty }) {
  const { t } = useT();
  if (!c.check) return <span className="badge badge-gray">—</span>;
  const top = c.check.matches[0];
  const cls = c.check.status === "green" ? "badge-green" : c.check.status === "yellow" ? "badge-yellow" : "badge-red";
  const label = c.check.status === "green" ? t("cp.noMatch") : c.check.status === "yellow" ? t("cp.possible") : t("cp.match", { list: top?.list ?? "" });
  return <span className={`badge ${cls}`}><StatusIcon s={c.check.status} size={14} />{label}</span>;
}

export function CounterpartiesPage() {
  const { t, lang } = useT();
  const { toast } = useUi();
  const nav = useNavigate();
  const [items, setItems] = useState<Counterparty[] | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => api.get<{ items: Counterparty[] }>(`/counterparties?q=${encodeURIComponent(q)}`).then((r) => setItems(r.items));
  useEffect(() => { const h = setTimeout(load, 200); return () => clearTimeout(h); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const recheck = async (id: string) => {
    await api.post(`/counterparties/${id}/check`);
    toast(t("common.saved"));
    await load();
  };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.counterparties")}</div>
      <div className="page-head">
        <h1>{t("cp.title")}</h1>
        <button className="btn btn-primary btn-wide" onClick={() => setAdding(true)}>{t("cp.add")}</button>
      </div>
      <Field label={t("cp.search")}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cp.searchPh")} />
      </Field>
      <div className="card mt-8">
        {!items ? <Loading variant="inline" /> : items.length === 0 ? <p className="muted">{t("cp.empty")}</p> : (
          <table className="table responsive">
            <thead><tr><th>{t("cp.colName")}</th><th>{t("cp.colCheck")}</th><th>{t("cp.colActions")}</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="clickable" style={{ cursor: "pointer" }} onClick={() => nav(`/app/counterparties/${c.id}`)}>
                    <div style={{ fontWeight: 600, fontSize: 17 }}>{c.name}</div>
                    <div className="muted small">{countryName(c.country, lang)}{c.name_local ? ` · ${c.name_local}` : ""}</div>
                  </td>
                  <td>
                    <CheckBadge c={c} />
                    <div className="small muted mt-8">{dmy(c.checked_at)}</div>
                  </td>
                  <td><button className="btn btn-ghost" onClick={() => recheck(c.id)}>{t("cp.recheck")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <AddCounterparty onClose={() => setAdding(false)} onSaved={() => { void load(); }} />}
    </>
  );
}

function AddCounterparty({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useT();
  const [f, setF] = useState({ name: "", name_local: "", country: "CN", address: "", bank_details: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ id: string; screening: ScreeningResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = t("err.required");
    if (f.address.trim().length < 5) errs.address = t("err.required");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      setResult(await api.post("/counterparties", f));
      onSaved();
    } catch (e) {
      setErrors({ name: errText(t, e instanceof HttpError ? e.code : "") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("cp.addH")} onClose={onClose} wide>
      {result ? (
        <>
          <div className={`card ${result.screening.status === "green" ? "card-mint" : result.screening.status === "yellow" ? "card-warn" : "card-risk"}`} style={{ boxShadow: "none" }}>
            <div className="row" style={{ gap: 10 }}><StatusIcon s={result.screening.status} /><b>{f.name}</b></div>
            <p className="mt-8"><ScreeningText s={result.screening} /></p>
          </div>
          <div className="row mt-24">
            <Link className="btn btn-primary" to={`/app/counterparties/${result.id}`}>{t("common.open")}</Link>
            <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          </div>
        </>
      ) : (
        <>
          <Field label={t("wiz.cpName")} error={errors.name}><input className={`input ${errors.name ? "err" : ""}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t("wiz.cpLocal")}><input className="input" value={f.name_local} onChange={(e) => setF({ ...f, name_local: e.target.value })} /></Field>
          <Field label={t("wiz.country")}>
            <select className="select" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
              {COUNTRIES.filter((c) => c.code !== "KZ").map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
            </select>
          </Field>
          <Field label={t("wiz.address")} error={errors.address}><input className={`input ${errors.address ? "err" : ""}`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{t("cp.screen")}</button>
        </>
      )}
    </Modal>
  );
}

export function CounterpartyPage() {
  const { t, lang } = useT();
  const { toast, confirm } = useUi();
  const nav = useNavigate();
  const { id } = useParams();
  const [r, setR] = useState<{ item: Counterparty; deals: any[] } | null>(null);
  const load = () => api.get(`/counterparties/${id}`).then(setR);
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Loading />;
  const c = r.item;
  return (
    <>
      <div className="crumbs">{t("shell.account")} / <Link to="/app/counterparties">{t("nav.counterparties")}</Link></div>
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="sub">{countryName(c.country, lang)}{c.name_local ? ` · ${c.name_local}` : ""}</p>
        </div>
        <div className="row">
          {r.deals.length === 0 && (
            <button className="btn btn-secondary" onClick={async () => {
              if (!(await confirm({ title: t("cp.deleteQ"), text: t("cp.deleteT"), ok: t("common.delete"), danger: true }))) return;
              await api.del(`/counterparties/${id}`);
              toast(t("cp.deleted"));
              nav("/app/counterparties");
            }}>{t("cp.delete")}</button>
          )}
          <button className="btn btn-primary btn-wide" onClick={async () => { await api.post(`/counterparties/${id}/check`); toast(t("common.saved")); await load(); }}>{t("deal.recheck")}</button>
        </div>
      </div>
      <div className="two-col">
        <div className={`card ${c.check?.status === "green" ? "card-mint" : c.check?.status === "yellow" ? "card-warn" : c.check?.status === "red" ? "card-risk" : ""}`}>
          <h3 className="row" style={{ gap: 10 }}>{c.check && <StatusIcon s={c.check.status} />}{t("cp.colCheck")}</h3>
          {c.check ? (
            <>
              <p className="mt-16" style={{ fontSize: 17 }}><ScreeningText s={c.check} /></p>
              <p className="small mt-16">{t("cp.checkedAt", { date: dmy(c.checked_at) })} · {t("chk.demoList", { v: c.check.lists_version })}</p>
            </>
          ) : <p>—</p>}
        </div>
        <div className="card">
          <h3 className="mb-16">{t("cp.details")}</h3>
          <p className="small muted">{t("wiz.address")}</p><p className="mb-16">{c.address || "—"}</p>
          <p className="small muted">{t("wiz.bank")}</p><p>{c.bank_details || "—"}</p>
        </div>
      </div>
      <div className="card mt-24">
        <h3 className="mb-16">{t("cp.deals")}</h3>
        {r.deals.length === 0 ? <p className="muted">—</p> : (
          <table className="table responsive">
            <tbody>
              {r.deals.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/app/deals/${d.id}`}><b>{d.number}</b></Link></td>
                  <td className="m-num">{money(d.amount, d.currency)}</td>
                  <td className="m-inline"><RiskBadge risk={d.risk} /></td>
                  <td className="m-inline"><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
