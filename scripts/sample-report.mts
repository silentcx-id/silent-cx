// Membuat contoh PDF laporan dengan data rekaan, untuk mengecek tampilan sebelum dipakai.
// Jalankan: npm run contoh:laporan  → e2e-output/contoh-laporan-essential.pdf, -insight.pdf, dan -performance.pdf
import { renderToFile } from "@react-pdf/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { ReportDocument } from "../src/lib/report/pdf";
import { SAMPLES } from "../src/lib/report/sample";

const out = path.join(process.cwd(), "e2e-output");
mkdirSync(out, { recursive: true });

async function main() {
  for (const [key, data] of Object.entries(SAMPLES))
    await renderToFile(createElement(ReportDocument, { data }) as Parameters<typeof renderToFile>[0], path.join(out, `contoh-laporan-${key}.pdf`));
  console.log("Contoh laporan dibuat di e2e-output/.");
}

void main();
