// Uji headless landing page baru: tombol masuk/daftar, galeri dan testimoni yang bergeser otomatis,
// tampilan HP, dan pengalihan akun yang sudah masuk ke dashboard.
// Tidak mengubah data; hanya membuat tautan masuk sekali pakai untuk akun demo admin dan client.
// Jalankan: node --env-file=.env.local tests/e2e/putaran5-landing.mjs
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
const shot = (page, name) => page.screenshot({ path: new URL(`landing-${name}.png`, OUT).pathname.slice(1), fullPage: true });
// Posisi geser deretan kartu di bagian tertentu.
const scrollOf = (page, id) => page.locator(`#${id} ul.no-scrollbar`).evaluate((el) => el.scrollLeft);

async function loginAs(browser, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });

  const header = page.locator("header");
  check("header punya Masuk dan Daftar", (await header.getByRole("link", { name: "Masuk" }).getAttribute("href")) === "/login" && (await header.getByRole("link", { name: "Daftar", exact: true }).getAttribute("href")) === "/register");
  const hero = page.locator("#hero");
  check("tombol hero ke daftar pemilik bisnis dan shopper", (await hero.getByRole("link").nth(0).getAttribute("href")) === "/register" && (await hero.getByRole("link").nth(1).getAttribute("href")) === "/become-shopper");
  check("ilustrasi hero tampil", (await hero.locator("img").getAttribute("src")) === "/landing/hero.svg");
  for (const id of ["problems", "steps", "audited", "why", "sample", "packages", "testimonials", "faq", "shopper", "contact", "cta"]) {
    check(`bagian ${id} tampil`, (await page.locator(`#${id}`).count()) === 1);
  }
  check("ikon kartu tampil", (await page.locator("#problems svg").count()) >= 3);
  check("galeri contoh laporan berisi 6 gambar", (await page.locator("#sample img").count()) === 6);
  check("tidak ada tombol tema", (await page.getByRole("button", { name: /^(Gelap|Terang)$/ }).count()) === 0);
  const footer = page.locator("footer");
  const footerText = (await footer.textContent()) ?? "";
  check("footer menampilkan alamat, telepon, WhatsApp, email, dan situs web", ["Jl. Contoh No. 123", "(021) 000 0000", "WhatsApp", "halo@silentcx.com", "silentcx.com"].every((x) => footerText.includes(x)));
  check("footer menampilkan 6 ikon media sosial", (await footer.locator('ul[aria-label="Media sosial"] a').count()) === 6);
  check("tautan Instagram dari nama akun", (await footer.getByRole("link", { name: "Instagram" }).getAttribute("href")) === "https://instagram.com/silentcx.id");
  await footer.screenshot({ path: new URL("landing-footer.png", OUT).pathname.slice(1) });
  await shot(page, "desktop");

  // Geser otomatis satu kartu sekitar tiap 5 detik; tombol → juga menggeser.
  await page.locator("#testimonials").scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  const before = await scrollOf(page, "testimonials");
  await page.waitForTimeout(6500);
  const after = await scrollOf(page, "testimonials");
  check("testimoni bergeser otomatis", after > before, `${before} → ${after}`);
  await page.locator("#sample").scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  const s0 = await scrollOf(page, "sample");
  await page.locator("#sample").getByRole("button", { name: "Berikutnya" }).click();
  await page.waitForTimeout(1200);
  check("tombol berikutnya menggeser galeri", (await scrollOf(page, "sample")) !== s0);

  await page.locator("#packages").getByRole("link", { name: "Pilih paket" }).first().click();
  await page.waitForURL(/\/register/);
  check("pilih paket membawa ke daftar dengan paketnya", decodeURIComponent(page.url()).includes("next=/app/paket?paket="), page.url());
  check("tanpa error JavaScript", errors.length === 0, errors.join(" | "));
  await ctx.close();

  // Tampilan HP.
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  await mp.goto(BASE, { waitUntil: "networkidle" });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("HP tanpa geser samping", overflow <= 0, `${overflow}px`);
  check("HP: Masuk dan Daftar tetap terlihat", (await mp.locator("header").getByRole("link", { name: "Masuk" }).isVisible()) && (await mp.locator("header").getByRole("link", { name: "Daftar", exact: true }).isVisible()));
  await mp.locator("header summary").click();
  check("HP: menu berisi tautan bagian", await mp.locator("header details").getByRole("link", { name: "Paket" }).isVisible());
  await shot(mp, "hp");
  await m.close();

  // Akun yang sudah masuk diarahkan ke dashboard.
  for (const [email, home] of [
    ["client@silentcx.demo", "/app"],
    ["admin@silentcx.demo", "/admin"],
  ]) {
    const s = await loginAs(browser, email);
    for (const path of ["/", "/register", "/become-shopper", "/login"]) {
      await s.page.goto(BASE + path, { waitUntil: "networkidle" });
      check(`${email} membuka ${path} → ${home}`, new URL(s.page.url()).pathname === home, s.page.url());
    }
    if (home === "/admin") {
      const r = await s.page.goto(`${BASE}/pratinjau`, { waitUntil: "networkidle" });
      check("admin tetap bisa membuka pratinjau landing", r?.status() === 200 && (await s.page.locator("#hero").count()) === 1);
      await s.page.goto(`${BASE}/admin/content`, { waitUntil: "networkidle" });
      const editor = (await s.page.textContent("main")) ?? "";
      check("editor menampilkan peringatan testimoni dan kontak contoh", editor.includes("Testimoni masih berisi contoh fiktif") && editor.includes("Kontak di footer masih contoh"));
    }
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
