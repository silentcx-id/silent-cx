"use client";

import { useState } from "react";
import { cancelOrder, proofLink, reviewOrder, verifyPayment } from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { rupiah } from "@/lib/format";
import type { InvoiceLine } from "@/lib/orders";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";

// Rincian biaya satu unit (misalnya satu outlet luar kota).
type Item = { label: string; amount: string };
type Group = { name: string; items: Item[] };

const QUICK = ["Transportasi", "Penginapan", "Uang makan", "Lain-lain"];
const blankGroups = (l: InvoiceLine, cities: string[]): Group[] =>
  Array.from({ length: l.quantity }, (_, i) => ({
    name: l.item_key === "out_of_city" ? (cities[i] ?? "") : "",
    items: l.item_key === "out_of_city" ? QUICK.slice(0, 3).map((label) => ({ label, amount: "" })) : [{ label: "Biaya", amount: "" }],
  }));
const groupTotal = (g: Group) => g.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

// Meninjau pesanan: isi harga add-on yang dikonfirmasi admin (angka, atau rincian biaya per unit), lalu setujui atau batalkan.
// cities: kota outlet di luar kota dilayani, dipakai sebagai nama rincian Tugas luar kota.
export function ReviewForm({ projectId, pendingLines, cities = [] }: { projectId: string; pendingLines: InvoiceLine[]; cities?: string[] }) {
  const { pending, status, act } = useAction();
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Baris yang diisi dengan rincian; Tugas luar kota langsung memakai rincian.
  const [detailed, setDetailed] = useState<Record<string, Group[] | undefined>>(() =>
    Object.fromEntries(pendingLines.filter((l) => l.item_key === "out_of_city").map((l) => [l.id, blankGroups(l, cities)])),
  );
  const [note, setNote] = useState("");

  const setGroup = (lineId: string, gi: number, next: Group) => setDetailed((d) => ({ ...d, [lineId]: d[lineId]!.map((g, i) => (i === gi ? next : g)) }));

  function payload() {
    const out: Record<string, number | { groups: { name: string; items: { label: string; amount: number }[] }[] }> = {};
    for (const l of pendingLines) {
      const groups = detailed[l.id];
      if (groups) {
        out[l.id] = { groups: groups.map((g) => ({ name: g.name.trim(), items: g.items.filter((it) => it.label.trim() || it.amount).map((it) => ({ label: it.label.trim(), amount: Number(it.amount) || 0 })) })) };
      } else if (prices[l.id]) out[l.id] = Number(prices[l.id]);
    }
    return out;
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => reviewOrder({ projectId, approve: true, note, prices: payload() }), "Pesanan disetujui. Invoice bisa dibayar client (batas 2x24 jam).");
      }}
    >
      {pendingLines.map((l) => {
        const groups = detailed[l.id];
        return (
          <fieldset key={l.id} className="grid gap-3 rounded-xl border border-dashed border-line p-3" data-testid="quote-line">
            <legend className="px-1 text-sm font-semibold">
              {l.label}
              {l.quantity > 1 ? ` × ${l.quantity}` : ""}
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={Boolean(groups)}
                onChange={(e) => setDetailed((d) => ({ ...d, [l.id]: e.target.checked ? blankGroups(l, cities) : undefined }))}
              />
              Isi rincian biaya{l.quantity > 1 ? " per unit (tampil di invoice client)" : " (tampil di invoice client)"}
            </label>
            {!groups ? (
              <label className="grid gap-1 text-sm font-semibold">
                Harga satuan (Rp)
                <input
                  className={`${input} max-w-xs`}
                  inputMode="numeric"
                  required
                  value={prices[l.id] ?? ""}
                  onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value.replace(/\D/g, "") })}
                />
                {prices[l.id] && <span className="font-normal text-muted">Subtotal {rupiah(Number(prices[l.id]) * l.quantity)}</span>}
              </label>
            ) : (
              <div className="grid gap-3">
                {groups.map((g, gi) => (
                  <div key={gi} className="grid gap-2 rounded-lg border border-line p-3">
                    <label className="grid gap-1 text-xs font-semibold text-muted">
                      {l.quantity > 1 ? `Unit ${gi + 1}: nama (misalnya kota outlet)` : "Nama (opsional, misalnya kota outlet)"}
                      <input className={`${input} max-w-xs`} value={g.name} maxLength={60} onChange={(e) => setGroup(l.id, gi, { ...g, name: e.target.value })} />
                    </label>
                    {g.items.map((it, ii) => (
                      <div key={ii} className="grid grid-cols-[minmax(0,1fr)_140px_auto] items-end gap-2">
                        <label className="grid gap-1 text-xs text-muted">
                          Biaya
                          <input
                            className={input}
                            list="quote-labels"
                            value={it.label}
                            maxLength={60}
                            onChange={(e) => setGroup(l.id, gi, { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, label: e.target.value } : x)) })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted">
                          Jumlah (Rp)
                          <input
                            className={input}
                            inputMode="numeric"
                            value={it.amount}
                            onChange={(e) => setGroup(l.id, gi, { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, amount: e.target.value.replace(/\D/g, "") } : x)) })}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`Hapus ${it.label || "biaya"}`}
                          disabled={g.items.length === 1}
                          onClick={() => setGroup(l.id, gi, { ...g, items: g.items.filter((_, j) => j !== ii) })}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={g.items.length >= 10}
                        onClick={() => setGroup(l.id, gi, { ...g, items: [...g.items, { label: "", amount: "" }] })}
                      >
                        + Tambah rincian
                      </button>
                      <span className="text-sm font-semibold tabular-nums">Total {rupiah(groupTotal(g))}</span>
                    </div>
                  </div>
                ))}
                {groups.length > 1 && <p className="text-right text-sm text-muted">Total semua unit {rupiah(groups.reduce((s, g) => s + groupTotal(g), 0))}</p>}
              </div>
            )}
          </fieldset>
        );
      })}
      <datalist id="quote-labels">
        {QUICK.map((q) => (
          <option key={q} value={q} />
        ))}
      </datalist>
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
export function VerifyForm({ invoiceId, proofId, extra = false }: { invoiceId: string; proofId: string; extra?: boolean }) {
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
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(() => verifyPayment({ invoiceId, approve: true, note }), extra ? "Tagihan tambahan lunas." : "Pembayaran diverifikasi. Proyek aktif.")}>
          {extra ? "Pembayaran sesuai, tandai lunas" : "Pembayaran sesuai, aktifkan proyek"}
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
