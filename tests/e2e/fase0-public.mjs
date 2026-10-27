// Pengecekan headless halaman publik dan penjagaan dashboard (tidak butuh Supabase).
// Jalankan server dulu: NEXT_DIST_DIR=.next-build npx next start -p 3100, lalu: node tests/e2e/fase0-public.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = "") => {
  results.push({ ok, name, info });
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1280, height: 860 }], ["hp", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    for (const path of ["/", "/login", "/register", "/become-shopper"]) {
      const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
      check(`${label} ${path} terbuka`, res?.status() === 200, `status ${res?.status()}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${label} ${path} tanpa geser samping`, overflow <= 0, `${overflow}px`);
      await page.screenshot({ path: new URL(`fase0-${label}${path.replace(/\//g, "_") || "_home"}.png`, OUT).pathname.slice(1), fullPage: true });
    }

    for (const path of ["/app", "/shopper/assignments", "/admin/accounts"]) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      check(`${label} ${path} dialihkan ke login`, new URL(page.url()).pathname === "/login", page.url());
    }

    check(`${label} tanpa error JavaScript`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // Bahasa dan tema.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  check("bahasa bawaan Indonesia", (await page.getAttribute("html", "lang")) === "id");
  check("tema bawaan gelap", (await page.getAttribute("html", "data-theme")) === "dark");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  check("tombol EN mengganti bahasa", (await page.textContent("h1"))?.includes("customers") ?? false, await page.textContent("h1"));
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await page.reload({ waitUntil: "networkidle" });
  check("tema terang tersimpan setelah reload", (await page.getAttribute("html", "data-theme")) === "light");
  await page.screenshot({ path: new URL("fase0-light-en.png", OUT).pathname.slice(1), fullPage: true });
  await page.getByRole("button", { name: "ID", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "id");

  // Login salah memberi pesan yang jelas (atau petunjuk setup kalau Supabase belum disambungkan).
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", "tidak-ada@silentcx.test");
  await page.fill("#password", "salah12345");
  await page.click("button:has-text('Masuk')");
  // Next.js juga punya elemen role=alert (pengumuman navigasi), jadi dibatasi ke dalam form.
  const alert = (await page.locator("form [role=alert]").textContent({ timeout: 20000 })) ?? "";
  check("login salah menampilkan pesan", /password salah|SETUP|server/.test(alert), alert);
  await ctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
