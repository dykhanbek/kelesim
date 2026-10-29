import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useUi } from "../components/ui";
import { useT, type TKey } from "../i18n";

export function HelpPage() {
  const { t } = useT();
  const { openSupport } = useUi();
  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("help.title")}</div>
      <div className="page-head">
        <h1>{t("help.title")}</h1>
        <button className="btn btn-primary btn-wide" onClick={openSupport}>{t("help.contact")}</button>
      </div>
      <div className="two-col">
        <div className="card">
          <h2>{t("help.glossary")}</h2>
          <dl className="glossary">
            {(["ucn", "rep", "inc", "sanc"] as const).map((k) => (
              <div key={k}><dt>{t(`help.g.${k}` as TKey)}</dt><dd>{t(`help.g.${k}T` as TKey)}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card faq">
          <h2 className="mb-16">{t("help.faq")}</h2>
          {(["1", "2", "3", "4"] as const).map((n) => (
            <details key={n}><summary>{t(`land.q${n}` as TKey)}</summary><p>{t(`land.a${n}` as TKey)}</p></details>
          ))}
        </div>
      </div>
    </>
  );
}

/** Free plan limit reached (state from the mockups). */
export function LimitPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [u, setU] = useState({ used: 2, limit: 2 });
  useEffect(() => { api.get("/account/usage").then((r) => setU({ used: r.used, limit: r.limit ?? r.used })); }, []);
  const dealId = sp.get("deal");
  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.documents")}</div>
      <h1>{t("lim.title")}</h1>
      <div className="card center-card">
        <span className="badge badge-indigo">{t("lim.badge", u)}</span>
        <h2 className="result-head">{t("lim.h")}</h2>
        <p className="result-text mb-24">{t("lim.t")}</p>
        <div className="row mt-32">
          <button className="btn btn-primary btn-wide" onClick={() => nav("/app/settings?tab=plan")}>{t("lim.compare")}</button>
          <button className="btn btn-secondary btn-wide" onClick={() => nav(dealId ? `/app/deals/${dealId}/documents` : "/app")}>{dealId ? t("lim.back") : t("lim.backDash")}</button>
        </div>
      </div>
    </>
  );
}
