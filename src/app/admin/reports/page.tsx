import type { Metadata } from "next";
import Link from "next/link";
import { dayLabel, wibDate } from "@/lib/field";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Laporan" };

type Eta = { express: boolean; days: number; all_done: boolean; due: string | null };

// Sisa hari kalender sampai tenggat laporan (WIB). Negatif = lewat tenggat.
function daysLeft(due: string) {
  return Math.round((Date.parse(due) - Date.parse(wibDate())) / 86400_000);
}

type Row = {
  id: string;
  code: string;
  status: string;
  package_snapshot: { name: string };
  project_outlets: { id: string; is_competitor: boolean }[];
  audit_tasks: { status: string; outlet_id: string }[];
  reports: { status: string; published_at: string | null } | { status: string; published_at: string | null }[] | null;
};

// Proyek aktif dan selesai beserta kesiapan laporannya.
export default async function ReportsAdminPage() {
  await requireRole("admin", "/admin/reports");
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, code, status, package_snapshot, project_outlets(id, is_competitor), audit_tasks(status, outlet_id), reports(status, published_at)")
    .in("status", ["active", "reporting", "completed"])
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const etas = new Map(
    await Promise.all(rows.map(async (p) => [p.id, ((await supabase.rpc("project_report_eta", { p_project: p.id })).data ?? null) as Eta | null] as const)),
  );
  // Laporan express dan yang paling dekat tenggatnya tampil lebih dulu; yang sudah terbit di akhir.
  const order = (p: Row) => {
    const report = Array.isArray(p.reports) ? p.reports[0] : p.reports;
    if (report?.status === "published") return 1e9;
    const eta = etas.get(p.id);
    return eta?.due ? daysLeft(eta.due) - (eta.express ? 0.5 : 0) : eta?.express ? 1e6 : 1e7;
  };
  rows.sort((a, b) => order(a) - order(b));

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Laporan</h1>
        <p className="text-muted">Susun laporan dari kunjungan yang lolos QC, pratinjau PDF-nya, lalu terbitkan ke client.</p>
      </section>
      {rows.length === 0 ? (
        <p className="card p-6 text-muted">Belum ada proyek aktif.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => {
            const report = Array.isArray(p.reports) ? p.reports[0] : p.reports;
            const ready = p.project_outlets.filter((o) => p.audit_tasks.some((t) => t.outlet_id === o.id && t.status === "approved")).length;
            const waiting = p.audit_tasks.filter((t) => t.status === "submitted" || t.status === "revision").length;
            const state = report?.status === "published" ? "Terbit" : report ? "Draf" : "Belum disusun";
            const eta = report?.status === "published" ? null : etas.get(p.id);
            const left = eta?.due ? daysLeft(eta.due) : null;
            return (
              <li key={p.id}>
                <Link href={`/admin/reports/${p.id}`} className="card grid gap-1 p-5 transition hover:border-muted">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold">{p.code}</span>
                    <span className={`chip ${report?.status === "published" ? "border-good/50 text-good" : report ? "border-accent text-mark" : ""}`}>{state}</span>
                    {eta?.express && <span className="chip border-accent bg-accent/15 font-bold text-mark">Express</span>}
                  </span>
                  <span className="text-sm">{p.package_snapshot.name}</span>
                  <span className="text-sm text-muted">
                    {ready}/{p.project_outlets.length} outlet punya kunjungan lolos QC{waiting > 0 && ` · ${waiting} menunggu QC`}
                  </span>
                  {eta?.due && left !== null && (
                    <span className={`text-sm font-semibold ${left < 0 ? "text-bad" : left <= 1 ? "text-warn" : "text-muted"}`}>
                      Tenggat terbit {dayLabel(eta.due)} · {left < 0 ? `lewat ${-left} hari` : left === 0 ? "hari ini" : `${left} hari lagi`}
                    </span>
                  )}
                  {eta && !eta.due && <span className="text-xs text-muted">Tenggat {eta.days} hari kerja setelah kunjungan terakhir lolos QC</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
