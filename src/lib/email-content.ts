// Isi email untuk notifikasi penting. Teksnya sama dengan notifikasi di lonceng, ditambah tombol ke halaman terkait.
// Admin tidak menerima email; cukup lonceng di dashboard.
import { notificationLink, notificationText, type Notification } from "./notification-text";

export const EMAIL_KINDS: Record<string, string> = {
  // Shopper
  "task.offered": "Tawaran tugas baru",
  "task.revision": "Kunjungan Anda perlu direvisi",
  "application.approved": "Lamaran shopper Anda disetujui",
  "application.rejected": "Kabar tentang lamaran shopper Anda",
  "payout.paid": "Fee kunjungan sudah ditransfer",
  // Client
  "order.ready": "Tagihan Anda siap dibayar",
  "invoice.paid": "Pembayaran Anda sudah diverifikasi",
  "invoice.rejected": "Bukti pembayaran perlu diunggah ulang",
  "invoice.due_soon": "Pengingat: tagihan jatuh tempo",
  "report.published": "Laporan audit Anda sudah terbit",
};

export const isEmailKind = (kind: string) => Object.hasOwn(EMAIL_KINDS, kind);

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export type EmailMessage = { subject: string; text: string; html: string };

// appUrl = alamat situs tanpa garis miring di akhir, misalnya https://silentcx.com.
export function notificationEmail(n: Notification, name: string, appUrl: string): EmailMessage {
  const subject = `${EMAIL_KINDS[n.kind] ?? "Pemberitahuan"} · SilentCX`;
  const body = notificationText(n, "id");
  const link = notificationLink(n, "id");
  const href = link ? `${appUrl}${link.href}` : appUrl;
  const label = link?.label ?? "Buka SilentCX";
  const greeting = name.trim() ? `Halo, ${name.trim()}.` : "Halo.";
  const footer = "Email ini dikirim otomatis oleh SilentCX karena ada pemberitahuan untuk akun Anda. Semua pemberitahuan juga ada di lonceng notifikasi setelah masuk.";
  const text = `${greeting}\n\n${body}\n\n${label}: ${href}\n\n${footer}`;
  const html = `<!doctype html><html lang="id"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#06080c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#06080c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:bold">Silent<span style="color:#E5A93C">CX</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">${escape(greeting)}</p>
<p style="margin:0 0 20px">${escape(body)}</p>
<a href="${escape(href)}" style="display:inline-block;background:#E5A93C;color:#06080c;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">${escape(label)}</a>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;color:#71717a">${escape(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
