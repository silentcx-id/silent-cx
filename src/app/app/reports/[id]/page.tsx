import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { loadClientReport } from "@/lib/report/load";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Laporan" };

export default async function ReportPage({ params }: PageProps<"/app/reports/[id]">) {
  const { id } = await params;
  const [, lang] = await Promise.all([requireRole("client", `/app/reports/${id}`), getLang()]);
  const t = dict(lang).reports;
  const report = await loadClientReport(id);
  if (!report) notFound();
  return (
    <>
      <Link href="/app/reports" className="text-sm text-muted hover:text-fg">
        ← {t.back}
      </Link>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <span className="eyebrow">Laporan audit pengalaman pelanggan · {report.data.code}</span>
          <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{report.data.company}</h1>
          {report.data.publishedAt && <p className="text-sm text-muted">{t.published(report.data.publishedAt)}</p>}
        </div>
        <a href={`/app/reports/${id}/pdf`} className="btn btn-primary">
          {t.download}
        </a>
      </section>
      <ReportView data={report.data} />
    </>
  );
}
