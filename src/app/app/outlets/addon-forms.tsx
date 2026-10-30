"use client";

import { useState } from "react";
import { saveBrief, saveExtraVisits } from "../actions";
import { StatusText, useAction } from "@/components/use-action";

type Outlet = {
  id: string;
  position: number;
  name: string;
  city: string;
  extra_visits: number;
  locked: boolean;
};

// Kunjungan tambahan dibagikan setelah outlet punya nama, supaya client memilih cabang yang ia kenal.
// Outlet yang sudah dijadwalkan admin terkunci.
export function ExtraVisitsForm({
  projectId,
  allowance,
  baseVisits,
  outlets,
}: {
  projectId: string;
  allowance: number;
  baseVisits: number;
  outlets: Outlet[];
}) {
  const { pending, status, act } = useAction();
  const [rows, setRows] = useState(outlets.map((o) => ({ id: o.id, extra: o.extra_visits })));
  const used = rows.reduce((n, r) => n + r.extra, 0);
  const left = allowance - used;
  const unnamed = outlets.some((o) => !o.name.trim());
  const set = (id: string, extra: number) => setRows(rows.map((r) => (r.id === id ? { ...r, extra: Math.max(0, extra) } : r)));
  const saved = outlets.every((o) => rows.find((r) => r.id === o.id)?.extra === o.extra_visits);

  return (
    <section className="card grid gap-4 p-5" aria-labelledby="extra-title" id="kunjungan-tambahan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="extra-title" className="text-xl font-extrabold">
            Bagikan {allowance} kunjungan tambahan
          </h2>
          <p className="text-sm text-muted">
            Setiap outlet sudah mendapat {baseVisits} kunjungan dari paket. Pilih outlet yang mendapat kunjungan tambahan. Pembagian masih bisa diubah sampai
            kunjungan outlet itu dijadwalkan.
          </p>
        </div>
        <span className={`chip ${left === 0 ? "border-good/50 text-good" : "border-warn/50 text-warn"}`} aria-live="polite">
          {left === 0 ? "Semua sudah dibagikan" : left > 0 ? `Sisa ${left}` : `Kelebihan ${-left}`}
        </span>
      </div>
      {unnamed && (
        <p className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">
          Isi dan simpan nama setiap outlet di bawah dulu, supaya pembagian kunjungan memakai nama cabang.
        </p>
      )}
      <ul className="grid gap-2">
        {outlets.map((o) => {
          const extra = rows.find((r) => r.id === o.id)?.extra ?? 0;
          const label = o.name.trim() || `Outlet ${o.position} · ${o.city}`;
          return (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
              <span className="grid">
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted">
                  {o.city} · total {baseVisits + extra} kunjungan
                  {o.locked && " · sudah dijadwalkan, terkunci"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Kurangi kunjungan tambahan ${label}`}
                  disabled={pending || o.locked || unnamed || extra === 0}
                  onClick={() => set(o.id, extra - 1)}
                >
                  −
                </button>
                <span className="w-8 text-center font-display text-xl font-extrabold tabular-nums" aria-label={`Kunjungan tambahan ${label}`}>
                  {extra}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Tambah kunjungan tambahan ${label}`}
                  disabled={pending || o.locked || unnamed || left <= 0}
                  onClick={() => set(o.id, extra + 1)}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || unnamed || saved || left < 0}
          onClick={() =>
            act(
              () =>
                saveExtraVisits({
                  projectId,
                  items: rows.map((r) => ({ outlet_id: r.id, extra: r.extra })),
                }),
              "Pembagian kunjungan tersimpan.",
            )
          }
        >
          Simpan pembagian
        </button>
        <StatusText status={status} />
      </div>
    </section>
  );
}

// Brief kuesioner khusus: kebutuhan client yang menjadi dasar admin menyusun kuesioner.
export function BriefForm({ projectId, initial, locked }: { projectId: string; initial: string; locked: boolean }) {
  const { pending, status, act } = useAction();
  const [brief, setBrief] = useState(initial);
  return (
    <section className="card grid gap-3 p-5" aria-labelledby="brief-title">
      <h2 id="brief-title" className="text-xl font-extrabold">
        Kebutuhan kuesioner khusus
      </h2>
      <div className="field">
        <label htmlFor="custom-brief">Apa yang ingin diperiksa secara khusus?</label>
        <textarea
          id="custom-brief"
          rows={5}
          maxLength={2000}
          value={brief}
          disabled={locked}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Contoh: SOP sapaan baku 'Selamat datang di …', penawaran paket member, standar waktu saji 8 menit, area yang sering dikeluhkan pelanggan."
        />
        <small>Minimal 20 karakter. Tim kami menyusun pertanyaan dan bobot dari brief ini sebelum kunjungan dijadwalkan.</small>
      </div>
      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || brief.trim() === initial.trim()}
            onClick={() => act(() => saveBrief({ projectId, brief }), "Brief tersimpan.")}
          >
            Simpan brief
          </button>
          <StatusText status={status} />
        </div>
      )}
    </section>
  );
}
