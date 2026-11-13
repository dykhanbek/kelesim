// Copies the OCR engine (Tesseract WebAssembly) and its language data from node_modules into
// public/ocr so they are served from our own domain: scanned contracts are recognised in the
// browser and nothing is requested from third-party servers. Runs before every build.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const out = new URL("../public/ocr/", import.meta.url).pathname;
mkdirSync(join(out, "lang"), { recursive: true });

const core = dirname(require.resolve("tesseract.js-core/package.json"));
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) cpSync(join(core, f), join(out, f));
cpSync(join(dirname(require.resolve("tesseract.js/package.json")), "dist", "worker.min.js"), join(out, "worker.min.js"));
for (const lang of ["eng", "rus", "chi_sim"]) {
  const dir = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
  cpSync(join(dir, "4.0.0_best_int", `${lang}.traineddata.gz`), join(out, "lang", `${lang}.traineddata.gz`));
}
console.log("OCR assets copied to public/ocr");
