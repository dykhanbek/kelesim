import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, HttpError } from "../api";
import { useAuth } from "../auth";
import { Field, useUi } from "../components/ui";
import { VerifyModal } from "../components/Verify";
import { errText, LANGS, locale, useT, type Lang, type TKey } from "../i18n";
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
    </div>
  );
}

interface Consents {
  terms_accepted_at: string | null;
  pd_consent_at: string | null;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  consent_version: string | null;
  current_version: string;
  log: { kind: string; granted: number; version: string; created_at: string }[];
}

/** "Data & privacy": consent status, marketing on/off, download my data, delete account (= withdraw consent). */
function PrivacySettings() {
  const { t, lang } = useT();
  const { toast, confirm } = useUi();
  const { me, refresh } = useAuth();
  const [c, setC] = useState<Consents | null>(null);
  const [pwd, setPwd] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const load = () => api.get<Consents>("/account/consents").then(setC);
  useEffect(() => { void load(); }, []);
  if (!me || !c) return null;

  const when = (iso: string | null) => (iso ? new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString(locale(lang), { dateStyle: "long", timeStyle: "short" }) : "—");
  const toggleMarketing = async (on: boolean) => {
    setC({ ...c, marketing_consent: on }); // optimistic: the switch moves immediately
    try {
      await api.patch("/account/me", { marketing_consent: on });
      toast(on ? t("priv.mkOn") : t("priv.mkOff"));
    } catch (e) {
      toast(errText(t, e instanceof HttpError ? e.code : ""), "err");
    }
    await Promise.all([refresh(), load()]);
  };
  const remove = async () => {
    setDelErr(null);
    if (!(await confirm({ title: t("priv.delQ"), text: t("priv.delT"), ok: t("priv.delOk"), danger: true }))) return;
    setBusy(true);
    try {
      await api.del("/account/me", { password: pwd });
      // full reload: the session cookie is already gone, start from a clean app state
      window.location.assign("/?deleted=1");
    } catch (e) {
      setDelErr(errText(t, e instanceof HttpError ? e.code : ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {verifyOpen && <VerifyModal onClose={() => setVerifyOpen(false)} />}
      <div className="card" style={{ maxWidth: 760 }}>
        <h3 style={{ fontSize: 22, lineHeight: "30px" }}>{t("priv.consentsH")}</h3>
        <p className="muted mt-8 mb-16">{t("priv.consentsT")}</p>
        <div className="consent-row">
          <div><b>{t("priv.contact")}</b><div className="small muted">{me.login} · {me.verified ? t("priv.verified") : t("priv.notVerified")}</div></div>
          {!me.verified && !me.is_demo && <button className="btn btn-secondary btn-sm" onClick={() => setVerifyOpen(true)}>{t("ver.confirm")}</button>}
        </div>
        <div className="consent-row">
          <div><b>{t("priv.terms")}</b><div className="small muted">{c.terms_accepted_at ? t("priv.given", { date: when(c.terms_accepted_at) }) : t("priv.atSignup")}</div></div>
          <Link className="small" to="/legal/terms" target="_blank">{t("priv.read")}</Link>
        </div>
        <div className="consent-row">
          <div><b>{t("priv.pd")}</b><div className="small muted">{c.pd_consent_at ? t("priv.given", { date: when(c.pd_consent_at) }) : t("priv.atSignup")}</div></div>
          <Link className="small" to="/legal/consent" target="_blank">{t("priv.read")}</Link>
        </div>
        <div className="consent-row">
          <div>
            <b>{t("priv.mk")}</b>
            <div className="small muted">{t("priv.mkT")}{c.marketing_consent_at ? ` · ${t("priv.changed", { date: when(c.marketing_consent_at) })}` : ""}</div>
            {c.marketing_consent && !me.verified && <div className="small" style={{ color: "var(--warn)" }}>{t("priv.mkNeedsVerify")}</div>}
          </div>
          <label className="switch">
            <input type="checkbox" checked={c.marketing_consent} onChange={(e) => toggleMarketing(e.target.checked)} aria-label={t("priv.mk")} />
            <span>{c.marketing_consent ? t("set.on") : t("set.off")}</span>
          </label>
        </div>
        <p className="small muted mt-16">
          <Link to="/legal/privacy" target="_blank">{t("priv.policy")}</Link> · <Link to="/legal/cookies" target="_blank">Cookie</Link>
        </p>
      </div>

      <div className="card mt-24" style={{ maxWidth: 760 }}>
        <h3 style={{ fontSize: 22, lineHeight: "30px" }}>{t("priv.exportH")}</h3>
        <p className="muted mt-8 mb-16">{t("priv.exportT")}</p>
        <a className="btn btn-secondary" href="/api/account/export" download>{t("priv.exportBtn")}</a>
      </div>

      <div className="card mt-24 danger-zone" style={{ maxWidth: 760 }}>
        <h3 style={{ fontSize: 22, lineHeight: "30px" }}>{t("priv.delH")}</h3>
        <p className="muted mt-8 mb-16">{t("priv.delInfo")}</p>
        {delErr && <div className="alert alert-error">{delErr}</div>}
        {!me.is_demo && (
          <Field label={t("priv.delPwd")}>
            <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" style={{ maxWidth: 360 }} />
          </Field>
        )}
        <button className="btn btn-danger" disabled={busy || (!me.is_demo && !pwd)} onClick={remove}>{t("priv.delBtn")}</button>
      </div>
    </>
  );
}

type Tab = "notifications" | "plan" | "language" | "security" | "privacy";

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
  const changeLang = async (l: Lang) => {
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
        {(["notifications", "plan", "language", "security", "privacy"] as const).map((k) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setSp({ tab: k }, { replace: true })}>{t(`set.tab.${k}` as TKey)}</button>
        ))}
      </div>
      {tab === "notifications" && <><TelegramConnect /><EmailReminders /></>}
      {tab === "plan" && <PricingCards current={me?.plan} onSelect={changePlan} />}
      {tab === "language" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 className="mb-16">{t("set.langH")}</h3>
          <div className="mode-switch">
            {LANGS.map((l) => (
              <button key={l.code} className={lang === l.code ? "on" : ""} onClick={() => changeLang(l.code)}>{l.name}</button>
            ))}
          </div>
          <h3 className="mt-24 mb-16">{t("set.themeH")}</h3>
          <div className="mode-switch">
            {(["system", "light", "dark"] as const).map((m) => (
              <button key={m} className={theme === m ? "on" : ""} onClick={() => { setTheme(m); setThemePref(m); }}>{t(`set.theme.${m}` as TKey)}</button>
            ))}
          </div>
        </div>
      )}
      {tab === "privacy" && <PrivacySettings />}
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
