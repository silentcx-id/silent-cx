import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReauditCard } from "./reaudit";
import { ReportView } from "@/components/report-view";
import { getCatalog } from "@/lib/catalog";
import { displayPrice } from "@/lib/catalog-types";
import { dayLabel } from "@/lib/field";
import { dict } from "@/lib/i18n";
import { getClientProjects, OPEN_STATUSES } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { loadClientReport } from "@/lib/report/load";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Laporan" };

export default async function ReportPage({ params }: PageProps<"/app/reports/[id]">) {
  const { id } = await params;
  const [viewer, lang] = await Promise.all([requireRole("client", `/app/reports/${id}`), getLang()]);
  const t = dict(lang).reports;
  const [report, projects, { addons }] = await Promise.all([loadClientReport(id), getClientProjects(viewer.id), getCatalog()]);
  if (!report) notFound();

  // Audit ulang: hanya setelah laporan terbit, untuk paket yang boleh memakainya.
  const project = projects.find((p) => p.id === id);
  const reaudit = addons.find((a) => a.key === "re_audit" && a.active);
  const allowed =
    project &&
    reaudit &&
    project.status === "completed" &&
    (reaudit.applicable_packages.length === 0 || reaudit.applicable_packages.includes(project.package_snapshot.key));
  const child = projects.find((p) => p.parent_project_id === id && p.status !== "cancelled" && p.status !== "expired");
  const earliest = report.row.published_at
    ? new Date(new Date(report.row.published_at).getTime() + 7 * 3600_000 + 30 * 86400_000).toISOString().slice(0, 10)
    : null;

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
      {allowed && earliest && (
        <ReauditCard
          projectId={id}
          outlets={project.project_outlets.filter((o) => !o.is_competitor).length}
          unitPrice={displayPrice(reaudit.price, reaudit)}
          quote={reaudit.pricing === "quote"}
          review={reaudit.requires_review || reaudit.pricing === "quote"}
          earliest={dayLabel(earliest, lang)}
          existing={child ? { code: child.code, status: child.status } : null}
          blocked={!child && projects.some((p) => OPEN_STATUSES.includes(p.status))}
        />
      )}
    </>
  );
}
