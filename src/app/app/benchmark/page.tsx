import type { Metadata } from "next";
import Link from "next/link";
import { OutletHeatmap } from "@/components/report-view";
import { clientFeatureGate } from "@/lib/area";
import { latestClientReport } from "@/lib/report/load";
import { fmtScore, outletPatterns, type ReportData } from "@/lib/report/types";

export const metadata: Metadata = { title: "Benchmark outlet" };

// Benchmark antar outlet dari laporan Performance terbaru: peta panas outlet × area, SOP, red flag, dan pola.
export default async function BenchmarkPage() {
  const gate = await clientFeatureGate("benchmark");
  if (gate.locked) return gate.locked;
  const report = await latestClientReport(gate.viewer.id, "benchmarking");

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{gate.title}</h1>
        <p className="text-muted">Bandingkan skor setiap outlet per area penilaian, kepatuhan SOP, dan red flag dari laporan terbaru.</p>
      </section>
      {!report ? (
        <section className="card grid gap-3 p-6">
          <p className="font-semibold">Benchmark tampil setelah laporan audit terbit.</p>
          <p className="text-muted">Pantau kunjungan yang sedang berjalan di halaman Audit berjalan.</p>
          <Link href="/app/audits" className="btn btn-primary w-fit">
            Lihat audit berjalan →
          </Link>
        </section>
      ) : (
        <Benchmark projectId={report.projectId} data={report.data} />
      )}
    </>
  );
}

function Benchmark({ projectId, data }: { projectId: string; data: ReportData }) {
  const ranked = [...data.outlets].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const patterns = outletPatterns(data);
  const best = ranked[0];
  const worst = ranked.at(-1);
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Skor rata-rata", fmtScore(data.score), `${data.outletCount} outlet · ${data.visitCount} kunjungan`],
          ["Outlet tertinggi", best ? fmtScore(best.score) : "—", best?.name ?? "—"],
          ["Outlet terendah", worst ? fmtScore(worst.score) : "—", worst?.name ?? "—"],
        ].map(([k, v, sub]) => (
          <div key={k} className="card grid gap-1 p-5">
            <span className="text-xs uppercase tracking-wider text-muted">{k}</span>
            <span className="font-display text-4xl font-extrabold tabular-nums">{v}</span>
            <span className="text-sm text-muted">{sub}</span>
          </div>
        ))}
      </section>
      <section className="card grid gap-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-extrabold">Peta skor outlet</h2>
          <span className="text-sm text-muted">
            {data.code} · periode {data.visitPeriod}
          </span>
        </div>
        <OutletHeatmap data={data} showSop />
      </section>
      {(patterns.sharedSop.length > 0 || patterns.areas.length > 0) && (
        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">Pola antar outlet</h2>
          <ul className="grid gap-2 text-sm">
            {patterns.sharedSop.map((i) => (
              <li key={i.prompt} className="rounded-xl border border-bad/40 p-3 font-semibold">
                SOP dilanggar di {i.outlets.length} outlet: {i.prompt}
              </li>
            ))}
            {patterns.areas.slice(0, 4).map((a) => (
              <li key={a.title} className="rounded-xl border border-line p-3">
                <span className="font-semibold">{a.title}</span>
                <span className="text-muted">
                  {" "}
                  · {a.below === 0 ? "semua outlet mencapai target" : `${a.below} dari ${a.total} outlet di bawah target`} · selisih {fmtScore(a.spread)} poin
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link href={`/app/reports/${projectId}`} className="btn btn-primary w-fit">
        Buka laporan lengkap →
      </Link>
    </>
  );
}
