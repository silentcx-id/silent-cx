"use client";

import { useState } from "react";
import { publishReport, saveReport } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { PRIORITY_LABEL, SEVERITY_LABEL, type Priority, type ReportFinding, type ReportRecommendation, type Severity } from "@/lib/report/types";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";

type Draft = { summary: string; findings: ReportFinding[]; recommendations: ReportRecommendation[]; photoIds: string[] };

export function ReportEditor({
  projectId,
  initial,
  outlets,
  photos,
  evidence,
  detailed,
  summaryLabel,
  suggestion,
  blockers,
  isNew,
}: {
  projectId: string;
  initial: Draft;
  outlets: string[];
  photos: { id: string; url: string; caption: string }[];
  evidence: boolean;
  detailed: boolean;
  summaryLabel: string;
  suggestion: { summary: string; findings: ReportFinding[] };
  blockers: string[];
  isNew: boolean;
}) {
  const { pending, status, act } = useAction();
  const [d, setD] = useState<Draft>(initial);
  const setFinding = (i: number, patch: Partial<ReportFinding>) => setD({ ...d, findings: d.findings.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setRec = (i: number, patch: Partial<ReportRecommendation>) => setD({ ...d, recommendations: d.recommendations.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const togglePhoto = (id: string) => setD({ ...d, photoIds: d.photoIds.includes(id) ? d.photoIds.filter((x) => x !== id) : [...d.photoIds, id].slice(0, 12) });
  const save = () => saveReport({ projectId, ...d });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        act(save, "Draf tersimpan.");
      }}
    >
      {isNew && <p className="rounded-xl border border-accent bg-accent/10 p-4 text-sm">Draf awal disusun otomatis dari skor. Periksa, lengkapi, lalu simpan.</p>}

      <section className="card grid gap-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="summary" className="text-lg font-extrabold">
            {summaryLabel}
          </label>
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => (!d.summary.trim() || confirm("Ganti ringkasan dengan draf otomatis dari angka terbaru?")) && setD({ ...d, summary: suggestion.summary })}
            >
              Susun ulang ringkasan otomatis
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={d.findings.length >= 20}
              onClick={() => {
                const have = new Set(d.findings.map((x) => x.title));
                setD({ ...d, findings: [...d.findings, ...suggestion.findings.filter((x) => !have.has(x.title))].slice(0, 20) });
              }}
            >
              Tambah temuan otomatis
            </button>
          </span>
        </div>
        <p className="text-xs text-muted">Draf otomatis memakai angka terbaru: skor, kepatuhan SOP, customer journey, gap, dan red flag sesuai paket. Periksa dan sesuaikan sebelum terbit.</p>
        <textarea id="summary" className={input} rows={5} maxLength={4000} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} />
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Temuan ({d.findings.length})</h2>
        {d.findings.map((x, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_200px]">
              <input aria-label="Judul temuan" className={input} maxLength={200} value={x.title} onChange={(e) => setFinding(i, { title: e.target.value })} placeholder="Judul temuan" />
              <select aria-label="Tingkat keparahan" className={input} value={x.severity} onChange={(e) => setFinding(i, { severity: e.target.value as Severity })}>
                {(Object.keys(SEVERITY_LABEL) as Severity[]).map((k) => (
                  <option key={k} value={k}>
                    {SEVERITY_LABEL[k]}
                  </option>
                ))}
              </select>
              <select aria-label="Outlet" className={input} value={x.outlet ?? ""} onChange={(e) => setFinding(i, { outlet: e.target.value || null })}>
                <option value="">Semua outlet</option>
                {outlets.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <textarea aria-label="Keterangan temuan" className={input} rows={2} maxLength={1000} value={x.detail} onChange={(e) => setFinding(i, { detail: e.target.value })} placeholder="Apa yang terjadi, kapan, dan buktinya" />
            <button type="button" className="btn btn-sm w-fit" onClick={() => setD({ ...d, findings: d.findings.filter((_, j) => j !== i) })}>
              Hapus temuan
            </button>
          </div>
        ))}
        {!detailed && <p className="text-xs text-muted">Paket ini tidak menampilkan tingkat keparahan di laporan client.</p>}
        <button type="button" className="btn btn-sm w-fit" disabled={d.findings.length >= 20} onClick={() => setD({ ...d, findings: [...d.findings, { title: "", detail: "", severity: "major", outlet: null }] })}>
          + Temuan
        </button>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Rekomendasi ({d.recommendations.length})</h2>
        {d.recommendations.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
            <input aria-label="Rekomendasi" className={input} maxLength={500} value={r.text} onChange={(e) => setRec(i, { text: e.target.value })} placeholder="Langkah yang bisa dijalankan" />
            <select aria-label="Prioritas" className={input} value={r.priority} onChange={(e) => setRec(i, { priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => (
                <option key={k} value={k}>
                  {PRIORITY_LABEL[k]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => setD({ ...d, recommendations: d.recommendations.filter((_, j) => j !== i) })}>
              Hapus
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-sm w-fit" disabled={d.recommendations.length >= 20} onClick={() => setD({ ...d, recommendations: [...d.recommendations, { text: "", priority: "now" }] })}>
          + Rekomendasi
        </button>
      </section>

      {evidence && (
        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">Foto bukti di laporan ({d.photoIds.length}/12)</h2>
          <p className="text-sm text-muted">Pilih foto yang aman ditampilkan ke client, tanpa wajah shopper atau staf yang jelas. Foto kompetitor dan foto check-in tidak bisa dipilih.</p>
          {photos.length === 0 ? (
            <p className="text-sm text-muted">Belum ada foto dari kunjungan yang lolos QC.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((p) => (
                <li key={p.id}>
                  <label className={`grid cursor-pointer gap-1 rounded-xl border p-2 text-xs ${d.photoIds.includes(p.id) ? "border-accent bg-accent/10" : "border-line"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- tautan sementara dari penyimpanan privat */}
                    <img src={p.url} alt={p.caption} className="aspect-[3/2] w-full rounded-lg object-cover" />
                    <span className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={d.photoIds.includes(p.id)} onChange={() => togglePhoto(p.id)} />
                      {p.caption}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card grid gap-3 border-accent p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={pending}>
            Simpan draf
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending || blockers.length > 0}
            onClick={() => {
              if (!confirm("Terbitkan laporan ke client? Setelah terbit, laporan tidak bisa diubah dan proyek ditandai selesai.")) return;
              act(async () => {
                const saved = await save();
                if (!saved.ok) return saved;
                return publishReport({ projectId });
              }, "Laporan terbit. Client sudah diberi tahu.");
            }}
          >
            Terbitkan ke client
          </button>
          <StatusText status={status} />
        </div>
        {blockers.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold">Belum bisa terbit (sesuai draf tersimpan):</p>
            <ul className="list-disc pl-5 text-muted">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted">Saat terbit, kelebihan pembelian yang disetujui di QC ditagihkan ke client sebagai satu invoice tambahan.</p>
      </section>
    </form>
  );
}
