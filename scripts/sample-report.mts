// Membuat contoh PDF laporan dengan data rekaan, untuk mengecek tampilan sebelum dipakai.
// Jalankan: npm run contoh:laporan  → e2e-output/contoh-laporan-essential.pdf dan contoh-laporan-performance.pdf
import { renderToFile } from "@react-pdf/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { ReportDocument } from "../src/lib/report/pdf";
import { essentialSample, performanceSample } from "../src/lib/report/sample";

const out = path.join(process.cwd(), "e2e-output");
mkdirSync(out, { recursive: true });

async function main() {
  await renderToFile(createElement(ReportDocument, { data: essentialSample }) as Parameters<typeof renderToFile>[0], path.join(out, "contoh-laporan-essential.pdf"));
  await renderToFile(createElement(ReportDocument, { data: performanceSample }) as Parameters<typeof renderToFile>[0], path.join(out, "contoh-laporan-performance.pdf"));
  console.log("Contoh laporan dibuat di e2e-output/.");
}

void main();
