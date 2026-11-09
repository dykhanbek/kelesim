import { Cookie } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";

const KEY = "kls_cookie_consent";
/** Bump to show the banner again after the cookie policy changes. */
const VERSION = "2026-11-09";

function accepted(): boolean {
  try {
    return localStorage.getItem(KEY)?.startsWith(VERSION) ?? false;
  } catch {
    return false;
  }
}

/** First-visit cookie notice: "Accept" + link to the cookie policy. Shown on every page until accepted. */
export function CookieBanner() {
  const { t } = useT();
  const [hidden, setHidden] = useState(accepted);
  const [leaving, setLeaving] = useState(false);
  if (hidden) return null;
  const accept = () => {
    try { localStorage.setItem(KEY, `${VERSION}|${new Date().toISOString()}`); } catch { /* private mode: hide for this visit */ }
    setLeaving(true);
    window.setTimeout(() => setHidden(true), 220);
  };
  return (
    <div className={`cookie-banner ${leaving ? "leaving" : ""}`} role="region" aria-label="Cookie">
      <Cookie size={22} className="cookie-ico" aria-hidden />
      <p>
        {t("cookie.text")} <Link to="/legal/cookies">{t("cookie.more")}</Link>
      </p>
      <button className="btn btn-primary" onClick={accept}>{t("cookie.accept")}</button>
    </div>
  );
}
