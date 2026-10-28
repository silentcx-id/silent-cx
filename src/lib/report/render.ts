import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReportDocument } from "./pdf";
import type { ReportData } from "./types";

// File PDF siap unduh. `inline` membuka di tab browser (pratinjau admin); selain itu langsung terunduh.
export async function pdfResponse(element: Parameters<typeof renderToBuffer>[0], filename: string, inline = false) {
  const buffer = await renderToBuffer(element);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.-]/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function reportPdf(data: ReportData, draft = false, inline = false) {
  return pdfResponse(createElement(ReportDocument, { data, draft }) as Parameters<typeof renderToBuffer>[0], `laporan-${data.code}${draft ? "-draf" : ""}.pdf`, inline);
}
