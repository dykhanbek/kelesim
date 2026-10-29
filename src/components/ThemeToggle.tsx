import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { isDark, setThemePref } from "../theme";

/** One-tap light ↔ dark switch (Settings keeps the "system" option). */
export function ThemeToggle({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  const { t } = useT();
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const on = () => setDark(isDark());
    window.addEventListener("kls-theme", on);
    return () => window.removeEventListener("kls-theme", on);
  }, []);
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button
      type="button"
      className={`theme-toggle ${onDark ? "on-dark" : ""} ${className}`}
      onClick={() => setThemePref(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
