import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, HttpError } from "../api";
import { useAuth } from "../auth";
import { ThemeToggle } from "../components/ThemeToggle";
import { Field, Logo } from "../components/ui";
import { errText, useT } from "../i18n";

function Split({ dark, title, text, children }: { dark?: boolean; title: string; text: string; children: ReactNode }) {
  const { t, lang, setLang } = useT();
  return (
    <div className="split">
      <div className={`split-left ${dark ? "dark" : ""}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link to="/"><Logo height={30} light /></Link>
          <div className="row" style={{ gap: 4 }}>
            <ThemeToggle onDark />
            <button className="btn btn-ghost" style={{ color: "#fff" }} onClick={() => setLang(lang === "ru" ? "en" : "ru")}>{lang === "ru" ? "EN" : "RU"}</button>
          </div>
        </div>
        <div>
          <h1 style={{ whiteSpace: "pre-line" }}>{title}</h1>
          <p>{text}</p>
        </div>
        <div className="small tagline" style={{ color: "#dcd9f6" }}>Kelisim · {t("brand.tagline")}</div>
      </div>
      <div className="split-right">{children}</div>
    </div>
  );
}

export function Register() {
  const { t, lang } = useT();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTaken(false);
    setBusy(true);
    try {
      await api.post("/auth/register", { login, password, accept, name, lang });
      await refresh();
      nav("/app/onboarding");
    } catch (err) {
      const code = err instanceof HttpError ? err.code : "";
      setTaken(code === "login_taken");
      setError(errText(t, code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Split title={t("auth.regLeftH")} text={t("auth.regLeftP")}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h2>{t("auth.regH")}</h2>
        <p className="sub">{t("auth.regSub")}</p>
        {error && (
          <div className="alert alert-error">
            {error} {taken && <Link to={`/login?login=${encodeURIComponent(login)}`}><b>{t("auth.signIn")} →</b></Link>}
          </div>
        )}
        <Field label={t("auth.login")} htmlFor="login">
          <input id="login" className="input" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("auth.loginPh")} autoComplete="username" required />
        </Field>
        <Field label={t("auth.name")} htmlFor="name">
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordPh")} autoComplete="new-password" required />
        </Field>
        <label className="check mb-24">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>{t("auth.accept")} (<Link to="/legal" target="_blank">{t("foot.terms").toLowerCase()}</Link>)</span>
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>{t("auth.create")}</button>
        <p className="mt-16 small">{t("auth.haveAccount")} <Link to="/login">{t("auth.signIn")}</Link></p>
      </form>
    </Split>
  );
}

export function Login() {
  const { t } = useT();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [login, setLogin] = useState(sp.get("login") ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = () => nav(sp.get("next") || "/app");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login", { login, password, remember });
      await refresh();
      go();
    } catch (err) {
      setError(errText(t, err instanceof HttpError ? err.code : ""));
    } finally {
      setBusy(false);
    }
  };
  const demo = () => nav("/demo");

  return (
    <Split dark title={t("auth.loginLeftH")} text={t("auth.loginLeftP")}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h2>{t("auth.loginH")}</h2>
        <p className="sub">{t("auth.loginSub")}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label={t("auth.login")} htmlFor="login">
          <input id="login" className="input" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("auth.loginPh")} autoComplete="username" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <div className="row mb-24" style={{ justifyContent: "space-between" }}>
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{t("auth.remember")}</label>
          <Link className="small" to="/forgot-password"><b>{t("auth.forgot")}</b></Link>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{t("auth.signIn")}</button>
        <Link className="btn btn-secondary btn-block mt-16" to="/register">{t("auth.create")}</Link>
        <button type="button" className="btn btn-soft btn-block mt-16" onClick={demo} disabled={busy}>{t("auth.demo")}</button>
        <p className="small muted mt-16">{t("auth.secure")}</p>
      </form>
    </Split>
  );
}

export function Forgot() {
  const { t } = useT();
  const [login, setLogin] = useState("");
  const [done, setDone] = useState<{ reset_url: string | null; sent?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setDone(await api.post("/auth/forgot", { login }));
    } catch (err) {
      setError(errText(t, err instanceof HttpError ? err.code : ""));
    }
  };
  return (
    <Split dark title={t("auth.loginLeftH")} text={t("auth.loginLeftP")}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h2>{t("auth.forgotH")}</h2>
        <p className="sub">{t("auth.forgotSub")}</p>
        {error && <div className="alert alert-error">{error}</div>}
        {done ? (
          <>
            <div className="alert alert-ok">{done.sent ? t("auth.emailSent") : t("auth.linkSent")}</div>
            {done.reset_url && (
              <div className="alert alert-info">
                {t("auth.demoLink")} <Link to={done.reset_url}><b>{t("auth.openReset")} →</b></Link>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label={t("auth.login")} htmlFor="login">
              <input id="login" className="input" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("auth.loginPh")} />
            </Field>
            <button className="btn btn-primary btn-block">{t("auth.sendLink")}</button>
          </>
        )}
        <p className="mt-24 small"><Link to="/login">{t("auth.backToLogin")}</Link></p>
      </form>
    </Split>
  );
}

export function Reset() {
  const { t } = useT();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/auth/reset", { token: sp.get("token"), password });
      await refresh();
      nav("/app");
    } catch (err) {
      setError(errText(t, err instanceof HttpError ? err.code : ""));
    }
  };
  return (
    <Split dark title={t("auth.loginLeftH")} text={t("auth.loginLeftP")}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h2>{t("auth.resetH")}</h2>
        {error && <div className="alert alert-error mt-16">{error}</div>}
        <div className="mt-24" />
        <Field label={t("auth.newPassword")} htmlFor="pw">
          <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordPh")} autoComplete="new-password" />
        </Field>
        <button className="btn btn-primary btn-block">{t("auth.setPassword")}</button>
        <p className="mt-24 small"><Link to="/login">{t("auth.backToLogin")}</Link></p>
      </form>
    </Split>
  );
}
