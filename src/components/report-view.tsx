import {
  fmtDiff,
  fmtScore,
  gapRows,
  heatClass,
  outletPatterns,
  PRIORITY_LABEL,
  reportFeatures,
  scoreBand,
  SEVERITY_LABEL,
  summaryTitle,
  type ReportData,
} from "@/lib/report/types";

const tone = (n: number | null | undefined) => (n === null || n === undefined ? "text-muted" : n >= 70 ? "text-good" : n >= 55 ? "text-warn" : "text-bad");
const sevTone = {
  critical: "border-bad/60 text-bad",
  major: "border-warn/60 text-warn",
  minor: "text-muted",
} as const;

function Bar({ value, target }: { value: number | null; target?: number }) {
  return (
    <span className="relative block h-2 overflow-hidden rounded-full bg-raise">
      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      {target !== undefined && <span className="absolute inset-y-0 w-0.5 bg-fg/60" style={{ left: `${target}%` }} aria-hidden />}
    </span>
  );
}

// Peta panas outlet × area. Dipakai di laporan dan halaman Benchmark outlet.
export function OutletHeatmap({ data, showSop }: { data: Pick<ReportData, "outlets" | "sections">; showSop: boolean }) {
  const ranked = [...data.outlets].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 font-semibold">#</th>
            <th className="py-1 font-semibold">Outlet</th>
            {data.sections.map((s) => (
              <th key={s.title} className="py-1 text-center font-normal">
                {s.title}
              </th>
            ))}
            {showSop && <th className="py-1 text-center font-semibold">SOP</th>}
            {showSop && <th className="py-1 text-center font-semibold">Red flag</th>}
            <th className="py-1 text-right font-semibold">Skor</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((o, i) => (
            <tr key={o.name}>
              <td className="py-1 text-muted">{i + 1}</td>
              <td className="py-1">
                {o.name} <span className="text-muted">· {o.city}</span>
              </td>
              {data.sections.map((s) => {
                const v = o.sections.find((x) => x.title === s.title)?.score ?? null;
                return (
                  <td key={s.title} className={`rounded-md px-2 py-1.5 text-center tabular-nums ${heatClass(v)}`}>
                    {fmtScore(v)}
                  </td>
                );
              })}
              {showSop && (
                <td className={`rounded-md px-2 py-1.5 text-center tabular-nums ${heatClass(o.sop)}`}>
                  {o.sop === null || o.sop === undefined ? "—" : `${fmtScore(o.sop)}%`}
                </td>
              )}
              {showSop && <td className={`px-2 py-1.5 text-center tabular-nums ${o.redFlags ? "font-semibold text-bad" : "text-muted"}`}>{o.redFlags ?? 0}</td>}
              <td className={`py-1 text-right font-semibold tabular-nums ${tone(o.score)}`}>{fmtScore(o.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-good/25" /> 85+
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-good/10" /> 70–84
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-warn/20" /> 55–69
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-bad/25" /> di bawah 55
        </span>
      </p>
    </div>
  );
}

// Tabel skor sendiri dibanding kompetitor. Dipakai di laporan dan halaman Benchmark kompetitor.
export function CompetitorTable({ data }: { data: Pick<ReportData, "company" | "score" | "sections" | "competitors"> }) {
  return (
    <div className="overflow-x-auto">
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
                    {diff !== null && <span className={`ml-1 text-xs ${diff >= 0 ? "text-good" : "text-bad"}`}>{fmtDiff(diff)}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Angka kecil adalah selisih: hijau berarti Anda unggul, merah berarti tertinggal. Foto kunjungan ke kompetitor tidak ditampilkan dan hanya dipakai untuk
        pemeriksaan kualitas. Data kompetitor hanya untuk penggunaan internal.
      </p>
    </div>
  );
}

// Laporan audit versi web, isinya sama dengan PDF. Bagian yang tampil mengikuti fitur paket.
export function ReportView({ data }: { data: ReportData }) {
  const f = reportFeatures(data.entitlements);
  const ranked = [...data.outlets].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const multi = f.multiOutlet && data.outlets.length > 1;
  const gaps = gapRows(data.sections);
  const patterns = outletPatterns(data);
  const sop = data.sop;
  const violated = sop?.items.filter((i) => i.no > 0) ?? [];
  const weakest = [...data.journey].filter((j) => j.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="grid content-start gap-1 rounded-2xl bg-[#06080c] p-6 text-white">
          <span className="text-xs uppercase tracking-widest text-[#9aa0ab]">Skor CX keseluruhan</span>
          <span className="font-display text-6xl font-extrabold leading-none text-[#e5a93c] tabular-nums">{fmtScore(data.score)}</span>
          <span className="font-semibold">{scoreBand(data.score)}</span>
          {f.sop && sop && (
            <span className="mt-3 text-sm text-[#d5d8de]">
              Kepatuhan SOP <span className="font-bold text-white">{sop.score === null ? "—" : `${fmtScore(sop.score)}%`}</span>
            </span>
          )}
        </div>
        <div className="card grid content-start gap-2 p-5">
          <h2 className="eyebrow">{summaryTitle(data.entitlements)}</h2>
          <p className="whitespace-pre-line">{data.summary || "—"}</p>
          <p className="text-sm text-muted">
            {data.packageName} · {data.outletCount} outlet · {data.visitCount} kunjungan · periode {data.visitPeriod}
          </p>
        </div>
      </section>

      {data.previous && (
        <section className="card grid gap-3 p-5" aria-labelledby="r-prev">
          <h2 id="r-prev" className="text-lg font-extrabold">
            Perbandingan dengan audit sebelumnya
          </h2>
          <p className="text-sm text-muted">
            Audit sebelumnya {data.previous.code}
            {data.previous.publishedAt && ` · terbit ${data.previous.publishedAt}`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2">Area</th>
                  <th className="py-2 text-right">Sebelumnya</th>
                  <th className="py-2 text-right">Sekarang</th>
                  <th className="py-2 text-right">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    title: "Skor keseluruhan",
                    before: data.previous.score,
                    now: data.score,
                  },
                  ...(f.sop
                    ? [
                        {
                          title: "Kepatuhan SOP (%)",
                          before: data.previous.sop,
                          now: sop?.score ?? null,
                        },
                      ]
                    : []),
                  ...data.sections.map((s) => ({
                    title: s.title,
                    before: data.previous?.sections.find((x) => x.title === s.title)?.score ?? null,
                    now: s.score,
                  })),
                ].map((r, i) => {
                  const diff = r.before !== null && r.now !== null ? r.now - r.before : null;
                  return (
                    <tr key={r.title} className="border-t border-line">
                      <td className={`py-2 ${i === 0 ? "font-semibold" : ""}`}>{r.title}</td>
                      <td className="py-2 text-right tabular-nums text-muted">{fmtScore(r.before)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{fmtScore(r.now)}</td>
                      <td className={`py-2 text-right tabular-nums ${diff === null ? "text-muted" : diff >= 0 ? "text-good" : "text-bad"}`}>
                        {diff === null ? "—" : fmtDiff(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Skor per area penilaian</h2>
        {data.sections.map((s) => (
          <div key={s.title} className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-3 sm:grid-cols-[220px_minmax(0,1fr)_48px]">
            <span className="text-sm">
              {s.title} <span className="text-muted">· bobot {s.weight}</span>
            </span>
            <span className="order-last col-span-2 sm:order-none sm:col-span-1">
              <Bar value={s.score} target={f.sop ? s.target : undefined} />
            </span>
            <span className={`text-right font-semibold tabular-nums ${tone(s.score)}`}>{fmtScore(s.score)}</span>
          </div>
        ))}
        {f.sop && <p className="text-xs text-muted">Garis tipis pada batang adalah target skor area.</p>}
      </section>

      {f.sop && (
        <section className="card grid gap-4 p-5" aria-labelledby="r-sop">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="r-sop" className="text-lg font-extrabold">
              Kepatuhan SOP
            </h2>
            {sop && (
              <span className="text-sm text-muted">
                {sop.yes} patuh · {sop.no} tidak patuh dari {sop.yes + sop.no} pemeriksaan
              </span>
            )}
          </div>
          {!sop || sop.yes + sop.no === 0 ? (
            <p className="text-sm text-muted">Belum ada pemeriksaan SOP di kunjungan yang lolos QC.</p>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
                <Bar value={sop.score} />
                <span className={`text-right font-display text-2xl font-extrabold tabular-nums ${tone(sop.score)}`}>{fmtScore(sop.score)}%</span>
              </div>
              {violated.length === 0 ? (
                <p className="text-sm text-good">Semua SOP yang diperiksa dipatuhi.</p>
              ) : (
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">SOP yang dilanggar</h3>
                  <ul className="grid gap-2">
                    {violated.map((i) => (
                      <li key={i.prompt} className="grid gap-1 rounded-xl border border-line p-3 text-sm">
                        <span className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-semibold">{i.prompt}</span>
                          <span className="chip border-bad/50 text-bad">
                            {i.no} dari {i.yes + i.no} tidak patuh
                          </span>
                        </span>
                        <span className="text-xs text-muted">
                          {i.section}
                          {multi && i.outlets.length > 0 && ` · ${i.outlets.join(", ")}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {f.sop && (
        <section className="card grid gap-3 p-5" aria-labelledby="r-journey">
          <h2 id="r-journey" className="text-lg font-extrabold">
            Customer journey
          </h2>
          {data.journey.length === 0 ? (
            <p className="text-sm text-muted">Belum ada data per tahap customer journey.</p>
          ) : (
            <>
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.journey.map((j, i) => (
                  <li key={j.title} className={`grid gap-2 rounded-xl border p-3 ${j.score !== null && j.score < 70 ? "border-warn/50" : "border-line"}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">
                        <span className="font-display font-extrabold text-mark">{i + 1}</span> {j.title}
                      </span>
                      <span className={`font-semibold tabular-nums ${tone(j.score)}`}>{fmtScore(j.score)}</span>
                    </span>
                    <Bar value={j.score} />
                    <span className="text-xs text-muted">{j.questions} indikator</span>
                  </li>
                ))}
              </ol>
              {weakest && (
                <p className="text-sm">
                  Titik terlemah: <span className="font-semibold">{weakest.title}</span> ({fmtScore(weakest.score)}).
                </p>
              )}
            </>
          )}
        </section>
      )}

      {f.sop && gaps.length > 0 && (
        <section className="card grid gap-3 p-5" aria-labelledby="r-gap">
          <h2 id="r-gap" className="text-lg font-extrabold">
            Analisis gap
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2">Area</th>
                  <th className="py-2 text-right">Target</th>
                  <th className="py-2 text-right">Aktual</th>
                  <th className="py-2 text-right">Gap</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.title} className="border-t border-line">
                    <td className="py-2">{g.title}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{g.target}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${tone(g.score)}`}>{fmtScore(g.score)}</td>
                    <td className={`py-2 text-right tabular-nums ${g.gap >= 0 ? "text-good" : "text-bad"}`}>{fmtDiff(g.gap)}</td>
                    <td className="py-2 text-right">
                      <span className={`chip ${g.gap >= 0 ? "border-good/50 text-good" : "border-bad/50 text-bad"}`}>
                        {g.gap >= 0 ? "Tercapai" : "Di bawah target"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Diurutkan dari gap terbesar. Prioritaskan area teratas.</p>
        </section>
      )}

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">{multi ? "Peringkat outlet" : "Skor outlet"}</h2>
        {multi ? (
          <OutletHeatmap data={data} showSop={f.benchmarking} />
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {ranked.map((o) => (
                <tr key={o.name} className="border-t border-line first:border-t-0">
                  <td className="py-2">
                    {o.name} <span className="text-muted">· {o.city}</span>
                  </td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${tone(o.score)}`}>{fmtScore(o.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {f.benchmarking && multi && (patterns.areas.length > 0 || patterns.sharedSop.length > 0) && (
        <section className="card grid gap-3 p-5" aria-labelledby="r-pattern">
          <h2 id="r-pattern" className="text-lg font-extrabold">
            Pola antar outlet
          </h2>
          <ul className="grid gap-2 text-sm">
            {patterns.sharedSop.map((i) => (
              <li key={i.prompt} className="grid gap-1 rounded-xl border border-bad/40 p-3">
                <span className="font-semibold">
                  SOP dilanggar di {i.outlets.length} outlet: {i.prompt}
                </span>
                <span className="text-muted">{i.outlets.join(", ")}. Kemungkinan masalah sistem atau pelatihan, bukan satu cabang saja.</span>
              </li>
            ))}
            {patterns.areas.map((a) => (
              <li key={a.title} className="grid gap-1 rounded-xl border border-line p-3">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{a.title}</span>
                  <span
                    className={`chip ${a.below === a.total ? "border-bad/50 text-bad" : a.below > 0 ? "border-warn/50 text-warn" : "border-good/50 text-good"}`}
                  >
                    {a.below === 0 ? "Semua outlet mencapai target" : `${a.below} dari ${a.total} outlet di bawah target`}
                  </span>
                </span>
                <span className="text-muted">
                  Terendah {a.low.name} ({fmtScore(a.low.score)}), tertinggi {a.high.name} ({fmtScore(a.high.score)}), selisih {fmtScore(a.spread)} poin.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.benchmarking && (
        <section className="card grid gap-3 p-5" aria-labelledby="r-flag">
          <h2 id="r-flag" className="text-lg font-extrabold">
            Red flag
          </h2>
          {data.redFlags.length === 0 ? (
            <p className="text-sm text-good">Tidak ada red flag di kunjungan yang lolos QC.</p>
          ) : (
            <ul className="grid gap-2">
              {data.redFlags.map((r, i) => (
                <li key={i} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-bad/40 bg-bad/5 p-3 text-sm">
                  <span className="grid gap-0.5">
                    <span className="font-semibold">{r.prompt}</span>
                    <span className="text-xs text-muted">
                      {r.outlet} · {r.section}
                    </span>
                  </span>
                  {/* Prompt red flag ditulis sebagai standar, jadi diberi label supaya tidak terbaca sebagai hal yang sudah baik. */}
                  <span className="flex flex-wrap gap-1.5">
                    <span className="chip border-bad/50 text-bad">Tidak terpenuhi</span>
                    {r.count > 1 && <span className="chip border-bad/50 text-bad">{r.count} kunjungan</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Red flag adalah kejadian yang perlu ditindaklanjuti segera. Red flag tidak mengurangi skor; nilainya sudah terhitung di area masing-masing.
          </p>
        </section>
      )}

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
        <h2 className="text-lg font-extrabold">{f.benchmarking ? "Rekomendasi untuk manajemen" : "Rekomendasi"}</h2>
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
        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">Benchmark kompetitor</h2>
          <CompetitorTable data={data} />
        </section>
      )}

      <div className="grid gap-1 text-xs text-muted">
        <p>
          Skor 0–100: Ya = 1, Tidak = 0, skala 1–5 dikonversi ke 0–1; pertanyaan yang tidak teramati tidak dihitung. Skor outlet adalah rata-rata kunjungan yang
          lolos QC. Kategori: 85–100 sangat baik · 70–84 baik · 55–69 perlu perbaikan · di bawah 55 kritis.
        </p>
        {f.sop && <p>Kepatuhan SOP = pemeriksaan yang patuh dibagi seluruh pemeriksaan SOP. Gap = skor aktual dikurangi target area.</p>}
        {f.benchmarking && <p>Red flag = pertanyaan bertanda red flag yang dijawab Tidak atau bernilai 1–2 pada skala 1–5.</p>}
        {f.customScope && <p>Kuesioner audit ini disusun khusus sesuai kebutuhan {data.company}.</p>}
      </div>
    </div>
  );
}
