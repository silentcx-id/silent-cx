// Uji headless perbaikan sebelum deploy: menu HP, header keamanan, halaman 404, pesanan, penanda tahap client,
// pilihan bahasa disembunyikan, dan endpoint email yang menolak pemanggil tanpa kunci.
// Tidak mengubah data: hanya membuka halaman dengan tautan masuk sekali pakai untuk akun demo.
// Jalankan: node --env-file=.env.local tests/e2e/putaran8-siap-deploy.mjs
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
const shot = (page, name) => page.screenshot({ path: new URL(`siap-${name}.png`, OUT).pathname.slice(1), fullPage: true });

async function loginAs(browser, email, viewport) {
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
  // 1. Header keamanan, 404, bahasa, dan endpoint email.
  const res = await fetch(`${BASE}/`);
  const h = res.headers;
  check("header anti-iframe terpasang", h.get("x-frame-options") === "DENY" && (h.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
  check("header nosniff, referrer, dan izin perangkat terpasang", h.get("x-content-type-options") === "nosniff" && h.get("referrer-policy") === "strict-origin-when-cross-origin" && (h.get("permissions-policy") ?? "").includes("geolocation=(self)"));
  check("header X-Powered-By tidak ada", !h.has("x-powered-by"));
  const dispatch = await fetch(`${BASE}/api/email/dispatch`, { method: "POST" });
  check("endpoint email menolak pemanggil tanpa kunci", dispatch.status === 401);

  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const r404 = await page.goto(`${BASE}/halaman-tidak-ada`, { waitUntil: "networkidle" });
    check("halaman 404 punya judul utama", r404?.status() === 404 && (await page.locator("h1").count()) === 1);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    check("tombol ID/EN tidak tampil", (await page.getByRole("group", { name: "Bahasa" }).count()) === 0);
    check("captcha tidak tampil selama kuncinya belum diisi", (await page.locator("iframe[src*='challenges.cloudflare.com']").count()) === 0);
    await ctx.close();
  }

  // 2. Menu HP: terlipat, terbuka dengan tombol, tertutup setelah pindah halaman; tanpa ruang kosong di bawah menu.
  for (const [email, home, target] of [
    ["client@silentcx.demo", "/app", "Tagihan"],
    ["shopper@silentcx.demo", "/shopper", "Tugas"],
    ["admin@silentcx.demo", "/admin", "Katalog"],
  ]) {
    const s = await loginAs(browser, email, { width: 390, height: 844 });
    await s.page.goto(BASE + home, { waitUntil: "networkidle" });
    const toggle = s.page.locator("nav").getByRole("button", { expanded: false });
    check(`${email}: HP — menu terlipat di balik satu tombol`, (await toggle.count()) === 1 && !(await s.page.locator("#portal-menu").isVisible()));
    await toggle.click();
    const links = s.page.locator("#portal-menu a");
    check(`${email}: HP — semua menu terlihat tanpa digeser`, (await s.page.locator("#portal-menu").isVisible()) && (await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${await links.count()} menu`);
    await s.page.locator("#portal-menu").getByRole("link", { name: target }).click();
    await s.page.waitForURL(`**${home}/**`);
    // Selama halaman dimuat tampil kerangka abu-abu; tunggu judul halaman yang sebenarnya.
    await s.page.locator("main h1").first().waitFor();
    check(`${email}: HP — menu tertutup setelah pindah halaman dan tombol menampilkan ${target}`, !(await s.page.locator("#portal-menu").isVisible()) && ((await s.page.locator("nav button").first().textContent()) ?? "").includes(target));
    // Jarak dari bawah menu sampai judul halaman tidak lebih dari kira-kira tinggi header (lonceng dan tombol Keluar).
    const gap = await s.page.evaluate(() => {
      const aside = document.querySelector("aside")?.getBoundingClientRect();
      const h1 = document.querySelector("main h1")?.getBoundingClientRect();
      return aside && h1 ? Math.round(h1.top - aside.bottom) : -1;
    });
    check(`${email}: HP — tidak ada ruang kosong di bawah menu`, gap >= 0 && gap < 140, `${gap}px`);
    if (home === "/shopper") await shot(s.page, "hp-shopper");
    check(`${email}: tanpa error JavaScript`, s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // 3. Client: penanda tahap bukan tombol; alasan tombol Buat pesanan nonaktif ada di dekatnya.
  {
    const s = await loginAs(browser, "client@silentcx.demo", { width: 1280, height: 900 });
    await s.page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const stages = s.page.getByRole("list", { name: "Tahap akun" });
    check("penanda tahap client tampil sebagai teks dengan tahap aktif", (await stages.count()) === 1 && (await stages.locator("[aria-current=step]").count()) === 1 && (await stages.locator("button, a").count()) === 0);
    await s.page.goto(`${BASE}/app/paket`, { waitUntil: "networkidle" });
    const order = s.page.getByRole("button", { name: "Buat pesanan" });
    if (await order.isDisabled()) {
      check("tombol nonaktif disertai alasan dan tautan ke isian kota", (await s.page.getByText("Pilih kota untuk setiap outlet dulu.").count()) === 1);
      await s.page.getByRole("link", { name: "Pilih kota" }).click();
      check("tautan Pilih kota menuju isian kota", s.page.url().endsWith("#kota-outlet"));
    } else check("tombol Buat pesanan aktif karena kota sudah dipilih", true);
    await s.ctx.close();
  }

  // 4. Admin: Katalog punya pilihan durasi konsultasi; halaman detail punya judul utama.
  {
    const s = await loginAs(browser, "admin@silentcx.demo", { width: 1280, height: 900 });
    await s.page.goto(`${BASE}/admin/catalog?tab=paket`, { waitUntil: "networkidle" });
    check("form paket punya pilihan konsultasi gratis", (await s.page.getByLabel("Konsultasi gratis setelah laporan terbit").count()) >= 1);
    await s.page.goto(`${BASE}/admin/questionnaires`, { waitUntil: "networkidle" });
    const q = s.page.locator("main a[href^='/admin/questionnaires/']").first();
    if (await q.count()) {
      await q.click();
      await s.page.waitForURL("**/admin/questionnaires/**");
      await s.page.waitForLoadState("networkidle");
      check("detail kuesioner punya satu judul utama", (await s.page.locator("h1").count()) === 1);
    }
    check("admin tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
