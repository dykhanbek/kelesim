// Renders generated documents to HTML — used by the on-screen preview and by PDF export (print).
import type { Bi, DocBlock, GeneratedDoc } from "../../shared/documents";

export type ViewMode = "a" | "b" | "both";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function text(v: Bi, mode: ViewMode): string {
  if (mode === "a") return esc(v.a);
  if (mode === "b") return esc(v.b);
  return v.a === v.b ? esc(v.a) : `${esc(v.a)}<br><span class="alt">${esc(v.b)}</span>`;
}
const cell = (v: string | Bi, mode: ViewMode) => (typeof v === "string" ? esc(v) : text(v, mode));

function block(b: DocBlock, mode: ViewMode): string {
  switch (b.t) {
    case "title":
      return `<div class="d-title">${text(b.text, mode)}</div>`;
    case "meta":
      return `<div class="d-meta">${mode === "both" ? `${esc(b.text.a)} · ${esc(b.text.b)}` : text(b.text, mode)}</div>`;
    case "h":
    case "p": {
      const cls = b.t === "h" ? "d-h" : "d-p";
      if (mode !== "both") return `<div class="${cls}">${text(b.text, mode)}</div>`;
      return `<div class="bi"><div class="${cls}">${esc(b.text.a)}</div><div class="${cls} alt">${esc(b.text.b)}</div></div>`;
    }
    case "table": {
      const al = (i: number) => (b.align?.[i] === "r" ? ' class="r"' : b.align?.[i] === "c" ? ' class="c"' : "");
      const head = b.head.map((h) => `<th>${text(h, mode)}</th>`).join("");
      const rows = b.rows.map((r) => `<tr>${r.map((c, i) => `<td${al(i)}>${cell(c, mode)}</td>`).join("")}</tr>`).join("");
      const foot = b.foot ? `<tfoot><tr>${b.foot.map((c, i) => `<td${al(i)}>${cell(c, mode)}</td>`).join("")}</tr></tfoot>` : "";
      return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody>${foot}</table>`;
    }
    case "parties":
      return `<div class="parties">${b.parties
        .map(
          (p) => `<div class="party"><div class="role">${text(p.role, mode)}</div><div class="nm">${esc(p.name)}</div>${p.lines
            .map((l) => `<div class="ln">${text(l, mode)}</div>`)
            .join("")}<div class="sign">${mode === "b" ? "Signature / 签字" : mode === "a" ? "Подпись / М.П." : "Подпись / Signature / 签字"}</div></div>`,
        )
        .join("")}</div>`;
  }
}

export function docToHtml(doc: GeneratedDoc, mode: ViewMode): string {
  return doc.blocks.map((b) => block(b, mode)).join("\n");
}

/** Standalone printable page for PDF export (browser "Save as PDF"). */
export function printableHtml(docs: GeneratedDoc[], mode: ViewMode, title: string): string {
  const body = docs.map((d, i) => `<section class="doc-paper" ${i ? 'style="page-break-before:always"' : ""}>${docToHtml(d, mode)}</section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { margin: 0; font-family: "Times New Roman", "Noto Serif SC", "Songti SC", "SimSun", serif; font-size: 11pt; line-height: 1.45; color: #111; }
    .d-title { text-align: center; font-weight: 700; font-size: 12.5pt; margin-bottom: 4px; }
    .d-meta { text-align: center; color: #444; margin-bottom: 14px; }
    .d-h { font-weight: 700; margin: 10px 0 3px; }
    .d-p { text-align: justify; margin: 0 0 5px; }
    .bi { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .bi > div + div { border-left: 1px solid #ccc; padding-left: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5pt; }
    th, td { border: 1px solid #777; padding: 3px 5px; vertical-align: top; }
    th { background: #eee; } td.r { text-align: right; } td.c { text-align: center; } tfoot td { font-weight: 700; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; page-break-inside: avoid; }
    .role { font-weight: 700; } .nm { margin: 2px 0 4px; } .ln { font-size: 9.5pt; color: #333; }
    .sign { margin-top: 28px; border-top: 1px solid #000; padding-top: 2px; font-size: 8.5pt; color: #555; width: 80%; }
    .alt { color: #222; }
    .footer-note { margin-top: 24px; font-size: 8pt; color: #777; }
  </style></head><body>${body}</body></html>`;
}

/** Prints through a hidden iframe (no pop-up blocker issues after async calls). */
export function printDocs(docs: GeneratedDoc[], mode: ViewMode, title: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const w = iframe.contentWindow!;
  w.document.open();
  w.document.write(printableHtml(docs, mode, title));
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  if (w.document.readyState === "complete") setTimeout(go, 250);
  else iframe.onload = () => setTimeout(go, 250);
}
