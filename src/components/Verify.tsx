import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, HttpError } from "../api";
import { useAuth } from "../auth";
import { errText, useT } from "../i18n";
import { Field, Modal, useUi } from "./ui";

type Start =
  | { ok: true; verified: true }
  | { ok: true; channel: "email"; to: string; dev_code?: string }
  | { ok: true; channel: "telegram"; url: string; dev_token?: string };

/** Banner in the account until the login (phone / email) is confirmed. */
export function VerifyBanner() {
  const { t } = useT();
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me || me.verified || me.is_demo) return null;
  const phone = me.login.startsWith("+");
  return (
    <>
      <div className="demo-banner verify-banner mb-16">
        <ShieldCheck size={20} color="var(--indigo)" />
        <span className="txt">{phone ? t("ver.bannerPhone") : t("ver.bannerEmail")}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>{t("ver.confirm")}</button>
      </div>
      {open && <VerifyModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** Email: send a 6-digit code and enter it. Phone: open the Telegram bot and share the contact. */
export function VerifyModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const { toast } = useUi();
  const { me, refresh } = useAuth();
  const [st, setSt] = useState<Start | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phone = me?.login.startsWith("+");

  const start = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<Start>("/account/verify/start");
      setSt(r);
      if ("url" in r) setQr(await QRCode.toDataURL(r.url, { margin: 1, width: 240, color: { dark: "#3C3489" } }));
    } catch (e) {
      setErr(errText(t, e instanceof HttpError ? e.code : ""));
    } finally {
      setBusy(false);
    }
  };

  // Telegram: poll until the bot has confirmed the number
  useEffect(() => {
    if (!st || !("channel" in st) || st.channel !== "telegram") return;
    const id = window.setInterval(async () => {
      const u = await refresh();
      if (u?.verified) { window.clearInterval(id); toast(t("ver.done")); onClose(); }
    }, 3000);
    return () => window.clearInterval(id);
  }, [st]);

  const confirm = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.post("/account/verify/confirm", { code });
      await refresh();
      toast(t("ver.done"));
      onClose();
    } catch (e) {
      setErr(errText(t, e instanceof HttpError ? e.code : ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={phone ? t("ver.titlePhone") : t("ver.titleEmail")} onClose={onClose}>
      {err && <div className="alert alert-error">{err}</div>}
      {!st && (
        <>
          <p className="muted mb-24">{phone ? t("ver.introPhone", { phone: me?.login ?? "" }) : t("ver.introEmail", { email: me?.login ?? "" })}</p>
          <button className="btn btn-primary btn-block" onClick={start} disabled={busy}>{phone ? t("ver.openTg") : t("ver.sendCode")}</button>
        </>
      )}
      {st && "channel" in st && st.channel === "email" && (
        <>
          <p className="muted mb-16">{t("ver.codeSent", { email: st.to })}</p>
          {st.dev_code && <div className="alert alert-info">{t("ver.devCode")} <b>{st.dev_code}</b></div>}
          <Field label={t("ver.code")}>
            <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && code.length === 6 && confirm()} />
          </Field>
          <button className="btn btn-primary btn-block" onClick={confirm} disabled={busy || code.length !== 6}>{t("ver.confirm")}</button>
          <button className="btn btn-ghost btn-block mt-8" onClick={start} disabled={busy}>{t("ver.resend")}</button>
        </>
      )}
      {st && "channel" in st && st.channel === "telegram" && (
        <div className="row" style={{ alignItems: "flex-start", gap: 20 }}>
          {qr && <img className="qr" src={qr} alt="QR" width={160} height={160} />}
          <div style={{ flex: "1 1 220px" }}>
            <ol className="ver-steps">
              <li>{t("ver.step1")}</li>
              <li>{t("ver.step2")}</li>
              <li>{t("ver.step3")}</li>
            </ol>
            <a className="btn btn-primary mt-16" href={st.url} target="_blank" rel="noreferrer">{t("ver.openTgBtn")}</a>
            <p className="small muted mt-16">{t("ver.waiting")}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
