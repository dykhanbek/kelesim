import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { ReviewResult } from "../../shared/contract-review";
import { formatTenge, NEXT_STATUSES, ORDER_STATUSES, serviceById, STATUS_LABEL, type OrderStatus } from "../../shared/services";
import { api, HttpError, type Order } from "../api";
import { useAuth } from "../auth";
import { FindingCard } from "../components/ReviewView";
import { Field, Loading, Modal, useUi } from "../components/ui";
import { loc, useT } from "../i18n";
import { useS } from "../i18n.services";
import { dmy } from "../lib/format";
import { STATUS_BADGE } from "./Services";

type AdminOrder = Order & { admin_note: string; user_login: string; user_name: string; company: string | null };
interface Detail {
  order: AdminOrder;
  review: { filename: string; text: string; score: number; risk: string; result: ReviewResult } | null;
  deal: { number: string; amount: number; currency: string; counterparty: { name: string; country: string } } | null;
  events: { ts: string; status: OrderStatus; note: string }[];
}
interface Stats { users: number; verified: number; deals: number; reviews: number; orders: number; paid: number; revenue: number; users_week: number }

function OrderModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const s = useS();
  const { toast } = useUi();
  const [d, setD] = useState<Detail | null>(null);
  const [form, setForm] = useState({ result_text: "", result_url: "", admin_note: "", price: "" });
  const [error, setError] = useState("");

  const load = () => api.get<Detail>(`/admin/orders/${id}`).then((r) => {
    setD(r);
    setForm({ result_text: r.order.result_text, result_url: r.order.result_url, admin_note: r.order.admin_note, price: r.order.price === null ? "" : String(r.order.price) });
  }).catch(onClose);
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (status?: OrderStatus) => {
    setError("");
    try {
      await api.patch(`/admin/orders/${id}`, { ...form, price: form.price.trim() === "" ? null : Number(form.price.replace(/\s/g, "")), ...(status ? { status } : {}) });
      toast(t("common.saved"));
      onChanged();
      await load();
    } catch (e) {
      const field = e instanceof HttpError ? e.details?.field : "";
      setError(field === "result" ? s("ad.needResult") : field === "result_url" ? s("ad.badUrl") : t("common.error"));
    }
  };
  if (!d) return <Modal title="…" onClose={onClose} wide><Loading variant="inline" /></Modal>;
  const o = d.order;
  const sv = serviceById(o.service);
  return (
    <Modal title={`${o.number} · ${sv ? loc(sv.title, lang) : o.service}`} onClose={onClose} wide>
      <div className="row mb-16">
        <span className={`badge ${STATUS_BADGE[o.status]}`}>{loc(STATUS_LABEL[o.status], lang)}</span>
        <span className="muted small">{dmy(o.created_at)}</span>
      </div>
      <div className="admin-grid">
        <div>
          <h4>{s("ad.client")}</h4>
          <p>{o.user_name || "—"} · {o.user_login}{o.company ? ` · ${o.company}` : ""}</p>
          <p><span className="muted">{s("ad.contact")}:</span> <b>{o.contact}</b></p>
          <h4 className="mt-16">{s("ad.details")}</h4>
          {sv?.fields.filter((f) => o.details[f.key]).map((f) => <p key={f.key}><span className="muted">{loc(f.label, lang)}:</span> {o.details[f.key]}</p>)}
          {d.deal && <p><span className="muted">{s("sv.deal")}:</span> {d.deal.number} · {d.deal.counterparty?.name} · {d.deal.amount} {d.deal.currency}</p>}
          <h4 className="mt-16">{s("ad.history")}</h4>
          <ul className="timeline">{d.events.map((e, i) => <li key={i}><span className="muted small">{e.ts.replace("T", " ").slice(0, 16)}</span><span>{loc(STATUS_LABEL[e.status], lang)}{e.note ? ` · ${e.note}` : ""}</span></li>)}</ul>
        </div>
        <div>
          <Field label={s("ad.price")}><input className="input" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label={s("ad.result")}><textarea className="textarea" style={{ minHeight: 140 }} value={form.result_text} placeholder={s("ad.resultPh")} onChange={(e) => setForm({ ...form, result_text: e.target.value })} /></Field>
          <Field label={s("ad.resultUrl")}><input className="input" value={form.result_url} onChange={(e) => setForm({ ...form, result_url: e.target.value })} /></Field>
          <Field label={s("ad.note")}><textarea className="textarea" value={form.admin_note} onChange={(e) => setForm({ ...form, admin_note: e.target.value })} /></Field>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="row">
            <button className="btn btn-secondary btn-sm" onClick={() => save()}>{t("common.save")}</button>
            {NEXT_STATUSES[o.status].map((n) => (
              <button key={n} className={`btn btn-sm ${n === "cancelled" ? "btn-ghost" : "btn-primary"}`} onClick={() => save(n)}>→ {loc(STATUS_LABEL[n], lang)}</button>
            ))}
          </div>
        </div>
      </div>
      {d.review && (
        <details className="mt-24">
          <summary><b>{s("ad.contractText")}</b> · {d.review.filename || s("cr.untitled")} · {s("ad.autoReview", { n: d.review.score })}</summary>
          <div className="findings mt-16">{d.review.result.findings.filter((f) => f.sev !== "ok").map((f) => <FindingCard key={f.id} f={f} />)}</div>
          <pre className="letter mt-16" style={{ maxHeight: 420 }}>{d.review.text}</pre>
        </details>
      )}
    </Modal>
  );
}

