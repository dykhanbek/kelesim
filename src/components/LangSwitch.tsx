import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { LANGS, useT, type Lang } from "../i18n";

/** RU / ҚАЗ / EN switcher: a small button that opens a menu of the three languages. */
export function LangSwitch({ className = "btn btn-ghost", style, save }: { className?: string; style?: React.CSSProperties; save?: boolean }) {
  const { lang, setLang } = useT();
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (l: Lang) => {
    setLang(l);
    setOpen(false);
    if (save && me) api.patch("/account/me", { lang: l }).catch(() => {});
  };
  const cur = LANGS.find((l) => l.code === lang)!;
  return (
    <div className="lang-switch" ref={ref}>
      <button type="button" className={className} style={style} onClick={() => setOpen((o) => !o)} aria-label="Language" aria-haspopup="menu" aria-expanded={open}>
        {cur.short}
      </button>
      {open && (
        <div className="popover lang-menu" role="menu">
          {LANGS.map((l) => (
            <button key={l.code} role="menuitemradio" aria-checked={l.code === lang} className="item" onClick={() => pick(l.code)}>
              <span>{l.name}</span>
              {l.code === lang && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
