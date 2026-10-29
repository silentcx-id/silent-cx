// Uji headless lupa password, Akun saya, halaman hukum, persetujuan daftar, dan kecepatan dashboard.
// Tidak mengubah data: tautan reset dibuat lewat admin.generateLink (tidak ada email terkirim), password tidak disimpan,
// dan form daftar hanya dicoba sampai ditolak karena belum mencentang persetujuan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran7-akun.mjs
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
const shot = (page, name) => page.screenshot({ path: new URL(`akun-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";
// Menunggu pesan muncul (getByRole("alert") juga menangkap pengumuman navigasi bawaan Next.js yang kosong).
const shows = (page, msg) =>
  page
    .getByText(msg)
    .first()
    .waitFor({ timeout: 30000 })
    .then(() => true, () => false);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function context(browser, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}
async function link(type, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error) throw new Error(`${email}: ${error.message}`);
  return `${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=${type}`;
}

const browser = await chromium.launch();
try {
  // 1. Halaman publik: lupa password, halaman hukum, persetujuan daftar.
  {
    const s = await context(browser);
    await s.page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await s.page.getByRole("link", { name: "Lupa password?" }).click();
    await s.page.waitForURL("**/forgot-password");
    check("tautan Lupa password membuka halaman lupa password", (await text(s.page)).includes("Kami kirim tautan untuk membuat password baru"));
    await s.page.fill("#email", "bukan-email");
    await s.page.getByRole("button", { name: "Kirim tautan" }).click();
    check("email tidak valid ditolak tanpa mengirim email", await shows(s.page, "Format email tidak valid"));

    await s.page.goto(`${BASE}/reset-password`, { waitUntil: "networkidle" });
    check("halaman password baru tanpa tautan email meminta tautan baru", (await text(s.page)).includes("Tautan reset sudah tidak berlaku") && (await s.page.locator("#password").count()) === 0);

    for (const [path, title, other] of [["/privasi", "Kebijakan Privasi", "Syarat & Ketentuan"], ["/syarat", "Syarat & Ketentuan", "Kebijakan Privasi"]]) {
      await s.page.goto(BASE + path, { waitUntil: "networkidle" });
      check(`${path} tampil dengan judul, tanggal, dan subjudul`, (await s.page.locator("h1").textContent()) === title && (await text(s.page)).includes("Terakhir diperbarui") && (await s.page.locator("article h2").count()) >= 3);
      check(`${path} menautkan ${other}`, (await s.page.getByRole("link", { name: other }).count()) === 1);
    }
    await shot(s.page, "syarat");

    await s.page.goto(BASE, { waitUntil: "networkidle" });
    const footer = s.page.locator("footer");
    check("footer landing menautkan Syarat dan Privasi", (await footer.getByRole("link", { name: "Syarat & Ketentuan" }).getAttribute("href")) === "/syarat" && (await footer.getByRole("link", { name: "Kebijakan Privasi" }).getAttribute("href")) === "/privasi");

    for (const path of ["/register", "/become-shopper"]) {
      await s.page.goto(BASE + path, { waitUntil: "networkidle" });
      const box = s.page.getByRole("checkbox", { name: /Saya menyetujui/ });
      check(`${path}: centang persetujuan ada dan belum tercentang`, (await box.count()) === 1 && !(await box.isChecked()));
      check(`${path}: tautan persetujuan dibuka di tab baru`, (await s.page.locator("form a[href='/syarat'][target=_blank]").count()) === 1 && (await s.page.locator("form a[href='/privasi'][target=_blank]").count()) === 1);
    }
    // Form lengkap tanpa centang: ditolak server sebelum akun dibuat (tidak ada data tertulis).
    await s.page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await s.page.fill("#full_name", "Uji Persetujuan");
    await s.page.fill("#email", `uji-persetujuan-${Date.now()}@contoh.test`);
    await s.page.fill("#phone", "081234567890");
    await s.page.fill("#password", "rahasia123");
    await s.page.evaluate(() => document.querySelectorAll("form [required]").forEach((e) => e.removeAttribute("required")));
    await s.page.getByRole("button", { name: "Buat akun" }).click();
    check("daftar tanpa centang persetujuan ditolak", await shows(s.page, "Centang persetujuan"));
    check("isian tetap terisi setelah ditolak", (await s.page.inputValue("#full_name")) === "Uji Persetujuan");
    check("halaman publik tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // 2. Tautan reset password (dibuat tanpa email) membuka form password baru; isian salah ditolak tanpa menyimpan.
  {
    const s = await context(browser);
    await s.page.goto(await link("recovery", "client@silentcx.demo"), { waitUntil: "networkidle" });
    check("tautan reset membuka halaman password baru", s.page.url().endsWith("/reset-password") && (await s.page.locator("#password").count()) === 1);
    check("email akun ditampilkan", (await text(s.page)).includes("client@silentcx.demo"));
    await s.page.fill("#password", "pendek1");
    await s.page.fill("#confirm", "pendek1");
    await s.page.getByRole("button", { name: "Simpan password" }).click();
    check("password terlalu pendek ditolak", await shows(s.page, "Password minimal 8 karakter"));
    await s.page.fill("#password", "passwordbaru1");
    await s.page.fill("#confirm", "passwordbaru2");
    await s.page.getByRole("button", { name: "Simpan password" }).click();
    check("konfirmasi yang berbeda ditolak", await shows(s.page, "Kedua password baru tidak sama"));
    await shot(s.page, "reset");

    // Sesi biasa (tautan masuk, bukan reset) tidak bisa membuka form password baru.
    const m = await context(browser);
    await m.page.goto(await link("magiclink", "client@silentcx.demo"), { waitUntil: "networkidle" });
    await m.page.goto(`${BASE}/reset-password`, { waitUntil: "networkidle" });
    check("sesi masuk biasa tidak bisa memakai halaman password baru", (await m.page.locator("#password").count()) === 0);
    await m.ctx.close();
    check("reset password tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // 3. Akun saya di ketiga role, kecepatan dashboard, dan tampilan HP.
  for (const [email, home] of [
    ["client@silentcx.demo", "/app"],
    ["shopper@silentcx.demo", "/shopper"],
    ["admin@silentcx.demo", "/admin"],
  ]) {
    const s = await context(browser);
    await s.page.goto(await link("magiclink", email), { waitUntil: "networkidle" });
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await s.page.goto(BASE + home, { waitUntil: "load" });
      times.push(Date.now() - t0);
    }
    const best = Math.min(...times);
    check(`${email}: beranda terbuka di bawah 2,5 detik`, best < 2500, `${times.join(" / ")} ms`);

    await s.page.locator("nav").getByRole("link", { name: "Akun saya" }).first().click();
    await s.page.waitForURL(`**${home}/account`);
    await s.page.locator("main h1").first().waitFor();
    const body = await text(s.page);
    check(`${email}: menu Akun saya membuka halaman akun`, body.includes("Data akun") && body.includes("Ganti password"));
    check(`${email}: email tampil dan tidak bisa diubah`, (await s.page.inputValue("#account-email")) === email && (await s.page.getAttribute("#account-email", "readonly")) !== null);
    check(`${email}: nama dan nomor terisi`, (await s.page.inputValue("#account-name")).length > 0 && (await s.page.inputValue("#account-phone")).length > 0);
    await s.page.fill("#current-password", "bukan-password-ini-1");
    await s.page.fill("#new-password", "passwordbaru1");
    await s.page.fill("#confirm-password", "passwordbaru1");
    await s.page.getByRole("button", { name: "Ganti password" }).click();
    check(`${email}: password saat ini yang salah ditolak`, await shows(s.page, "Password saat ini salah"));
    if (home === "/app") await shot(s.page, "akun");

    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.reload({ waitUntil: "networkidle" });
    check(`${email}: HP — halaman akun tidak bergeser ke samping`, (await overflow(s.page)) <= 1);
    check(`${email}: tanpa error JavaScript`, s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
