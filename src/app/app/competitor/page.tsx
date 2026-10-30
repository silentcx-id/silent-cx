import type { Metadata } from "next";
import Link from "next/link";
import { CompetitorTable } from "@/components/report-view";
import { clientFeatureGate } from "@/lib/area";
import { latestClientReport } from "@/lib/report/load";
import { fmtScore } from "@/lib/report/types";

export const metadata: Metadata = { title: "Benchmark kompetitor" };

// Perbandingan dengan kompetitor dari laporan terbaru yang memuat add-on Benchmark kompetitor.
export default async function CompetitorPage() {
  const gate = await clientFeatureGate("competitor");
  if (gate.locked) return gate.locked;
  const report = await latestClientReport(gate.viewer.id, "competitor");
  const data = report?.data;

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{gate.title}</h1>
        <p className="text-muted">Skor outlet Anda dibanding kompetitor yang dikunjungi dengan kuesioner yang sama.</p>
      </section>
      {!report || !data || data.competitors.length === 0 ? (
        <section className="card grid gap-3 p-6">
          <p className="font-semibold">Benchmark kompetitor tampil setelah laporan audit terbit.</p>
          <p className="text-muted">Kompetitor diisi di halaman Outlet & data, lalu dikunjungi bersama outlet Anda.</p>
          <Link href="/app/outlets" className="btn btn-primary w-fit">
            Buka Outlet & data →
          </Link>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card grid gap-1 p-5">
              <span className="text-xs uppercase tracking-wider text-muted">{data.company}</span>
              <span className="font-display text-4xl font-extrabold tabular-nums">{fmtScore(data.score)}</span>
            </div>
            {data.competitors.map((c) => {
              const diff = c.score !== null && data.score !== null ? data.score - c.score : null;
              return (
                <div key={c.name} className="card grid gap-1 p-5">
                  <span className="text-xs uppercase tracking-wider text-muted">
                    {c.name} · {c.city}
                  </span>
                  <span className="font-display text-4xl font-extrabold tabular-nums">{fmtScore(c.score)}</span>
                  {diff !== null && (
                    <span className={`text-sm ${diff >= 0 ? "text-good" : "text-bad"}`}>
                      Anda {diff >= 0 ? "unggul" : "tertinggal"} {fmtScore(Math.abs(diff))} poin
                    </span>
                  )}
                </div>
              );
            })}
          </section>
          <section className="card grid gap-3 p-5">
            <h2 className="text-lg font-extrabold">Per area penilaian</h2>
            <CompetitorTable data={data} />
          </section>
          <Link href={`/app/reports/${report.projectId}`} className="btn btn-primary w-fit">
            Buka laporan lengkap →
          </Link>
        </>
      )}
    </>
  );
}
