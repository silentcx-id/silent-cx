// Isi laporan audit yang dibaca client dan dicetak ke PDF. Bagian yang tampil mengikuti fitur paket (entitlements).

export type Severity = "critical" | "major" | "minor";
export type Priority = "now" | "soon" | "later";

export type ReportScore = { title: string; score: number | null };
export type ReportSection = ReportScore & { weight: number };
export type ReportOutlet = { name: string; city: string; score: number | null; visits: number; sections: ReportScore[] };
export type ReportFinding = { title: string; detail: string; severity: Severity; outlet: string | null };
export type ReportRecommendation = { text: string; priority: Priority };
// `src`: data URI atau tautan sementara; foto kompetitor tidak pernah masuk ke sini.
export type ReportPhoto = { src: string; caption: string };
export type ReportCompetitor = { name: string; city: string; score: number | null; sections: ReportScore[] };

export type ReportData = {
  code: string;
  company: string;
  packageName: string;
  entitlements: string[];
  publishedAt: string | null;
  visitPeriod: string;
  outletCount: number;
  visitCount: number;
  score: number | null;
  summary: string;
  sections: ReportSection[];
  outlets: ReportOutlet[];
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  photos: ReportPhoto[];
  competitors: ReportCompetitor[];
};

export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Kritis", major: "Sedang", minor: "Ringan" };
export const PRIORITY_LABEL: Record<Priority, string> = { now: "Segera", soon: "1–3 bulan", later: "Jangka panjang" };

// Kategori skor CX, dipakai di laporan dan dijelaskan di bagian metodologi.
export function scoreBand(score: number | null): string {
  if (score === null) return "Belum ada data";
  if (score >= 85) return "Sangat baik";
  if (score >= 70) return "Baik";
  if (score >= 55) return "Perlu perbaikan";
  return "Kritis";
}

export function reportFeatures(entitlements: string[]) {
  return {
    detailed: entitlements.includes("report_detailed"),
    evidence: entitlements.includes("evidence"),
    multiOutlet: entitlements.includes("multi_outlet"),
    competitor: entitlements.includes("competitor"),
  };
}

export const fmtScore = (n: number | null) => (n === null ? "—" : (Math.round(n * 10) / 10).toLocaleString("id-ID"));
