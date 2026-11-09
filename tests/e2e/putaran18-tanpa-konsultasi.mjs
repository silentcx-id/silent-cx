// Uji headless Putaran 18: fitur konsultasi dihapus. Paket hanya berisi kunjungan dan laporan.
// Skrip ini hanya membuka halaman (tanpa menulis data): landing, artikel promo, menu dan halaman client/admin,
// Katalog admin, dan halaman Paket client.
// Butuh migration 20261109000029 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran18-tanpa-konsultasi.mjs
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
const path = (name) => new URL(`p18-${name}.png`, OUT).pathname.slice(1);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const KONSUL = /konsultasi|debrief|consultation/i;

async function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      const r = await fn();
      if (r.error) throw new Error(r.error.message);
      return r;
    } catch (e) {
      if (i >= 3) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function context(browser, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}

async function loginAs(browser, email, viewport) {
  const { data } = await retry(() => admin.auth.admin.generateLink({ type: "magiclink", email }));
  const s = await context(browser, viewport);
  await s.page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return s;
}

const probe = (await retry(() => admin.from("addons").select("active").eq("key", "additional_consultation").single())).data;
if (probe.active) {
  console.log("✗ migration 20261109000029 belum terpasang di staging. Jalankan npm run db:migrate dulu.");
  process.exit(1);
}

const browser = await chromium.launch();
try {
  // 1. Landing: tanpa kartu fitur Konsultasi, fitur paket tanpa sesi konsultasi, add-on tanpa Konsultasi tambahan.
  {
    const s = await context(browser);
    await s.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const features = s.page.locator("section#features");
    const titles = await features.locator("li").allInnerTexts();
    check("landing: kartu fitur tanpa Konsultasi", titles.length >= 2 && !titles.some((x) => KONSUL.test(x)), `${titles.length} kartu`);
    const packages = s.page.locator("section#packages");
    const pkgText = await packages.innerText();
    check("landing: fitur paket tanpa konsultasi/debrief", pkgText.includes("Laporan audit") && !KONSUL.test(pkgText));
    const addons = await s.page.locator("section#addons").innerText();
    check("landing: daftar add-on tanpa Konsultasi tambahan", addons.includes("Outlet tambahan") && !KONSUL.test(addons));
    await features.screenshot({ path: path("landing-fitur") });
    await packages.screenshot({ path: path("landing-paket") });
    check("landing tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // 2. Landing di HP.
  {
    const s = await context(browser, { width: 390, height: 844 });
    await s.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("HP landing: tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    await s.ctx.close();
  }

  // 3. Artikel promo.
  {
    const s = await context(browser);
    for (const slug of ["promo-launching-silentcx", "syarat-ketentuan-promo-launching"]) {
      await s.page.goto(`${BASE}/artikel/promo/${slug}`, { waitUntil: "networkidle" });
      const text = await s.page.locator("main").innerText();
      check(`artikel ${slug}: terbuka tanpa menyebut konsultasi`, text.length > 300 && !KONSUL.test(text));
    }
    await s.ctx.close();
  }

  // 4. Client: menu tanpa Konsultasi, halaman lama 404, Paket tanpa konsultasi.
  {
    const s = await loginAs(browser, "client@silentcx.demo");
    await s.page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const nav = await s.page.locator("nav").allInnerTexts();
    check("client: menu tanpa Konsultasi", nav.join(" ").includes("Laporan") && !KONSUL.test(nav.join(" ")));
    check("client: tahap Tindak lanjut tanpa konsultasi", !KONSUL.test(await s.page.locator("main").innerText()));
    await s.page.screenshot({ path: path("client-beranda") });
    // Area client memakai loading.tsx, jadi halaman 404 dikirim lewat streaming (status HTTP tetap 200).
    await s.page.goto(`${BASE}/app/consultation`, { waitUntil: "networkidle" });
    check("client: /app/consultation tidak ada lagi (halaman 404)", (await s.page.getByText("Halaman ini tidak ada.").count()) === 1);
    await s.page.screenshot({ path: path("client-404") });
    await s.page.goto(`${BASE}/app/paket`, { waitUntil: "networkidle" });
    const paket = await s.page.locator("main").innerText();
    check("client: halaman Paket tanpa konsultasi", paket.includes("Essential") && !KONSUL.test(paket));
    await s.page.screenshot({ path: path("client-paket"), fullPage: true });
    await s.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    check("client: Tagihan tanpa konsultasi", !KONSUL.test(await s.page.locator("main").innerText()));
    check("client tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // 5. Client di HP.
  {
    const s = await loginAs(browser, "client@silentcx.demo", { width: 390, height: 844 });
    await s.page.goto(`${BASE}/app/paket`, { waitUntil: "networkidle" });
    check("HP client: halaman Paket tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    await s.page.screenshot({ path: path("hp-client-paket"), fullPage: true });
    await s.ctx.close();
  }

  // 6. Admin: menu dan antrian tanpa Konsultasi, halaman lama 404, Katalog tanpa pilihan konsultasi.
  {
    const s = await loginAs(browser, "admin@silentcx.demo");
    await s.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const nav = await s.page.locator("nav").allInnerTexts();
    check("admin: menu tanpa Konsultasi", nav.join(" ").includes("Katalog") && !KONSUL.test(nav.join(" ")));
    check("admin: antrian kerja tanpa Konsultasi tanpa link meeting", !KONSUL.test(await s.page.locator("main").innerText()));
    await s.page.screenshot({ path: path("admin-antrian") });
    await s.page.goto(`${BASE}/admin/consultations`, { waitUntil: "networkidle" });
    check("admin: /admin/consultations tidak ada lagi (halaman 404)", (await s.page.getByText("Halaman ini tidak ada.").count()) === 1);
    await s.page.goto(`${BASE}/admin/catalog?tab=paket`, { waitUntil: "networkidle" });
    check(
      "admin Katalog: form paket tanpa pilihan konsultasi",
      (await s.page.getByLabel("Batas biaya pembelian per kunjungan (Rp)").count()) >= 1 && (await s.page.getByLabel("Konsultasi gratis setelah laporan terbit").count()) === 0,
    );
    const features = await s.page.locator("textarea").evaluateAll((els) => els.map((e) => e.value).join("\n"));
    check("admin Katalog: teks fitur paket tanpa konsultasi", features.includes("Laporan audit") && !KONSUL.test(features));
    await s.page.screenshot({ path: path("admin-katalog-paket") });
    await s.page.goto(`${BASE}/admin/catalog?tab=addon`, { waitUntil: "networkidle" });
    const addonRow = s.page.locator("main").getByText("Konsultasi tambahan", { exact: true });
    const row = (await addonRow.count()) ? await addonRow.first().locator("xpath=ancestor::*[self::li or self::tr or contains(@class,'card')][1]").innerText() : "";
    check("admin Katalog: add-on Konsultasi tambahan nonaktif", row === "" || /nonaktif|tidak aktif/i.test(row), row ? row.replace(/\s+/g, " ").slice(0, 80) : "tidak ditampilkan");
    await s.page.screenshot({ path: path("admin-katalog-addon"), fullPage: true });
    check("admin tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} lolos`);
process.exit(passed === results.length ? 0 : 1);
