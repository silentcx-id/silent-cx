import { loadAdminReport } from "@/lib/report/load";
import { reportPdf } from "@/lib/report/render";
import { requireRole } from "@/lib/session";

// Pratinjau PDF untuk admin: draf diberi tanda "DRAF, BELUM TERBIT".
export async function GET(_req: Request, { params }: RouteContext<"/admin/reports/[id]/pdf">) {
  const { id } = await params;
  await requireRole("admin", `/admin/reports/${id}`);
  const report = await loadAdminReport(id);
  if (!report) return new Response("Laporan tidak ditemukan.", { status: 404 });
  return reportPdf(report.data, report.row?.status !== "published", true);
}
