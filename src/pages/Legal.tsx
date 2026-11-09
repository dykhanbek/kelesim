import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { OPERATOR_INCOMPLETE } from "../config";
import { useT } from "../i18n";
import { LEGAL_DATE, LEGAL_DOCS, legalDoc } from "../legal/docs";
import { SimplePage } from "./Public";

/** /legal and /legal/:doc — the service's legal documents with a side navigation. */
export function LegalPage() {
  const { t, lang } = useT();
  const { doc: id } = useParams();
  const doc = legalDoc(id ?? "privacy");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);
  if (!doc) return <Navigate to="/legal/privacy" replace />;

  return (
    <SimplePage title={t("legal.title")}>
      <div className="legal-layout">
        <nav className="legal-nav" aria-label={t("legal.title")}>
          {LEGAL_DOCS.map((d) => (
            <Link key={d.id} to={`/legal/${d.id}`} className={d.id === doc.id ? "on" : ""}>{d.short}</Link>
          ))}
        </nav>
        <article className="card legal-doc">
          {lang === "en" && (
            <div className="alert alert-info mb-24">
              {doc.en} The legally binding version is in Russian.
            </div>
          )}
          {lang === "kk" && <div className="alert alert-info mb-24">{t("legal.kkNote")}</div>}
          {OPERATOR_INCOMPLETE && <div className="alert alert-warn mb-24">{t("legal.draft")}</div>}
          <h2>{doc.title}</h2>
          <p className="small muted mt-8">{t("legal.version", { date: LEGAL_DATE })}</p>
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h3>{s.h}</h3>
              <LegalBody lines={s.body} />
            </section>
          ))}
        </article>
      </div>
    </SimplePage>
  );
}

/** Renders paragraphs, grouping consecutive "• " lines into one list. */
function LegalBody({ lines }: { lines: string[] }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul${out.length}`}>{list.map((l) => <li key={l}>{l}</li>)}</ul>);
    list = [];
  };
  for (const l of lines) {
    if (l.startsWith("• ")) list.push(l.slice(2));
    else { flush(); out.push(<p key={`p${out.length}`}>{l}</p>); }
  }
  flush();
  return <>{out}</>;
}
