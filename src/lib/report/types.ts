// Isi laporan audit yang dibaca client dan dicetak ke PDF. Bagian yang tampil mengikuti fitur paket (entitlements).

export type Severity = "critical" | "major" | "minor";
export type Priority = "now" | "soon" | "later";

export type ReportScore = { title: string; score: number | null };
// target ada sejak Putaran 9 (bawaan 85); laporan lama tidak memilikinya.
export type ReportSection = ReportScore & { weight: number; target?: number };
export type ReportOutlet = {
  name: string;
  city: string;
  score: number | null;
  visits: number;
  sections: ReportScore[];
  sop?: number | null;
  redFlags?: number;
};
export type ReportFinding = {
  title: string;
  detail: string;
  severity: Severity;
  outlet: string | null;
};
export type ReportRecommendation = { text: string; priority: Priority };
// `src`: data URI atau tautan sementara; foto kompetitor tidak pernah masuk ke sini.
export type ReportPhoto = { src: string; caption: string };
export type ReportCompetitor = {
  name: string;
  city: string;
  score: number | null;
  sections: ReportScore[];
};

// Kepatuhan SOP: Ya / (Ya + Tidak) dari pertanyaan bertanda SOP. `outlets` = outlet yang melanggar.
export type ReportSopItem = {
  prompt: string;
  section: string;
  yes: number;
  no: number;
  outlets: string[];
};
export type ReportSop = {
  score: number | null;
  yes: number;
  no: number;
  items: ReportSopItem[];
};
export type ReportJourneyStage = {
  title: string;
  score: number | null;
  questions: number;
};
// Red flag: pertanyaan bertanda red flag yang dijawab Tidak atau skala 1–2. Tidak memotong skor.
export type ReportRedFlag = {
  prompt: string;
  section: string;
  outlet: string;
  count: number;
};
// Audit ulang: angka laporan sebelumnya.
export type ReportPrevious = {
  code: string;
  publishedAt: string | null;
  score: number | null;
  sections: ReportSection[];
  outlets: { name: string; score: number | null }[];
  sop: number | null;
};

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
  sop: ReportSop | null;
  journey: ReportJourneyStage[];
  redFlags: ReportRedFlag[];
  previous: ReportPrevious | null;
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Kritis",
  major: "Sedang",
  minor: "Ringan",
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  now: "Segera",
  soon: "1–3 bulan",
  later: "Jangka panjang",
};
export const DEFAULT_TARGET = 85;

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
    // Kepatuhan SOP, customer journey, dan analisis gap (Insight dan Performance).
    sop: entitlements.includes("sop"),
    // SOP per outlet, red flag, pola antar outlet, dan ringkasan eksekutif (Performance).
    benchmarking: entitlements.includes("benchmarking"),
    customScope: entitlements.includes("custom_scope"),
    reaudit: entitlements.includes("re_audit"),
  };
}

export function summaryTitle(entitlements: string[]) {
  const f = reportFeatures(entitlements);
  return f.benchmarking ? "Ringkasan eksekutif" : f.detailed ? "Ringkasan manajemen" : "Ringkasan";
}

export const fmtScore = (n: number | null | undefined) => (n === null || n === undefined ? "—" : (Math.round(n * 10) / 10).toLocaleString("id-ID"));
export const fmtDiff = (n: number) => (n >= 0 ? `+${fmtScore(n)}` : `−${fmtScore(-n)}`);

// Analisis gap: selisih skor tiap area dengan targetnya, dari yang paling jauh di bawah target.
export function gapRows(sections: ReportSection[]) {
  return sections
    .filter((s) => s.score !== null)
    .map((s) => {
      const target = s.target ?? DEFAULT_TARGET;
      return {
        title: s.title,
        target,
        score: s.score as number,
        gap: Math.round(((s.score as number) - target) * 10) / 10,
      };
    })
    .sort((a, b) => a.gap - b.gap);
}

// Pola antar outlet: rentang skor tiap area, outlet terendah dan tertinggi, dan berapa outlet di bawah target.
// Ditambah SOP yang dilanggar di lebih dari satu outlet (masalah sistemik, bukan satu cabang).
export function outletPatterns(data: Pick<ReportData, "sections" | "outlets" | "sop">) {
  const areas = data.sections
    .map((sec) => {
      const target = sec.target ?? DEFAULT_TARGET;
      const vals = data.outlets
        .map((o) => ({
          name: o.name,
          score: o.sections.find((x) => x.title === sec.title)?.score ?? null,
        }))
        .filter((v): v is { name: string; score: number } => v.score !== null);
      if (vals.length < 2) return null;
      const sorted = [...vals].sort((a, b) => a.score - b.score);
      return {
        title: sec.title,
        target,
        low: sorted[0],
        high: sorted[sorted.length - 1],
        spread: Math.round((sorted[sorted.length - 1].score - sorted[0].score) * 10) / 10,
        below: vals.filter((v) => v.score < target).length,
        total: vals.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.below - a.below || b.spread - a.spread);
  const sharedSop = (data.sop?.items ?? []).filter((i) => i.outlets.length >= 2);
  return { areas, sharedSop };
}

// Warna sel peta panas (heatmap) per skor.
export function heatClass(n: number | null | undefined) {
  if (n === null || n === undefined) return "bg-raise text-muted";
  if (n >= 85) return "bg-good/25";
  if (n >= 70) return "bg-good/10";
  if (n >= 55) return "bg-warn/20";
  return "bg-bad/25";
}
