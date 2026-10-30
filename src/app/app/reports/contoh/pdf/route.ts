import type { NextRequest } from "next/server";
import { reportPdf } from "@/lib/report/render";
import { sampleFor } from "@/lib/report/sample";
import { requireRole } from "@/lib/session";

// Contoh laporan dengan data rekaan, untuk calon client yang ingin melihat isi laporan sebelum membeli.
// ?paket=essential|insight|performance memilih isi laporan.
export async function GET(req: NextRequest) {
  await requireRole("client", "/app/reports");
  return reportPdf({ ...sampleFor(req.nextUrl.searchParams.get("paket")), code: "CONTOH" }, false, true);
}
