// Screenshot tampilan web laporan contoh ketiga paket, dengan CSS asli dari server yang sedang berjalan.
// Jalankan server dulu (npx next start -p 3100), lalu: npm run contoh:laporan:shot
// Hasil: e2e-output/contoh-web-essential.png, -insight.png, -performance.png
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { ReportView } from "../src/components/report-view";
import { SAMPLES } from "../src/lib/report/sample";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const out = path.join(process.cwd(), "e2e-output");
mkdirSync(out, { recursive: true });

async function main() {
  // Tag <html> (variabel font, tema) dan stylesheet diambil dari halaman publik yang sudah dibangun.
  const page = await (await fetch(`${BASE}/login`)).text();
  const htmlTag = page.match(/<html[^>]*>/)?.[0] ?? "<html lang=\"id\">";
  const styles = [...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*>|<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join("\n");
  const browser = await chromium.launch();
  try {
    for (const [key, data] of Object.entries(SAMPLES)) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const tab = await ctx.newPage();
      const body = renderToStaticMarkup(createElement(ReportView, { data: { ...data, code: "CONTOH" } }));
      await tab.goto(`${BASE}/login`, { waitUntil: "load" });
      await tab.setContent(
        `<!doctype html>${htmlTag}<head><meta charset="utf-8"><base href="${BASE}/">${styles}</head><body class="min-h-dvh antialiased"><main class="mx-auto grid max-w-6xl gap-6 p-8"><h1 class="text-3xl font-extrabold">Contoh laporan · ${data.packageName}</h1>${body}</main></body></html>`,
        { waitUntil: "networkidle" },
      );
      await tab.screenshot({ path: path.join(out, `contoh-web-${key}.png`), fullPage: true });
      await ctx.close();
      console.log(`contoh-web-${key}.png`);
    }
  } finally {
    await browser.close();
  }
}

void main();
