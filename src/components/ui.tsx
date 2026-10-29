import { AlertTriangle, Check, CircleAlert, Mail, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SUPPORT_EMAIL } from "../config";
import { useT, type TKey } from "../i18n";

// ── Logo: "kelisim" with the dots of both i's joined by a line (delivery from point A to point B)
export function Logo({ height = 30, light = false }: { height?: number; light?: boolean }) {
  const style = { height, width: "auto", display: "block" };
  if (light) return <img src="/logo-white.svg" alt="Kelisim" style={style} />;
  return (
    <>
      <img className="logo-l" src="/logo.svg" alt="Kelisim" style={style} />
      <img className="logo-d" src="/logo-dark.svg" alt="Kelisim" style={style} />
    </>
  );
}

// ── Field wrapper with label, hint and error (UI kit: input with hint and error)
export function Field({ label, error, hint, children, help, htmlFor }: { label: ReactNode; error?: string; hint?: string; help?: TKey; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {help && <Hint k={help} />}
      </label>
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

/** "?" hint with a plain-language explanation (UX principle: plain language). */
export function Hint({ k }: { k: TKey }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className="hint-btn" aria-label="?" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>?</button>
      {open && <span className="hint-pop" role="tooltip">{t(k)}</span>}
    </span>
  );
}

// ── Badges: colour is never the only signal — icon + text
export function RiskBadge({ risk, ucn }: { risk: string | null | undefined; ucn?: boolean }) {
  const { t } = useT();
  if (risk === "red") return <span className="badge badge-red"><CircleAlert />{t("risk.red")}</span>;
  if (risk === "yellow") return <span className="badge badge-yellow"><AlertTriangle />{ucn ? t("risk.ucn") : t("risk.yellow")}</span>;
  if (risk === "green") return <span className="badge badge-green"><Check />{t("risk.green")}</span>;
  return <span className="badge badge-gray">{t("risk.none")}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const cls = status === "closed" ? "badge-mint" : status === "active" ? "badge-indigo" : "badge-gray";
  return <span className={`badge ${cls}`}>{t(`status.${status}` as TKey)}</span>;
}

// ── Modal
export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Toasts, confirm dialog, support modal (global UI services)
export interface ConfirmOptions {
  title: string;
  text?: string;
  ok?: string;
  danger?: boolean;
}
interface UiApi {
  toast: (msg: string, kind?: "ok" | "err" | "info") => void;
  openSupport: () => void;
  /** Promise-based confirmation for destructive actions. */
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}
const UiCtx = createContext<UiApi | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [support, setSupport] = useState(false);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const toast = useCallback((msg: string, kind: "ok" | "err" | "info" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setToasts((x) => x.filter((tt) => tt.id !== id)), 3500);
  }, []);
  const openSupport = useCallback(() => setSupport(true), []);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), []);
  const answer = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <UiCtx.Provider value={{ toast, openSupport, confirm }}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.msg}</div>)}
      </div>
      {ask && (
        <Modal title={ask.title} onClose={() => answer(false)}>
          {ask.text && <p className="muted mb-24">{ask.text}</p>}
          <div className="row">
            <button className={`btn ${ask.danger ? "btn-danger" : "btn-primary"}`} onClick={() => answer(true)}>{ask.ok ?? t("common.confirm")}</button>
            <button className="btn btn-secondary" onClick={() => answer(false)}>{t("common.cancel")}</button>
          </div>
        </Modal>
      )}
      {support && (
        <Modal title={t("help.contact")} onClose={() => setSupport(false)}>
          <div className="card card-indigo" style={{ boxShadow: "none" }}>
            <div className="muted small">{t("help.email")}</div>
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ fontSize: 24, lineHeight: "34px", color: "var(--text-2)", display: "inline-flex", gap: 10, alignItems: "center", marginTop: 6, wordBreak: "break-all" }}>
              <Mail size={20} /> {SUPPORT_EMAIL}
            </a>
          </div>
          <p className="muted small mt-16">{t("help.contactT")}</p>
          <button className="btn btn-primary btn-block mt-24" onClick={() => setSupport(false)}>{t("common.understood")}</button>
        </Modal>
      )}
    </UiCtx.Provider>
  );
}

export function useUi() {
  const c = useContext(UiCtx);
  if (!c) throw new Error("UiProvider missing");
  return c;
}

/** Skeleton placeholder shown while a page loads (instead of a "Loading…" line). */
export function Loading({ variant = "page" }: { variant?: "page" | "inline" }) {
  const { t } = useT();
  if (variant === "inline") return <div className="sk-wrap" aria-busy="true" aria-label={t("common.loading")}><div className="sk sk-line" /><div className="sk sk-line w60" /></div>;
  return (
    <div className="sk-wrap" aria-busy="true" aria-label={t("common.loading")}>
      <div className="sk sk-crumb" />
      <div className="sk sk-title" />
      <div className="sk-grid">
        <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
      </div>
      <div className="sk sk-block" />
    </div>
  );
}
