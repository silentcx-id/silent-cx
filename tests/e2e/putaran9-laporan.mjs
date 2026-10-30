// Uji headless Putaran 9: builder kuesioner (SOP, red flag, tahap journey, target), contoh laporan per paket,
// halaman Benchmark outlet dan Benchmark kompetitor, progres audit, Outlet & data, dan daftar laporan admin.
// Tidak mengubah data: hanya membuka halaman dengan tautan masuk sekali pakai untuk akun demo.
// Butuh migrasi 20261030000014_report_features.sql sudah dijalankan di database yang dipakai.
// Jalankan: node --env-file=.env.local tests/e2e/putaran9-laporan.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const shot = (page, name) => page.screenshot({ path: new URL(`p9-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function loginAs(browser, email, viewport = { width: 1280, height: 900 }) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}

const browser = await chromium.launch();
try {
  // 1. Contoh laporan PDF per paket, tanpa login.
  for (const paket of ["essential", "insight", "performance"]) {
    const res = await fetch(`${BASE}/contoh-laporan?paket=${paket}`);
    const size = (await res.arrayBuffer()).byteLength;
    check(`contoh laporan ${paket} berupa PDF`, res.status === 200 && (res.headers.get("content-type") ?? "").includes("application/pdf") && size > 20000, `${Math.round(size / 1024)} KB`);
  }

  // 2. Admin: builder kuesioner menampilkan ringkasan isi laporan, tahap journey, dan tanda pertanyaan.
  {
    const s = await loginAs(browser, "admin@silentcx.demo");
    await s.page.goto(`${BASE}/admin/questionnaires`, { waitUntil: "networkidle" });
    const first = s.page.locator("main a[href^='/admin/questionnaires/']").first();
    if (await first.count()) {
      await first.click();
      await s.page.waitForURL("**/admin/questionnaires/**");
      await s.page.locator("main h1").first().waitFor();
      const body = await text(s.page);
      check("detail kuesioner punya Ringkasan isi laporan", body.includes("Ringkasan isi laporan") && body.includes("Pertanyaan SOP") && body.includes("Tahap journey dipakai"));
      check("detail kuesioner menyebut syarat paket Insight dan Performance", body.includes("Paket Insight") && body.includes("Paket Performance"));
      check("panel tahap customer journey tampil", (await s.page.getByRole("heading", { name: /Tahap customer journey/ }).count()) === 1);
      await s.page.getByText(/Catatan referensi customer journey/).click();
      check("catatan referensi berisi contoh alur", (await text(s.page)).includes("Contoh alur"));
      check("setiap bagian punya isian target skor", (await s.page.getByLabel("Target skor").count()) > 0);
      check("pertanyaan punya pilihan SOP, red flag, dan tahap", (await s.page.getByLabel(/^SOP/).count()) > 0 && (await s.page.getByLabel("Red flag").count()) > 0 && (await s.page.getByLabel("Tahap customer journey").count()) > 0);
      // Pertanyaan skala: centang SOP tidak bisa dipilih.
      const scaleRow = s.page.locator("li", { has: s.page.locator("select option:checked", { hasText: "Skala 1–5" }) }).first();
      if (await scaleRow.count()) check("SOP tidak bisa dicentang untuk pertanyaan skala", await scaleRow.getByLabel(/^SOP/).isDisabled());
      await shot(s.page, "kuesioner");
    } else check("ada kuesioner untuk diperiksa", false);

    await s.page.goto(`${BASE}/admin/reports`, { waitUntil: "networkidle" });
    check("daftar laporan admin terbuka", (await s.page.locator("main h1").textContent())?.includes("Laporan"));
    const report = s.page.locator("main a[href^='/admin/reports/']").first();
    if (await report.count()) {
      await report.click();
      await s.page.waitForURL("**/admin/reports/**");
      await s.page.locator("main h1").first().waitFor();
      const draft = await s.page.getByRole("button", { name: "Susun ulang ringkasan otomatis" }).count();
      const published = (await text(s.page)).includes("Laporan yang terbit");
      check("editor laporan punya draf otomatis (atau laporan sudah terbit)", draft === 1 || published);
    }
    check("admin tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // 3. Client: benchmark, kompetitor, progres audit, Outlet & data, dan contoh laporan per paket.
  {
    const s = await loginAs(browser, "client@silentcx.demo");
    for (const [path, title] of [
      ["/app/benchmark", "Benchmark outlet"],
      ["/app/competitor", "Benchmark kompetitor"],
    ]) {
      await s.page.goto(BASE + path, { waitUntil: "networkidle" });
      const body = await text(s.page);
      check(`${path}: tidak lagi "Segera hadir"`, !body.includes("Segera hadir") && (await s.page.locator("main h1").first().textContent())?.includes(title));
      check(
        `${path}: menampilkan data, keadaan kosong, atau fitur terkunci`,
        body.includes("Buka laporan lengkap") || body.includes("tampil setelah laporan audit terbit") || (await s.page.getByRole("link", { name: /paket/i }).count()) > 0,
      );
    }
    await shot(s.page, "benchmark");
    await s.page.goto(`${BASE}/app/audits`, { waitUntil: "networkidle" });
    check("Audit berjalan terbuka", (await s.page.locator("main h1").count()) >= 1);
    await s.page.goto(`${BASE}/app/outlets`, { waitUntil: "networkidle" });
    check("Outlet & data terbuka", (await s.page.locator("main h1").count()) >= 1);
    await s.page.goto(`${BASE}/app/reports`, { waitUntil: "networkidle" });
    const links = await s.page.locator("a[href^='/app/reports/contoh/pdf?paket=']").count();
    const published = await s.page.locator("main a[href^='/app/reports/']:not([href*='contoh'])").count();
    check("halaman Laporan: contoh per paket (atau daftar laporan terbit)", links === 3 || published > 0, `${links} contoh, ${published} laporan`);
    if (published > 0) {
      await s.page.locator("main a[href^='/app/reports/']:not([href*='contoh'])").first().click();
      await s.page.waitForURL("**/app/reports/**");
      await s.page.locator("main h1").first().waitFor();
      check("laporan terbit tampil tanpa error", (await text(s.page)).includes("Skor per area penilaian"));
      await shot(s.page, "laporan-client");
    }
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(`${BASE}/app/benchmark`, { waitUntil: "networkidle" });
    check("HP: Benchmark outlet tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    check("client tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
