import type { NextRequest } from "next/server";
import { reportPdf } from "@/lib/report/render";
import { sampleFor } from "@/lib/report/sample";

// Contoh laporan untuk pengunjung landing page, tanpa login. Datanya fiktif (PT ABC / Cafe 123).
// ?paket=essential|insight|performance memilih isi laporan; bawaannya Performance (paling lengkap).
export async function GET(req: NextRequest) {
  return reportPdf({ ...sampleFor(req.nextUrl.searchParams.get("paket")), code: "CONTOH" }, false, true);
}
