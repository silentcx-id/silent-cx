import { fmtScore, PRIORITY_LABEL, reportFeatures, scoreBand, SEVERITY_LABEL, type ReportData } from "@/lib/report/types";

const tone = (n: number | null) => (n === null ? "text-muted" : n >= 70 ? "text-good" : n >= 55 ? "text-warn" : "text-bad");
const sevTone = { critical: "border-bad/60 text-bad", major: "border-warn/60 text-warn", minor: "text-muted" } as const;

// Laporan audit versi web, isinya sama dengan PDF. Bagian yang tampil mengikuti fitur paket.
export function ReportView({ data }: { data: ReportData }) {
  const f = reportFeatures(data.entitlements);
  const ranked = [...data.outlets].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const multi = f.multiOutlet && data.outlets.length > 1;
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="grid content-start gap-1 rounded-2xl bg-[#06080c] p-6 text-white">
          <span className="text-xs uppercase tracking-widest text-[#9aa0ab]">Skor CX keseluruhan</span>
          <span className="font-display text-6xl font-extrabold leading-none text-[#e5a93c] tabular-nums">{fmtScore(data.score)}</span>
          <span className="font-semibold">{scoreBand(data.score)}</span>
        </div>
        <div className="card grid content-start gap-2 p-5">
          <h2 className="eyebrow">{f.detailed ? "Ringkasan manajemen" : "Ringkasan"}</h2>
          <p className="whitespace-pre-line">{data.summary || "—"}</p>
          <p className="text-sm text-muted">
            {data.packageName} · {data.outletCount} outlet · {data.visitCount} kunjungan · periode {data.visitPeriod}
          </p>
        </div>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Skor per area penilaian</h2>
        {data.sections.map((s) => (
          <div key={s.title} className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-3 sm:grid-cols-[220px_minmax(0,1fr)_48px]">
            <span className="text-sm">
              {s.title} <span className="text-muted">· bobot {s.weight}</span>
            </span>
            <span className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-raise sm:order-none sm:col-span-1">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, s.score ?? 0))}%` }} />
            </span>
            <span className={`text-right font-semibold tabular-nums ${tone(s.score)}`}>{fmtScore(s.score)}</span>
          </div>
        ))}
      </section>

      <section className="card grid gap-3 overflow-x-auto p-5">
        <h2 className="text-lg font-extrabold">{multi ? "Peringkat outlet" : "Skor outlet"}</h2>
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2">#</th>
              <th className="py-2">Outlet</th>
              {multi && data.sections.map((s) => <th key={s.title} className="py-2 text-right font-normal">{s.title}</th>)}
              <th className="py-2 text-right">Skor</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((o, i) => (
              <tr key={o.name} className="border-t border-line">
                <td className="py-2 text-muted">{i + 1}</td>
                <td className="py-2">
                  {o.name} <span className="text-muted">· {o.city}</span>
                </td>
                {multi &&
                  data.sections.map((s) => {
                    const v = o.sections.find((x) => x.title === s.title)?.score ?? null;
                    return (
                      <td key={s.title} className={`py-2 text-right tabular-nums ${tone(v)}`}>
                        {fmtScore(v)}
                      </td>
                    );
                  })}
                <td className={`py-2 text-right font-semibold tabular-nums ${tone(o.score)}`}>{fmtScore(o.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-extrabold">Temuan utama</h2>
        {data.findings.map((x, i) => (
          <article key={i} className="card grid gap-1 border-l-4 border-l-accent p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{x.title}</h3>
              {f.detailed && <span className={`chip ${sevTone[x.severity]}`}>{SEVERITY_LABEL[x.severity]}</span>}
            </div>
            <p className="text-sm">{x.detail}</p>
            {x.outlet && <p className="text-xs text-muted">Outlet: {x.outlet}</p>}
          </article>
        ))}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Rekomendasi</h2>
        <ol className="grid gap-2">
          {data.recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="font-display font-extrabold text-mark">{i + 1}</span>
              <span className="flex-1">{r.text}</span>
              <span className="chip">{PRIORITY_LABEL[r.priority]}</span>
            </li>
          ))}
        </ol>
      </section>

      {f.evidence && data.photos.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-extrabold">Bukti kunjungan</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.photos.map((p, i) => (
              <li key={i} className="grid gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- tautan sementara dari penyimpanan privat */}
                <img src={p.src} alt={p.caption} className="aspect-[3/2] w-full rounded-xl border border-line object-cover" />
                <span className="text-xs text-muted">{p.caption}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.competitor && data.competitors.length > 0 && (
        <section className="card grid gap-3 overflow-x-auto p-5">
          <h2 className="text-lg font-extrabold">Benchmark kompetitor</h2>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2">Area</th>
                <th className="py-2 text-right">{data.company}</th>
                {data.competitors.map((c) => (
                  <th key={c.name} className="py-2 text-right">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[{ title: "Skor keseluruhan", score: data.score }, ...data.sections].map((s, i) => (
                <tr key={s.title} className="border-t border-line">
                  <td className={`py-2 ${i === 0 ? "font-semibold" : ""}`}>{s.title}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{fmtScore(s.score)}</td>
                  {data.competitors.map((c) => {
                    const v = i === 0 ? c.score : (c.sections.find((x) => x.title === s.title)?.score ?? null);
                    const diff = v !== null && s.score !== null ? s.score - v : null;
                    return (
                      <td key={c.name} className="py-2 text-right tabular-nums">
                        {fmtScore(v)}
                        {diff !== null && <span className={`ml-1 text-xs ${diff >= 0 ? "text-good" : "text-bad"}`}>{diff >= 0 ? `+${fmtScore(diff)}` : `−${fmtScore(-diff)}`}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">
            Angka kecil adalah selisih: hijau berarti Anda unggul, merah berarti tertinggal. Foto kunjungan ke kompetitor tidak ditampilkan dan hanya dipakai untuk pemeriksaan kualitas.
            Data kompetitor hanya untuk penggunaan internal.
          </p>
        </section>
      )}

      <p className="text-xs text-muted">
        Skor 0–100: Ya = 1, Tidak = 0, skala 1–5 dikonversi ke 0–1; pertanyaan yang tidak teramati tidak dihitung. Skor outlet adalah rata-rata kunjungan yang lolos QC. Kategori: 85–100 sangat
        baik · 70–84 baik · 55–69 perlu perbaikan · di bawah 55 kritis.
      </p>
    </div>
  );
}
