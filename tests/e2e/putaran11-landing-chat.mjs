// Uji headless Putaran 11: bagian landing baru (Fitur platform, Bisnis yang kami layani, Mitra kami), editor Konten,
// tab Lamaran masuk tanpa pelamar yang belum mengirim lamaran, dan live chat Sisca.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka halaman. Dengan E2E_TULIS=1 skrip mengirim satu pesan dari client demo dan
// satu balasan admin di staging, lalu memeriksa pesan tampil langsung di kedua sisi tanpa muat ulang.
// Butuh migration 20261104000018 dan 20261104000019 sudah dijalankan (npm run db:migrate juga membuat bucket chat-attachments).
// Jalankan: node --env-file=.env.local tests/e2e/putaran11-landing-chat.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const WRITE = process.env.E2E_TULIS === "1";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const shot = (page, name) => page.screenshot({ path: new URL(`p11-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function loginAs(browser, email, viewport = { width: 1280, height: 900 }) {
  // Koneksi ke Supabase kadang putus sesaat: coba sampai 3 kali.
  let res;
  for (let i = 0; i < 3; i++) {
    res = await admin.auth.admin.generateLink({ type: "magiclink", email }).catch((e) => ({ data: null, error: e }));
    if (!res.error) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const { data, error } = res;
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
  // 1. Landing: bagian baru tampil, Mitra kami tersembunyi selama belum ada logo.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const features = page.locator("section#features");
    check("landing: Fitur platform tampil", (await features.count()) === 1 && (await features.locator("li").count()) >= 3, `${await features.locator("li").count()} kartu`);
    for (const title of ["Check-in GPS dan bukti foto", "Benchmark outlet", "Konsultasi"]) check(`landing: kartu ${title}`, (await features.getByText(title, { exact: true }).count()) === 1);
    const industries = page.locator("section#industries");
    check("landing: Bisnis yang kami layani tampil dengan 8 jenis", (await industries.count()) === 1 && (await industries.locator("li").count()) === 8);
    const partners = await page.locator("section#partners").count();
    const logos = partners ? await page.locator("section#partners img").count() : 0;
    check("landing: Mitra kami hanya tampil kalau ada logo", partners === 0 || logos > 0, partners ? `${logos} logo` : "belum ada logo");
    await features.screenshot({ path: new URL("p11-landing-fitur.png", OUT).pathname.slice(1) });
    await industries.screenshot({ path: new URL("p11-landing-bisnis.png", OUT).pathname.slice(1) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("HP: landing tidak bergeser ke samping", (await overflow(page)) <= 1);
    await ctx.close();
  }

  // 2. Admin: editor Konten, Lamaran masuk, inbox Live chat.
  const a = await loginAs(browser, "admin@silentcx.demo");
  {
    await a.page.goto(`${BASE}/admin/content`, { waitUntil: "networkidle" });
    const body = await text(a.page);
    check("Konten: tiga bagian baru ada di editor", ["Fitur platform", "Bisnis yang kami layani", "Mitra kami"].every((x) => body.includes(x)));
    await a.page.locator("summary", { hasText: "Fitur platform" }).first().click();
    check("Konten: setiap kartu punya tombol Tampil/Disembunyikan", (await a.page.locator("details[open] li").getByRole("button", { name: /^(Tampil|Disembunyikan)$/ }).count()) >= 4);

    await a.page.goto(`${BASE}/admin/accounts?tab=pending`, { waitUntil: "networkidle" });
    check("Lamaran masuk: tanpa daftar Belum mengirim lamaran", !(await text(a.page)).includes("Belum mengirim lamaran"));

    await a.page.goto(`${BASE}/admin/chat`, { waitUntil: "networkidle" });
    check("menu Live chat terbuka", (await a.page.locator("main h1").textContent())?.includes("Live chat"));
    check("Live chat: pengaturan jam kerja", (await a.page.getByText("Jam kerja dan pesan otomatis").count()) === 1);
    check("menu samping punya Live chat", (await a.page.locator("nav a[href='/admin/chat']").count()) >= 1);
  }

  // 3. Client: tombol Chat Sisca membuka panel.
  const c = await loginAs(browser, "client@silentcx.demo");
  {
    await c.page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const button = c.page.getByRole("button", { name: /Live chat dengan Sisca/ });
    check("client: tombol Chat Sisca di dashboard", (await button.count()) === 1);
    await button.click();
    const panel = c.page.getByRole("dialog", { name: /Live chat dengan Sisca/ });
    await panel.waitFor();
    await panel.getByRole("textbox", { name: "Pesan" }).waitFor();
    const body = (await panel.textContent()) ?? "";
    check("panel chat: identitas Sisca dan jam kerja", body.includes("Silent Interactive System for Customers Assistance") && body.includes("Jam kerja"));

    if (WRITE) {
      const stamp = new Date().toISOString().slice(11, 19);
      await panel.getByRole("textbox", { name: "Pesan" }).fill(`Uji e2e ${stamp}: halo Sisca`);
      await panel.getByRole("textbox", { name: "Pesan" }).press("Enter");
      await panel.getByRole("log").getByText(`Uji e2e ${stamp}: halo Sisca`).waitFor();
      check("client: pesan terkirim", true);

      await a.page.goto(`${BASE}/admin/chat`, { waitUntil: "networkidle" });
      await a.page.getByRole("link", { name: /Client Demo|client@silentcx.demo/ }).first().click();
      await a.page.getByRole("log").getByText(`Uji e2e ${stamp}: halo Sisca`).waitFor();
      check("admin: pesan client masuk ke inbox", true);
      await a.page.getByRole("textbox", { name: "Pesan" }).fill(`Balasan e2e ${stamp}`);
      await a.page.getByRole("button", { name: "Kirim", exact: true }).click();
      await panel.getByRole("log").getByText(`Balasan e2e ${stamp}`).waitFor({ timeout: 20000 });
      check("client: balasan Sisca tampil tanpa muat ulang", true);
      await shot(a.page, "admin-chat");
      await c.page.screenshot({ path: new URL("p11-chat-client.png", OUT).pathname.slice(1) });
    } else {
      await c.page.screenshot({ path: new URL("p11-chat-client.png", OUT).pathname.slice(1) });
      console.log("· pengiriman pesan tidak diuji (jalankan dengan E2E_TULIS=1)");
    }
    await c.page.setViewportSize({ width: 390, height: 844 });
    check("HP: panel chat memenuhi layar tanpa geser samping", (await overflow(c.page)) <= 1);
    await c.page.screenshot({ path: new URL("p11-chat-hp.png", OUT).pathname.slice(1) });
    check("client tanpa error JavaScript", c.errors.length === 0, c.errors.join(" | "));
  }

  // 4. Shopper juga mendapat tombol chat.
  {
    const s = await loginAs(browser, "shopper@silentcx.demo");
    await s.page.goto(`${BASE}/shopper`, { waitUntil: "networkidle" });
    check("shopper: tombol Chat Sisca di dashboard", (await s.page.getByRole("button", { name: /Live chat dengan Sisca/ }).count()) === 1);
    check("shopper tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
  check("admin tanpa error JavaScript", a.errors.length === 0, a.errors.join(" | "));
  await a.ctx.close();
  await c.ctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
