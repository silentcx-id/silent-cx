// Uji headless Putaran 15: voucher promo khusus brand, klaim voucher di Tagihan, dan artikel.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka halaman (artikel publik, robots, sitemap, admin Voucher dan Artikel).
// Dengan E2E_TULIS=1 skrip menulis data uji sementara di staging:
//   1. admin membuat voucher "Kopi Uji E2E" lewat form (logo diunggah, aturan Promo Launching, berlaku mulai hari ini);
//   2. halaman voucher publik, gambar PNG, dan tombol Masuk yang menyimpan kode;
//   3. pesanan uji PRJ-E2E15A (Essential): kode terisi otomatis di Tagihan, cek, pasang, lepas, kode salah;
//   4. pesanan uji PRJ-E2E15B (Performance dengan promo): perbandingan promo dan voucher, lepas promo & pakai voucher;
//   5. admin menulis dan menerbitkan artikel uji lewat editor, lalu artikel tampil di /artikel dan sitemap;
//   6. admin membatalkan voucher uji.
// Tidak ada bukti bayar yang diunggah. Voucher, pesanan, artikel, dan logo uji dihapus di akhir.
// Butuh migration 20261104000024 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran15-voucher-artikel.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const WRITE = process.env.E2E_TULIS === "1";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const LOGO = fileURLToPath(new URL("../../assets/pdf/simbol-emas.png", import.meta.url));
const BRAND = "Kopi Uji E2E";
const ARTICLE = "uji-e2e-artikel-voucher";

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const path = (name) => new URL(`p15-${name}.png`, OUT).pathname.slice(1);
const waitText = (loc, re) => loc.filter({ hasText: re }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const wibDay = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

// Koneksi ke Supabase kadang putus sesaat: perintah dicoba sampai 4 kali.
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

const probe = await admin.from("vouchers").select("id").limit(1);
if (probe.error) {
  console.log("✗ migration 20261104000024 belum terpasang di staging. Jalankan npm run db:migrate dulu.");
  process.exit(1);
}

const clientUser = (await retry(() => admin.from("profiles").select("id").eq("email", "client@silentcx.demo").single())).data;
async function cleanup() {
  const { data: logos } = await admin.from("vouchers").select("brand_logo").like("brand_name", `${BRAND}%`);
  await retry(() => admin.from("projects").delete().like("code", "PRJ-E2E15%"));
  await retry(() => admin.from("vouchers").delete().like("brand_name", `${BRAND}%`));
  await retry(() => admin.from("articles").delete().like("slug", "uji-e2e-%"));
  const files = (logos ?? []).map((l) => l.brand_logo.split("/site-assets/")[1]).filter(Boolean);
  if (files.length) await admin.storage.from("site-assets").remove(files);
}

async function tempOrder(suffix, pkg, line) {
  const p = (
    await retry(() =>
      admin
        .from("projects")
        .insert({ code: `PRJ-E2E15${suffix}`, client_id: clientUser.id, package_snapshot: pkg, outlet_count: pkg.outlets, entitlements: ["report_basic"], status: "awaiting_payment" })
        .select("id")
        .single(),
    )
  ).data;
  const inv = (
    await retry(() =>
      admin
        .from("invoices")
        .insert({ code: `INV-E2E15${suffix}`, project_id: p.id, client_id: clientUser.id, status: "unpaid", total: line.amount, due_at: new Date(Date.now() + 86400_000).toISOString(), kind: "order" })
        .select("id")
        .single(),
    )
  ).data;
  await retry(() => admin.from("invoice_lines").insert({ invoice_id: inv.id, position: 1, kind: "package", quantity: 1, ...line }));
  return { project: p.id, invoice: inv.id };
}
const invoiceTotal = async (id) => (await retry(() => admin.from("invoices").select("total, dp_amount").eq("id", id).single())).data;

const browser = await chromium.launch();
let c = null;
let a = null;
try {
  if (WRITE) await cleanup();

  // Halaman publik: artikel, robots, sitemap.
  {
    const s = await context(browser);
    const res = await s.page.goto(`${BASE}/artikel`, { waitUntil: "networkidle" });
    check("/artikel terbuka", res.status() === 200 && (await s.page.locator("h1").innerText()) === "Artikel SilentCX");
    const cat = await s.page.goto(`${BASE}/artikel/promo`, { waitUntil: "networkidle" });
    check("/artikel/promo terbuka", cat.status() === 200 && (await s.page.locator("h1").innerText()) === "Promo");
    const missing = await s.page.goto(`${BASE}/artikel/tidak-ada`, { waitUntil: "networkidle" });
    check("kategori yang tidak ada = 404", missing.status() === 404);
    const seeded = (await retry(() => admin.from("articles").select("slug, status, published_at").eq("category", "promo").eq("slug", "promo-launching-silentcx").single())).data;
    const live = new Date(seeded.published_at).getTime() <= Date.now();
    const art = await s.page.goto(`${BASE}/artikel/promo/promo-launching-silentcx`, { waitUntil: "networkidle" });
    check(`artikel Promo Launching ${live ? "terbuka untuk publik" : "belum terbuka untuk publik sebelum 5 Nov (terjadwal)"}`, art.status() === (live ? 200 : 404), String(art.status()));
    const robots = await s.page.request.get(`${BASE}/robots.txt`);
    const rtext = await robots.text();
    check("robots.txt menutup dashboard dan voucher, menunjuk sitemap", robots.status() === 200 && rtext.includes("Disallow: /admin") && rtext.includes("Disallow: /voucher") && rtext.includes("sitemap.xml"));
    const sm = await s.page.request.get(`${BASE}/sitemap.xml`);
    const stext = await sm.text();
    check("sitemap.xml memuat halaman publik dan /artikel", sm.status() === 200 && stext.includes("/artikel</loc>") && stext.includes("/syarat</loc>"));
    check(`sitemap ${live ? "memuat" : "belum memuat"} artikel terjadwal`, stext.includes("promo-launching-silentcx") === live);
    const vx = await s.page.goto(`${BASE}/voucher/TIDAKADA-0000`, { waitUntil: "networkidle" });
    check("kode voucher yang tidak ada = 404", vx.status() === 404);
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(`${BASE}/artikel`, { waitUntil: "networkidle" });
    check("HP: /artikel tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    check("publik tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  // Admin: menu Voucher dan Artikel, pratinjau artikel terjadwal.
  a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  check("admin: menu Voucher dan Artikel", (await a.page.locator("nav").getByRole("link", { name: "Voucher" }).count()) >= 1 && (await a.page.locator("nav").getByRole("link", { name: "Artikel" }).count()) >= 1);
  await a.page.goto(`${BASE}/admin/articles`, { waitUntil: "networkidle" });
  const list = await a.page.getByTestId("admin-articles").innerText();
  check("admin: 3 artikel promo launching ada di daftar", ["Promo Launching SilentCX", "Syarat & Ketentuan Promo Launching", "Cara Klaim Voucher SilentCX"].every((t) => list.includes(t)));
  await a.page.screenshot({ path: path("admin-artikel"), fullPage: true });
  await a.page.goto(`${BASE}/artikel/promo/cara-klaim-voucher-silentcx`, { waitUntil: "networkidle" });
  const body = await a.page.getByTestId("article-body").innerText();
  check("admin: artikel Cara Klaim terbuka dengan langkah bernomor", (await a.page.locator("article ol li").count()) >= 6 && body.includes("Lepas promo & pakai voucher"));
  check("admin: tautan di artikel menjadi link", (await a.page.locator("article a[href='/artikel/promo/syarat-ketentuan-promo-launching']").count()) === 1);
  await a.page.goto(`${BASE}/artikel/promo/syarat-ketentuan-promo-launching`, { waitUntil: "networkidle" });
  const terms = await a.page.getByTestId("article-body").innerText();
  check("admin: S&K memuat kewajiban testimoni dengan nama dan logo brand sebagai mitra", terms.includes("Kewajiban brand penerima voucher") && terms.includes("beserta nama pemberi testimoni") && terms.includes("sebagai mitra SilentCX"));
  await a.page.getByRole("heading", { name: "Kewajiban brand penerima voucher" }).scrollIntoViewIfNeeded().catch(() => {});
  await a.page.screenshot({ path: path("artikel-sk-testimoni") });
  await a.page.goto(`${BASE}/artikel/promo/cara-klaim-voucher-silentcx`, { waitUntil: "networkidle" });
  const waSet = (await a.page.getByTestId("article-cta").count()) === 1;
  if (waSet) check("admin: tombol WhatsApp artikel menuju wa.me dengan pesan", (await a.page.getByTestId("article-cta").locator("a").getAttribute("href")).startsWith("https://wa.me/"));
  else console.log("· nomor WhatsApp bisnis belum diisi di Konten, jadi tombol WA artikel tidak tampil");
  await a.page.screenshot({ path: path("artikel-cara-klaim"), fullPage: true });

  await a.page.goto(`${BASE}/admin/vouchers`, { waitUntil: "networkidle" });
  check("admin: halaman Voucher terbuka", (await a.page.locator("main h1").innerText()) === "Voucher");

  if (WRITE) {
    // 1. Admin membuat voucher lewat form.
    if (!(await a.page.locator("#voucher-brand").isVisible())) await a.page.getByText("+ Buat voucher").click();
    await a.page.fill("#voucher-brand", BRAND);
    check("admin: pratinjau kode dari nama brand", (await a.page.getByTestId("code-preview").innerText()) === "KOPIUJIE2E-XXXX");
    await a.page.getByTestId("voucher-logo").setInputFiles(LOGO);
    await a.page.locator("form img[alt='Logo brand']").waitFor({ timeout: 30000 });
    await a.page.waitForFunction(() => [...document.querySelectorAll("form img")].every((i) => i.complete && i.naturalWidth > 0));
    await a.page.getByRole("button", { name: "Pakai aturan Promo Launching" }).click();
    await a.page.fill("#voucher-starts", wibDay(0));
    await a.page.fill("#voucher-ends", wibDay(30));
    const preview = await a.page.getByTestId("voucher-card").first().innerText();
    check("admin: pratinjau kartu memuat brand dan potongan", preview.includes(BRAND) && preview.includes("Hemat 50%") && preview.includes("Hemat Rp999.000") && /Essential & Insight/.test(preview));
    await a.page.locator("details").first().screenshot({ path: path("admin-buat-voucher") });
    await a.page.getByRole("button", { name: "Buat voucher" }).click();
    check("admin: voucher dibuat dan muncul di daftar", await waitText(a.page.getByTestId("voucher-item"), new RegExp(BRAND)));
    const voucher = (await retry(() => admin.from("vouchers").select("*").eq("brand_name", BRAND).single())).data;
    check("admin: kode personal dari nama brand", /^KOPIUJIE2E-[2-9A-Z]{4}$/.test(voucher.code), voucher.code);
    check("admin: aturan Promo Launching tersimpan", voucher.rules.map((r) => `${r.package}:${r.pct ?? ""}:${r.amount ?? ""}`).join(",") === "essential:50:,insight:50:,performance::999000", JSON.stringify(voucher.rules));
    check("admin: logo tersimpan di Storage", voucher.brand_logo.includes("/site-assets/vouchers/"));
    const item = a.page.getByTestId("voucher-item").filter({ hasText: BRAND });
    check("admin: tombol kirim voucher lengkap", ["Salin kode", "Salin pesan WA", "Unduh gambar", "Lihat halaman voucher ↗"].every(Boolean) && (await item.getByRole("link", { name: "Unduh gambar" }).getAttribute("href")) === `/voucher/${voucher.code}/gambar?unduh=1`);
    await item.screenshot({ path: path("admin-voucher-item") });

    // 2. Halaman voucher publik dan gambar PNG.
    const p = await context(browser);
    await p.page.goto(`${BASE}/voucher/${voucher.code.toLowerCase()}`, { waitUntil: "networkidle" });
    const card = await p.page.getByTestId("voucher-card").innerText();
    check("publik: halaman voucher menampilkan brand, kode, potongan", card.includes(BRAND) && card.includes(voucher.code) && card.includes("Hemat 50%"));
    check("publik: halaman voucher tidak diindeks", (await p.page.locator("meta[name='robots']").getAttribute("content"))?.includes("noindex"));
    check("publik: gambar pratinjau tautan (og:image) tersedia", (await p.page.locator("meta[property='og:image']").getAttribute("content"))?.includes(`/voucher/${voucher.code}/gambar?format=og`));
    await p.page.screenshot({ path: path("voucher-publik"), fullPage: true });
    const png = await p.page.request.get(`${BASE}/voucher/${voucher.code}/gambar?unduh=1`);
    const buf = await png.body();
    check("publik: gambar voucher PNG 1080×1080 bisa diunduh", png.status() === 200 && png.headers()["content-type"] === "image/png" && png.headers()["content-disposition"]?.includes(`voucher-${voucher.code}.png`) && buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1080);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path("voucher-gambar"), buf);
    const og = await p.page.request.get(`${BASE}/voucher/${voucher.code}/gambar?format=og`);
    const ogBuf = await og.body();
    check("publik: gambar pratinjau 1200×630", og.status() === 200 && ogBuf.readUInt32BE(16) === 1200 && ogBuf.readUInt32BE(20) === 630);
    writeFileSync(path("voucher-og"), ogBuf);
    await p.page.getByRole("link", { name: "Sudah punya akun? Masuk" }).click();
    await p.page.waitForURL("**/login?next=*");
    const saved = (await p.ctx.cookies()).find((x) => x.name === "scx_voucher");
    check("publik: tombol Masuk menyimpan kode dan membuka halaman masuk", saved?.value === voucher.code && p.page.url().includes("next=%2Fapp%2Fbilling") || p.page.url().includes("next=/app/billing"));
    await p.page.setViewportSize({ width: 390, height: 844 });
    await p.page.goto(`${BASE}/voucher/${voucher.code}`, { waitUntil: "networkidle" });
    check("HP: halaman voucher tidak bergeser ke samping", (await overflow(p.page)) <= 1);
    await p.page.screenshot({ path: path("voucher-hp"), fullPage: true });
    check("publik voucher tanpa error JavaScript", p.errors.length === 0, p.errors.join(" | "));
    await p.ctx.close();

    // 3. Klaim di Tagihan (Essential tanpa promo).
    const A = await tempOrder("A", { key: "essential", name: "SilentCX Essential", outlets: 1, visits: 1, purchase_allowance: 150000 }, { item_key: "essential", label: "SilentCX Essential (1 outlet)", unit_price: 1099000, amount: 1099000, list_price: 1099000 });
    c = await loginAs(browser, "client@silentcx.demo");
    await c.page.goto(`${BASE}/voucher/${voucher.code}`, { waitUntil: "networkidle" });
    await c.page.getByRole("link", { name: "Pakai voucher ini →" }).click();
    await c.page.waitForURL("**/app/billing");
    await c.page.getByTestId("voucher-panel").waitFor();
    check("client: kode dari halaman voucher terisi otomatis", (await c.page.inputValue("#voucher-code")) === voucher.code && (await c.page.getByTestId("voucher-panel").innerText()).includes("sudah terisi"));
    await c.page.getByRole("button", { name: "Cek voucher" }).click();
    check("client: hasil cek menampilkan total baru", await waitText(c.page.getByTestId("voucher-quote"), /Total jadi Rp549\.500 \(sebelumnya Rp1\.099\.000\)/));
    await c.page.getByTestId("voucher-panel").screenshot({ path: path("tagihan-cek-voucher") });
    await c.page.getByRole("button", { name: "Pakai voucher" }).click();
    check("client: voucher terpasang", await waitText(c.page.getByTestId("voucher-applied"), new RegExp(voucher.code)));
    check("client: total tagihan Rp549.500", (await invoiceTotal(A.invoice)).total === 549500);
    const invText = await c.page.locator("main").innerText();
    check("client: baris voucher tampil di invoice", invText.includes(`Voucher ${voucher.code} · ${BRAND}`) && invText.includes("-Rp549.500"));
    check("client: DP minimal dihitung dari total baru", invText.includes("Rp439.600"));
    check("client: kode tersimpan dihapus setelah dipakai", !(await c.ctx.cookies()).some((x) => x.name === "scx_voucher"));
    await c.page.screenshot({ path: path("tagihan-voucher-terpasang"), fullPage: true });
    await c.page.setViewportSize({ width: 390, height: 844 });
    await c.page.reload({ waitUntil: "networkidle" });
    check("HP: tagihan dengan voucher tidak bergeser ke samping", (await overflow(c.page)) <= 1);
    await c.page.setViewportSize({ width: 1280, height: 900 });

    await a.page.goto(`${BASE}/admin/vouchers?tab=dipakai`, { waitUntil: "networkidle" });
    const used = await a.page.getByTestId("voucher-item").filter({ hasText: BRAND }).innerText();
    check("admin: voucher pindah ke Dipakai dengan nama client dan invoice", used.includes("Dipasang di tagihan") && used.includes("INV-E2E15A"));

    await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    await c.page.getByRole("button", { name: "Lepas voucher" }).click();
    check("client: voucher dilepas, kolom kode kembali", await c.page.locator("#voucher-code").waitFor({ timeout: 20000 }).then(() => true, () => false));
    check("client: total kembali Rp1.099.000", (await invoiceTotal(A.invoice)).total === 1099000);
    await c.page.fill("#voucher-code", "SALAH-0000");
    await c.page.getByRole("button", { name: "Cek voucher" }).click();
    check("client: kode salah ditolak dengan pesan jelas", await waitText(c.page.getByRole("alert"), /Kode voucher SALAH-0000 tidak ditemukan/));
    await retry(() => admin.from("projects").delete().eq("id", A.project));

    // 4. Paket dengan promo: perbandingan, lalu lepas promo dan pakai voucher.
    const B = await tempOrder("B", { key: "performance", name: "SilentCX Performance", outlets: 4, visits: 1, purchase_allowance: 150000 }, { item_key: "performance", label: "SilentCX Performance (4 outlet)", unit_price: 3999000, amount: 3999000, list_price: 4999000 });
    await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    await c.page.fill("#voucher-code", voucher.code.toLowerCase());
    await c.page.getByRole("button", { name: "Cek voucher" }).click();
    await c.page.getByTestId("voucher-quote").waitFor();
    const q = await c.page.getByTestId("voucher-quote").innerText();
    check("client: perbandingan promo sekarang dan voucher", q.includes("Dengan promo sekarang") && q.includes("Rp3.999.000") && q.includes("Dengan voucher") && q.includes("Rp4.000.000"));
    check("client: menyebut promo lebih hemat Rp1.000", q.includes("Promo sekarang lebih hemat Rp1.000"));
    await c.page.getByTestId("voucher-quote").screenshot({ path: path("tagihan-promo-vs-voucher") });
    await c.page.getByRole("button", { name: "Tetap pakai promo" }).click();
    check("client: Tetap pakai promo menutup perbandingan tanpa mengubah tagihan", (await c.page.getByTestId("voucher-quote").count()) === 0 && (await invoiceTotal(B.invoice)).total === 3999000);
    await c.page.getByRole("button", { name: "Cek voucher" }).click();
    await c.page.getByRole("button", { name: "Lepas promo & pakai voucher" }).click();
    check("client: promo dilepas dan voucher dipasang (Rp4.999.000 − Rp999.000)", (await waitText(c.page.getByTestId("voucher-applied"), new RegExp(voucher.code))) && (await invoiceTotal(B.invoice)).total === 4000000);
    await c.page.getByRole("button", { name: "Lepas voucher" }).click();
    await c.page.locator("#voucher-code").waitFor();
    check("client: lepas voucher memulihkan harga promo Rp3.999.000", (await invoiceTotal(B.invoice)).total === 3999000);
    await retry(() => admin.from("projects").delete().eq("id", B.project));
    check("client: tanpa error JavaScript", c.errors.length === 0, c.errors.join(" | "));

    // 5. Admin menulis dan menerbitkan artikel.
    await a.page.goto(`${BASE}/admin/articles/baru`, { waitUntil: "networkidle" });
    await a.page.fill("#article-title", "Uji E2E Artikel Voucher");
    check("admin: alamat artikel dibuat dari judul", (await a.page.inputValue("#article-slug")) === ARTICLE);
    await a.page.fill("#article-body", "Paragraf pembuka **penting**.\n\n## Subjudul uji\n- butir satu\n- butir dua\n\n1. langkah satu\n2. langkah dua\n\nBaca [panduan](/artikel/promo).");
    await a.page.getByRole("tab", { name: "Pratinjau" }).click();
    check("admin: pratinjau isi artikel", (await a.page.getByTestId("article-body").locator("h2").innerText()) === "Subjudul uji" && (await a.page.getByTestId("article-body").locator("strong").innerText()) === "penting");
    await a.page.screenshot({ path: path("admin-editor-artikel"), fullPage: true });
    await a.page.getByRole("button", { name: "Terbitkan" }).click();
    await a.page.waitForURL(/\/admin\/articles\/[0-9a-f-]{36}$/);
    check("admin: artikel terbit", await waitText(a.page.getByTestId("article-status"), /Terbit/));
    const pub = await context(browser);
    const r = await pub.page.goto(`${BASE}/artikel/promo/${ARTICLE}`, { waitUntil: "networkidle" });
    check("publik: artikel uji terbuka", r.status() === 200 && (await pub.page.locator("h1").innerText()) === "Uji E2E Artikel Voucher");
    const ld = JSON.parse(await pub.page.locator("script[type='application/ld+json']").innerText());
    check("publik: data terstruktur Article dan Breadcrumb untuk Google", ld[0]["@type"] === "Article" && ld[0].headline === "Uji E2E Artikel Voucher" && ld[1]["@type"] === "BreadcrumbList");
    check("publik: URL kanonik artikel", (await pub.page.locator("link[rel='canonical']").getAttribute("href"))?.endsWith(`/artikel/promo/${ARTICLE}`));
    await pub.page.goto(`${BASE}/artikel`, { waitUntil: "networkidle" });
    check("publik: artikel uji tampil di /artikel", (await pub.page.getByTestId("article-card").filter({ hasText: "Uji E2E Artikel Voucher" }).count()) === 1);
    await pub.page.screenshot({ path: path("artikel-daftar"), fullPage: true });
    check("publik: sitemap memuat artikel uji", (await (await pub.page.request.get(`${BASE}/sitemap.xml`)).text()).includes(`/artikel/promo/${ARTICLE}`));
    await pub.ctx.close();

    // 6. Admin membatalkan voucher.
    await a.page.goto(`${BASE}/admin/vouchers`, { waitUntil: "networkidle" });
    a.page.once("dialog", (d) => d.accept());
    await a.page.getByTestId("voucher-item").filter({ hasText: BRAND }).getByRole("button", { name: "Batalkan voucher" }).click();
    await a.page.waitForTimeout(1500);
    await a.page.goto(`${BASE}/admin/vouchers?tab=selesai`, { waitUntil: "networkidle" });
    check("admin: voucher dibatalkan pindah ke Berakhir & batal", (await a.page.getByTestId("voucher-item").filter({ hasText: BRAND }).innerText()).includes("Dibatalkan"));
  }

  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.goto(`${BASE}/admin/vouchers`, { waitUntil: "networkidle" });
  check("HP: admin Voucher tidak bergeser ke samping", (await overflow(a.page)) <= 1);
  check("admin: tanpa error JavaScript", a.errors.length === 0, a.errors.join(" | "));
} finally {
  if (WRITE) {
    await cleanup();
    console.log("· voucher, pesanan, artikel, dan logo uji dihapus");
  }
  await browser.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed ? 1 : 0);
