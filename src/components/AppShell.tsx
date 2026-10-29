import { Bell, Building2, CalendarDays, FileText, Handshake, LayoutGrid, MoreHorizontal, Search, Settings, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type Deadline } from "../api";
import { useAuth } from "../auth";
import { useT, type TKey } from "../i18n";
import { dayMonth, daysLeft, initials } from "../lib/format";
import { ThemeToggle } from "./ThemeToggle";
import { Logo, useUi } from "./ui";

const NAV: { to: string; key: TKey; icon: ReactNode; end?: boolean }[] = [
  { to: "/app", key: "nav.dashboard", icon: <LayoutGrid />, end: true },
  { to: "/app/deals", key: "nav.deals", icon: <Handshake /> },
  { to: "/app/documents", key: "nav.documents", icon: <FileText /> },
  { to: "/app/counterparties", key: "nav.counterparties", icon: <Users /> },
  { to: "/app/calendar", key: "nav.calendar", icon: <CalendarDays /> },
  { to: "/app/company", key: "nav.company", icon: <Building2 /> },
  { to: "/app/settings", key: "nav.settings", icon: <Settings /> },
];

export function AppShell() {
  const { t, lang, setLang } = useT();
  const { me, logout } = useAuth();
  const { openSupport } = useUi();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [notes, setNotes] = useState<Deadline[]>([]);

  useEffect(() => {
    setMenu(false);
    setBell(false);
    setUserMenu(false);
    api.get<{ items: Deadline[] }>("/notifications").then((r) => setNotes(r.items)).catch(() => {});
  }, [loc.pathname]);

  const switchLang = async () => {
    const next = lang === "ru" ? "en" : "ru";
    setLang(next);
    api.patch("/account/me", { lang: next }).catch(() => {});
  };
  const doLogout = async () => {
    await logout();
    nav("/login");
  };
  const planName = me ? t(`plan.${me.plan}` as TKey) : "";

  const navLinks = (
    <nav className="nav">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
          {n.icon}
          {t(n.key)}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="shell">
      <div className="shell-logo">
        <Link to="/app" aria-label="Kelisim"><Logo height={30} /></Link>
      </div>
      <header className="shell-header">
        <GlobalSearch />
        <div className="header-actions" style={{ position: "relative" }}>
          <ThemeToggle />
          <button className="link" onClick={switchLang} aria-label="Language">{lang.toUpperCase()}</button>
          <span>·</span>
          <button className="link" onClick={() => setBell((b) => !b)} aria-label={t("shell.notifications")}>
            <Bell size={18} />
            {t("shell.notifications")}
            {notes.length > 0 && <span className="dot" />}
          </button>
          <button className="avatar" onClick={() => setUserMenu((u) => !u)} aria-label={t("shell.account")}>{me ? initials(me.name, me.login) : ""}</button>
          {bell && <NotificationsPopover items={notes} />}
          {userMenu && (
            <div className="popover" style={{ minWidth: 220 }}>
              <div className="small muted" style={{ padding: "6px 12px" }}>{t("set.loggedAs", { login: me?.login ?? "" })}</div>
              <Link className="item" to="/app/settings">{t("nav.settings")}</Link>
              <button className="item" onClick={doLogout}>{t("nav.logout")}</button>
            </div>
          )}
        </div>
      </header>
      <aside className="shell-side">
        {navLinks}
        <div className="plan-box">
          <b>{t("shell.plan")} {planName}</b>
          <a href="#" onClick={(e) => { e.preventDefault(); openSupport(); }}>{t("nav.help")}</a>
          <div><Link to="/app/help" className="small">{t("help.title")}</Link></div>
        </div>
      </aside>

      {/* Mobile header: logo, language, three-dot menu (mockup M-menu) */}
      <div className="mobile-top">
        <Link to="/app"><Logo height={26} /></Link>
        <div className="right">
          <button className="btn btn-ghost" onClick={switchLang}>{lang.toUpperCase()}</button>
          <ThemeToggle className="icon-btn" />
          <Link to="/app/calendar" className="icon-btn" aria-label={t("shell.notifications")} style={{ position: "relative" }}>
            <Bell size={18} />{notes.length > 0 && <span className="dot" />}
          </Link>
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t("nav.navigation")}><MoreHorizontal size={20} /></button>
        </div>
      </div>
      {menu && (
        <div className="modal-back" style={{ background: "rgba(28,26,50,.25)", alignItems: "flex-start" }} onClick={() => setMenu(false)}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="head">
              {t("nav.navigation")}
              <button className="icon-btn" style={{ background: "none" }} onClick={() => setMenu(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <NavLink to="/app/deals/new" className="btn btn-primary btn-block mb-8">{t("dash.newDeal")}</NavLink>
            {navLinks}
            <a href="#" className="small" style={{ display: "block", padding: "8px 18px" }} onClick={(e) => { e.preventDefault(); openSupport(); }}>{t("nav.help")}</a>
            <button className="btn btn-ghost" style={{ padding: "8px 18px" }} onClick={doLogout}>{t("nav.logout")}</button>
          </div>
        </div>
      )}

      <main className="shell-main">
        {me?.is_demo && <DemoBanner />}
        <InstallPrompt />
        {/* keyed by path → each page plays the enter animation */}
        <div key={loc.pathname} className="page-in"><Outlet /></div>
      </main>
    </div>
  );
}

function NotificationsPopover({ items }: { items: Deadline[] }) {
  const { t, lang } = useT();
  return (
    <div className="popover">
      {items.length === 0 && <div className="item muted">{t("shell.noNotifications")}</div>}
      {items.map((d) => {
        const left = daysLeft(d.due_date);
        return (
          <Link key={d.id} className="item" to={`/app/deals/${d.deal_id}?tab=deadlines`}>
            <div style={{ fontWeight: 600, color: left < 0 ? "var(--risk)" : undefined }}>
              {t(`kind.${d.kind}` as TKey)} · {left < 0 ? t("deal.overdueBy", { n: -left }) : left === 0 ? t("dash.today") : t("dash.inDays", { n: left })}
            </div>
            <div className="small muted">{d.counterparty_name} · {d.deal_number} · {dayMonth(d.due_date, lang)}</div>
          </Link>
        );
      })}
    </div>
  );
}

function GlobalSearch() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ deals: any[]; counterparties: any[] } | null>(null);
  const timer = useRef<number>(0);
  const loc = useLocation();
  useEffect(() => { setQ(""); setRes(null); }, [loc.pathname]);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes(null); return; }
    timer.current = window.setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {});
    }, 250);
  }, [q]);
  return (
    <div className="search">
      <Search />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shell.search")} aria-label={t("shell.search")} onBlur={() => setTimeout(() => setRes(null), 200)} />
      {res && (res.deals.length > 0 || res.counterparties.length > 0) && (
        <div className="search-results">
          {res.deals.map((d) => (
            <Link key={d.id} to={`/app/deals/${d.id}`}><span>{d.counterparty_name}</span><span className="muted">{d.number}</span></Link>
          ))}
          {res.counterparties.map((c) => (
            <Link key={c.id} to={`/app/counterparties/${c.id}`}><span>{c.name}</span><span className="muted">{c.country}</span></Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Add to home screen" banner (Android/Chrome fire beforeinstallprompt; iOS uses Share → Add to Home Screen). */
function InstallPrompt() {
  const { t } = useT();
  const [evt, setEvt] = useState<any>(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem("kls_install_dismissed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e); };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (!evt || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem("kls_install_dismissed", "1"); } catch { /* ignore */ }
  };
  return (
    <div className="card card-indigo install-banner mb-16" style={{ boxShadow: "none" }}>
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
      <div style={{ flex: 1 }}>
        <b>{t("pwa.install")}</b>
        <div className="small muted">{t("pwa.installT")}</div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={async () => { await evt.prompt(); dismiss(); }}>{t("pwa.installBtn")}</button>
      <button className="icon-btn" style={{ background: "none" }} onClick={dismiss} aria-label={t("common.close")}><X size={16} /></button>
    </div>
  );
}

/** Shown inside the demo account: makes clear it's sample data and offers a real account. */
function DemoBanner() {
  const { t } = useT();
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="demo-banner mb-16">
      <span className="badge badge-indigo">DEMO</span>
      <span className="txt">{t("demo.banner")}</span>
      <button className="btn btn-primary btn-sm" onClick={async () => { await logout(); nav("/register"); }}>{t("demo.own")}</button>
    </div>
  );
}
