import { Check, ChevronDown, ChevronUp, Trash2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { dealTotal, validateDeal, type FieldErrors } from "../../shared/compliance";
import { COUNTRIES } from "../../shared/countries";
import { UNIT_CODES } from "../../shared/documents";
import { sampleDeal } from "../../shared/sample";
import { CURRENCIES, INCOTERMS, type DealInput, type GoodsItem } from "../../shared/types";
import { api, type Counterparty, type DealFull } from "../api";
import { Field, Loading } from "../components/ui";
import { useT, type TKey } from "../i18n";
import { money } from "../lib/format";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; key: TKey }[] = [
  { n: 1, key: "wiz.s1" },
  { n: 2, key: "wiz.s2" },
  { n: 3, key: "wiz.s3" },
  { n: 4, key: "wiz.s4" },
];

export function Wizard() {
  const { t, lang } = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const step = (Math.min(4, Math.max(1, Number(sp.get("step")) || 1)) as Step);
  const [data, setData] = useState<DealInput | null>(null);
  const [number, setNumber] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [save, setSave] = useState<"saved" | "saving" | "idle">("idle");
  const [cps, setCps] = useState<Counterparty[]>([]);
  const [more, setMore] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    api.get<{ deal: DealFull }>(`/deals/${id}`).then(({ deal }) => {
      if (deal.status === "active" || deal.status === "closed") { nav(`/app/deals/${id}`, { replace: true }); return; }
      setData(deal.data);
      setNumber(deal.number);
      setSave("saved");
    });
    api.get<{ items: Counterparty[] }>("/counterparties").then((r) => setCps(r.items));
  }, [id, nav]);

  const flush = useCallback(async (d: DealInput | null = data) => {
    window.clearTimeout(timer.current);
    if (!d || !dirty.current) return;
    dirty.current = false;
    setSave("saving");
    await api.put(`/deals/${id}`, { data: d });
    setSave("saved");
  }, [data, id]);

  // Draft autosave (UX principle: forgiving of mistakes)
  const update = (fn: (d: DealInput) => DealInput) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = fn(structuredClone(prev));
      dirty.current = true;
      setSave("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flushRef.current(next), 700);
      return next;
    });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { void flushRef.current(); }, []);

  if (!data) return <Loading />;

  const e = (k: string) => (errors[k] ? errors[k][lang] : undefined);
  const goStep = async (n: Step) => {
    await flush();
    setErrors({});
    setSp({ step: String(n) }, { replace: false });
    window.scrollTo(0, 0);
  };
  const next = async () => {
    const errs = validateDeal(data, step);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (step < 4) return goStep((step + 1) as Step);
    dirty.current = true;
    await flush(data);
    nav(`/app/deals/${id}/check`);
  };
  const fillExample = () => {
    const s = sampleDeal();
    update(() => ({ ...s, contract_type: data.contract_type, lang_pair: data.lang_pair }));
    setErrors({});
  };

  const altLabel = data.lang_pair === "ru-cn" ? t("wiz.itemAltCn") : t("wiz.itemAltEn");
  const total = dealTotal(data);
  const setItem = (i: number, p: Partial<GoodsItem>) => update((d) => { d.goods[i] = { ...d.goods[i], ...p }; return d; });
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.deals")} · {number}</div>
      <div className="page-head">
        <h1>{t("wiz.title")}</h1>
        <button className="btn btn-soft btn-sm" onClick={fillExample}><Wand2 size={16} />{t("wiz.example")}</button>
      </div>
      <div className="stepper" role="tablist">
        {STEPS.map((s) => (
          <button key={s.n} role="tab" aria-selected={s.n === step} className={s.n === step ? "active" : s.n < step ? "done" : ""} onClick={() => s.n < step && goStep(s.n)}>
            {s.n < step ? <Check size={16} /> : null}0{s.n}&nbsp;&nbsp;{t(s.key)}
          </button>
        ))}
      </div>
      <div className="wizard">
        <div className="card wizard-card">
          <div className="badge badge-indigo mobile-only mb-16">{lang === "ru" ? `Шаг ${step} из 4` : `Step ${step} of 4`} · {t(STEPS[step - 1].key)}</div>
          {step === 1 && (
            <>
              <h2>{t("wiz.h1")}</h2>
              <Field label={t("wiz.ctype")}>
                <select className="select" value={data.contract_type} onChange={(ev) => update((d) => ({ ...d, contract_type: ev.target.value as DealInput["contract_type"] }))}>
                  {(["supply", "agency", "services"] as const).map((c) => <option key={c} value={c}>{t(`ctype.${c}` as TKey)}</option>)}
                </select>
              </Field>
              <Field label={t("wiz.langs")}>
                <select className="select" value={data.lang_pair} onChange={(ev) => update((d) => ({ ...d, lang_pair: ev.target.value as DealInput["lang_pair"] }))}>
                  <option value="ru-cn">{t("lp.ru-cn")}</option>
                  <option value="ru-en">{t("lp.ru-en")}</option>
                </select>
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h2>{t("wiz.h2")}</h2>
              {cps.length > 0 && (
                <>
                  <div className="label mb-8">{t("wiz.saved_cps")}</div>
                  <div className="saved-cp">
                    {cps.map((c) => (
                      <button key={c.id} type="button" className={data.counterparty.id === c.id ? "on" : ""}
                        onClick={() => update((d) => ({ ...d, counterparty: { id: c.id, name: c.name, name_local: c.name_local, country: c.country, address: c.address, bank_details: c.bank_details } }))}>
                        {c.name}
                      </button>
                    ))}
                    <button type="button" onClick={() => update((d) => ({ ...d, counterparty: { name: "", name_local: "", country: "CN", address: "", bank_details: "" } }))}>{t("wiz.newCp")}</button>
                  </div>
                </>
              )}
              <Field label={t("wiz.cpName")} error={e("counterparty.name")}>
                <input className={`input ${e("counterparty.name") ? "err" : ""}`} value={data.counterparty.name} placeholder="Guangzhou Textile Co., Ltd."
                  onChange={(ev) => update((d) => { d.counterparty.name = ev.target.value; d.counterparty.id = undefined; return d; })} />
              </Field>
              <Field label={t("wiz.cpLocal")} help="hint.local" hint={t("wiz.cpLocalHint")}>
                <input className="input" value={data.counterparty.name_local} onChange={(ev) => update((d) => { d.counterparty.name_local = ev.target.value; return d; })} />
              </Field>
              <Field label={t("wiz.country")} error={e("counterparty.country")}>
                <select className="select" value={data.counterparty.country} onChange={(ev) => update((d) => { d.counterparty.country = ev.target.value; return d; })}>
                  {COUNTRIES.filter((c) => c.code !== "KZ").map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
                </select>
              </Field>
              <Field label={t("wiz.address")} error={e("counterparty.address")}>
                <input className={`input ${e("counterparty.address") ? "err" : ""}`} value={data.counterparty.address} placeholder="Guangzhou, Guangdong, China"
                  onChange={(ev) => update((d) => { d.counterparty.address = ev.target.value; return d; })} />
              </Field>
              <Field label={<>{t("wiz.bank")} <span className="small muted">({t("common.optional")})</span></>}>
                <input className="input" value={data.counterparty.bank_details} placeholder="Bank of China · SWIFT BKCHCNBJ · A/C …"
                  onChange={(ev) => update((d) => { d.counterparty.bank_details = ev.target.value; return d; })} />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <h2>{t("wiz.h3")}</h2>
              {data.goods.map((g, i) => (
                <div className="goods-row" key={i}>
                  <div className="caps mb-16">{t("wiz.item", { n: i + 1 })}</div>
                  {data.goods.length > 1 && (
                    <button className="btn btn-ghost remove" onClick={() => update((d) => { d.goods.splice(i, 1); return d; })} aria-label={t("common.delete")}><Trash2 size={16} /></button>
                  )}
                  <div className="grid-goods">
                    <Field label={t("wiz.itemName")} error={e(`goods.${i}.name`)}>
                      <input className={`input ${e(`goods.${i}.name`) ? "err" : ""}`} value={g.name} placeholder={lang === "ru" ? "Детская одежда" : "Children's clothing"} onChange={(ev) => setItem(i, { name: ev.target.value })} />
                    </Field>
                    <Field label={altLabel}>
                      <input className="input" value={g.name_alt} placeholder={data.lang_pair === "ru-cn" ? "儿童服装" : "Children's clothing"} onChange={(ev) => setItem(i, { name_alt: ev.target.value })} />
                    </Field>
                  </div>
                  <div className="grid-nums">
                    <Field label={t("wiz.qty")} error={e(`goods.${i}.qty`)}>
                      <input className={`input ${e(`goods.${i}.qty`) ? "err" : ""}`} inputMode="decimal" value={g.qty || ""} onChange={(ev) => setItem(i, { qty: num(ev.target.value) })} />
                    </Field>
                    <Field label={t("wiz.unit")}>
                      <select className="select" value={g.unit} onChange={(ev) => setItem(i, { unit: ev.target.value })}>
                        {UNIT_CODES.map((u) => <option key={u} value={u}>{t(`units.${u}` as TKey)}</option>)}
                      </select>
                    </Field>
                    <Field label={`${t("wiz.price")}, ${data.currency}`} error={e(`goods.${i}.price`)}>
                      <input className={`input ${e(`goods.${i}.price`) ? "err" : ""}`} inputMode="decimal" value={g.price || ""} onChange={(ev) => setItem(i, { price: num(ev.target.value) })} />
                    </Field>
                    <Field label={t("wiz.hs")}>
                      <input className="input" value={g.hs_code} placeholder="6202 40" onChange={(ev) => setItem(i, { hs_code: ev.target.value })} />
                    </Field>
                  </div>
                  {data.contract_type !== "services" && (
                    <div className="grid-pack">
                      <Field label={t("wiz.packages")}><input className="input" inputMode="numeric" value={g.packages || ""} onChange={(ev) => setItem(i, { packages: num(ev.target.value) })} /></Field>
                      <Field label={t("wiz.net")}><input className="input" inputMode="decimal" value={g.net_kg || ""} onChange={(ev) => setItem(i, { net_kg: num(ev.target.value) })} /></Field>
                      <Field label={t("wiz.gross")}><input className="input" inputMode="decimal" value={g.gross_kg || ""} onChange={(ev) => setItem(i, { gross_kg: num(ev.target.value) })} /></Field>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-ghost mb-24" onClick={() => update((d) => { d.goods.push({ name: "", name_alt: "", hs_code: "", qty: 0, unit: "pcs", price: 0, net_kg: 0, gross_kg: 0, packages: 0 }); return d; })}>{t("wiz.addItem")}</button>
              <Field label={t("wiz.total")} error={e("total")}>
                <div className={`input-group ${e("total") ? "err" : ""}`}>
                  <input className="input" readOnly value={money(total)} aria-label={t("wiz.total")} />
                  <span className="sep" />
                  <select className="select" style={{ width: 110 }} value={data.currency} onChange={(ev) => update((d) => ({ ...d, currency: ev.target.value as DealInput["currency"] }))} aria-label={t("wiz.currency")}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </Field>
              <Field label={<>{t("wiz.batch")} <span className="small muted">({t("common.optional")})</span></>}>
                <input className="input" value={data.batch_note} placeholder={t("wiz.batchPh")} onChange={(ev) => update((d) => ({ ...d, batch_note: ev.target.value }))} />
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <h2>{t("wiz.h4")}</h2>
              <div className="grid-2">
                <Field label={t("wiz.incoterm")} help="hint.incoterms">
                  <select className="select" value={data.terms.incoterm} onChange={(ev) => update((d) => { d.terms.incoterm = ev.target.value as DealInput["terms"]["incoterm"]; return d; })}>
                    {INCOTERMS.map((i) => <option key={i} value={i}>{i} · Incoterms 2020</option>)}
                  </select>
                </Field>
                <Field label={t("wiz.place")} error={e("terms.incoterm_place")}>
                  <input className={`input ${e("terms.incoterm_place") ? "err" : ""}`} value={data.terms.incoterm_place} placeholder="Guangzhou" onChange={(ev) => update((d) => { d.terms.incoterm_place = ev.target.value; return d; })} />
                </Field>
              </div>
              <div className="grid-2">
                <Field label={t("wiz.payment")}>
                  <select className="select" value={data.terms.payment} onChange={(ev) => update((d) => { d.terms.payment = ev.target.value as DealInput["terms"]["payment"]; return d; })}>
                    {(["prepay100", "prepay30", "postpay"] as const).map((p) => <option key={p} value={p}>{t(`pay.${p}` as TKey)}</option>)}
                  </select>
                </Field>
                {data.terms.payment === "postpay" ? (
                  <Field label={t("wiz.postpayDays")} error={e("terms.postpay_days")}>
                    <input className="input" inputMode="numeric" value={data.terms.postpay_days} onChange={(ev) => update((d) => { d.terms.postpay_days = num(ev.target.value); return d; })} />
                  </Field>
                ) : <div />}
              </div>
              <div className="grid-3">
                <Field label={t("wiz.signDate")} error={e("terms.sign_date")}>
                  <input type="date" className={`input ${e("terms.sign_date") ? "err" : ""}`} value={data.terms.sign_date} onChange={(ev) => update((d) => { d.terms.sign_date = ev.target.value; return d; })} />
                </Field>
                <Field label={t("wiz.deliveryDate")} error={e("terms.delivery_date")}>
                  <input type="date" className={`input ${e("terms.delivery_date") ? "err" : ""}`} value={data.terms.delivery_date} onChange={(ev) => update((d) => { d.terms.delivery_date = ev.target.value; return d; })} />
                </Field>
                <Field label={t("wiz.performanceDate")} help="hint.repatriation" error={e("terms.performance_date")}>
                  <input type="date" className={`input ${e("terms.performance_date") ? "err" : ""}`} value={data.terms.performance_date} onChange={(ev) => update((d) => { d.terms.performance_date = ev.target.value; return d; })} />
                </Field>
              </div>
              <button className="details-toggle" onClick={() => setMore((m) => !m)}>{more ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{t("wiz.more")}</button>
              {more && (
                <div className="grid-3">
                  <Field label={t("wiz.penalty")}><input className="input" inputMode="decimal" value={data.terms.penalty_rate} onChange={(ev) => update((d) => { d.terms.penalty_rate = num(ev.target.value); return d; })} /></Field>
                  <Field label={t("wiz.cap")}><input className="input" inputMode="decimal" value={data.terms.penalty_cap} onChange={(ev) => update((d) => { d.terms.penalty_cap = num(ev.target.value); return d; })} /></Field>
                  <Field label={t("wiz.arbitration")}>
                    <select className="select" value={data.terms.arbitration} onChange={(ev) => update((d) => { d.terms.arbitration = ev.target.value as DealInput["terms"]["arbitration"]; return d; })}>
                      {(["aifc", "cietac", "kz_court"] as const).map((a) => <option key={a} value={a}>{t(`arb.${a}` as TKey)}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </>
          )}

          {Object.keys(errors).length > 0 && <div className="alert alert-error">{t("wiz.fixErrors")}</div>}
          <div className="wizard-actions">
            <button className="btn btn-secondary" style={{ minWidth: 120 }} onClick={() => (step > 1 ? goStep((step - 1) as Step) : nav("/app"))}>{t("common.back")}</button>
            <button className="btn btn-primary" style={{ minWidth: 184, justifyContent: "flex-start" }} onClick={next}>{step === 4 ? t("wiz.check") : t("common.next")}</button>
          </div>
        </div>
        <aside className="wizard-aside">
          <div className="saved">{save === "saving" ? t("wiz.saving") : <><Check size={14} />{t("wiz.saved")}</>}</div>
          <p>{t("wiz.aside")}</p>
          {step >= 3 && total > 0 && <p className="mt-24"><b>{t("wiz.total")}:</b><br />{money(total, data.currency)}</p>}
        </aside>
      </div>
    </>
  );
}
