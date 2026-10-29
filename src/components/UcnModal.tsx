import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, HttpError } from "../api";
import { errText, useT } from "../i18n";
import { Field, Modal, useUi } from "./ui";

/** How to obtain a contract registration number (UCN) + field to save the number from the bank. */
export function UcnModal({ dealId, current, onClose, onSaved }: { dealId: string; current?: string; onClose: () => void; onSaved?: (ucn: string) => void }) {
  const { t } = useT();
  const { toast } = useUi();
  const [ucn, setUcn] = useState(current ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (ucn.trim().length < 4) return setErr(t("err.required"));
    setBusy(true);
    try {
      await api.post(`/deals/${dealId}/ucn`, { ucn: ucn.trim() });
      toast(t("deal.ucnSaved", { ucn: ucn.trim() }));
      onSaved?.(ucn.trim());
      onClose();
    } catch (e) {
      setErr(errText(t, e instanceof HttpError ? e.code : ""));
    } finally {
      setBusy(false);
    }
  };
  const steps = [t("ucn.s1"), t("ucn.s2"), t("ucn.s3"), t("ucn.s4")];
  return (
    <Modal title={t("ucn.title")} onClose={onClose} wide>
      <p className="muted mb-16">{t("ucn.intro")}</p>
      <ol className="steps-list">
        {steps.map((s, i) => (
          <li key={i}><span className="n">{i + 1}</span><span>{s}</span></li>
        ))}
      </ol>
      <div className="row mb-24">
        <Link className="btn btn-secondary btn-sm" to={`/app/deals/${dealId}/documents`} onClick={onClose}>{t("ucn.openDocs")}</Link>
      </div>
      <Field label={t("deal.ucnField")} error={err ?? undefined} hint={t("ucn.later")}>
        <input className={`input ${err ? "err" : ""}`} value={ucn} onChange={(e) => { setUcn(e.target.value); setErr(null); }} placeholder={t("deal.ucnPh")} onKeyDown={(e) => e.key === "Enter" && save()} />
      </Field>
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={busy}><Check size={16} />{t("deal.ucnSave")}</button>
        <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
      </div>
    </Modal>
  );
}
