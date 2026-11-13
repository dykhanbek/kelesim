import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { REVIEW_MIN_CHARS } from "../../shared/contract-review";
import { SAMPLE_CONTRACT, SAMPLE_CONTRACT_NAME } from "../../shared/contract-sample";
import { useS } from "../i18n.services";
import { ExtractError, extractText } from "../lib/extractText";

export interface ContractSource {
  text: string;
  filename: string;
}

/** File drop zone + paste area. Extracts the text in the browser and hands it to `onSubmit`. */
export function ContractInput({ onSubmit, busy, children }: { onSubmit: (src: ContractSource) => void; busy?: boolean; children?: React.ReactNode }) {
  const s = useS();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      const t = await extractText(file);
      setText(t);
      setFilename(file.name);
    } catch (e) {
      setError(s(`cr.err.${e instanceof ExtractError ? e.code : "read"}` as "cr.err.read"));
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };
  const submit = () => {
    if (text.trim().length < REVIEW_MIN_CHARS) return setError(s("cr.err.short"));
    setError("");
    onSubmit({ text, filename });
  };

  return (
    <div className="contract-input">
      <label
        className={`dropzone dropzone-lg ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}
      >
        <input ref={input} type="file" hidden accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void take(e.target.files?.[0])} />
        {filename ? <FileText size={22} /> : <Upload size={22} />}
        <span>
          <b>{reading ? s("cr.reading") : filename || s("cr.drop")}</b>
          <span className="small muted" style={{ display: "block" }}>{filename && !reading ? s("cr.fileReady", { n: text.length.toLocaleString("ru-RU") }) : s("cr.dropHint")}</span>
        </span>
      </label>
      <div className="or-line"><span>{s("cr.or")}</span></div>
      <textarea className="textarea contract-text" value={text} onChange={(e) => { setText(e.target.value); if (filename) setFilename(""); }} placeholder={s("cr.pastePh")} aria-label={s("cr.pastePh")} />
      {children}
      {error && <div className="alert alert-error mt-16" role="alert">{error}</div>}
      <div className="row mt-16">
        <button className="btn btn-primary btn-wide" onClick={submit} disabled={busy || reading}>{busy ? s("cr.checking") : s("cr.run")}</button>
        <button className="btn btn-ghost" type="button" onClick={() => { setText(SAMPLE_CONTRACT); setFilename(SAMPLE_CONTRACT_NAME); setError(""); }}>{s("cr.sample")}</button>
      </div>
    </div>
  );
}
