// Pengecekan headless dengan akun demo sungguhan: setiap role masuk ke area-nya dan tertolak di area lain.
// Hanya membaca; tidak mengubah data. Login memakai tautan sekali pakai dari service role, jadi password tidak dibutuhkan.
// Syarat: .env.local terisi, npm run db:migrate dan npm run demo:akun sudah dijalankan, server berjalan di port 3100.
// Jalankan: node --env-file=.env.local tests/e2e/fase0-login.mjs
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

async function loginAs(browser, email) {
  // Jaringan ke Supabase kadang putus sesaat; dicoba ulang sebelum dianggap gagal.
  let data, error;
  for (let i = 1; i <= 4; i++) {
    ({ data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }));
    if (!error) break;
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}

const path = (page) => new URL(page.url()).pathname;
const shot = (page, name) => page.screenshot({ path: new URL(`fase0-${name}.png`, OUT).pathname.slice(1), fullPage: true });

const browser = await chromium.launch();
try {
  {
    const { ctx, page } = await loginAs(browser, "client@silentcx.demo");
    check("client masuk ke /app", path(page) === "/app", page.url());
    check("client melihat tahap Calon client", (await page.textContent("main"))?.includes("Calon client") ?? false);
    await shot(page, "client-home");
    for (const p of ["/admin", "/admin/accounts", "/shopper"]) {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      check(`client tertolak di ${p}`, path(page) === "/app", page.url());
    }
    await page.goto(BASE + "/app/paket", { waitUntil: "networkidle" });
    check("menu Paket tampil sebagai Fase 1", (await page.textContent("main"))?.includes("Fase 1") ?? false);
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(browser, "pelamar@silentcx.demo");
    check("pelamar masuk ke /shopper", path(page) === "/shopper", page.url());
    check("pelamar melihat layar seleksi", (await page.textContent("h1"))?.includes("ditinjau") ?? false, await page.textContent("h1"));
    await shot(page, "shopper-pending");
    await page.goto(BASE + "/shopper/assignments", { waitUntil: "networkidle" });
    check("menu Tugas terkunci untuk pelamar", (await page.textContent("h1"))?.includes("disetujui") ?? false);
    await page.goto(BASE + "/app", { waitUntil: "networkidle" });
    check("pelamar tertolak di /app", path(page) === "/shopper", page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(browser, "shopper@silentcx.demo");
    check("shopper aktif melihat dashboard aktif", (await page.textContent("main"))?.includes("Akun Anda aktif") ?? false);
    await shot(page, "shopper-active");
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(browser, "admin@silentcx.demo");
    check("admin masuk ke /admin", path(page) === "/admin", page.url());
    await shot(page, "admin-home");
    await page.goto(BASE + "/admin/accounts?tab=pending", { waitUntil: "networkidle" });
    check("antrian seleksi memuat pelamar demo", (await page.textContent("main"))?.includes("pelamar@silentcx.demo") ?? false);
    await shot(page, "admin-accounts");
    await page.goto(BASE + "/app", { waitUntil: "networkidle" });
    check("admin tertolak di /app", path(page) === "/admin", page.url());
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
