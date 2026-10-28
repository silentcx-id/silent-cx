import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportEditor } from "./report-editor";
import { ReportView } from "@/components/report-view";
import type { QuestionnaireSnapshot } from "@/lib/field";
import { loadAdminReport } from "@/lib/report/load";
import { reportFeatures, scoreBand, fmtScore, type ReportData, type ReportFinding } from "@/lib/report/types";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Laporan" };

// Draf awal dari skor: ringkasan berisi area terkuat dan terlemah, temuan dari area di bawah 70.
function suggest(data: ReportData): { summary: string; findings: ReportFinding[] } {
  const scored = data.sections.filter((s) => s.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const best = scored[0];
  const worst = scored.at(-1);
  const summary = [
    `Skor CX keseluruhan ${fmtScore(data.score)} (${scoreBand(data.score).toLowerCase()}) dari ${data.visitCount} kunjungan di ${data.outletCount} outlet.`,
    best && worst && best !== worst ? `Area terkuat adalah ${best.title} (${fmtScore(best.score)}), sedangkan ${worst.title} (${fmtScore(worst.score)}) paling perlu perhatian.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const findings = scored
    .filter((s) => (s.score ?? 100) < 70)
    .reverse()
    .slice(0, 5)
    .map((s) => ({ title: `${s.title}: skor ${fmtScore(s.score)}`, detail: "", severity: (s.score ?? 0) < 55 ? "critical" : "major", outlet: null }) as ReportFinding);
  return { summary, findings };
}

export default async function ReportEditorPage({ params }: PageProps<"/admin/reports/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/reports/${id}`);
  const supabase = await createClient();
  const [report, { data: blockers }, { data: project }] = await Promise.all([
    loadAdminReport(id),
    supabase.rpc("report_blockers", { p_project: id }),
    supabase.from("projects").select("code, status, entitlements").eq("id", id).maybeSingle(),
  ]);
  if (!report || !project) notFound();
  const published = report.row?.status === "published";
  const f = reportFeatures(report.data.entitlements);

  // Foto yang boleh masuk laporan: dari kunjungan yang lolos QC ke outlet client, bukan foto check-in atau kompetitor.
  let candidates: { id: string; url: string; caption: string }[] = [];
  if (f.evidence && !published) {
    const [{ data: rows }, { data: pq }] = await Promise.all([
      supabase
        .from("visit_photos")
        .select("id, kind, question_id, path, audit_tasks!inner(project_id, status, code, project_outlets!inner(name, is_competitor))")
        .eq("audit_tasks.project_id", id)
        .eq("audit_tasks.status", "approved")
        .eq("audit_tasks.project_outlets.is_competitor", false)
        .neq("kind", "checkin"),
      supabase.from("project_questionnaires").select("snapshot").eq("project_id", id).maybeSingle(),
    ]);
    const list = (rows ?? []) as unknown as { id: string; kind: string; question_id: string | null; path: string; audit_tasks: { code: string; project_outlets: { name: string } } }[];
    const snap = pq?.snapshot as QuestionnaireSnapshot | undefined;
    const prompt = (q: string | null) => snap?.sections.flatMap((s) => s.questions).find((x) => x.id === q)?.prompt;
    if (list.length) {
      const { data: signed } = await createAdminClient().storage.from("audit-evidence").createSignedUrls(list.map((p) => p.path), 600);
      candidates = list.map((p, i) => ({
        id: p.id,
        url: signed?.[i]?.signedUrl ?? "",
        caption: `${p.audit_tasks.project_outlets.name} · ${p.kind === "receipt" ? "Struk pembelian" : (prompt(p.question_id) ?? "Bukti")} (${p.audit_tasks.code})`,
      }));
    }
  }

  const draft = report.row ?? { summary: "", findings: [], recommendations: [], photo_ids: [] };
  const initial = report.row
    ? { summary: draft.summary, findings: draft.findings, recommendations: draft.recommendations, photoIds: draft.photo_ids }
    : { ...suggest(report.data), recommendations: [], photoIds: [] };

  return (
    <>
      <Link href="/admin/reports" className="text-sm text-muted hover:text-fg">
        ← Semua laporan
      </Link>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[clamp(24px,4vw,34px)] font-extrabold">{project.code}</h1>
            <span className={`chip ${published ? "border-good/50 text-good" : "border-accent text-mark"}`}>{published ? `Terbit ${report.data.publishedAt}` : "Draf"}</span>
          </span>
          <p className="text-muted">
            {report.data.company} · {report.data.packageName}
          </p>
        </div>
        <a href={`/admin/reports/${id}/pdf`} target="_blank" rel="noreferrer" className="btn">
          {published ? "Lihat PDF" : "Pratinjau PDF"} ↗
        </a>
      </section>

      {!published && (
        <ReportEditor
          projectId={id}
          initial={initial}
          outlets={report.data.outlets.map((o) => o.name)}
          photos={candidates}
          evidence={f.evidence}
          detailed={f.detailed}
          blockers={(blockers ?? []) as string[]}
          isNew={!report.row}
        />
      )}

      <section className="grid gap-3">
        <h2 className="eyebrow">{published ? "Laporan yang terbit" : "Pratinjau sesuai draf tersimpan"}</h2>
        <ReportView data={report.data} />
      </section>
    </>
  );
}