export function AdminPage() {
  const { t, lang } = useT();
  const s = useS();
  const { me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const open = sp.get("order");

  const load = () => {
    api.get<{ orders: AdminOrder[] }>(`/admin/orders${filter ? `?status=${filter}` : ""}`).then((r) => setOrders(r.orders)).catch(() => setOrders([]));
    api.get<Stats>("/admin/stats").then(setStats).catch(() => {});
  };
  useEffect(load, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me?.is_admin) return <Navigate to="/app" replace />;

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {s("nav.admin")}</div>
      <h1 className="mb-24">{s("ad.title")}</h1>
      {stats && (
        <div className="stats stats-4">
          <div className="card stat"><div className="label">{s("ad.users")}</div><div className="value">{stats.users}</div><div className="muted small">{s("ad.usersWeek", { n: stats.users_week })}</div></div>
          <div className="card stat"><div className="label">{s("ad.deals")}</div><div className="value">{stats.deals}</div></div>
          <div className="card stat"><div className="label">{s("ad.reviews")}</div><div className="value">{stats.reviews}</div></div>
          <div className="card stat card-mint"><div className="label">{s("ad.revenue")}</div><div className="value">{formatTenge(stats.revenue)}</div><div className="muted small">{s("ad.paidOrders", { n: stats.paid })}</div></div>
        </div>
      )}
      <div className="card">
        <div className="filters mb-16">
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as OrderStatus | "")} aria-label={s("ad.status")}>
            <option value="">{s("ad.all")}</option>
            {ORDER_STATUSES.map((st) => <option key={st} value={st}>{loc(STATUS_LABEL[st], lang)}</option>)}
          </select>
        </div>
        {orders === null ? <Loading variant="inline" /> : orders.length === 0 ? <p className="muted">{s("ad.empty")}</p> : (
          <table className="table responsive">
            <thead><tr><th>№</th><th>{s("ad.service")}</th><th>{s("ad.client")}</th><th>{s("ad.price")}</th><th>{s("ad.status")}</th><th>{s("ad.created")}</th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const sv = serviceById(o.service);
                return (
                  <tr key={o.id} className="clickable" onClick={() => setSp({ order: o.id })}>
                    <td><b style={{ fontWeight: 500 }}>{o.number}</b></td>
                    <td>{sv ? loc(sv.title, lang) : o.service}</td>
                    <td>{o.user_name || o.user_login}<span className="muted small m-block"> {o.contact}</span></td>
                    <td className="m-num">{o.price === null ? "—" : formatTenge(o.price)}</td>
                    <td className="m-inline"><span className={`badge ${STATUS_BADGE[o.status]}`}>{loc(STATUS_LABEL[o.status], lang)}</span></td>
                    <td className="muted small m-inline">{dmy(o.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {open && <OrderModal id={open} onClose={() => setSp({})} onChanged={load} />}
    </>
  );
}
