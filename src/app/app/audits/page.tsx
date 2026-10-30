import type { Metadata } from "next";
import Link from "next/link";
import { Stepper } from "@/components/stepper";
import { dayLabel } from "@/lib/field";
import { dict } from "@/lib/i18n";
import { getClientProjects } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit berjalan" };

type Row = {
  project_id: string;
  project_code: string;
  project_status: string;
  outlet_id: string;
  position: number;
  name: string;
  city: string;
  visits_planned: number;
  scheduled: number;
  awaiting_qc: number;
  approved: number;
  is_competitor: boolean;
  extra_visits: number;
  // Perkiraan laporan: biasa 5 hari kerja, express 2 hari kerja setelah kunjungan terakhir lolos QC.
  report_eta: { express: boolean; days: number; all_done: boolean; due: string | null } | null;
  // Audit ulang: tanggal paling cepat kunjungan (30 hari setelah laporan sebelumnya terbit).
  earliest_visit: string | null;
};

function etaText(r: Row, status: string) {
  const eta = r.report_eta;
  if (!eta || status === "completed") return null;
  const kind = eta.express ? "Laporan express" : "Laporan";
  if (eta.due) return `${kind}: perkiraan terbit ${dayLabel(eta.due)}`;
  return `${kind} terbit sekitar ${eta.days} hari kerja setelah kunjungan terakhir lolos QC`;
}

// Tahap proyek dari 0 (Pesanan) sampai 6 (Laporan); 7 berarti laporan sudah terbit.
// Proyek yang tampil di sini sudah lunas, jadi Pesanan dan Pembayaran selalu selesai.
function projectStep(status: string, detailsDone: boolean, outlets: Row[]): number {
  if (status === "completed") return 7;
  if (status === "reporting") return 6;
  if (!detailsDone) return 2;
  const all = (f: (r: Row) => number) => outlets.every((r) => f(r) >= r.visits_planned);
  if (!all((r) => r.scheduled + r.awaiting_qc + r.approved)) return 3;
  if (!all((r) => r.awaiting_qc + r.approved)) return 4;
  if (!all((r) => r.approved)) return 5;
  return 6;
}

// Timeline per proyek, lalu progres per outlet tanpa tanggal kunjungan, nama shopper, atau jawaban
// (angkanya dihitung di client_audit_progress).
export default async function AuditsPage() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app/audits"), getLang()]);
  const t = dict(lang).audits;
  const supabase = await createClient();
  const [{ data }, projects] = await Promise.all([supabase.rpc("client_audit_progress"), getClientProjects(viewer.id)]);
  const rows = (data ?? []) as Row[];
  const detailsDone = new Map(projects.map((p) => [p.id, Boolean(p.details_completed_at)]));
  const ids = [...new Set(rows.map((r) => r.project_id))];

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>
      {ids.length === 0 && <p className="card p-6 text-muted">{t.empty}</p>}
      {ids.map((projectId) => {
        const outlets = rows.filter((r) => r.project_id === projectId);
        const { project_code: code, project_status: status } = outlets[0];
        const step = projectStep(status, detailsDone.get(projectId) ?? false, outlets);
        return (
          <section key={projectId} className="grid gap-5">
            <div className="card grid gap-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="eyebrow font-mono">{code}</h2>
                  <p className="text-lg font-extrabold">{t.stepNow[step]}</p>
                  {etaText(outlets[0], status) && <p className="text-sm text-muted">{etaText(outlets[0], status)}</p>}
                  {outlets[0].earliest_visit && status !== "completed" && (
                    <p className="text-sm text-muted">Audit ulang: kunjungan paling cepat {dayLabel(outlets[0].earliest_visit)}, 30 hari setelah laporan sebelumnya terbit.</p>
                  )}
                </div>
                {step === 2 && (
                  <Link href="/app/outlets" className="btn btn-primary">
                    {t.completeDetails} →
                  </Link>
                )}
                {step === 7 && (
                  <Link href={`/app/reports/${projectId}`} className="btn btn-primary">
                    {t.openReport} →
                  </Link>
                )}
              </div>
              <Stepper steps={t.steps} current={step} label={t.timeline} hereLabel={t.here} />
            </div>

            <h3 className="eyebrow">{t.perOutlet}</h3>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {outlets.map((r) => {
                const pct = Math.min(100, Math.round((r.approved / Math.max(1, r.visits_planned)) * 100));
                const state =
                  r.approved >= r.visits_planned
                    ? { label: t.approved, tone: "border-good/50 text-good" }
                    : r.awaiting_qc > 0
                      ? { label: t.awaitingQc, tone: "border-accent text-mark" }
                      : r.scheduled > 0 || r.approved > 0
                        ? { label: t.scheduled, tone: "" }
                        : { label: t.notScheduled, tone: "text-muted" };
                return (
                  <li key={r.outlet_id} className="card grid content-start gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold">
                        {r.position}. {r.name || r.city}
                      </span>
                      <span className="flex gap-1">
                        {r.is_competitor && <span className="chip border-accent text-mark">{t.competitor}</span>}
                        {r.extra_visits > 0 && <span className="chip">+{r.extra_visits} kunjungan tambahan</span>}
                        <span className="chip">{r.city}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-raise" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-muted">{t.approvedOf(r.approved, r.visits_planned)}</span>
                      <span className={`chip ${state.tone}`}>{state.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {ids.length > 0 && <p className="text-sm text-muted">{t.note}</p>}
    </>
  );
}
