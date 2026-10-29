// Transactional email via Resend (https://resend.com). Optional: without RESEND_API_KEY + EMAIL_FROM
// the app falls back to on-screen reset links and in-app/Telegram reminders.
import type { Env } from "../env";

export const emailConfigured = (env: Env) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
export const isEmail = (s: string | null | undefined): s is string => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendEmail(env: Env, to: string, subject: string, text: string, button?: { label: string; url: string }): Promise<boolean> {
  if (!emailConfigured(env) || !isEmail(to)) return false;
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAF7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#2C2C2A">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:26px;font-weight:700;color:#3C3489;letter-spacing:-0.5px">kelisim</div>
    <div style="background:#fff;border:1px solid #E7E5DD;border-radius:12px;padding:24px;margin-top:20px;font-size:16px;line-height:24px">
      ${esc(text).replace(/\n/g, "<br>")}
      ${button ? `<p style="margin:24px 0 0"><a href="${esc(button.url)}" style="display:inline-block;background:#3C3489;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(button.label)}</a></p>` : ""}
    </div>
    <p style="font-size:12px;color:#5F5E5A;margin-top:16px">Kelisim · ${esc(new URL(env.APP_URL).host)}</p>
  </div></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text: button ? `${text}\n\n${button.url}` : text }),
    });
    if (!res.ok) console.warn("resend error", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.warn("resend failed", e);
    return false;
  }
}
