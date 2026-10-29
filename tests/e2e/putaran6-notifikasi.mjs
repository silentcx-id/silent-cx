// Uji headless lonceng notifikasi di header semua role dan kartu rekening shopper.
// Tidak mengubah data: hanya membuat tautan masuk sekali pakai untuk akun demo, dan panel hanya dibuka-tutup.
// Uji real time (notifikasi masuk tanpa reload) ada di fase2-flow.mjs karena perlu membuat data.
// Jalankan: node --env-file=.env.local tests/e2e/putaran6-notifikasi.mjs
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
const shot = (page, name) => page.screenshot({ path: new URL(`notif-${name}.png`, OUT).pathname.slice(1) });

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
  for (const [email, home] of [
    ["client@silentcx.demo", "/app"],
    ["shopper@silentcx.demo", "/shopper"],
    ["admin@silentcx.demo", "/admin"],
  ]) {
    const s = await loginAs(browser, email);
    await s.page.goto(BASE + home, { waitUntil: "networkidle" });
    const bell = s.page.locator("header").getByRole("button", { name: /^Notifikasi/ });
    check(`${email}: lonceng ada di header`, await bell.isVisible());
    check(`${email}: beranda tanpa daftar notifikasi`, (await s.page.locator("main").getByRole("button", { name: /Tandai (semua|sudah) dibaca/ }).count()) === 0);
    await bell.click();
    const panel = s.page.getByRole("dialog", { name: "Notifikasi" });
    check(`${email}: panel terbuka`, await panel.isVisible());
    const items = await panel.locator("li").count();
    check(`${email}: panel berisi maksimal 10 notifikasi atau pesan kosong`, items <= 10 && (items > 0 || ((await panel.textContent()) ?? "").includes("Belum ada notifikasi")), `${items} butir`);
    await shot(s.page, home.slice(1));
    await s.page.keyboard.press("Escape");
    check(`${email}: Escape menutup panel`, (await panel.count()) === 0);
    await bell.click();
    await s.page.mouse.click(10, 500);
    check(`${email}: klik di luar menutup panel`, (await panel.count()) === 0);
    await bell.click();
    await panel.getByRole("link", { name: /Lihat semua notifikasi/ }).click();
    await s.page.waitForURL(`**${home}/notifications`);
    check(`${email}: halaman semua notifikasi terbuka`, ((await s.page.textContent("main")) ?? "").includes("Semua pemberitahuan untuk akun Anda"));

    if (home === "/shopper") {
      await s.page.goto(`${BASE}/shopper/profile`, { waitUntil: "networkidle" });
      const card = s.page.getByTestId("bank-card");
      if (await card.count()) {
        const masked = (await card.textContent()) ?? "";
        check("rekening tersimpan tampil disamarkan tanpa form", masked.includes("••••") && masked.includes("***") && (await s.page.locator("#number").count()) === 0);
        await s.page.getByRole("button", { name: "Tampilkan data rekening saya" }).click();
        check("tombol tampilkan membuka nomor lengkap", !((await card.textContent()) ?? "").includes("••••"));
        await s.page.getByRole("button", { name: "Ubah rekening" }).click();
        check("ubah rekening membuka form berisi data lama", (await s.page.inputValue("#number")).length >= 5);
        await s.page.getByRole("button", { name: "Batal" }).click();
        check("batal kembali ke kartu", ((await card.textContent()) ?? "").includes("••••"));
        await card.screenshot({ path: new URL("notif-bank-card.png", OUT).pathname.slice(1) });
      } else {
        check("shopper demo belum punya rekening: form tampil", (await s.page.locator("#number").count()) === 1);
      }
    }

    // Tampilan HP: lonceng tetap bisa dibuka dan panel tidak keluar layar.
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(BASE + home, { waitUntil: "networkidle" });
    await s.page.locator("header").getByRole("button", { name: /^Notifikasi/ }).click();
    const box = await s.page.getByRole("dialog", { name: "Notifikasi" }).boundingBox();
    check(`${email}: HP — panel muat di layar`, box !== null && box.x >= 0 && box.x + box.width <= 390, box ? `${Math.round(box.x)}–${Math.round(box.x + box.width)}px` : "");
    if (home === "/app") await shot(s.page, "hp");
    check(`${email}: tanpa error JavaScript`, s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
