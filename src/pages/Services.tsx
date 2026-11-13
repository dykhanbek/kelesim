import { Check, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatTenge, SERVICES, serviceById, STATUS_LABEL, type OrderStatus, type Service } from "../../shared/services";
import { api, HttpError, type DealSummary, type Order, type PaymentInfo, type Review } from "../api";
import { useAuth } from "../auth";
import { Field, Loading, Modal, useUi } from "../components/ui";
import { loc, useT } from "../i18n";
import { useS } from "../i18n.services";
import { dmy } from "../lib/format";

export const STATUS_BADGE: Record<OrderStatus, string> = {
  new: "badge-indigo", awaiting_payment: "badge-yellow", payment_reported: "badge-indigo", in_progress: "badge-mint", done: "badge-green", cancelled: "badge-gray",
};

export function ServicePrice({ sv }: { sv: Service }) {
  const { lang } = useT();
  const s = useS();
  if (sv.price !== null) {
    return <div className="svc-price"><b>{formatTenge(sv.price)}</b>{sv.days && <span className="muted small"><Clock size={14} />{sv.days === 1 ? s("sv.days1") : s("sv.daysN", { n: sv.days })}</span>}</div>;
  }
  return <div className="svc-price"><span className="svc-note">{loc(sv.priceNote, lang)}</span></div>;
}

