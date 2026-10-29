import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, HttpError } from "../api";
import { useAuth } from "../auth";
import { Field, useUi } from "../components/ui";
import { errText, useT, type TKey } from "../i18n";
import { getThemePref, setThemePref, type ThemePref } from "../theme";
import { PricingCards } from "./Public";

interface TgStatus {
  configured: boolean;
  connected: boolean;
  bot_username: string | null;
  preview: { text: string; reply_markup: { inline_keyboard: { text: string }[][] } } | null;
}

/** Telegram connection card: deep link + QR when the bot is configured, a message preview otherwise. */
export function TelegramConnect({ compact }: { compact?: boolean }) {
  const { t } = useT();
  const { toast, confirm } = useUi();
  const { me, refresh } = useAuth();
  const [st, setSt] = useState<TgStatus | null>(null);
  const [link, setLink] = useState<{ url: string; qr: string } | null>(null);

  const load = () => api.get<TgStatus>("/telegram/status").then(setSt);
  useEffect(() => { void load(); }, []);

  const connect = async () => {
    try {
      const r = await api.post<{ url: string }>("/telegram/link");
      setLink({ url: r.url, qr: await QRCode.toDataURL(r.url, { margin: 1, width: 280, color: { dark: "#3C3489" } }) });
    } catch (e) {
      toast(errText(t, e instanceof HttpError ? e.code : ""), "err");
    }
  };
  if (!st) return null;
  const buttons = st.preview?.reply_markup.inline_keyboard.flat() ?? [];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ maxWidth: 520 }}>
          <h3 style={{ fontSize: 22, lineHeight: "30px" }}>{st.connected ? `✓ ${t("set.tgConnected")}` : t("set.tgH")}</h3>
          <p className="muted mt-8">{t("set.tgT")}</p>
        </div>
        {st.configured && !st.connected && !link && <button className="btn btn-primary btn-wide" onClick={connect}>{t("set.tgConnect")}</button>}
        {st.connected && (
          <div className="row">
            <button className="btn btn-secondary btn-sm" onClick={async () => { try { await api.post("/telegram/test"); toast(t("common.saved")); } catch (e) { toast(errText(t, e instanceof HttpError ? e.code : ""), "err"); } }}>{t("set.tgTest")}</button>
            <button className="btn btn-ghost" onClick={async () => { if (!(await confirm({ title: t("set.tgDisconnectQ"), ok: t("set.tgDisconnect"), danger: true }))) return; await api.post("/telegram/unlink"); await load(); await refresh(); }}>{t("set.tgDisconnect")}</button>
          </div>
        )}
      </div>
      {me?.plan !== "pro" && st.configured && <p className="small mt-16" style={{ color: "var(--warn)" }}>{t("set.tgProOnly")}</p>}
      {link && (
        <div className="row mt-24" style={{ alignItems: "flex-start", gap: 24 }}>
          <img className="qr" src={link.qr} alt="QR" />
          <div style={{ maxWidth: 340 }}>
            <p className="muted">{t("set.tgScan")}</p>
            <div className="row mt-16">
              <a className="btn btn-primary" href={link.url} target="_blank" rel="noreferrer">{t("set.tgOpen")}</a>
              <button className="btn btn-secondary" onClick={async () => { await load(); await refresh(); }}>{t("set.tgRefresh")}</button>
            </div>
          </div>
        </div>
      )}
      {!st.configured && <div className="alert alert-info mt-16">{t("set.tgNotConfigured")}</div>}
      {!compact && st.preview && (
        <>
          <div className="caps mt-24 mb-8">{t("set.preview")}</div>
          <div className="tg-msg" style={{ maxWidth: 560 }}>
            <p>{st.preview.text}</p>
            <div className="btns">
              {buttons.map((b, i) => <span key={i} className={`btn btn-sm ${i === 0 ? "btn-primary" : "btn-secondary"}`}>{b.text}</span>)}
            </div>
          </div>
        </>
      )}
      <p className="small muted mt-16">{t("set.inApp")}</p>
    </div>
  );
}

