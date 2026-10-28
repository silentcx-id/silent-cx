import { loadClientReport } from "@/lib/report/load";
import { reportPdf } from "@/lib/report/render";
import { requireRole } from "@/lib/session";

// PDF laporan yang sudah terbit, hanya untuk client pemilik proyek (dijaga RLS tabel reports).
export async function GET(_req: Request, { params }: RouteContext<"/app/reports/[id]/pdf">) {
  const { id } = await params;
  await requireRole("client", `/app/reports/${id}`);
  const report = await loadClientReport(id);
  if (!report) return new Response("Laporan tidak ditemukan.", { status: 404 });
  return reportPdf(report.data);
}
