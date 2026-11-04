import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportFinding } from "./types";

// Ringkasan laporan yang masih terkunci karena pelunasan belum lunas (client_report_preview, migrasi 20261104000023).
export type ReportPreview = {
  project: string;
  code: string;
  company: string;
  package: string;
  published_at: string;
  score: number | null;
  outlets: { name: string; city: string | null; score: number | null }[];
  findings: ReportFinding[];
  settlement: { id: string; code: string; total: number; status: "unpaid" | "verifying" | "paid" | "cancelled" };
};

export async function getReportPreview(projectId: string): Promise<ReportPreview | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("client_report_preview", { p_project: projectId });
  if (!data) return null;
  const p = data as ReportPreview;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { ...p, score: num(p.score), outlets: p.outlets.map((o) => ({ ...o, score: num(o.score) })) };
}

export type LockedReport = { project_id: string; code: string; package_name: string; published_at: string; score: number | null; settlement_total: number; settlement_status: string };

export async function getLockedReports(): Promise<LockedReport[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("client_locked_reports");
  return ((data ?? []) as LockedReport[]).map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) }));
}
