// Uji headless Putaran 12: promo Gratis 1 outlet (Performance), pilihan Tanpa promo, promo semua add-on, dan bagian
// Add-on di landing.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka form dan pratinjau. Dengan E2E_TULIS=1 skrip memasang promo uji di staging
// (Performance gratis 1 outlet, promo semua add-on 10%, satu promo add-on untuk uji bentrok), memeriksa landing,
// checkout, dan pesan bentrok, lalu mengembalikan promo seperti semula. Tidak ada pesanan yang dibuat.
// Butuh migration 20261104000020 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran12-promo.mjs
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
const path = (name) => new URL(`p12-${name}.png`, OUT).pathname.slice(1);
const wib = (ms) => new Date(Date.now() + ms + 7 * 3600_000).toISOString().slice(0, 16);
const DAY = 86400_000;

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

// Promo yang ada sebelum uji, untuk dikembalikan.
const PROMO_COLS = "promo_pct, promo_amount, promo_starts_at, promo_ends_at";
const saved = WRITE
  ? {
      packages: (await admin.from("packages").select(`id, promo_free_outlet, ${PROMO_COLS}`)).data ?? [],
      addons: (await admin.from("addons").select(`id, ${PROMO_COLS}`)).data ?? [],
      global: (await admin.from("addon_promo").select(PROMO_COLS).maybeSingle()).data,
    }
  : null;
if (WRITE && saved.addons.some((a) => a.promo_pct || a.promo_amount)) {
  console.log("· ada promo add-on aktif di staging; uji tulis dilewati supaya promo Anda tidak terganggu");
  process.exit(1);
}

