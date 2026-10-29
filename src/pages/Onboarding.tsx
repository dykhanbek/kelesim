import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Company } from "../../shared/types";
import { api, HttpError } from "../api";
import { useAuth } from "../auth";
import { Field } from "../components/ui";
import { errText, useT } from "../i18n";
import { TelegramConnect } from "./Settings";

export const EMPTY_COMPANY: Company = { bin: "", legal_form: "ТОО", name_ru: "", name_en: "", city: "", address: "", signatory: "", signatory_basis: "", bank_name: "", bik: "", iban: "" };

export function CompanyMainFields({ c, set, errors }: { c: Company; set: (p: Partial<Company>) => void; errors: Record<string, string> }) {
  const { t } = useT();
  return (
    <>
      <div className="grid-2">
        <Field label={t("onb.legalForm")}>
          <select className="select" value={c.legal_form} onChange={(e) => set({ legal_form: e.target.value })}>
            <option value="ТОО">ТОО / LLP</option>
            <option value="ИП">ИП / IE</option>
            <option value="АО">АО / JSC</option>
          </select>
        </Field>
        <Field label={t("onb.city")}><input className="input" value={c.city} onChange={(e) => set({ city: e.target.value })} /></Field>
      </div>
      <div className="grid-2">
        <Field label={t("onb.nameRu")} error={errors.name_ru}><input className={`input ${errors.name_ru ? "err" : ""}`} value={c.name_ru} onChange={(e) => set({ name_ru: e.target.value })} placeholder="ТОО «Компания»" /></Field>
        <Field label={t("onb.nameEn")}><input className="input" value={c.name_en} onChange={(e) => set({ name_en: e.target.value })} placeholder="Company LLP" /></Field>
      </div>
      <Field label={t("onb.address")}><input className="input" value={c.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label={t("onb.signatory")}><input className="input" value={c.signatory} onChange={(e) => set({ signatory: e.target.value })} /></Field>
        <Field label={t("onb.basis")}><input className="input" value={c.signatory_basis} onChange={(e) => set({ signatory_basis: e.target.value })} placeholder="Устава" /></Field>
      </div>
    </>
  );
}

export function CompanyBankFields({ c, set, errors }: { c: Company; set: (p: Partial<Company>) => void; errors: Record<string, string> }) {
  const { t } = useT();
  return (
    <>
      <Field label={t("onb.bank")}><input className="input" value={c.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder="АО «Kaspi Bank»" /></Field>
      <div className="grid-2">
        <Field label={t("onb.bik")}><input className="input" value={c.bik} onChange={(e) => set({ bik: e.target.value.toUpperCase() })} placeholder="CASPKZKA" /></Field>
        <Field label={t("onb.iban")} error={errors.iban}><input className={`input ${errors.iban ? "err" : ""}`} value={c.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} placeholder="KZ00 0000 0000 0000 0000" /></Field>
      </div>
    </>
  );
}

export function companyErrors(t: ReturnType<typeof useT>["t"], details: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (details && typeof details === "object") for (const [k, v] of Object.entries(details)) out[k] = errText(t, String(v));
  return out;
}

export function Onboarding() {
  const { t } = useT();
  const { me, company, refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(Math.min(3, me?.onboarding_step ?? 1));
  const [c, setC] = useState<Company>({ ...EMPTY_COMPANY, ...(company ?? {}) });
  const [lookup, setLookup] = useState<"idle" | "found" | "notfound">(company?.name_ru ? "found" : "idle");
  const [manual, setManual] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Company>) => setC((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (me && me.onboarding_step >= 4) nav("/app", { replace: true });
  }, [me, nav]);

  const find = async () => {
    setErrors({});
    try {
      const r = await api.get<{ found: boolean; company: Partial<Company> }>(`/account/company/lookup?bin=${c.bin}`);
      set(r.company);
      setLookup(r.found ? "found" : "notfound");
      setManual(!r.found);
    } catch (e) {
      setErrors({ bin: errText(t, e instanceof HttpError ? e.code : "") });
    }
  };

  const save = async (nextStep: number) => {
    setBusy(true);
    setErrors({});
    try {
      await api.put("/account/company", c);
      await api.patch("/account/me", { onboarding_step: nextStep });
      setStep(nextStep);
      await refresh();
    } catch (e) {
      setErrors(e instanceof HttpError ? companyErrors(t, e.details) : {});
      if (e instanceof HttpError && e.details?.name_ru) setManual(true);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await api.patch("/account/me", { onboarding_step: 4 });
    await refresh();
    nav("/app");
  };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.company")}</div>
      <h1>{step === 1 ? t("onb.h1") : step === 2 ? t("onb.h2") : t("onb.h3")}</h1>
      <div className="mt-16 mb-24"><span className="badge badge-indigo">{t("onb.step", { n: step })}</span></div>
      <div style={{ maxWidth: 640 }}>
        {step === 1 && (
          <>
            <p className="muted mb-24" style={{ fontSize: 18 }}>{t("onb.sub1")}</p>
            <Field label={t("onb.bin")} error={errors.bin}>
              <div className={`input-group ${errors.bin ? "err" : ""}`}>
                <input className="input" inputMode="numeric" maxLength={12} value={c.bin} placeholder={t("onb.binPh")}
                  onChange={(e) => { set({ bin: e.target.value.replace(/\D/g, "") }); setLookup("idle"); }}
                  onKeyDown={(e) => e.key === "Enter" && find()} />
                <button className="btn btn-soft" style={{ borderRadius: 0 }} onClick={find} disabled={c.bin.length !== 12}>{t("onb.find")}</button>
              </div>
            </Field>
            {lookup === "found" && (
              <div className="card card-mint mb-24" style={{ boxShadow: "none" }}>
                <h3 className="row" style={{ gap: 8 }}><Check size={20} />{t("onb.found")}</h3>
                <p className="mt-8">{c.name_ru}</p>
                <p>{c.city} · {t("onb.demoData")}</p>
                {!manual && <button className="btn btn-ghost mt-8" style={{ color: "var(--mint)" }} onClick={() => setManual(true)}>✎ {t("onb.manual")}</button>}
              </div>
            )}
            {lookup === "notfound" && <div className="alert alert-info">{t("onb.notFound")}</div>}
            {(manual || lookup === "notfound") && <CompanyMainFields c={c} set={set} errors={errors} />}
            {lookup === "idle" && !manual && <button className="btn btn-ghost mb-24" onClick={() => setManual(true)}>{t("onb.manual")}</button>}
            <div>
              <button className="btn btn-primary btn-wide" disabled={busy || (!c.name_ru && !manual)} onClick={() => save(2)}>{t("onb.toBank")}</button>
              <p className="small muted mt-16">{t("onb.nextSteps")}</p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="muted mb-24" style={{ fontSize: 18 }}>{t("onb.sub2")}</p>
            <CompanyBankFields c={c} set={set} errors={errors} />
            <div className="row">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>{t("common.back")}</button>
              <button className="btn btn-primary btn-wide" disabled={busy} onClick={() => save(3)}>{t("onb.toTg")}</button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <p className="muted mb-24" style={{ fontSize: 18 }}>{t("onb.sub3")}</p>
            <TelegramConnect compact />
            <div className="row mt-24">
              <button className="btn btn-secondary" onClick={finish}>{t("onb.skip")}</button>
              <button className="btn btn-primary btn-wide" onClick={finish}>{t("onb.finish")}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
