// Uji headless Putaran 10: form promo (persen atau nominal), tampilan harga promo, dan halaman Akun admin
// (10 per halaman, pencarian, filter, tombol Detail, halaman detail shopper dan pemilik bisnis).
// Tidak mengubah data: hanya membuka halaman dengan tautan masuk sekali pakai untuk akun demo.
// Butuh migration 20261031000016_promo_amount.sql dan 20261031000017_admin_accounts.sql sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran10-akun-promo.mjs
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
const shot = (page, name) => page.screenshot({ path: new URL(`p10-${name}.png`, OUT).pathname.slice(1), fullPage: true });
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
  // 1. Landing: kalau ada promo berjalan, harga asli dicoret dengan label Hemat dan tanggal akhir promo.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const promos = await page.locator("#paket s, section s").count();
    if (promos) {
      const body = (await page.textContent("body")) ?? "";
      check("landing: promo berjalan menampilkan label Hemat dan periode", /Hemat (\d+%|Rp[\d.]+)/.test(body) && body.includes("Promo s.d."));
    } else console.log("· landing: belum ada promo berjalan, tampilan promo tidak dicek");
    await ctx.close();
  }

  // 2. Admin: form promo dan halaman Akun.
  {
    const s = await loginAs(browser, "admin@silentcx.demo");
    await s.page.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
    const kind = s.page.getByLabel("Jenis potongan").first();
    const opts = await kind.locator("option").allTextContents();
    check("katalog: form promo punya pilihan Tanpa promo, Persen, atau Nominal", (await kind.count()) === 1 && ["Tanpa promo", "Persen (%)", "Nominal (Rp)"].every((o) => opts.includes(o)));

    await s.page.goto(`${BASE}/admin/accounts?tab=shopper`, { waitUntil: "networkidle" });
    for (const label of ["Cari", "Status akun", "Jangkauan kota", "Bisnis yang diminati", "Jenis kelamin"]) check(`akun shopper: filter ${label}`, (await s.page.getByLabel(label, { exact: true }).count()) === 1);
    const rows = await s.page.locator("main tbody tr").count();
    check("akun shopper: paling banyak 10 baris", rows > 0 && rows <= 10, `${rows} baris`);
    check("akun shopper: keterangan halaman", /\d+–\d+ dari \d+ akun/.test(await text(s.page)));
    await shot(s.page, "akun-shopper");

    await s.page.getByLabel("Jenis kelamin", { exact: true }).selectOption("female");
    await s.page.getByRole("button", { name: "Terapkan" }).click();
    await s.page.waitForURL(/gender=female/);
    check("filter jenis kelamin tersimpan di alamat halaman", s.page.url().includes("gender=female") && (await s.page.getByRole("link", { name: "Reset" }).count()) === 1);

    await s.page.goto(`${BASE}/admin/accounts?tab=all&q=zzzz-tidak-ada`, { waitUntil: "networkidle" });
    check("pencarian tanpa hasil memberi pesan jelas", (await text(s.page)).includes("Tidak ada akun yang cocok"));

    await s.page.goto(`${BASE}/admin/accounts?tab=shopper`, { waitUntil: "networkidle" });
    await s.page.getByRole("link", { name: "Detail" }).first().click();
    await s.page.waitForURL(/\/admin\/accounts\/[0-9a-f-]{36}$/);
    const shopper = await text(s.page);
    check("detail shopper: data lamaran, rekening, tugas, pembayaran", ["Data lamaran", "Rekening pembayaran", "Tugas kunjungan", "Pembayaran ke shopper"].every((x) => shopper.includes(x)));
    await shot(s.page, "detail-shopper");

    await s.page.goto(`${BASE}/admin/accounts?tab=client`, { waitUntil: "networkidle" });
    check("akun pemilik bisnis: filter kota dan jenis usaha", (await s.page.getByLabel("Kota", { exact: true }).count()) === 1 && (await s.page.getByLabel("Jenis usaha", { exact: true }).count()) === 1);
    check("akun pemilik bisnis: tanpa filter jenis kelamin", (await s.page.getByLabel("Jenis kelamin", { exact: true }).count()) === 0);
    await s.page.getByRole("link", { name: "Detail" }).first().click();
    await s.page.waitForURL(/\/admin\/accounts\/[0-9a-f-]{36}$/);
    const owner = await text(s.page);
    check("detail pemilik bisnis: perusahaan, outlet, proyek, tagihan", ["Perusahaan", "Outlet", "Proyek", "Tagihan"].every((x) => owner.includes(x)));
    await shot(s.page, "detail-bisnis");

    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(`${BASE}/admin/accounts?tab=shopper`, { waitUntil: "networkidle" });
    check("HP: halaman Akun tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    check("admin tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
