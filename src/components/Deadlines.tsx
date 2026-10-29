import { Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api, HttpError, type Deadline, type ProofFile } from "../api";
import { errText, useT, type TKey } from "../i18n";
import { dayMonth, daysLeft, dmy } from "../lib/format";
import { Field, Modal, useUi } from "./ui";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/heic";
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Badge with "in N days" / "overdue by N days" / "done" — text + colour. */
export function DeadlineBadge({ d }: { d: Deadline }) {
  const { t } = useT();
  if (d.done_at) return <span className="badge badge-mint">✓ {t("deal.doneAt", { date: dmy(d.done_at) })}</span>;
  const left = daysLeft(d.due_date);
  if (left < 0) return <span className="badge badge-red">! {t("deal.overdueBy", { n: -left })}</span>;
  if (left <= 7) return <span className="badge badge-yellow">◷ {left === 0 ? t("dash.today") : t("deal.left", { n: left })}</span>;
  return <span className="badge badge-gray">{t("deal.left", { n: left })}</span>;
}

async function uploadProof(deadlineId: string, file: File) {
  return api.upload<ProofFile>(`/deadlines/${deadlineId}/files`, file);
}

/** List of attached proof files with open / delete (with confirmation). */
export function ProofList({ files, onChange }: { files: ProofFile[]; onChange: () => void }) {
  const { t } = useT();
  const { confirm, toast } = useUi();
  if (!files.length) return null;
  return (
    <ul className="files">
      {files.map((f) => (
        <li key={f.id}>
          <Paperclip size={14} />
          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{f.filename}</a>
          <span className="muted small">{kb(f.size)}</span>
          <button className="icon-btn sm" aria-label={t("common.delete")} onClick={async () => {
            if (!(await confirm({ title: t("files.deleteQ"), text: f.filename, ok: t("common.delete"), danger: true }))) return;
            await api.del(`/files/${f.id}`);
            toast(t("files.deleted"));
            onChange();
          }}><Trash2 size={14} /></button>
        </li>
      ))}
    </ul>
  );
}

/** "Mark as done" with an optional proof note and file (flow 5.3), plus undo, snooze and late attachments. */
export function DeadlineActions({ d, onChange, compact }: { d: Deadline; onChange: () => void; compact?: boolean }) {
  const { t } = useT();
  const { toast, confirm } = useUi();
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const attachRef = useRef<HTMLInputElement>(null);

  const reportUploadError = (e: unknown) =>
    toast(e instanceof HttpError && e.code === "file_too_large" ? t("files.tooLarge", { max: kb(e.details?.max ?? 0) }) : errText(t, e instanceof HttpError ? e.code : ""), "err");

  const done = async () => {
    setBusy(true);
    try {
      if (file) await uploadProof(d.id, file);
      const r = await api.post<{ deal_closed: boolean }>(`/deadlines/${d.id}/done`, { proof });
      setOpen(false);
      setFile(null);
      toast(r.deal_closed ? t("deal.closed") : t("common.saved"));
      onChange();
    } catch (e) {
      reportUploadError(e);
    } finally {
      setBusy(false);
    }
  };
  const attachLater = async (f: File | undefined) => {
    if (!f) return;
    try {
      await uploadProof(d.id, f);
      toast(t("files.uploaded"));
      onChange();
    } catch (e) {
      reportUploadError(e);
    }
  };

  if (d.done_at) {
    return (
      <div className="row" style={{ gap: 6 }}>
        {d.proof_note && <span className="small muted">{d.proof_note}</span>}
        <input ref={attachRef} type="file" accept={ACCEPT} hidden onChange={(e) => attachLater(e.target.files?.[0])} />
        <button className="btn btn-ghost btn-sm" onClick={() => attachRef.current?.click()}><Upload size={14} />{t("files.attach")}</button>
        <button className="btn btn-ghost btn-sm" onClick={async () => {
          if (!(await confirm({ title: t("deal.undoQ"), text: t(`kind.${d.kind}` as TKey) }))) return;
          await api.post(`/deadlines/${d.id}/undo`);
          onChange();
        }}>{t("deal.undo")}</button>
      </div>
    );
  }
  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn btn-primary ${compact ? "btn-block" : "btn-sm"}`} onClick={() => setOpen(true)}>{t("deal.markDone")}</button>
        {!compact && <button className="btn btn-secondary btn-sm" onClick={async () => { await api.post(`/deadlines/${d.id}/snooze`); toast(t("common.saved")); }}>{t("deal.snooze")}</button>}
      </div>
      {open && (
        <Modal title={t("deal.proofH")} onClose={() => setOpen(false)}>
          <p className="muted mb-16">{t(`kind.${d.kind}` as TKey)} · {d.counterparty_name ?? ""} · {dmy(d.due_date)}</p>
          <Field label={t("deal.proofT")}>
            <input className="input" value={proof} onChange={(e) => setProof(e.target.value)} placeholder={t("deal.proofPh")} />
          </Field>
          <Field label={<>{t("files.label")} <span className="small muted">({t("common.optional")})</span></>} hint={t("files.hint")}>
            <label className={`dropzone ${file ? "has" : ""}`}>
              <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Upload size={18} />
              <span>{file ? `${file.name} · ${kb(file.size)}` : t("files.choose")}</span>
            </label>
          </Field>
          <div className="row">
            <button className="btn btn-primary" onClick={done} disabled={busy}>{busy ? t("wiz.saving") : t("deal.confirm")}</button>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function DeadlineList({ items, files = [], onChange }: { items: Deadline[]; files?: ProofFile[]; onChange: () => void }) {
  const { t, lang } = useT();
  return (
    <div>
      {items.map((d) => (
        <div className="dl-row" key={d.id}>
          <div className="when">{dayMonth(d.due_date, lang)}</div>
          <div>
            <div style={{ fontWeight: 500 }}>{t(`kind.${d.kind}` as TKey)}</div>
            <div className="mt-8"><DeadlineBadge d={d} /></div>
            <ProofList files={files.filter((f) => f.deadline_id === d.id)} onChange={onChange} />
          </div>
          <DeadlineActions d={d} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}
