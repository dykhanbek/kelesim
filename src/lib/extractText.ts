// Reads the text of a contract file in the browser: .txt, .docx (unzipped with JSZip), .pdf (pdf.js)
// and scans / photos (OCR with Tesseract WebAssembly).
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

export type Progress = (p: { stage: "ocr"; page: number; pages: number }) => void;
export const MAX_OCR_PAGES = 8;

/** Tesseract puts spaces between Chinese characters; remove them and tidy the lines. */
export function cleanOcr(text: string): string {
  return text
    .replace(/(?<=[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]) +(?=[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF])/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Recognises text on scans and photos in the browser (Tesseract WebAssembly, served from /ocr).
 * English, Russian and Chinese at once; the image never leaves the device.
 */
async function ocr(images: (Blob | HTMLCanvasElement)[], onProgress?: Progress): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["eng", "rus", "chi_sim"], 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr/lang", gzip: true });
  try {
    const out: string[] = [];
    for (let i = 0; i < images.length; i++) {
      onProgress?.({ stage: "ocr", page: i + 1, pages: images.length });
      const { data } = await worker.recognize(images[i]);
      out.push(data.text);
    }
    return cleanOcr(out.join("\n\n"));
  } finally {
    await worker.terminate();
  }
}

async function pdf(file: File, onProgress?: Progress): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
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
    const text = pages.join("\n\n");
    if (text.replace(/\s/g, "").length >= MIN_TEXT) return text;

    // No text layer: a scanned contract. Render the pages and recognise them.
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_OCR_PAGES); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      canvases.push(canvas);
    }
    return await ocr(canvases, onProgress);
  } finally {
    await task.destroy();
  }
}

const MIN_TEXT = 200;
const isImage = (file: File, name: string) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/.test(name);

export async function extractText(file: File, onProgress?: Progress): Promise<string> {
  if (file.size > MAX_CONTRACT_FILE) throw new ExtractError("size");
  const name = file.name.toLowerCase();
  let text: string;
  try {
    if (name.endsWith(".docx")) text = await docx(file);
    else if (name.endsWith(".pdf") || file.type === "application/pdf") text = await pdf(file, onProgress);
    else if (isImage(file, name)) text = await ocr([file], onProgress);
    else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) text = await file.text();
    else throw new ExtractError("type");
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    console.warn("extractText failed", e);
    throw new ExtractError("read");
  }
  // nothing recognisable: an empty page or a photo that is too blurry
  if (text.replace(/\s/g, "").length < MIN_TEXT) throw new ExtractError("empty");
  return text;
}
