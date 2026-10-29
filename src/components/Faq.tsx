import { Plus } from "lucide-react";
import { useId, useState } from "react";

/** Accordion item with a smooth height animation (grid-rows 0fr → 1fr) and a rotating "+". */
export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button type="button" className="faq-q" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <Plus className="faq-icon" size={20} aria-hidden />
      </button>
      <div className="faq-a" id={id} role="region" aria-hidden={!open}>
        <div><p>{a}</p></div>
      </div>
    </div>
  );
}
