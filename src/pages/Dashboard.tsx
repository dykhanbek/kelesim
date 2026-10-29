import { Plus, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Deadline, type DealSummary } from "../api";
import { useAuth } from "../auth";
import { Loading, RiskBadge, StatusBadge } from "../components/ui";
import { useT, type TKey } from "../i18n";
import { dayMonth, daysLeft, money } from "../lib/format";

interface DashboardData {
  today: string;
  total_deals: number;
  stats: { active: number; attention: number; drafts: number };
  nearest: Deadline | null;
  upcoming: Deadline[];
  overdue: Deadline[];
  deals: DealSummary[];
  next: { kind: string; deal_id?: string; deal_number?: string; counterparty?: string; deadline_kind?: string; due_date?: string };
  telegram_connected: boolean;
}

export function Dashboard() {
  const { t, lang } = useT();
  const { me } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get<DashboardData>("/dashboard").then(setD);
  }, []);

  if (!d) return <Loading />;

  if (d.total_deals === 0) {
    return (
      <>
        <div className="crumbs">{t("shell.account")} / {t("nav.dashboard")}</div>
        <h1 className="mb-24">{t("dash.emptyH1")}</h1>
        <div className="card empty mt-32">
          <div className="plus"><Plus size={40} /></div>
          <h2>{t("dash.emptyH")}</h2>
          <p>{t("dash.emptyT")}</p>
          <Link to="/app/deals/new" className="btn btn-primary" style={{ minWidth: 296 }}>{t("dash.emptyBtn")}</Link>
        </div>
      </>
    );
  }

  const nearestLeft = d.nearest ? daysLeft(d.nearest.due_date) : null;
  const kindName = (k?: string) => (k ? t(`kind.${k}` as TKey) : "");
  const next = d.next;
  const nextTitle =
    next.kind === "ucn" ? t("dash.next.ucn")
    : next.kind === "overdue" ? t("dash.next.overdue", { kind: kindName(next.deadline_kind).toLowerCase() })
    : next.kind === "deadline" ? t("dash.next.deadline", { kind: kindName(next.deadline_kind).toLowerCase(), date: dayMonth(next.due_date!, lang) })
    : next.kind === "draft" ? t("dash.next.draft", { num: next.deal_number ?? "" })
    : t("dash.next.new");
  const vars = { cp: next.counterparty ?? "", num: next.deal_number ?? "", date: next.due_date ? dayMonth(next.due_date, lang) : "" };
  const nextText =
    next.kind === "ucn" ? t("dash.next.ucnT", vars)
    : next.kind === "overdue" ? t("dash.next.overdueT", vars)
    : next.kind === "deadline" ? t("dash.next.deadlineT", vars)
    : next.kind === "draft" ? t("dash.next.draftT", vars)
    : t("dash.next.newT");
  const nextLink = next.kind === "new_deal" ? "/app/deals/new"
    : next.kind === "draft" ? `/app/deals/${next.deal_id}/edit`
    : `/app/deals/${next.deal_id}${next.kind === "ucn" ? "" : "?tab=deadlines"}`;

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.dashboard")}</div>
      <div className="page-head">
        <div>
          <h1>{t("dash.hello", { name: me?.name || "👋" })}</h1>
          <p className="sub">{t("dash.sub")}</p>
        </div>
        <Link to="/app/deals/new" className="btn btn-primary btn-wide" style={{ minWidth: 184 }}>{t("dash.newDeal")}</Link>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">{t("dash.active")}</div>
          <div className="value">{d.stats.active}</div>
          <div className="muted small">{t("dash.activeNote")}</div>
        </div>
        <div className="card stat card-mint" style={{ cursor: d.nearest ? "pointer" : undefined }} onClick={() => d.nearest && nav(`/app/calendar?date=${d.nearest.due_date}`)}>
          <div className="label">{t("dash.nearest")}</div>
          <div className="value">{d.nearest ? dayMonth(d.nearest.due_date, lang) : "—"}</div>
          <div className="muted small">
            {d.nearest ? `${kindName(d.nearest.kind)} · ${nearestLeft === 0 ? t("dash.today") : t("dash.inDays", { n: nearestLeft! })}` : t("dash.noNearest")}
          </div>
        </div>
        <div className={`card stat ${d.overdue.length ? "card-risk" : ""}`}>
          <div className="label">{t("dash.attention")}</div>
          <div className="value">{d.stats.attention}</div>
          <div className="muted small">{d.stats.attention ? t("dash.attentionNote") : t("dash.attentionNone")}</div>
        </div>
      </div>

      {d.overdue.length > 0 && (
        <div className="card card-risk mb-24" style={{ boxShadow: "none" }}>
          <b>! {t("dash.overdueBanner", { n: d.overdue.length })}</b>
          {d.overdue.map((o) => (
            <div key={o.id} className="row mt-8" style={{ justifyContent: "space-between" }}>
              <span>{kindName(o.kind)} · {o.counterparty_name} · {o.deal_number} · {t("deal.overdueBy", { n: -daysLeft(o.due_date) })}</span>
              <Link to={`/app/deals/${o.deal_id}?tab=deadlines`} style={{ color: "var(--risk)", fontWeight: 600 }}>{t("common.open")} →</Link>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="mb-16">{t("dash.dealsH")}</h3>
        <table className="table responsive">
          <thead>
            <tr><th>{t("dash.colCp")}</th><th>{t("dash.colSum")}</th><th>{t("dash.colCheck")}</th><th>{t("dash.colStage")}</th></tr>
          </thead>
          <tbody>
            {d.deals.map((x) => (
              <tr key={x.id} className="clickable" onClick={() => nav(x.status === "draft" ? `/app/deals/${x.id}/edit` : `/app/deals/${x.id}`)}>
                <td><b style={{ fontWeight: 500 }}>{x.counterparty_name || "—"}</b> <span className="muted small m-block">{x.number}</span></td>
                <td className="m-num">{money(x.amount, x.currency)}</td>
                <td className="m-inline"><RiskBadge risk={x.risk} ucn={x.check?.ucn_required && !x.ucn} /></td>
                <td className="m-inline"><StatusBadge status={x.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link to={nextLink} className="card card-indigo mt-24" style={{ display: "block", textDecoration: "none", boxShadow: "none" }}>
        <h3 style={{ color: "var(--indigo)" }}>{nextTitle}</h3>
        <p className="muted mt-8">{nextText}</p>
      </Link>

      {!d.telegram_connected && (
        <div className="card mt-24 row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 16 }}>
            <Send color="var(--indigo)" />
            <div><b>{t("dash.tgH")}</b><p className="muted small">{t("dash.tgT")}</p></div>
          </div>
          <Link to="/app/settings" className="btn btn-secondary btn-sm">{t("dash.tgBtn")}</Link>
        </div>
      )}
    </>
  );
}
