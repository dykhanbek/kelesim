import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, HttpError, type DealSummary, type Review } from "../api";
import { ContractInput, type ContractSource } from "../components/ContractInput";
import { ReviewView } from "../components/ReviewView";
import { Field, Loading, RiskBadge, useUi } from "../components/ui";
import { useT } from "../i18n";
import { useS } from "../i18n.services";
import { dmy } from "../lib/format";

/** Text typed on the public page before sign-up waits here until the account exists. */
export const PENDING_KEY = "kls_pending_contract";
export function takePending(): ContractSource | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as ContractSource) : null;
  } catch {
    return null;
  }
}

export function ContractsPage() {
  const { t } = useT();
  const s = useS();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [dealId, setDealId] = useState(sp.get("deal") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (src: ContractSource, deal = dealId) => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ review: Review }>("/contracts", { text: src.text, filename: src.filename, deal_id: deal || undefined });
      try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
      nav(`/app/contracts/${r.review.id}`);
    } catch (e) {
      const code = e instanceof HttpError ? e.code : "";
      setError(code === "contract_too_short" ? s("cr.err.short") : code === "review_limit" ? s("cr.err.limit") : t("common.error"));
      setBusy(false);
    }
  };

  useEffect(() => {
    api.get<{ reviews: Review[] }>("/contracts").then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
    api.get<{ items: DealSummary[] }>("/deals").then((r) => setDeals(r.items ?? [])).catch(() => {});
    // continue a review started on the public page
    const pending = takePending();
    if (pending) void run(pending, "");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {s("nav.contracts")}</div>
      <div className="page-head">
        <div>
          <h1>{s("cr.title")}</h1>
          <p className="sub" style={{ maxWidth: 720 }}>{s("cr.sub")}</p>
        </div>
      </div>
      <div className="card">
        <ContractInput onSubmit={(src) => run(src)} busy={busy}>
          {deals.length > 0 && (
            <div className="mt-16" style={{ maxWidth: 420 }}>
              <Field label={s("cr.deal")} hint={s("cr.dealHint")}>
                <select className="select" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                  <option value="">{s("cr.dealNone")}</option>
                  {deals.map((d) => <option key={d.id} value={d.id}>{d.number} · {d.counterparty_name || "—"}</option>)}
                </select>
              </Field>
            </div>
          )}
        </ContractInput>
        {error && <div className="alert alert-error mt-16" role="alert">{error}</div>}
      </div>

      <div className="card mt-24">
        <h3 className="mb-16">{s("cr.history")}</h3>
        {reviews === null ? <Loading variant="inline" /> : reviews.length === 0 ? <p className="muted">{s("cr.historyEmpty")}</p> : (
          <table className="table responsive">
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => nav(`/app/contracts/${r.id}`)}>
                  <td><b style={{ fontWeight: 500 }}>{r.filename || s("cr.untitled")}</b>{r.deal_number && <span className="muted small m-block"> {r.deal_number}</span>}</td>
                  <td className="m-num">{r.score}/100</td>
                  <td className="m-inline"><RiskBadge risk={r.risk} /></td>
                  <td className="muted small m-inline">{dmy(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function ContractReviewPage() {
  const { t } = useT();
  const s = useS();
  const { id } = useParams();
  const nav = useNavigate();
  const { confirm } = useUi();
  const [r, setR] = useState<Review | null>(null);

  useEffect(() => {
    api.get<{ review: Review }>(`/contracts/${id}`).then((x) => setR(x.review)).catch(() => nav("/app/contracts", { replace: true }));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Loading />;

  const supplier = /(?:The Seller|Seller|Продавец|Поставщик|卖方)\s*[:：]\s*([^\n,;，。]{3,80})/i.exec(r.text ?? "")?.[1]?.trim();
  return (
    <>
      <div className="crumbs">{t("shell.account")} / <Link to="/app/contracts">{s("nav.contracts")}</Link></div>
      <div className="page-head">
        <div>
          <h1>{r.filename || s("cr.untitled")}</h1>
          <p className="sub">{dmy(r.created_at)}{r.deal_number && r.deal_id ? <> · <Link to={`/app/deals/${r.deal_id}`}>{s("rr.dealLink", { n: r.deal_number })}</Link></> : null}</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={async () => {
            if (!(await confirm({ title: s("rr.deleteQ"), ok: t("common.delete"), danger: true }))) return;
            await api.del(`/contracts/${r.id}`);
            nav("/app/contracts");
          }}>{s("rr.delete")}</button>
          <Link className="btn btn-primary" to="/app/contracts">{s("rr.again")}</Link>
        </div>
      </div>
      <div className="review-wrap">
        <ReviewView r={r.result} reviewId={r.id} dealId={r.deal_id} supplier={supplier} />
      </div>
    </>
  );
}
