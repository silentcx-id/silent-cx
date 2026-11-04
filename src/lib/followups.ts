// Follow-up client oleh CS dan konfirmasi proyek oleh admin (Putaran 16). Bisa dipakai di server dan browser.
import { dayLabel, waLink } from "./field";
import { rupiah } from "./format";

export type ClientStage = "new" | "review" | "payment" | "verifying" | "running" | "done" | "lapsed";
export type Outcome = "sent" | "replied" | "interested" | "not_interested" | "no_answer" | "other";
export type Channel = "wa" | "call" | "email" | "other";

export const STAGES: ClientStage[] = ["new", "review", "payment", "verifying", "running", "done", "lapsed"];

export const STAGE_LABEL: Record<ClientStage, string> = {
  new: "Belum pesan",
  review: "Ditinjau admin",
  payment: "Menunggu bayar",
  verifying: "Verifikasi bayar",
  running: "Audit berjalan",
  done: "Laporan terbit",
  lapsed: "Batal / kedaluwarsa",
};

export const STAGE_TONE: Record<ClientStage, string> = {
  new: "",
  review: "border-warn/50 text-warn",
  payment: "border-warn/50 text-warn",
  verifying: "border-accent text-mark",
  running: "border-good/50 text-good",
  done: "border-good/50 text-good",
  lapsed: "border-bad/50 text-bad",
};

export const OUTCOMES: Outcome[] = ["sent", "replied", "interested", "not_interested", "no_answer", "other"];
export const OUTCOME_LABEL: Record<Outcome, string> = {
  sent: "Pesan terkirim",
  replied: "Dibalas",
  interested: "Tertarik",
  not_interested: "Tidak tertarik",
  no_answer: "Belum ada jawaban",
  other: "Lainnya",
};

export const CHANNELS: Channel[] = ["wa", "call", "email", "other"];
export const CHANNEL_LABEL: Record<Channel, string> = { wa: "WhatsApp", call: "Telepon", email: "Email", other: "Lainnya" };

export const isOutcome = (v: unknown): v is Outcome => typeof v === "string" && (OUTCOMES as string[]).includes(v);
export const isStage = (v: unknown): v is ClientStage => typeof v === "string" && (STAGES as string[]).includes(v);

// Nomor WA client: HP PIC kalau ada, selain itu HP pemilik akun.
export function contactPhone(c: { pic_phone?: string | null; phone?: string | null }): string {
  return (c.pic_phone || c.phone || "").trim();
}

export type Phone = { label: string; number: string };

// Pilihan nomor WA: PIC dulu, lalu pemilik akun kalau nomornya berbeda.
export function clientPhones(r: { pic_name?: string | null; pic_phone?: string | null; full_name?: string | null; phone?: string | null }): Phone[] {
  const list: Phone[] = [];
  const digits = (s?: string | null) => (s ?? "").replace(/D/g, "");
  if (r.pic_phone) list.push({ label: `PIC${r.pic_name ? ` (${r.pic_name})` : ""}`, number: r.pic_phone });
  if (r.phone && digits(r.phone) !== digits(r.pic_phone)) list.push({ label: `Pemilik akun (${r.full_name || "client"})`, number: r.phone });
  return list;
}

export function waUrl(phone: string, text: string): string | null {
  return phone.replace(/\D/g, "").length >= 8 ? waLink(phone, text) : null;
}

export type FollowupContext = {
  name: string;
  staff: string;
  brand: string;
  origin: string;
  projectCode?: string | null;
  packageName?: string | null;
  invoiceCode?: string | null;
  invoiceTotal?: number | null;
  invoiceDue?: string | null;
};

export type MessageTemplate = { id: string; label: string; text: string };

