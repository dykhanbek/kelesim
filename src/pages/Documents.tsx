import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Loading, StatusBadge } from "../components/ui";
import { useT, type TKey } from "../i18n";
import { dmy, money } from "../lib/format";

interface DocRow { id: string; number: string; counterparty_name: string; contract_type: string; lang_pair: string; amount: number; currency: string; docs_generated_at: string; status: string }

export function DocumentsPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [items, setItems] = useState<DocRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get<{ items: DocRow[] }>("/documents").then((r) => setItems(r.items)); }, []);
  const filtered = (items ?? []).filter((d) => `${d.number} ${d.counterparty_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.documents")}</div>
      <div className="page-head"><div><h1>{t("docs.title")}</h1><p className="sub">{t("docs.sub")}</p></div></div>
      <div className="filters"><input className="input" style={{ maxWidth: 420 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shell.search")} /></div>
      <div className="card">
        {!items ? <Loading variant="inline" /> : filtered.length === 0 ? <p className="muted">{t("docs.empty")}</p> : (
          <table className="table responsive">
            <thead><tr><th>{t("deals.number")}</th><th>{t("dash.colCp")}</th><th>{t("wiz.ctype")}</th><th>{t("dash.colSum")}</th><th>{t("docs.generated")}</th><th>{t("dash.colStage")}</th></tr></thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => nav(`/app/deals/${d.id}/documents`)}>
                  <td><span className="row" style={{ gap: 8 }}><FileText size={16} color="var(--indigo)" /><b style={{ fontWeight: 600 }}>{d.number}</b></span></td>
                  <td>{d.counterparty_name}</td>
                  <td className="muted">{t(`ctype.${d.contract_type}` as TKey)} · {d.lang_pair === "ru-cn" ? "RU/CN" : "RU/EN"}</td>
                  <td className="m-num">{money(d.amount, d.currency)}</td>
                  <td className="muted small m-inline">{dmy(d.docs_generated_at)}</td>
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
