import { useState } from "react";
import type { Company } from "../../shared/types";
import { api, HttpError } from "../api";
import { useAuth } from "../auth";
import { useUi } from "../components/ui";
import { useT } from "../i18n";
import { CompanyBankFields, CompanyMainFields, EMPTY_COMPANY, companyErrors } from "./Onboarding";

export function CompanyPage() {
  const { t } = useT();
  const { toast } = useUi();
  const { company, refresh } = useAuth();
  const [c, setC] = useState<Company>({ ...EMPTY_COMPANY, ...(company ?? {}) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Company>) => setC((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.put("/account/company", c);
      await refresh();
      toast(t("common.saved"));
    } catch (e) {
      if (e instanceof HttpError) setErrors(companyErrors(t, e.details));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.company")}</div>
      <div className="page-head"><div><h1>{t("co.title")}</h1><p className="sub">{t("co.sub")}</p></div></div>
      <div className="two-col">
        <div className="card">
          <h3 className="mb-24">{t("co.main")}</h3>
          <div className="field">
            <label>{t("onb.bin")}</label>
            <input className={`input ${errors.bin ? "err" : ""}`} value={c.bin} maxLength={12} onChange={(e) => set({ bin: e.target.value.replace(/\D/g, "") })} />
            {errors.bin && <div className="field-error">{errors.bin}</div>}
          </div>
          <CompanyMainFields c={c} set={set} errors={errors} />
        </div>
        <div>
          <div className="card">
            <h3 className="mb-24">{t("co.bank")}</h3>
            <CompanyBankFields c={c} set={set} errors={errors} />
            <button className="btn btn-primary btn-wide" onClick={save} disabled={busy}>{t("common.save")}</button>
          </div>
          <p className="small muted mt-16">{t("co.b2b")}</p>
        </div>
      </div>
    </>
  );
}