// Template pesan WA per tahap client. Pesan bisa diubah CS sebelum WhatsApp dibuka.
export function followupTemplates(stage: ClientStage, c: FollowupContext): MessageTemplate[] {
  const hi = `Halo ${c.name || "Kak"}, saya ${c.staff || "tim"} dari SilentCX.`;
  const brand = c.brand || "bisnis Anda";
  const order = c.projectCode ? ` ${c.projectCode}` : "";
  const due = c.invoiceDue ? `, batas bayar ${dayLabel(new Date(new Date(c.invoiceDue).getTime() + 7 * 3600_000).toISOString().slice(0, 10))}` : "";
  const list: MessageTemplate[] = [];
  const add = (id: string, label: string, text: string) => list.push({ id, label, text });

  if (stage === "new") {
    add("welcome", "Sapa client baru", `${hi} Terima kasih sudah mendaftar. Ada yang bisa kami bantu untuk memilih paket audit mystery shopping yang pas untuk ${brand}?\n\nDaftar paket: ${c.origin}/app/paket`);
    add("promo", "Tawarkan konsultasi", `${hi} Kami bisa bantu jelaskan cara kerja audit mystery shopping dan contoh laporannya untuk ${brand}. Kapan waktu yang nyaman untuk ngobrol sebentar?\n\nContoh laporan: ${c.origin}/contoh-laporan`);
  }
  if (stage === "review") {
    add("review", "Pesanan sedang ditinjau", `${hi} Pesanan${order} untuk ${brand} sedang kami tinjau. Kami kabari begitu tagihannya siap dibayar. Ada yang ingin ditanyakan?`);
  }
  if (stage === "payment") {
    const amount = c.invoiceTotal != null ? ` sebesar ${rupiah(c.invoiceTotal)}` : "";
    add("payment", "Ingatkan pembayaran", `${hi} Tagihan ${c.invoiceCode ?? ""}${amount} untuk pesanan${order} (${c.packageName ?? "paket audit"}) menunggu pembayaran${due}.\n\nBayar dan unggah bukti transfer di: ${c.origin}/app/billing\n\nKalau ada kendala, balas pesan ini ya.`);
  }
  if (stage === "verifying") {
    add("verifying", "Bukti bayar diterima", `${hi} Bukti bayar pesanan${order} sudah kami terima dan sedang diverifikasi. Setelah itu dashboard audit langsung aktif.`);
  }
  if (stage === "running") {
    add("running", "Cek data outlet", `${hi} Audit${order} untuk ${brand} sedang berjalan. Mohon pastikan data outlet sudah lengkap di ${c.origin}/app/outlets supaya kunjungan bisa dijadwalkan.`);
  }
  if (stage === "done") {
    add("done", "Tindak lanjut laporan", `${hi} Laporan audit${order} untuk ${brand} sudah terbit di ${c.origin}/app/reports. Ingin dijadwalkan konsultasi untuk membahas hasilnya, atau audit ulang untuk melihat perkembangannya?`);
  }
  if (stage === "lapsed") {
    add("lapsed", "Ajak pesan ulang", `${hi} Pesanan${order} untuk ${brand} sudah tidak aktif. Kalau masih berminat, kami bantu buatkan pesanan baru: ${c.origin}/app/paket`);
  }
  add("blank", "Pesan bebas", `${hi} `);
  return list;
}

export type ConfirmOutlet = { position: number; name: string; city: string; address: string; maps_url?: string; is_competitor?: boolean; window?: string | null };
export type ConfirmContext = {
  name: string;
  brand: string;
  projectCode: string;
  packageName: string;
  statusLabel: string;
  outlets: ConfirmOutlet[];
  withSchedule: boolean;
  note: string;
  admin: string;
};

// Pesan "Konfirmasi WA" admin: detail proyek dan outlet, ditambah pesan admin.
export function projectConfirmMessage(c: ConfirmContext): string {
  const outlets = c.outlets.map((o) => {
    const head = `${o.position}. ${o.name || "Nama belum diisi"} · ${o.city}${o.is_competitor ? " (kompetitor)" : ""}`;
    const rows = [head];
    if (o.address) rows.push(`   ${o.address}`);
    if (o.maps_url) rows.push(`   ${o.maps_url}`);
    if (c.withSchedule && o.window) rows.push(`   Jadwal kunjungan: ${o.window}`);
    return rows.join("\n");
  });
  return [
    `Halo ${c.name || "Kak"}, saya ${c.admin || "admin"} dari SilentCX. Kami ingin mengonfirmasi proyek ${c.projectCode}${c.brand ? ` untuk ${c.brand}` : ""}:`,
    "",
    `Paket: ${c.packageName} · ${c.outlets.length} outlet`,
    `Status: ${c.statusLabel}`,
    "",
    "Outlet:",
    ...outlets,
    ...(c.note.trim() ? ["", c.note.trim()] : []),
    "",
    "Mohon balas pesan ini kalau ada data yang perlu diperbaiki. Terima kasih.",
  ].join("\n");
}
