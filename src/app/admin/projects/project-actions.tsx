"use client";

import { useState } from "react";
import { cancelOrder, proofLink, reviewOrder, verifyPayment } from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { rupiah } from "@/lib/format";
import type { InvoiceLine } from "@/lib/orders";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";

// Meninjau pesanan: isi harga add-on yang dikonfirmasi admin, lalu setujui atau batalkan.
export function ReviewForm({ projectId, pendingLines }: { projectId: string; pendingLines: InvoiceLine[] }) {
  const { pending, status, act } = useAction();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => reviewOrder({ projectId, approve: true, note, prices }), "Pesanan disetujui. Invoice bisa dibayar client (batas 2x24 jam).");
      }}
    >
      {pendingLines.map((l) => (
        <label key={l.id} className="grid gap-1 text-sm font-semibold">
          Harga satuan untuk {l.label}
          {l.quantity > 1 ? ` (× ${l.quantity})` : ""} (Rp)
          <input className={`${input} max-w-xs`} inputMode="numeric" required value={prices[l.id] ?? ""} onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value.replace(/\D/g, "") })} />
          {prices[l.id] && <span className="font-normal text-muted">Subtotal {rupiah(Number(prices[l.id]) * l.quantity)}</span>}
        </label>
      ))}
      <label className="grid gap-1 text-sm font-semibold">
        Catatan untuk client (wajib kalau membatalkan)
        <textarea className={`${input} min-h-20`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          Setujui pesanan
        </button>
        <button type="button" className="btn" disabled={pending || !note.trim()} onClick={() => act(() => reviewOrder({ projectId, approve: false, note }), "Pesanan dibatalkan.")}>
          Batalkan pesanan
        </button>
      </div>
      <StatusText status={status} />
    </form>
  );
}

// Memeriksa bukti bayar: lihat file, lalu terima atau tolak dengan alasan.
export function VerifyForm({ invoiceId, proofId }: { invoiceId: string; proofId: string }) {
  const { pending, status, setStatus, act } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-4">
      <button
        type="button"
        className="btn w-fit"
        onClick={async () => {
          // Jendela dibuka langsung saat diklik supaya tidak diblokir browser, lalu diarahkan ke tautan sementara.
          const win = window.open("", "_blank");
          const res = await proofLink({ proofId });
          if (res.ok && res.data && win) win.location.href = res.data;
          else {
            win?.close();
            setStatus({ tone: "error", text: res.ok ? "File tidak ditemukan." : res.error });
          }
        }}
      >
        Lihat file bukti ↗
      </button>
      <label className="grid gap-1 text-sm font-semibold">
        Catatan (wajib kalau menolak, terlihat oleh client)
        <textarea className={`${input} min-h-20`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(() => verifyPayment({ invoiceId, approve: true, note }), "Pembayaran diverifikasi. Proyek aktif.")}>
          Pembayaran sesuai, aktifkan proyek
        </button>
        <button type="button" className="btn" disabled={pending || !note.trim()} onClick={() => act(() => verifyPayment({ invoiceId, approve: false, note }), "Bukti ditolak. Client bisa mengirim ulang.")}>
          Tolak bukti
        </button>
      </div>
      <StatusText status={status} />
    </div>
  );
}

export function CancelForm({ projectId }: { projectId: string }) {
  const { pending, status, act } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) {
    return (
      <button type="button" className="btn btn-sm w-fit" onClick={() => setOpen(true)}>
        Batalkan pesanan…
      </button>
    );
  }
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-semibold">
        Alasan pembatalan (terlihat oleh client)
        <textarea className={`${input} min-h-16`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn btn-sm" disabled={pending || !note.trim()} onClick={() => act(() => cancelOrder({ projectId, note }), "Pesanan dibatalkan.")}>
          Batalkan pesanan
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Tutup
        </button>
      </div>
      <StatusText status={status} />
    </div>
  );
}
