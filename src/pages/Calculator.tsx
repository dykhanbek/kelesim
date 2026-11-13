import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DECLARATION_FEE_KZT, landedCost, VAT_RATE } from "../../shared/landed-cost";
import { formatTenge } from "../../shared/services";
import { useAuth } from "../auth";
import { Field } from "../components/ui";
import { useT } from "../i18n";
import { useS } from "../i18n.services";
import { Footer, PublicHeader } from "./Public";

const FALLBACK: Record<string, number> = { USD: 510, CNY: 71.4, EUR: 551, TRY: 14.8, RUB: 6.4 };
const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

/** Import cost calculator: the same component on the public page and inside the account. */
export function CalculatorPanel() {
  const s = useS();
  const { me } = useAuth();
  const [rates, setRates] = useState<{ kzt: Record<string, number>; date: string; source: string } | null>(null);
  const [cur, setCur] = useState("USD");
  const [f, setF] = useState({ goods: "10000", freight: "1200", duty: "10", units: "500", rate: "", fee: String(DECLARATION_FEE_KZT), broker: "80000", cert: "0", local: "0" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    fetch("/api/rates").then((r) => r.json()).then((r: any) => r?.kzt && setRates(r)).catch(() => {});
  }, []);
  const official = rates?.kzt[cur] ?? FALLBACK[cur];
  const rate = f.rate.trim() ? num(f.rate) : official;
  const r = useMemo(
    () => landedCost({ goods: num(f.goods), freight: num(f.freight), rate, duty_pct: num(f.duty), declaration_fee: num(f.fee), broker: num(f.broker), certification: num(f.cert), local_delivery: num(f.local), units: num(f.units) }),
    [f, rate],
  );
  const rows: [string, number, string?][] = [
    [s("lc.r.goods"), r.goods_kzt],
    [s("lc.r.freight"), r.freight_kzt],
    [s("lc.r.duty", { pct: num(f.duty) }), r.duty],
    [s("lc.r.vat", { pct: VAT_RATE }), r.vat, s("lc.r.vatNote")],
    [s("lc.r.fee"), r.declaration_fee],
    [s("lc.r.other"), r.other],
  ];
  const order = me && !me.is_demo ? "/app/services?service=turnkey_import" : `/register?next=${encodeURIComponent("/app/services?service=turnkey_import")}`;

  return (
    <div className="calc">
      <div className="card">
        <div className="grid-2">
          <Field label={s("lc.goods")}>
            <div className="input-group">
              <input className="input" inputMode="decimal" value={f.goods} onChange={set("goods")} aria-label={s("lc.goods")} />
              <select className="select" value={cur} onChange={(e) => { setCur(e.target.value); setF({ ...f, rate: "" }); }} aria-label={s("lc.currency")} style={{ maxWidth: 100 }}>
                {["USD", "CNY", "EUR", "TRY", "RUB"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </Field>
          <Field label={s("lc.freight", { cur })} hint={s("lc.freightHint")}><input className="input" inputMode="decimal" value={f.freight} onChange={set("freight")} /></Field>
        </div>
        <div className="grid-3">
          <Field label={s("lc.duty")} hint={s("lc.dutyHint")}><input className="input" inputMode="decimal" value={f.duty} onChange={set("duty")} /></Field>
          <Field label={s("lc.rate", { cur })} hint={rates?.source === "nbrk" ? s("lc.rateHint", { date: rates.date.split("-").reverse().join(".") }) : undefined}><input className="input" inputMode="decimal" value={f.rate} placeholder={String(official)} onChange={set("rate")} /></Field>
          <Field label={s("lc.units")}><input className="input" inputMode="numeric" value={f.units} onChange={set("units")} /></Field>
        </div>
        <details className="calc-more">
          <summary>{s("lc.more")}</summary>
          <div className="grid-2 mt-16">
            <Field label={s("lc.fee")} hint={s("lc.feeHint")}><input className="input" inputMode="numeric" value={f.fee} onChange={set("fee")} /></Field>
            <Field label={s("lc.broker")}><input className="input" inputMode="numeric" value={f.broker} onChange={set("broker")} /></Field>
            <Field label={s("lc.cert")}><input className="input" inputMode="numeric" value={f.cert} onChange={set("cert")} /></Field>
            <Field label={s("lc.local")}><input className="input" inputMode="numeric" value={f.local} onChange={set("local")} /></Field>
          </div>
        </details>
      </div>

      <div className="card calc-result" aria-live="polite">
        <span className="small muted">{s("lc.total")}</span>
        <div className="calc-total">{formatTenge(r.total)}</div>
        <div className="calc-kpis">
          {r.per_unit !== null && <div><span className="small muted">{s("lc.perUnit")}</span><b>{formatTenge(r.per_unit)}</b></div>}
          <div><span className="small muted">{s("lc.markup")}</span><b>+{r.markup_pct.toLocaleString("ru-RU")}%</b></div>
          <div><span className="small muted">{s("lc.customs")}</span><b>{formatTenge(r.customs_payments)}</b></div>
        </div>
        <table className="calc-table">
          <tbody>
            {rows.map(([k, v, note]) => (
              <tr key={k}><td>{k}{note && <span className="small muted" style={{ display: "block" }}>{note}</span>}</td><td>{formatTenge(v)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="small muted mt-16">{s("lc.disclaimer")}</p>
        <Link className="btn btn-primary btn-block mt-16" to={order}>{s("lc.cta")}</Link>
      </div>
    </div>
  );
}

export function PublicCalculator() {
  const s = useS();
  return (
    <>
      <PublicHeader />
      <div className="container public-check" style={{ maxWidth: 1080 }}>
        <h1>{s("lc.h1")}</h1>
        <p className="lead-text">{s("lc.lead")}</p>
        <CalculatorPanel />
      </div>
      <Footer />
    </>
  );
}

export function CalculatorPage() {
  const { t } = useT();
  const s = useS();
  return (
    <>
      <div className="crumbs">{t("shell.account")} / {s("nav.calculator")}</div>
      <div className="page-head"><div><h1>{s("lc.h1")}</h1><p className="sub" style={{ maxWidth: 720 }}>{s("lc.lead")}</p></div></div>
      <CalculatorPanel />
    </>
  );
}
