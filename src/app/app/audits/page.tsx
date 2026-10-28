import type { Metadata } from "next";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit berjalan" };

type Row = { project_id: string; project_code: string; outlet_id: string; position: number; name: string; city: string; visits_planned: number; scheduled: number; awaiting_qc: number; approved: number; is_competitor: boolean };

// Progres per outlet tanpa tanggal kunjungan, nama shopper, atau jawaban (dihitung di client_audit_progress).
export default async function AuditsPage() {
  const [, lang] = await Promise.all([requireRole("client", "/app/audits"), getLang()]);
  const t = dict(lang).audits;
  const supabase = await createClient();
  const { data } = await supabase.rpc("client_audit_progress");
  const rows = (data ?? []) as Row[];
  const projects = [...new Map(rows.map((r) => [r.project_id, r.project_code])).entries()];

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>
      {projects.length === 0 && <p className="card p-6 text-muted">{t.empty}</p>}
      {projects.map(([projectId, code]) => (
        <section key={projectId} className="grid gap-3">
          <h2 className="eyebrow font-mono">{code}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows
              .filter((r) => r.project_id === projectId)
              .map((r) => {
                const done = r.approved;
                const pct = Math.min(100, Math.round((done / Math.max(1, r.visits_planned)) * 100));
                return (
                  <li key={r.outlet_id} className="card grid gap-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold">
                        {r.position}. {r.name || r.city}
                      </span>
                      <span className="flex gap-1">
                        {r.is_competitor && <span className="chip border-accent text-mark">{t.competitor}</span>}
                        <span className="chip">{r.city}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-raise" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <ul className="grid gap-1 text-sm">
                      <li className="text-muted">{t.planned(r.visits_planned)}</li>
                      {r.scheduled > 0 && <li>{t.scheduled}: {r.scheduled}</li>}
                      {r.awaiting_qc > 0 && <li className="text-mark">{t.awaitingQc}: {r.awaiting_qc}</li>}
                      {r.approved > 0 && <li className="text-good">{t.approved}: {r.approved}</li>}
                      {r.scheduled + r.awaiting_qc + r.approved === 0 && <li className="text-muted">{t.notScheduled}</li>}
                    </ul>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {projects.length > 0 && <p className="text-sm text-muted">{t.note}</p>}
    </>
  );
}
