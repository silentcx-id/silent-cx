import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { QuestionnaireSnapshot } from "@/lib/field";
import type { ReportData, ReportFinding, ReportRecommendation } from "./types";

// Angka dari project_report_data (dihitung ulang untuk admin, dibekukan di reports.data untuk client).
type Numbers = Omit<ReportData, "summary" | "findings" | "recommendations" | "photos" | "publishedAt" | "visitPeriod"> & { firstVisit: string | null; lastVisit: string | null };

export type ReportRow = {
  project_id: string;
  status: "draft" | "published";
  summary: string;
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  photo_ids: string[];
  data: Numbers | null;
  published_at: string | null;
};

const fmt = (d: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(d));

function period(first: string | null, last: string | null) {
  if (!first || !last) return "—";
  return fmt(first) === fmt(last) ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

// Foto pilihan admin sebagai tautan sementara (10 menit), dengan keterangan outlet dan pertanyaan.
// Dibaca dengan service role karena client tidak punya akses ke tabel foto; kepemilikan proyek sudah dicek pemanggil.
async function photos(projectId: string, ids: string[]) {
  if (!ids.length) return [];
  const admin = createAdminClient();
  const [{ data: rows }, { data: pq }] = await Promise.all([
    admin.from("visit_photos").select("id, kind, question_id, path, audit_tasks!inner(project_id, project_outlets(name))").in("id", ids).eq("audit_tasks.project_id", projectId),
    admin.from("project_questionnaires").select("snapshot").eq("project_id", projectId).maybeSingle(),
  ]);
  const snap = pq?.snapshot as QuestionnaireSnapshot | undefined;
  const prompt = (qid: string | null) => snap?.sections.flatMap((s) => s.questions).find((q) => q.id === qid)?.prompt;
  const list = (rows ?? []) as unknown as { id: string; kind: string; question_id: string | null; path: string; audit_tasks: { project_outlets: { name: string } | null } }[];
  const ordered = ids.map((id) => list.find((r) => r.id === id)).filter((r): r is (typeof list)[number] => Boolean(r));
  if (!ordered.length) return [];
  const { data: signed } = await admin.storage.from("audit-evidence").createSignedUrls(ordered.map((r) => r.path), 600);
  return ordered.map((r, i) => ({
    id: r.id,
    src: signed?.[i]?.signedUrl ?? "",
    caption: `${r.audit_tasks.project_outlets?.name ?? "Outlet"} · ${r.kind === "receipt" ? "Struk pembelian" : (prompt(r.question_id) ?? "Bukti kunjungan")}`,
  })).filter((p) => p.src);
}

function assemble(numbers: Numbers, row: ReportRow | null, photoList: { src: string; caption: string }[]): ReportData {
  return {
    code: numbers.code,
    company: numbers.company,
    packageName: numbers.packageName,
    entitlements: numbers.entitlements,
    publishedAt: row?.published_at ? fmt(row.published_at) : null,
    visitPeriod: period(numbers.firstVisit, numbers.lastVisit),
    outletCount: numbers.outletCount,
    visitCount: numbers.visitCount,
    score: numbers.score === null ? null : Number(numbers.score),
    summary: row?.summary ?? "",
    sections: numbers.sections.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })),
    outlets: numbers.outlets.map((o) => ({ ...o, score: o.score === null ? null : Number(o.score), sections: o.sections.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })) })),
    findings: row?.findings ?? [],
    recommendations: row?.recommendations ?? [],
    photos: photoList,
    competitors: numbers.competitors.map((c) => ({ ...c, score: c.score === null ? null : Number(c.score), sections: c.sections.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })) })),
  };
}

// Admin: angka terbaru (atau yang dibekukan kalau sudah terbit) dan draf laporan.
export async function loadAdminReport(projectId: string) {
  const supabase = await createClient();
  const [{ data: numbers }, { data: row }] = await Promise.all([
    supabase.rpc("project_report_data", { p_project: projectId }),
    supabase.from("reports").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!numbers) return null;
  const report = row as ReportRow | null;
  const frozen = report?.status === "published" && report.data ? report.data : (numbers as Numbers);
  const photoList = await photos(projectId, report?.photo_ids ?? []);
  return { data: assemble(frozen, report, photoList), row: report, photos: photoList };
}

// Client: hanya laporan yang sudah terbit (dijaga RLS), dengan angka yang dibekukan saat terbit.
export async function loadClientReport(projectId: string) {
  const supabase = await createClient();
  const { data: row } = await supabase.from("reports").select("*").eq("project_id", projectId).eq("status", "published").maybeSingle();
  const report = row as ReportRow | null;
  if (!report?.data) return null;
  return { data: assemble(report.data, report, await photos(projectId, report.photo_ids)), row: report };
}
