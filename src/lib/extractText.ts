// Reads the text of a contract file in the browser: .txt, .docx (unzipped with JSZip) and .pdf (pdf.js).
// The file itself is not uploaded — only the extracted text is sent for the review.

export class ExtractError extends Error {
  constructor(public code: "type" | "empty" | "size" | "read") {
    super(code);
  }
}

export const MAX_CONTRACT_FILE = 15 * 1024 * 1024;

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Paragraph text from WordprocessingML; table cells in a row are separated by spaces. */
export function docxXmlToText(xml: string): string {
  const out: string[] = [];
  for (const p of xml.split(/<\/w:p>/)) {
    const line = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((m) => (m[1] !== undefined ? decodeXml(m[1]) : " ")).join("");
    if (line.trim()) out.push(line.trim());
  }
  return out.join("\n");
}

async function docx(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = zip.file("word/document.xml");
  if (!doc) throw new ExtractError("read");
  return docxXmlToText(await doc.async("string"));
}

async function pdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (item.str === undefined) continue;
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ""; }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  await task.destroy();
  return pages.join("\n\n");
}

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_CONTRACT_FILE) throw new ExtractError("size");
  const name = file.name.toLowerCase();
  let text: string;
  try {
    if (name.endsWith(".docx")) text = await docx(file);
    else if (name.endsWith(".pdf") || file.type === "application/pdf") text = await pdf(file);
    else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) text = await file.text();
    else throw new ExtractError("type");
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError("read");
  }
  // a scanned PDF has pages but no text layer
  if (text.replace(/\s/g, "").length < 200) throw new ExtractError("empty");
  return text;
}
