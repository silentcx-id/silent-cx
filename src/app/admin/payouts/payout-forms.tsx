"use client";

import { useState } from "react";
import { StatusText, useAction } from "@/components/use-action";
import { waLink } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";
import { shrinkImage } from "@/lib/shrink-image";
import { createClient } from "@/lib/supabase/client";
import { payoutProofUrl, preparePayoutProof, recordPayout, replacePayoutProof, saveAdminContact } from "./actions";

export type QueueTask = {
  task_id: string;
  code: string;
  outlet_name: string;
  city: string;
  project_code: string;
  task_status: "approved" | "rejected";
  fee: number;
  reimburse: number;
  total: number;
  decided_at: string;
  due_at: string | null;
  payout_status: "overdue" | "pending" | "waiting_bank";
};

export type PaidRow = {
  id: string;
  code: string;
  shopper_id: string;
  total: number;
  fee_total: number;
  reimburse_total: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  paid_at: string;
  note: string | null;
  proof_replaced_at: string | null;
  replace_note: string | null;
};

// Sisa waktu sampai batas 48 jam, dibulatkan ke jam.
function timeLeft(due: string): string {
  const hours = Math.round((new Date(due).getTime() - Date.now()) / 3600_000);
  if (hours < 0) return `lewat ${-hours} jam`;
  return hours === 0 ? "kurang dari 1 jam lagi" : `sisa ${hours} jam`;
}

// Mengunggah bukti ke folder shopper lewat tautan sekali pakai, lalu mengembalikan path-nya.
async function uploadProof(shopperId: string, file: File): Promise<string> {
  const upload = file.type === "application/pdf" ? file : await shrinkImage(file);
  const prep = await preparePayoutProof({ shopperId, type: upload.type, size: upload.size });
  if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
  const { error } = await createClient().storage.from("payout-proofs").uploadToSignedUrl(prep.data.path, prep.data.token, upload, { contentType: upload.type });
  if (error) throw new Error(error.message);
  return prep.data.path;
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function ShopperPayout({
  shopperId,
  name,
  phone,
  bank,
  tasks,
}: {
  shopperId: string;
  name: string;
  phone: string | null;
  bank: { bank_name: string; account_number: string; account_holder: string } | null;
  tasks: QueueTask[];
}) {
  const { pending, status, setStatus, act } = useAction();
  const [picked, setPicked] = useState<string[]>(() => (bank ? tasks.map((t) => t.task_id) : []));
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const total = tasks.filter((t) => picked.includes(t.task_id)).reduce((sum, t) => sum + t.total, 0);
  const late = tasks.some((t) => t.payout_status === "overdue");

  function submit() {
    if (!file) return;
    act(async () => {
      try {
        const path = await uploadProof(shopperId, file);
        return await recordPayout({ taskIds: picked, path, note });
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengunggah bukti." };
      }
    }, "Payout tercatat. Shopper sudah diberi tahu.");
  }

  return (
    <article className={`card grid gap-4 p-5 ${late ? "border-bad/60" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="text-lg font-extrabold">{name}</h3>
          {bank ? (
            <p className="text-sm">
              {bank.bank_name} · <span className="font-mono font-semibold">{bank.account_number}</span> · a.n. {bank.account_holder}
            </p>
          ) : (
            <p className="text-sm font-semibold text-warn">Belum mengisi rekening. Shopper sudah diberi notifikasi.</p>
          )}
        </div>
        {!bank && phone && (
          <a className="btn btn-sm" href={waLink(phone, "Halo, mohon isi rekening di menu Profil & lamaran SilentCX supaya fee kunjungan Anda bisa kami transfer.")} target="_blank" rel="noreferrer">
            Ingatkan via WhatsApp
          </a>
        )}
      </header>

      <ul className="grid gap-2">
        {tasks.map((t) => (
          <li key={t.task_id}>
            <label className={`flex items-start gap-3 rounded-lg border p-3 ${t.payout_status === "overdue" ? "border-bad/50 bg-bad/5" : "border-line"}`}>
              <input
                type="checkbox"
                className="mt-1"
                disabled={!bank}
                checked={picked.includes(t.task_id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.task_id] : p.filter((x) => x !== t.task_id)))}
              />
              <span className="grid flex-1 gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">{t.code}</span>
                  {t.task_status === "rejected" && <span className="chip">Ditolak · reimburse saja</span>}
                  {t.payout_status === "overdue" && <span className="chip border-bad/50 text-bad">Lewat 48 jam</span>}
                  {t.payout_status === "waiting_bank" && <span className="chip border-warn/50 text-warn">Menunggu rekening</span>}
                </span>
                <span className="text-sm">
                  {t.outlet_name} · {t.city} <span className="text-muted">· {t.project_code}</span>
                </span>
                <span className="text-xs text-muted">
                  Fee {rupiah(t.fee)} + reimburse {rupiah(t.reimburse)} · QC {dateTime(t.decided_at, "id")}
                  {t.due_at && ` · batas ${dateTime(t.due_at, "id")} (${timeLeft(t.due_at)})`}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{rupiah(t.total)}</span>
            </label>
          </li>
        ))}
      </ul>

      {bank && (
        <form
          className="grid gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStatus(null);
            submit();
          }}
        >
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-muted">Transfer ke shopper ini</span>
            <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(total)}</span>
            <span className="text-sm text-muted">({picked.length} tugas)</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor={`proof-${shopperId}`}>Bukti transfer</label>
              <input id={`proof-${shopperId}`} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
            <div className="field">
              <label htmlFor={`note-${shopperId}`}>Catatan (opsional)</label>
              <input id={`note-${shopperId}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary w-fit" disabled={pending || !file || picked.length === 0}>
            {pending ? "Menyimpan…" : "Tandai sudah ditransfer"}
          </button>
          <StatusText status={status} />
        </form>
      )}
    </article>
  );
}

