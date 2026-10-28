import { reportPdf } from "@/lib/report/render";
import { performanceSample } from "@/lib/report/sample";
import { requireRole } from "@/lib/session";

// Contoh laporan dengan data rekaan, untuk calon client yang ingin melihat isi laporan sebelum membeli.
export async function GET() {
  await requireRole("client", "/app/reports");
  return reportPdf({ ...performanceSample, code: "CONTOH" }, false, true);
}
