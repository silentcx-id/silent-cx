import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { QuestionnaireSnapshot } from "@/lib/field";
import type { ReportData, ReportFinding, ReportRecommendation } from "./types";

// Angka dari project_report_data (dihitung ulang untuk admin, dibekukan di reports.data untuk client).
// Laporan yang terbit sebelum Putaran 9 tidak punya sop, journey, redFlags, dan previous.
type Numbers = Omit<ReportData, "summary" | "findings" | "recommendations" | "photos" | "publishedAt" | "visitPeriod" | "sop" | "journey" | "redFlags" | "previous"> &
  Partial<Pick<ReportData, "sop" | "journey" | "redFlags" | "previous">> & { firstVisit: string | null; lastVisit: string | null };

const num = (n: unknown) => (n === null || n === undefined ? null : Number(n));

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
    outlets: numbers.outlets.map((o) => ({ ...o, score: o.score === null ? null : Number(o.score), sop: num(o.sop), redFlags: o.redFlags === undefined ? undefined : Number(o.redFlags), sections: o.sections.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })) })),
    findings: row?.findings ?? [],
    recommendations: row?.recommendations ?? [],
    photos: photoList,
    competitors: numbers.competitors.map((c) => ({ ...c, score: c.score === null ? null : Number(c.score), sections: c.sections.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })) })),
    sop: numbers.sop
      ? { score: num(numbers.sop.score), yes: Number(numbers.sop.yes), no: Number(numbers.sop.no), items: numbers.sop.items.map((i) => ({ ...i, yes: Number(i.yes), no: Number(i.no) })) }
      : null,
    journey: (numbers.journey ?? []).map((j) => ({ ...j, score: num(j.score), questions: Number(j.questions) })),
    redFlags: (numbers.redFlags ?? []).map((r) => ({ ...r, count: Number(r.count) })),
    previous: numbers.previous
      ? {
          ...numbers.previous,
          publishedAt: numbers.previous.publishedAt ? fmt(numbers.previous.publishedAt) : null,
          score: num(numbers.previous.score),
          sop: num(numbers.previous.sop),
          sections: (numbers.previous.sections ?? []).map((x) => ({ ...x, score: num(x.score) })),
          outlets: (numbers.previous.outlets ?? []).map((x) => ({ name: x.name, score: num(x.score) })),
        }
      : null,
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

// Laporan terbit terbaru milik client yang memuat fitur tertentu (benchmarking atau competitor). Tanpa foto.
export async function latestClientReport(clientId: string, entitlement: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("*, projects!inner(client_id, entitlements)")
    .eq("status", "published")
    .eq("projects.client_id", clientId)
    .contains("projects.entitlements", [entitlement])
    .order("published_at", { ascending: false })
    .limit(1);
  const report = data?.[0] as ReportRow | undefined;
  if (!report?.data) return null;
  return { projectId: report.project_id, data: assemble(report.data, report, []) };
}
