// DOCX export with the `docx` library. Bilingual mode puts the two languages side by side.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { TEMPLATE_VERSION, type Bi, type DocBlock, type GeneratedDoc } from "../../shared/documents";
import type { ViewMode } from "./docHtml";

const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "SimSun" };
const SIZE = 22; // half-points → 11 pt

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? SIZE, bold: opts.bold, color: opts.color });

function lines(v: Bi, mode: ViewMode): string[] {
  if (mode === "a") return [v.a];
  if (mode === "b") return [v.b];
  return v.a === v.b ? [v.a] : [v.a, v.b];
}

function para(children: ParagraphChild[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}) {
  return new Paragraph({ children, alignment: o.align, spacing: { after: o.after ?? 80, before: o.before ?? 0 } });
}

function multiline(v: Bi | string, mode: ViewMode, bold = false, size = SIZE): ParagraphChild[] {
  const ls = typeof v === "string" ? [v] : lines(v, mode);
  return ls.flatMap((l, i) => (i ? [new TextRun({ break: 1 }), run(l, { bold, size })] : [run(l, { bold, size })]));
}

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

function twoCol(a: Paragraph[], b: Paragraph[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [new TableRow({ children: [new TableCell({ children: a, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { right: 160 } }), new TableCell({ children: b, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { left: 160 } })] })],
  });
}

function block(b: DocBlock, mode: ViewMode): (Paragraph | Table)[] {
  switch (b.t) {
    case "title":
      return [para(multiline(b.text, mode, true, 26), { align: AlignmentType.CENTER, after: 60 })];
    case "meta":
      return [para([run(mode === "both" ? `${b.text.a} · ${b.text.b}` : mode === "a" ? b.text.a : b.text.b, { color: "555555" })], { align: AlignmentType.CENTER, after: 240 })];
    case "h":
    case "p": {
      const bold = b.t === "h";
      const o = { align: bold ? undefined : AlignmentType.JUSTIFIED, before: bold ? 160 : 0 };
      if (mode !== "both") return [para([run(mode === "a" ? b.text.a : b.text.b, { bold })], o)];
      return [twoCol([para([run(b.text.a, { bold })], o)], [para([run(b.text.b, { bold })], o)])];
    }
    case "table": {
      const right = (i: number) => (b.align?.[i] === "r" ? AlignmentType.RIGHT : b.align?.[i] === "c" ? AlignmentType.CENTER : AlignmentType.LEFT);
      const mk = (cells: (string | Bi)[], bold: boolean, shade?: string) =>
        new TableRow({
          children: cells.map((c, i) => new TableCell({
            shading: shade ? { fill: shade } : undefined,
            margins: { left: 60, right: 60, top: 30, bottom: 30 },
            children: [new Paragraph({ alignment: right(i), children: multiline(c, mode, bold, 18) })],
          })),
        });
      const rows = [mk(b.head, true, "EEEEEE"), ...b.rows.map((r) => mk(r, false)), ...(b.foot ? [mk(b.foot, true)] : [])];
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }), para([], { after: 120 })];
    }
    case "parties": {
      const col = (p: (typeof b.parties)[number]) => [
        para(multiline(p.role, mode, true), { before: 200 }),
        para([run(p.name)]),
        ...p.lines.map((l) => para(multiline(l, mode, false, 18), { after: 20 })),
        para([run("______________________  " + (mode === "b" ? "Signature" : "Подпись / Signature"), { size: 16, color: "666666" })], { before: 360 }),
      ];
      return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [new TableRow({ children: b.parties.map((p) => new TableCell({ children: col(p), width: { size: 50, type: WidthType.PERCENTAGE } })) })],
      })];
    }
  }
}

export async function docsToDocxBlob(docs: GeneratedDoc[], mode: ViewMode): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  docs.forEach((d, i) => {
    if (i) children.push(new Paragraph({ children: [new PageBreak()] }));
    for (const b of d.blocks) children.push(...block(b, mode));
    children.push(para([run(`Kelisim · template ${TEMPLATE_VERSION}`, { size: 14, color: "999999" })], { before: 240 }));
  });
  const doc = new Document({
    creator: "Kelisim",
    title: docs[0]?.number ?? "Kelisim",
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 900 } } }, children }],
  });
  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
