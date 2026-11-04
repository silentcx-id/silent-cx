import type { Metadata } from "next";
import Link from "next/link";
import { date, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { getLockedReports } from "@/lib/report/preview";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Laporan" };

export default async function ReportsPage() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app/reports"), getLang()]);
  const t = dict(lang).reports;
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("project_id, published_at, data, projects!inner(code, client_id, package_snapshot)")
    .eq("status", "published")
    .eq("projects.client_id", viewer.id)
    .order("published_at", { ascending: false });
  const locked = await getLockedReports();
  const rows = (data ?? []) as unknown as { project_id: string; published_at: string; data: { score: number | null }; projects: { code: string; package_snapshot: { name: string } } }[];

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>
      {locked.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Laporan menunggu pelunasan">
          {locked.map((r) => (
            <li key={r.project_id}>
              <Link href={`/app/reports/${r.project_id}`} className="card grid gap-1 border-accent p-5 transition hover:border-muted">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-muted">{r.code}</span>
                  <span className="chip border-accent text-mark">{r.settlement_status === "verifying" ? "Pelunasan diverifikasi" : "Menunggu pelunasan"}</span>
                </span>
                <span className="text-lg font-extrabold">{r.package_name}</span>
                <span className="text-sm text-muted">{t.published(date(r.published_at, lang))}</span>
                <span className="font-display text-4xl font-extrabold tabular-nums text-mark">{r.score ?? "—"}</span>
                <span className="text-sm">Laporan lengkap terbuka setelah pelunasan {rupiah(r.settlement_total)}.</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && locked.length === 0 ? (
        <section className="card grid gap-4 p-6">
          <p className="text-muted">{t.empty}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t.sample}:</span>
            {(["essential", "insight", "performance"] as const).map((k) => (
              <a key={k} href={`/app/reports/contoh/pdf?paket=${k}`} target="_blank" rel="noreferrer" className="btn btn-sm">
                {k[0].toUpperCase() + k.slice(1)} ↗
              </a>
            ))}
          </div>
        </section>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.project_id}>
              <Link href={`/app/reports/${r.project_id}`} className="card grid gap-1 p-5 transition hover:border-muted">
                <span className="font-mono text-sm text-muted">{r.projects.code}</span>
                <span className="text-lg font-extrabold">{r.projects.package_snapshot.name}</span>
                <span className="text-sm text-muted">{t.published(date(r.published_at, lang))}</span>
                <span className="font-display text-4xl font-extrabold tabular-nums text-mark">{r.data?.score ?? "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