const browser = await chromium.launch();
try {
  // 0. Landing: bagian Add-on dari Katalog.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pub = await ctx.newPage();
    await pub.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const sec = pub.locator("section#addons");
    const active = (await admin.from("addons").select("name").eq("active", true)).data ?? [];
    check("landing: bagian Add-on tampil dengan semua add-on aktif", (await sec.count()) === 1 && (await sec.locator("li.card").count()) === active.length, `${await sec.locator("li.card").count()} dari ${active.length}`);
    check("landing: Audit ulang bertanda Dipesan setelah laporan terbit", (await sec.locator("li", { hasText: "Audit ulang" }).getByText("Dipesan setelah laporan terbit").count()) === 1);
    check("landing: keterangan paket yang berlaku", (await sec.getByText(/^Untuk paket /).count()) >= 1);
    await sec.screenshot({ path: path("landing-addon") });
    await pub.setViewportSize({ width: 390, height: 844 });
    await pub.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("HP: landing tidak bergeser ke samping", (await pub.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await ctx.close();
  }

  // 1. Admin: form promo paket dan add-on.
  const a = await loginAs(browser, "admin@silentcx.demo");
  {
    await a.page.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
    const perf = a.page.locator("details", { hasText: "SilentCX Performance" }).first();
    await perf.locator("summary").click();
    const kind = perf.getByLabel("Jenis potongan");
    const options = await kind.locator("option").allTextContents();
    check("Performance: pilihan Tanpa promo, Persen, Nominal, Gratis 1 outlet", ["Tanpa promo", "Persen (%)", "Nominal (Rp)", "Gratis 1 outlet"].every((o) => options.includes(o)), options.join(", "));
    const before = await kind.inputValue();
    await kind.selectOption("free_outlet");
    check("Gratis 1 outlet: kolom nilai disembunyikan", (await perf.getByLabel(/^(Diskon %|Potongan Rp)$/).count()) === 0);
    const preview = (await perf.getByRole("list", { name: "Pratinjau harga promo" }).textContent()) ?? "";
    check("pratinjau: 3 outlet tanpa potongan, 4 outlet dibayar harga 3", /3 outlet.*tanpa potongan/.test(preview) && /4 outlet.*Rp4\.999\.000.*Rp3\.999\.000.*Gratis 1 outlet/.test(preview), preview.replace(/\s+/g, " ").slice(0, 140));
    await perf.screenshot({ path: path("form-gratis-outlet") });
    await kind.selectOption(before);

    await a.page.locator("details", { hasText: "SilentCX Essential" }).first().locator("summary").click();
    const essOptions = await a.page.locator("details", { hasText: "SilentCX Essential" }).first().getByLabel("Jenis potongan").locator("option").allTextContents();
    check("Essential (satu harga): tanpa pilihan Gratis 1 outlet", !essOptions.includes("Gratis 1 outlet"));

    await a.page.goto(`${BASE}/admin/catalog?tab=addon`, { waitUntil: "networkidle" });
    const card = a.page.locator("section", { has: a.page.getByRole("heading", { name: "Promo semua add-on" }) });
    check("tab Add-on: kartu Promo semua add-on", (await card.count()) === 1);
    const gKind = card.getByLabel("Jenis potongan");
    check("promo semua add-on: tanpa pilihan Gratis 1 outlet", !(await gKind.locator("option").allTextContents()).includes("Gratis 1 outlet"));
    await gKind.selectOption("pct");
    await card.getByLabel("Diskon %").fill("10");
    const gPreview = (await card.getByRole("list", { name: "Pratinjau harga promo" }).textContent()) ?? "";
    check("pratinjau semua add-on: setiap add-on aktif berharga pasti", gPreview.includes("Audit ulang") && gPreview.includes("Hemat 10%") && !gPreview.includes("Kuesioner khusus"), gPreview.replace(/\s+/g, " ").slice(0, 140));
  }

  if (WRITE) {
    // 2. Bentrok: promo add-on yang dijadwalkan menghalangi promo semua add-on, pesannya menyebut nama add-on.
    const reaudit = (await admin.from("addons").select("id, name").eq("key", "re_audit").single()).data;
    await admin
      .from("addons")
      .update({ promo_pct: 15, promo_starts_at: new Date(Date.now() + DAY).toISOString(), promo_ends_at: new Date(Date.now() + 5 * DAY).toISOString() })
      .eq("id", reaudit.id);
    await a.page.goto(`${BASE}/admin/catalog?tab=addon`, { waitUntil: "networkidle" });
    let card = a.page.locator("section", { has: a.page.getByRole("heading", { name: "Promo semua add-on" }) });
    await card.getByLabel("Jenis potongan").selectOption("pct");
    await card.getByLabel("Diskon %").fill("10");
    await card.getByLabel("Mulai").fill(wib(-DAY));
    await card.getByLabel("Selesai").fill(wib(10 * DAY));
    await card.getByRole("button", { name: "Simpan promo semua add-on" }).click();
    const alert = card.getByRole("alert");
    await alert.waitFor();
    const msg = (await alert.textContent()) ?? "";
    check("bentrok: promo semua add-on ditolak dengan nama add-on", msg.includes("Promo global tidak bisa disimpan") && msg.includes(reaudit.name) && msg.includes("Hemat 15%"), msg.slice(0, 160));
    await card.screenshot({ path: path("bentrok-addon") });
    await admin.from("addons").update({ promo_pct: null, promo_starts_at: null, promo_ends_at: null }).eq("id", reaudit.id);

    // 3. Simpan promo semua add-on 10% lewat form; promo per add-on terkunci.
    await a.page.goto(`${BASE}/admin/catalog?tab=addon`, { waitUntil: "networkidle" });
    card = a.page.locator("section", { has: a.page.getByRole("heading", { name: "Promo semua add-on" }) });
    await card.getByLabel("Jenis potongan").selectOption("pct");
    await card.getByLabel("Diskon %").fill("10");
    await card.getByLabel("Mulai").fill(wib(-DAY));
    await card.getByLabel("Selesai").fill(wib(10 * DAY));
    await card.getByRole("button", { name: "Simpan promo semua add-on" }).click();
    await card.getByText(/^Berlaku · Hemat 10%/).waitFor();
    check("promo semua add-on tersimpan dan tampil Berlaku", true);
    const item = a.page.locator("details", { hasText: "Audit ulang" }).first();
    check("daftar add-on: penanda Promo semua add-on", (await item.locator("summary").getByText("Promo semua add-on · Hemat 10%").count()) === 1);
    await item.locator("summary").click();
    check("form add-on: promo terkunci dengan alasan", (await item.getByText(/Promo semua add-on sedang berlaku s\.d\./).count()) === 1 && (await item.getByLabel("Jenis potongan").isDisabled()));
    await a.page.screenshot({ path: path("admin-promo-addon"), fullPage: true });

    // 4. Performance gratis 1 outlet lewat form.
    await a.page.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
    const perf = a.page.locator("details", { hasText: "SilentCX Performance" }).first();
    await perf.locator("summary").click();
    await perf.getByLabel("Jenis potongan").selectOption("free_outlet");
    await perf.getByLabel("Mulai").fill(wib(-DAY));
    await perf.getByLabel("Selesai").fill(wib(10 * DAY));
    await perf.getByRole("button", { name: "Simpan paket" }).click();
    await perf.locator("summary").getByText("Promo · Gratis 1 outlet").waitFor();
    check("Performance: promo Gratis 1 outlet tersimpan", true);

    // 5. Landing dan checkout client.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pub = await ctx.newPage();
    await pub.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const perfCard = pub.locator("li", { hasText: "Performance" }).filter({ hasText: "Gratis 1 outlet" });
    check("landing: label Gratis 1 outlet dan keterangan 4 outlet bayar 3", (await perfCard.count()) >= 1 && (await perfCard.first().getByText("4 outlet cukup bayar harga 3 outlet").count()) === 1);
    check("landing: harga mulai Performance tidak dicoret", (await perfCard.first().locator("s").count()) === 0);
    await perfCard.first().screenshot({ path: path("landing-performance") });
    const addonSec = pub.locator("section#addons");
    check("landing: add-on ikut promo semua add-on (harga coret, Hemat 10%)", (await addonSec.getByText("Hemat 10%").count()) >= 1 && (await addonSec.locator("s").count()) >= 1);
    await addonSec.screenshot({ path: path("landing-addon-promo") });
    await ctx.close();

    const c = await loginAs(browser, "client@silentcx.demo");
    await c.page.goto(`${BASE}/app/paket?paket=performance`, { waitUntil: "networkidle" });
    if ((await c.page.getByText("Ringkasan").count()) === 0) {
      check("checkout client terbuka (client demo tidak punya pesanan terbuka)", false, "client demo masih punya pesanan yang belum selesai");
    } else {
      const nudge = c.page.getByRole("button", { name: "Tambah 1 outlet, gratis" });
      check("checkout 3 outlet: ajakan Tambah 1 outlet, gratis", (await nudge.count()) === 1);
      await nudge.click();
      const summary = c.page.locator("aside", { hasText: "Ringkasan" });
      await summary.getByText("Promo gratis 1 outlet").waitFor();
      const sum = (await summary.textContent()) ?? "";
      check("ringkasan 4 outlet: baris potongan -Rp1.000.000, total Rp3.999.000", sum.includes("-Rp1.000.000") && /TotalRp3\.999\.000/.test(sum.replace(/\s+/g, "")), sum.replace(/\s+/g, " ").slice(0, 160));
      const re = c.page.locator("li", { hasText: "Outlet tambahan" }).first();
      check("checkout: add-on ikut promo semua add-on (Hemat 10%)", (await re.getByText("Hemat 10%").count()) === 1);
      await c.page.screenshot({ path: path("checkout-performance"), fullPage: true });
      await c.page.setViewportSize({ width: 390, height: 844 });
      check("HP: checkout tidak bergeser ke samping", (await c.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    }
    check("client tanpa error JavaScript", c.errors.length === 0, c.errors.join(" | "));
    await c.ctx.close();

    // 6. Tanpa promo menghentikan promo semua add-on.
    await a.page.goto(`${BASE}/admin/catalog?tab=addon`, { waitUntil: "networkidle" });
    card = a.page.locator("section", { has: a.page.getByRole("heading", { name: "Promo semua add-on" }) });
    await card.getByLabel("Jenis potongan").selectOption("none");
    await card.getByRole("button", { name: "Simpan promo semua add-on" }).click();
    await a.page.waitForTimeout(1500);
    const g = (await admin.from("addon_promo").select("promo_pct").single()).data;
    check("Tanpa promo: promo semua add-on dihentikan", g.promo_pct === null);
  } else {
    console.log("· promo tidak disimpan (jalankan dengan E2E_TULIS=1)");
  }
  check("admin tanpa error JavaScript", a.errors.length === 0, a.errors.join(" | "));
  await a.ctx.close();
} finally {
  await browser.close();
  if (WRITE) {
    for (const p of saved.packages) await admin.from("packages").update(p).eq("id", p.id);
    for (const x of saved.addons) await admin.from("addons").update(x).eq("id", x.id);
    await admin.from("addon_promo").update(saved.global ?? { promo_pct: null, promo_amount: null, promo_starts_at: null, promo_ends_at: null }).eq("id", true);
    console.log("· promo staging dikembalikan seperti semula");
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
