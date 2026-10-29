// Light / dark / system theme. The resolved theme is written to <html data-theme="…">,
// which the CSS tokens in styles.css react to. An inline script in index.html applies
// the stored choice before React loads, so there is no flash of the wrong theme.
export type ThemePref = "system" | "light" | "dark";
const KEY = "kls_theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111115" : "#ffffff");
  window.dispatchEvent(new CustomEvent("kls-theme", { detail: dark ? "dark" : "light" }));
}

export const isDark = () => document.documentElement.dataset.theme === "dark";

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

/** Follow OS changes while the preference is "system". */
export function watchSystemTheme() {
  media().addEventListener("change", () => getThemePref() === "system" && applyTheme("system"));
}