/** Email reminders card: address (for phone logins), on/off, test email. */
function EmailReminders() {
  const { t } = useT();
  const { toast } = useUi();
  const { me, emailEnabled, refresh } = useAuth();
  const [email, setEmail] = useState(me?.email ?? "");
  const [err, setErr] = useState<string | null>(null);
  if (!me) return null;
  const save = async (patch: Record<string, unknown>) => {
    setErr(null);
    try {
      await api.patch("/account/me", patch);
      await refresh();
      toast(t("common.saved"));
    } catch (e) {
      setErr(e instanceof HttpError && e.details?.email ? t("err.invalid_email") : errText(t, e instanceof HttpError ? e.code : ""));
    }
  };
  return (
    <div className="card mt-24">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ maxWidth: 520 }}>
          <h3 style={{ fontSize: 22, lineHeight: "30px" }}>{t("set.emailH")}</h3>
          <p className="muted mt-8">{t("set.emailT")}</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={me.email_reminders} onChange={(e) => save({ email_reminders: e.target.checked })} />
          <span>{me.email_reminders ? t("set.on") : t("set.off")}</span>
        </label>
      </div>
      <div className="row mt-16" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px" }}>
          <Field label={t("set.emailField")} error={err ?? undefined}>
            <input className={`input ${err ? "err" : ""}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.kz" />
          </Field>
        </div>
        <div className="row" style={{ marginBottom: 20 }}>
          <button className="btn btn-secondary" onClick={() => save({ email })}>{t("common.save")}</button>
          {emailEnabled && me.email && (
            <button className="btn btn-ghost" onClick={async () => { try { await api.post("/account/email-test"); toast(t("set.emailSent")); } catch (e) { toast(errText(t, e instanceof HttpError ? e.code : ""), "err"); } }}>{t("set.emailTest")}</button>
          )}
        </div>
      </div>
      {!emailEnabled && <div className="alert alert-info" style={{ marginBottom: 0 }}>{t("set.emailNotConfigured")}</div>}
    </div>
  );
}

type Tab = "notifications" | "plan" | "language" | "security";

export function SettingsPage() {
  const { t, lang, setLang } = useT();
  const { toast, confirm } = useUi();
  const { me, refresh } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "notifications";
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  useEffect(() => {
    const on = () => setTheme(getThemePref());
    window.addEventListener("kls-theme", on);
    return () => window.removeEventListener("kls-theme", on);
  }, []);

  const changePlan = async (plan: string) => {
    const order = ["free", "basic", "pro"];
    if (me && order.indexOf(plan) < order.indexOf(me.plan)) {
      if (!(await confirm({ title: t("set.planDownQ", { plan: t(`plan.${plan}` as TKey) }), text: t("set.planDownT") }))) return;
    }
    await api.patch("/account/me", { plan });
    await refresh();
    toast(t("plan.changed"));
  };
  const changeLang = async (l: "ru" | "en") => {
    setLang(l);
    await api.patch("/account/me", { lang: l });
  };
  const changePw = async () => {
    setPwErr(null);
    try {
      await api.post("/account/password", pw);
      setPw({ current: "", next: "" });
      toast(t("set.pwdChanged"));
    } catch (e) {
      setPwErr(errText(t, e instanceof HttpError ? e.code : ""));
    }
  };

  return (
    <>
      <div className="crumbs">{t("shell.account")} / {t("nav.settings")}</div>
      <h1>{t("set.title")}</h1>
      <div className="tabs" style={{ marginTop: 16 }}>
        {(["notifications", "plan", "language", "security"] as const).map((k) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setSp({ tab: k }, { replace: true })}>{t(`set.tab.${k}` as TKey)}</button>
        ))}
      </div>
      {tab === "notifications" && <><TelegramConnect /><EmailReminders /></>}
      {tab === "plan" && <PricingCards current={me?.plan} onSelect={changePlan} />}
      {tab === "language" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 className="mb-16">{t("set.langH")}</h3>
          <div className="mode-switch">
            <button className={lang === "ru" ? "on" : ""} onClick={() => changeLang("ru")}>Русский</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => changeLang("en")}>English</button>
          </div>
          <h3 className="mt-24 mb-16">{t("set.themeH")}</h3>
          <div className="mode-switch">
            {(["system", "light", "dark"] as const).map((m) => (
              <button key={m} className={theme === m ? "on" : ""} onClick={() => { setTheme(m); setThemePref(m); }}>{t(`set.theme.${m}` as TKey)}</button>
            ))}
          </div>
        </div>
      )}
      {tab === "security" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <p className="muted mb-24">{t("set.loggedAs", { login: me?.login ?? "" })}</p>
          <h3 className="mb-16">{t("set.secH")}</h3>
          {pwErr && <div className="alert alert-error">{pwErr}</div>}
          <Field label={t("set.current")}><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label={t("auth.newPassword")}><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder={t("auth.passwordPh")} autoComplete="new-password" /></Field>
          <button className="btn btn-primary" onClick={changePw}>{t("set.changePwd")}</button>
        </div>
      )}
    </>
  );
}
