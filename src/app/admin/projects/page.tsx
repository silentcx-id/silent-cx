import type { Metadata } from "next";
import Link from "next/link";
import { rupiah, dateTime } from "@/lib/format";
import { asList, type Project } from "@/lib/orders";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/project-labels";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Proyek & verifikasi" };

const TABS = [
  { id: "review", label: "Perlu review", statuses: ["awaiting_review"] },
  { id: "verify", label: "Verifikasi bukti", statuses: ["verifying"] },
  { id: "payment", label: "Menunggu pembayaran", statuses: ["awaiting_payment"] },
  { id: "active", label: "Aktif", statuses: ["active", "reporting"] },
  { id: "done", label: "Selesai", statuses: ["completed"] },
  { id: "all", label: "Semua", statuses: [] },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Row = Project & { profiles: { full_name: string; email: string } | null };

export default async function ProjectsPage({ searchParams }: PageProps<"/admin/projects">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/projects"), searchParams]);
  const supabase = await createClient();
  await supabase.rpc("expire_overdue");
  const { data } = await supabase
    .from("projects")
    .select("*, invoices(code, total, status, due_at, kind), profiles!projects_client_id_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as Row[];
  // Bukti bayar yang perlu diperiksa: pesanan baru atau tagihan tambahan kelebihan pembelian.
  const verifying = (r: Row) => r.status === "verifying" || asList(r.invoices).some((i) => i.status === "verifying");
  const needs = { review: rows.filter((r) => r.status === "awaiting_review").length, verify: rows.filter(verifying).length };
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : needs.review || !needs.verify ? "review" : "verify";
  const def = TABS.find((t) => t.id === tab)!;
  const shown = tab === "verify" ? rows.filter(verifying) : def.statuses.length ? rows.filter((r) => (def.statuses as readonly string[]).includes(r.status)) : rows;

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Proyek &amp; verifikasi</h1>
        <p className="text-muted">Tinjau pesanan yang perlu konfirmasi, periksa bukti bayar, lalu aktifkan proyek.</p>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Filter proyek">
        {TABS.map((t) => {
          const n = t.id === "review" ? needs.review : t.id === "verify" ? needs.verify : 0;
          return (
            <Link key={t.id} href={`/admin/projects?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined} className={`btn btn-sm ${t.id === tab ? "btn-primary" : ""}`}>
              {t.label}
              {n > 0 && <span className="rounded-full bg-accent-ink/80 px-1.5 text-[11px] text-accent">{n}</span>}
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <p className="card p-6 text-muted">Tidak ada proyek di kategori ini.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Proyek</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Paket</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const inv = asList(r.invoices)[0];
                return (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/projects/${r.id}`} className="font-mono font-semibold text-mark underline-offset-4 hover:underline">
                        {r.code}
                      </Link>
                      {inv && <div className="font-mono text-xs text-muted">{inv.code}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.profiles?.full_name || "—"}</div>
                      <div className="text-muted">{r.profiles?.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.package_snapshot.name}
                      <div className="text-muted">{r.outlet_count} outlet</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inv ? rupiah(inv.total) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${PROJECT_STATUS_TONE[r.status]}`}>{PROJECT_STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{dateTime(r.created_at, "id")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