export function PaidPayout({ payout, shopperName, paidLabel }: { payout: PaidRow; shopperName: string; paidLabel: string }) {
  const { pending, status, act } = useAction();
  const [replacing, setReplacing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");

  return (
    <article className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold">{payout.code}</span>
            <span className="font-semibold">{shopperName}</span>
            {payout.proof_replaced_at && <span className="chip">Bukti diganti</span>}
          </span>
          <span className="text-xs text-muted">
            {paidLabel} · {payout.bank_name} {payout.account_number} · fee {rupiah(payout.fee_total)} + reimburse {rupiah(payout.reimburse_total)}
          </span>
          {payout.note && <span className="text-sm text-muted">Catatan: {payout.note}</span>}
          {payout.replace_note && <span className="text-sm text-muted">Alasan ganti bukti: {payout.replace_note}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xl font-extrabold tabular-nums">{rupiah(payout.total)}</span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            onClick={() => act(() => payoutProofUrl({ payoutId: payout.id }), undefined, (url) => url && window.open(url, "_blank", "noopener"))}
          >
            Lihat bukti
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setReplacing((v) => !v)}>
            Ganti bukti
          </button>
        </span>
      </div>
      {replacing && (
        <form
          className="grid gap-3 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            act(
              async () => {
                try {
                  const path = await uploadProof(payout.shopper_id, file);
                  return await replacePayoutProof({ payoutId: payout.id, path, note });
                } catch (err) {
                  return { ok: false as const, error: err instanceof Error ? err.message : "Gagal mengunggah bukti." };
                }
              },
              "Bukti diganti. Shopper sudah diberi tahu.",
              () => setReplacing(false),
            );
          }}
        >
          <div className="field">
            <label htmlFor={`rp-file-${payout.id}`}>Bukti baru</label>
            <input id={`rp-file-${payout.id}`} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </div>
          <div className="field">
            <label htmlFor={`rp-note-${payout.id}`}>Alasan</label>
            <input id={`rp-note-${payout.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} required />
          </div>
          <button className="btn btn-primary" disabled={pending || !file || !note.trim()}>
            Simpan
          </button>
        </form>
      )}
      <StatusText status={status} />
    </article>
  );
}

export function ContactForm({ name, whatsapp }: { name: string; whatsapp: string }) {
  const { pending, status, act } = useAction();
  const [value, setValue] = useState({ name, whatsapp });
  return (
    <form
      className="card grid gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveAdminContact(value), "Kontak tersimpan.");
      }}
    >
      <p className="text-sm text-muted">Shopper melihat tombol Hubungi admin di setiap pembayaran. Tombol itu membuka WhatsApp ke nomor ini dengan kode dan nominal pembayaran.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="contact-name">Nama kontak person</label>
          <input id="contact-name" value={value.name} maxLength={80} onChange={(e) => setValue({ ...value, name: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="contact-wa">Nomor WhatsApp</label>
          <input id="contact-wa" inputMode="tel" value={value.whatsapp} maxLength={16} onChange={(e) => setValue({ ...value, whatsapp: e.target.value })} required />
        </div>
      </div>
      <button className="btn btn-primary w-fit" disabled={pending}>
        Simpan kontak
      </button>
      <StatusText status={status} />
    </form>
  );
}