export function ServiceCard({ sv, action }: { sv: Service; action: React.ReactNode }) {
  const { lang } = useT();
  const s = useS();
  return (
    <div className={`card svc-card ${sv.soon ? "soon" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3>{loc(sv.title, lang)}</h3>
        {sv.soon && <span className="badge badge-gray">{s("sv.soon")}</span>}
      </div>
      <p className="muted mt-8">{loc(sv.short, lang)}</p>
      <ul className="svc-list">
        {sv.includes.map((x, i) => <li key={i}><Check size={16} /><span>{loc(x, lang)}</span></li>)}
      </ul>
      <div className="svc-foot">
        <ServicePrice sv={sv} />
        {action}
      </div>
    </div>
  );
}

function OrderForm({ sv, reviewId, dealId, onDone, onClose }: { sv: Service; reviewId: string; dealId: string; onDone: (o: Order) => void; onClose: () => void }) {
  const { t, lang } = useT();
  const s = useS();
  const { me } = useAuth();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [contact, setContact] = useState(me && !me.is_demo ? me.login : "");
  const [deal, setDeal] = useState(dealId);
  const [review, setReview] = useState(reviewId);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [bad, setBad] = useState("");
  const [busy, setBusy] = useState(false);
  const needsReview = sv.id === "lawyer_review";

  useEffect(() => {
    api.get<{ items: DealSummary[] }>("/deals").then((r) => {
      setDeals(r.items ?? []);
      const d = (r.items ?? []).find((x) => x.id === dealId);
      if (d?.counterparty_name) setVals((v) => ({ supplier: d.counterparty_name, ...v }));
    }).catch(() => {});
    if (needsReview) api.get<{ reviews: Review[] }>("/contracts").then((r) => { setReviews(r.reviews); if (!reviewId && r.reviews[0]) setReview(r.reviews[0].id); }).catch(() => setReviews([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    setBad("");
    try {
      const r = await api.post<{ order: Order }>("/orders", { service: sv.id, details: vals, contact, deal_id: deal || undefined, review_id: review || undefined });
      onDone(r.order);
    } catch (e) {
      if (e instanceof HttpError && e.code === "order_field") setBad(e.details?.field ?? "");
      else setBad("_");
      setBusy(false);
    }
  };

  if (needsReview && reviews !== null && reviews.length === 0) {
    return (
      <Modal title={loc(sv.title, lang)} onClose={onClose}>
        <p className="mb-24">{s("sv.reviewNone")}</p>
        <Link className="btn btn-primary" to="/app/contracts">{s("sv.reviewGo")}</Link>
      </Modal>
    );
  }
  return (
    <Modal title={loc(sv.title, lang)} onClose={onClose}>
      <div className="mb-16"><ServicePrice sv={sv} /></div>
      {needsReview && (
        <Field label={s("sv.review")} error={bad === "review" ? s("sv.required") : undefined}>
          <select className="select" value={review} onChange={(e) => setReview(e.target.value)}>
            {(reviews ?? []).map((r) => <option key={r.id} value={r.id}>{r.filename || s("cr.untitled")} · {dmy(r.created_at)}</option>)}
          </select>
        </Field>
      )}
      {sv.fields.map((f) => (
        <Field key={f.key} label={<>{loc(f.label, lang)}{!f.required && <span className="muted small"> · {t("common.optional")}</span>}</>} error={bad === f.key ? s("sv.required") : undefined}>
          {f.multiline
            ? <textarea className={`textarea ${bad === f.key ? "err" : ""}`} value={vals[f.key] ?? ""} placeholder={loc(f.placeholder, lang)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            : <input className={`input ${bad === f.key ? "err" : ""}`} value={vals[f.key] ?? ""} placeholder={loc(f.placeholder, lang)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />}
        </Field>
      ))}
      {deals.length > 0 && !needsReview && (
        <Field label={<>{s("sv.deal")}<span className="muted small"> · {t("common.optional")}</span></>}>
          <select className="select" value={deal} onChange={(e) => setDeal(e.target.value)}>
            <option value="">—</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.number} · {d.counterparty_name || "—"}</option>)}
          </select>
        </Field>
      )}
      <Field label={s("sv.contact")} error={bad === "contact" ? s("sv.required") : undefined}>
        <input className={`input ${bad === "contact" ? "err" : ""}`} value={contact} placeholder={s("sv.contactPh")} onChange={(e) => setContact(e.target.value)} />
      </Field>
      {bad === "_" && <div className="alert alert-error" role="alert">{t("common.error")}</div>}
      <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>{sv.price !== null ? s("sv.submit") : s("sv.submitReq")}</button>
      <p className="small muted mt-16">{s("sv.agree")} <Link to="/legal/offer" target="_blank">{s("sv.offer")}</Link></p>
    </Modal>
  );
}

export function OrderCard({ o, payment, onChanged, highlight }: { o: Order; payment: PaymentInfo; onChanged: () => void; highlight?: boolean }) {
  const { lang } = useT();
  const s = useS();
  const { toast, confirm } = useUi();
  const sv = serviceById(o.service);
  const price = o.price !== null ? formatTenge(o.price) : "";
  const act = async (path: "paid" | "cancel") => {
    if (path === "cancel" && !(await confirm({ title: s("sv.cancelQ", { n: o.number }), ok: s("sv.cancel"), danger: true }))) return;
    await api.post(`/orders/${o.id}/${path}`);
    if (path === "paid") toast(s("sv.paidToast"));
    onChanged();
  };
  return (
    <div className={`order ${highlight ? "hl" : ""}`} id={`order-${o.id}`}>
      <div className="order-head">
        <div>
          <b>{sv ? loc(sv.title, lang) : o.service}</b>
          <div className="small muted">{o.number} · {dmy(o.created_at)}{price ? ` · ${price}` : ""}{o.details.supplier ? ` · ${o.details.supplier}` : ""}</div>
        </div>
        <span className={`badge ${STATUS_BADGE[o.status]}`}>{loc(STATUS_LABEL[o.status], lang)}</span>
      </div>
      {o.status === "awaiting_payment" && (
        <div className="pay-box">
          <b>{s("sv.payH")}</b>
          <p>{payment.kaspi ? s("sv.payKaspi", { price, kaspi: payment.kaspi, recipient: payment.recipient ?? "Kelisim", n: o.number }) : s("sv.payLater", { price })}</p>
          <div className="row mt-8">
            {payment.kaspi && <button className="btn btn-primary btn-sm" onClick={() => act("paid")}>{s("sv.paid")}</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => act("cancel")}>{s("sv.cancel")}</button>
          </div>
        </div>
      )}
      {(o.status === "new" || o.status === "payment_reported" || o.status === "in_progress") && <p className="muted small mt-8">{s(`sv.st.${o.status}`)}</p>}
      {o.status === "new" && <button className="btn btn-ghost btn-sm mt-8" onClick={() => act("cancel")}>{s("sv.cancel")}</button>}
      {(o.result_text || o.result_url) && (
        <div className="result-box">
          <b>{s("sv.resultH")}</b>
          {o.result_text && <p className="pre">{o.result_text}</p>}
          {o.result_url && <a className="btn btn-secondary btn-sm mt-8" href={o.result_url} target="_blank" rel="noreferrer noopener">{s("sv.resultFile")}</a>}
        </div>
      )}
    </div>
  );
}

export function ServicesPage() {
  const { t } = useT();
  const s = useS();
  const { toast } = useUi();
  const [sp, setSp] = useSearchParams();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [payment, setPayment] = useState<PaymentInfo>({ kaspi: null, recipient: null });
  const open = serviceById(sp.get("service") ?? "");
  const hl = sp.get("order");

  const load = () => api.get<{ orders: Order[]; payment: PaymentInfo }>("/orders").then((r) => { setOrders(r.orders); setPayment(r.payment); }).catch(() => setOrders([]));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (hl && orders) document.getElementById(`order-${hl}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hl, orders]);

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {s("nav.services")}</div>
      <div className="page-head">
        <div>
          <h1>{s("sv.title")}</h1>
          <p className="sub" style={{ maxWidth: 720 }}>{s("sv.sub")}</p>
        </div>
      </div>

      {orders === null ? <Loading variant="inline" /> : orders.length > 0 && (
        <div className="card mb-24">
          <h3 className="mb-16">{s("sv.my")}</h3>
          {orders.map((o) => <OrderCard key={o.id} o={o} payment={payment} onChanged={load} highlight={o.id === hl} />)}
        </div>
      )}

      <div className="svc-grid">
        {SERVICES.map((sv) => (
          <ServiceCard key={sv.id} sv={sv} action={
            <button className={`btn ${sv.price !== null ? "btn-primary" : "btn-secondary"}`} onClick={() => setSp({ service: sv.id })}>{sv.price !== null ? s("sv.order") : s("sv.request")}</button>
          } />
        ))}
      </div>

      {open && (
        <OrderForm sv={open} reviewId={sp.get("review") ?? ""} dealId={sp.get("deal") ?? ""} onClose={() => setSp({})}
          onDone={(o) => {
            toast(o.status === "awaiting_payment" ? s("sv.created", { n: o.number }) : s("sv.requested", { n: o.number }));
            setSp({ order: o.id });
            void load();
          }} />
      )}
    </>
  );
}
