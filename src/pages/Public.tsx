import { BellRing, Check, FileCheck2, Languages, Loader2, PlayCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { FaqItem } from "../components/Faq";
import { ThemeToggle } from "../components/ThemeToggle";
import { Logo, useUi } from "../components/ui";
import { SUPPORT_EMAIL } from "../config";
import { useT, type TKey } from "../i18n";

function PublicNav({ dark = true }: { dark?: boolean }) {
  const { t, lang, setLang } = useT();
  const { me } = useAuth();
  return (
    <div className="hero-nav">
      <Link to="/"><Logo height={34} light={dark} /></Link>
      <div className="actions">
        <ThemeToggle onDark={dark} />
        <button className="btn btn-ghost" style={{ color: dark ? "#fff" : undefined }} onClick={() => setLang(lang === "ru" ? "en" : "ru")}>{lang === "ru" ? "EN" : "RU"}</button>
        {me?.is_demo ? (
          // demo session is temporary: show the same buttons as for a guest (demo is in the hero)
          <>
            <LeaveDemoLink className="btn btn-soft" to="/login">{t("land.login")}</LeaveDemoLink>
            <LeaveDemoLink className="btn btn-soft hide-mobile" to="/register">{t("land.register")}</LeaveDemoLink>
          </>
        ) : me ? (
          <Link className="btn btn-soft" to="/app">{t("shell.account")}</Link>
        ) : (
          <>
            <Link className="btn btn-soft" to="/login">{t("land.login")}</Link>
            <Link className="btn btn-soft hide-mobile" to="/register">{t("land.register")}</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function PricingCards({ current, onSelect }: { current?: string; onSelect?: (p: "free" | "basic" | "pro") => void }) {
  const { t } = useT();
  const plans = ["free", "basic", "pro"] as const;
  return (
    <>
      <div className="grid-cards">
        {plans.map((p) => (
          <div key={p} className={`card price-card ${p === "pro" ? "featured" : ""}`}>
            <h3>{t(`plan.${p}` as TKey)}</h3>
            <div className="price">{t(`plan.${p}Price` as TKey)}</div>
            <p className="muted small" style={{ minHeight: 40 }}>{t(`plan.${p}T` as TKey)}</p>
            {onSelect ? (
              current === p ? (
                <button className="btn btn-secondary btn-block mt-24" disabled>{t("plan.current")}</button>
              ) : (
                <button className="btn btn-primary btn-block mt-24" onClick={() => onSelect(p)}>{t("plan.select")}</button>
              )
            ) : (
              <Link className="btn btn-ghost mt-16" to="/register">{t("land.choose")} →</Link>
            )}
          </div>
        ))}
      </div>
      <p className="muted mt-24" style={{ fontSize: 18 }}>{t("plan.b2b")}</p>
      <p className="muted small mt-8">{t("plan.note")}</p>
    </>
  );
}

export function Footer() {
  const { t } = useT();
  const { openSupport } = useUi();
  return (
    <footer className="container footer">
      <span>© Kelisim</span><span className="sep">·</span>
      <Link to="/legal#terms">{t("foot.terms")}</Link><span className="sep">·</span>
      <Link to="/legal#privacy">{t("foot.privacy")}</Link><span className="sep">·</span>
      <Link to="/brokers">{t("land.forBrokers")}</Link><span className="sep">·</span>
      <a href="#" onClick={(e) => { e.preventDefault(); openSupport(); }}>{t("foot.help")}</a>
    </footer>
  );
}

/**
 * Leads to sign-up. From a demo session it first signs out of the demo account,
 * so "Create a contract" never lands in the shared demo data.
 */
/** Link to /login or /register that ends a demo session first (those pages redirect logged-in users). */
function LeaveDemoLink({ className, to, children }: { className: string; to: string; children: React.ReactNode }) {
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <Link className={className} to={to} onClick={async (e) => {
      e.preventDefault();
      await logout();
      nav(to);
    }}>{children}</Link>
  );
}

export function RegisterButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  if (me && !me.is_demo) return <Link className={className} to="/app/deals/new">{children}</Link>;
  return (
    <Link className={className} to="/register" onClick={async (e) => {
      if (!me?.is_demo) return;
      e.preventDefault();
      await logout();
      nav("/register");
    }}>{children}</Link>
  );
}

export function Landing() {
  const { t } = useT();
  return (
    <>
      <section className="hero">
        <div className="container">
          <PublicNav />
          <div className="hero-grid">
            <div>
              <span className="chip-light">{t("land.chip")}</span>
              <h1>{t("land.h1a")}<br />{t("land.h1b")}</h1>
              <p className="lead">{t("land.lead")}</p>
              <div className="hero-cta">
                <div className="hero-buttons">
                  <RegisterButton className="btn">{t("land.cta")}</RegisterButton>
                  <Link className="btn btn-outline-light" to="/demo"><PlayCircle size={18} />{t("land.demoBtn")}</Link>
                </div>
                <span className="note">{t("land.ctaNote")}</span>
              </div>
              <div className="hero-stats">
                <div><b>15 {t("land.min")}</b><span>{t("land.stat1")}</span></div>
                <div><b>3</b><span>{t("land.stat2")}</span></div>
                <div><b>RU · CN · EN</b><span>{t("land.stat3")}</span></div>
              </div>
            </div>
            <div className="hero-visual" aria-hidden>
              <div className="hero-doc">
                <div className="paper">
                  <div className="ttl">ДОГОВОР ПОСТАВКИ № KLS-024</div>
                  <div className="small muted">{t("land.paperType")}</div>
                  <div className="bi">
                    <div>1. Продавец обязуется передать в собственность покупателя товар, а Покупатель — принять и оплатить его.</div>
                    <div>1. 卖方应将货物所有权转移给买方，买方应接收货物并支付货款。</div>
                  </div>
                  <div className="line" style={{ width: "80%" }} /><div className="line" /><div className="line" style={{ width: "65%" }} />
                  <div className="sig">
                    <div><span className="muted">{t("land.buyer")}</span><b>ИП Aigerim Store</b></div>
                    <div><span className="muted">{t("land.seller")}</span><b>Guangzhou Textile</b></div>
                  </div>
                </div>
              </div>
              <div className="float-card fc-1">
                <span className="fc-icon ok"><ShieldCheck size={18} /></span>
                <div><b>{t("land.fc1")}</b><span>{t("land.fc1t")}</span></div>
              </div>
              <div className="float-card fc-2">
                <span className="fc-icon warn"><FileCheck2 size={18} /></span>
                <div><b>{t("land.fc2")}</b><span>{t("land.fc2t")}</span></div>
              </div>
              <div className="float-card fc-3">
                <span className="fc-icon mint"><BellRing size={18} /></span>
                <div><b>{t("land.fc3")}</b><span>{t("land.fc3t")}</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section">
          <h2>{t("land.modulesH")}</h2>
          <div className="grid-cards">
            {(["1", "2", "3"] as const).map((n) => (
              <div className="card" key={n}>
                <h3>0{n}&nbsp;&nbsp;{t(`land.m${n}` as TKey)}</h3>
                <p className="muted mt-16">{t(`land.m${n}t` as TKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>{t("land.howH")}</h2>
          <div className="steps-row">
            <span className="step">01&nbsp;&nbsp;{t("land.s1")}</span>
            <span className="step">02&nbsp;&nbsp;{t("land.s2")}</span>
            <span className="step">03&nbsp;&nbsp;{t("land.s3")}</span>
          </div>
        </section>

        <section className="section">
          <h2>{t("land.trustH")}</h2>
          <div className="trust">
            <div className="item"><ShieldCheck /><div><b>{t("land.t1")}</b><p className="muted small mt-8">{t("land.t1t")}</p></div></div>
            <div className="item"><Languages /><div><b>{t("land.t2")}</b><p className="muted small mt-8">{t("land.t2t")}</p></div></div>
            <div className="item"><FileCheck2 /><div><b>{t("land.t3")}</b><p className="muted small mt-8">{t("land.t3t")}</p></div></div>
          </div>
        </section>

        <section className="section" id="pricing">
          <h2>{t("land.pricingH")}</h2>
          <PricingCards />
        </section>

        <section className="section faq">
          <h2>{t("land.faqH")}</h2>
          {(["1", "2", "3", "4"] as const).map((n) => (
            <FaqItem key={n} q={t(`land.q${n}` as TKey)} a={t(`land.a${n}` as TKey)} />
          ))}
        </section>
      </div>
      <Footer />
    </>
  );
}

function SimplePage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <div className="container">
          <PublicNav />
          <h1 style={{ fontWeight: 600, fontSize: 40, lineHeight: "48px", margin: 0 }}>{title}</h1>
        </div>
      </section>
      <div className="container" style={{ paddingTop: 40 }}>{children}</div>
      <Footer />
    </>
  );
}

export function PricingPage() {
  const { t } = useT();
  return (
    <SimplePage title={t("land.pricingH")}>
      <PricingCards />
    </SimplePage>
  );
}

export function Brokers() {
  const { t } = useT();
  return (
    <SimplePage title={t("b2b.title")}>
      <div className="two-col">
        <div>
          <p style={{ fontSize: 19, lineHeight: "29px" }} className="muted">{t("b2b.lead")}</p>
          <ul className="mt-24" style={{ paddingLeft: 0, listStyle: "none", display: "grid", gap: 12 }}>
            {(["p1", "p2", "p3"] as const).map((k) => <li key={k} className="row"><Check color="var(--mint)" />{t(`b2b.${k}` as TKey)}</li>)}
          </ul>
        </div>
        <div className="card">
          <h3>{t("b2b.formH")}</h3>
          <p className="muted mt-8 mb-24">{t("b2b.formT")}</p>
          <a className="btn btn-primary" href={`mailto:${SUPPORT_EMAIL}?subject=Kelisim%20B2B`}>{t("b2b.write")}</a>
        </div>
      </div>
    </SimplePage>
  );
}

export function Legal() {
  const { t, lang } = useT();
  const ru = lang === "ru";
  return (
    <SimplePage title={t("legal.title")}>
      <div className="card" style={{ maxWidth: 820 }}>
        <h2 id="terms">{t("foot.terms")}</h2>
        <p className="muted mt-8">{ru
          ? "Kelisim — учебный MVP. Сервис формирует документы по шаблонам и выполняет автоматические проверки по детерминированным правилам. Результаты носят информационный характер и не являются юридической консультацией. Перед подписанием договора рекомендуем показать его юристу и уточнить требования в обслуживающем банке."
          : "Kelisim is a student MVP. The service fills templates and runs automatic checks based on deterministic rules. Results are informational and are not legal advice. Before signing, show the contract to a lawyer and confirm the requirements with your bank."}</p>
        <h2 id="disclaimer" className="mt-32">Disclaimer</h2>
        <p className="muted mt-8">{ru
          ? "Санкционные списки в прототипе — демонстрационные (вымышленные компании). Курсы валют для пересчёта порога УНК — фиксированные демонстрационные значения; в рабочей версии используется официальный курс НБРК на дату подписания."
          : "Sanctions lists in the prototype are demo data (fictitious companies). Exchange rates for the UCN threshold are fixed demo values; production uses the official NBRK rate on the signing date."}</p>
        <h2 id="privacy" className="mt-32">{t("foot.privacy")}</h2>
        <p className="muted mt-8">{ru
          ? "Мы храним только данные, необходимые для формирования документов: логин, хэш пароля (PBKDF2), реквизиты компании, данные сделок и контрагентов. Данные хранятся в Cloudflare D1 и не передаются третьим лицам. Сессии — защищённые HttpOnly-cookie."
          : "We store only the data needed to produce documents: login, password hash (PBKDF2), company details, deal and counterparty data. Data is stored in Cloudflare D1 and is not shared with third parties. Sessions use secure HttpOnly cookies."}</p>
      </div>
    </SimplePage>
  );
}

/**
 * /demo — opens instantly with a progress screen while the demo account is created
 * (company, counterparties, 3 deals with deadlines), then jumps into the dashboard.
 */
export function DemoStart() {
  const { t, lang } = useT();
  const { me, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const steps = [t("demo.s1"), t("demo.s2"), t("demo.s3")];

  const start = async () => {
    setFailed(false);
    setStep(0);
    const tick = window.setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 450);
    try {
      await api.post("/auth/demo", { lang });
      await refresh();
      window.clearInterval(tick);
      setStep(steps.length);
      nav("/app", { replace: true });
    } catch {
      window.clearInterval(tick);
      setFailed(true);
    }
  };

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    if (me) nav("/app", { replace: true }); // already signed in (demo or own account)
    else void start();
  }, [loading, me]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="demo-start">
      <div className="demo-card">
        <Logo height={34} light />
        <h1>{t("demo.title")}</h1>
        <p>{t("demo.sub")}</p>
        <ul>
          {steps.map((s, i) => (
            <li key={s} className={i < step ? "done" : i === step && !failed ? "now" : ""}>
              {i < step ? <Check size={18} /> : i === step && !failed ? <Loader2 size={18} className="spin" /> : <span className="dot-empty" />}
              {s}
            </li>
          ))}
        </ul>
        <div className="demo-bar"><div style={{ width: `${failed ? 100 : Math.min(100, ((step + 0.6) / steps.length) * 100)}%` }} /></div>
        {failed && (
          <div className="mt-24">
            <p className="demo-err">{t("common.error")}</p>
            <button className="btn btn-soft mt-16" onClick={start}>{t("demo.retry")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
