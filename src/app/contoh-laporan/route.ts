import { reportPdf } from "@/lib/report/render";
import { performanceSample } from "@/lib/report/sample";

// Contoh laporan untuk pengunjung landing page, tanpa login. Datanya fiktif (PT ABC / Cafe 123).
export async function GET() {
  return reportPdf({ ...performanceSample, code: "CONTOH" }, false, true);
}
