import type { Metadata } from "next";
import Link from "next/link";
import { date } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
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
  const rows = (data ?? []) as unknown as { project_id: string; published_at: string; data: { score: number | null }; projects: { code: string; package_snapshot: { name: string } } }[];

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>
      {rows.length === 0 ? (
        <section className="card grid max-w-xl gap-4 p-6">
          <p className="text-muted">{t.empty}</p>
          <a href="/app/reports/contoh/pdf" target="_blank" rel="noreferrer" className="btn w-fit">
            {t.sample} ↗
          </a>
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
