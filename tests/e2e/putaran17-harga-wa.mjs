// Uji headless Putaran 17: harga baru, promo launching 10% paket, voucher brand 20%, batas pembelian Rp50.000,
// tanpa keterangan PPN, instruksi khusus client untuk shopper, dan tombol WhatsApp melayang di landing.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka halaman (landing, artikel promo, admin Katalog).
// Dengan E2E_TULIS=1 skrip menulis data uji sementara di staging:
//   1. voucher uji "Brand Uji E2E17" (20% semua paket) dan tagihan uji Essential berharga promo: client memasang voucher
//      lewat Tagihan → total Rp319.200; dilepas lagi → kembali Rp359.100;
//   2. proyek uji PRJ-E2E17A aktif dengan satu outlet: client mengisi instruksi khusus untuk shopper di menu Outlet,
//      admin melihatnya di penjadwalan, shopper demo melihatnya di tugas kunjungan uji.
// Voucher, proyek, tagihan, dan tugas uji dihapus di akhir.
// Butuh migration 20261109000028 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran17-harga-wa.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const WRITE = process.env.E2E_TULIS === "1";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BRAND = "Brand Uji E2E17";
const NOTE = "Pesan Kopi Gula Aren ukuran besar, perhatikan apakah kasir menawarkan member card.";

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const path = (name) => new URL(`p17-${name}.png`, OUT).pathname.slice(1);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const waitText = (loc, re) => loc.filter({ hasText: re }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);

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

const probe = await admin.from("project_outlets").select("shopper_note").limit(1);
if (probe.error) {
  console.log("✗ migration 20261109000028 belum terpasang di staging. Jalankan npm run db:migrate dulu.");
  process.exit(1);
}

const clientUser = (await retry(() => admin.from("profiles").select("id").eq("email", "client@silentcx.demo").single())).data;
const shopperUser = (await retry(() => admin.from("profiles").select("id").eq("email", "shopper@silentcx.demo").single())).data;

async function cleanup() {
  await retry(() => admin.from("vouchers").delete().eq("brand_name", BRAND));
  await retry(() => admin.from("projects").delete().like("code", "PRJ-E2E17%"));
  await retry(() => admin.from("questionnaires").delete().eq("name", "Kuesioner Uji E2E17"));
}

// Kuesioner uji yang sudah disetujui client, supaya admin bisa membuat tugas kunjungan di proyek uji.
async function attachQuestionnaire(projectId) {
  const q = (await retry(() => admin.from("questionnaires").insert({ name: "Kuesioner Uji E2E17", business_type: "fnb", photo_limit: 6 }).select("id").single())).data;
  const sec = (await retry(() => admin.from("questionnaire_sections").insert({ questionnaire_id: q.id, position: 1, title: "Kedatangan & sapaan", weight: 100, target: 80 }).select("id").single())).data;
  await retry(() => admin.from("questionnaire_questions").insert({ section_id: sec.id, position: 1, prompt: "Staf menyapa dalam 10 detik.", help: "", kind: "yes_no", photo_required: false, is_sop: true, red_flag: false }));
  const snapshot = (await retry(() => admin.rpc("questionnaire_snapshot", { p_questionnaire: q.id }))).data;
  const review = (await retry(() => admin.from("questionnaire_reviews").insert({ project_id: projectId, version: 1, snapshot, sent_at: new Date().toISOString(), due_at: new Date(Date.now() + 3 * 86400_000).toISOString(), status: "approved", decided_at: new Date().toISOString() }).select("id").single())).data;
  await retry(() => admin.from("project_questionnaires").insert({ project_id: projectId, questionnaire_id: q.id, snapshot, review_id: review.id }));
}

const browser = await chromium.launch();
try {
  await cleanup();

  // 1. Landing: harga promo, tanpa PPN, tombol WhatsApp melayang.
  const pub = await context(browser);
  await pub.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // Tombol hanya ada kalau nomor WhatsApp terisi di Konten (atau isi bawaan saat konten belum terbit).
  const hasWa = (await pub.page.getByTestId("wa-melayang").count()) > 0;
  const landing = await pub.page.locator("body").innerText();
  check("landing: harga promo Essential Rp359.100 dengan harga normal Rp399.000", landing.includes("Rp359.100") && landing.includes("Rp399.000"));
  check("landing: harga promo Insight Rp539.100 dan Performance Rp1.169.100", landing.includes("Rp539.100") && landing.includes("Rp1.169.100"));
  check("landing: Performance tanpa harga 4 dan 5 outlet", !landing.includes("Rp4.999.000") && !landing.includes("Rp5.999.000"));
  check("landing: tidak ada keterangan PPN", !/PPN/.test(landing));
  check("landing: tidak ada promo lama (gratis 1 outlet, hemat Rp300.000)", !/Gratis 1 outlet|Hemat Rp300\.000/i.test(landing));
  check("landing: Kuesioner khusus tidak tampil", !landing.includes("Kuesioner khusus"));
  check("landing: add-on Outlet tambahan Rp349.000 tanpa diskon", landing.includes("Rp349.000"));
  if (hasWa) {
    const wa = pub.page.getByTestId("wa-melayang");
    check("landing: tombol WhatsApp melayang tampil", await wa.isVisible());
    check("landing: tombol menuju wa.me dengan pesan", /^https:\/\/wa\.me\/\d+\?text=/.test((await wa.getAttribute("href")) ?? ""));
    await pub.page.screenshot({ path: path("landing-atas") });
    await pub.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await pub.page.waitForTimeout(500);
    const box = await wa.boundingBox();
    check("landing: setelah digulir ke bawah tombol tetap di pojok kanan bawah layar", Boolean(box) && box.y + box.height <= 900 && box.y > 700 && box.x > 1000, JSON.stringify(box));
    await pub.page.screenshot({ path: path("landing-bawah") });
    await pub.page.setViewportSize({ width: 390, height: 844 });
    await pub.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await pub.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await pub.page.waitForTimeout(500);
    const m = await wa.boundingBox();
    check("HP: tombol WhatsApp ikut saat digulir, tidak menutupi layar", Boolean(m) && m.y + m.height <= 844 && m.width <= 64, JSON.stringify(m));
    check("HP: landing tidak bergeser ke samping", (await overflow(pub.page)) <= 1);
    await pub.page.screenshot({ path: path("landing-hp") });
    await pub.page.setViewportSize({ width: 1280, height: 900 });
  } else {
    check("landing: nomor WhatsApp belum diisi di Konten, tombol melayang tidak tampil", (await pub.page.getByTestId("wa-melayang").count()) === 0);
  }

  // 2. Artikel promo.
  await pub.page.goto(`${BASE}/artikel/promo/promo-launching-silentcx`, { waitUntil: "networkidle" });
  const art = await pub.page.locator("main").innerText();
  check("artikel: promo 10% dengan harga baru dan voucher 20%", art.includes("Diskon 10%") && art.includes("Rp359.100") && art.includes("Rp319.200") && !art.includes("50%"));
  await pub.page.goto(`${BASE}/artikel/promo/syarat-ketentuan-promo-launching`, { waitUntil: "networkidle" });
  const terms = await pub.page.locator("main").innerText();
  check("artikel S&K: add-on tidak mendapat diskon, batas pembelian Rp50.000", terms.includes("Add-on tidak mendapat diskon promo") && terms.includes("Rp50.000"));
  await pub.page.screenshot({ path: path("artikel-sk"), fullPage: true });
  check("publik tanpa error JavaScript", pub.errors.length === 0, pub.errors.join(" | "));
  await pub.ctx.close();

  // 3. Admin Katalog.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
  const cat = await a.page.locator("main").innerText();
  check("admin Katalog: tanpa keterangan PPN", !/PPN/.test(cat));
  check("admin Katalog: harga Performance Rp1.299.000", cat.includes("1.299.000") || (await a.page.locator("input[value='1299000']").count()) > 0);
  await a.page.screenshot({ path: path("admin-katalog"), fullPage: true });

  if (WRITE) {
    // 4. Voucher 20% di Tagihan (tidak digabung dengan promo 10%).
    const v = (
      await retry(() =>
        admin
          .from("vouchers")
          .insert({ code: "UJIE2E17-2026", brand_name: BRAND, rules: [{ package: "essential", pct: 20 }, { package: "insight", pct: 20 }, { package: "performance", pct: 20 }], starts_at: new Date(Date.now() - 86400_000).toISOString(), ends_at: new Date(Date.now() + 7 * 86400_000).toISOString() })
          .select("id, code")
          .single(),
      )
    ).data;
    const p = (await retry(() => admin.from("projects").insert({ code: "PRJ-E2E17V", client_id: clientUser.id, package_snapshot: { key: "essential", name: "SilentCX Essential", outlets: 1, visits: 1, purchase_allowance: 50000 }, outlet_count: 1, entitlements: ["report_basic"], status: "awaiting_payment" }).select("id").single())).data;
    const inv = (await retry(() => admin.from("invoices").insert({ code: "INV-E2E17V", project_id: p.id, client_id: clientUser.id, status: "unpaid", total: 359100, due_at: new Date(Date.now() + 86400_000).toISOString(), kind: "order" }).select("id").single())).data;
    await retry(() => admin.from("invoice_lines").insert({ invoice_id: inv.id, position: 1, kind: "package", item_key: "essential", label: "SilentCX Essential (1 outlet)", quantity: 1, unit_price: 359100, amount: 359100, list_price: 399000 }));
    const total = async () => (await retry(() => admin.from("invoices").select("total").eq("id", inv.id).single())).data.total;

    const c = await loginAs(browser, "client@silentcx.demo");
    await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    const bill = await c.page.locator("main").innerText();
    check("client Tagihan: tanpa keterangan PPN", !/PPN/.test(bill));
    await c.page.fill("#voucher-code", v.code);
    await c.page.getByRole("button", { name: "Cek voucher" }).click();
    await c.page.getByTestId("voucher-quote").waitFor();
    const q = await c.page.getByTestId("voucher-quote").innerText();
    check("client: perbandingan promo Rp359.100 dan voucher Rp319.200", q.includes("Rp359.100") && q.includes("Rp319.200"), q.replace(/\s+/g, " ").slice(0, 160));
    await c.page.getByTestId("voucher-quote").screenshot({ path: path("tagihan-promo-vs-voucher") });
    await c.page.getByRole("button", { name: "Lepas promo & pakai voucher" }).click();
    check("client: voucher dipasang, total Rp319.200", (await waitText(c.page.getByTestId("voucher-applied"), /UJIE2E17-2026/)) && (await total()) === 319200);
    await c.page.getByRole("button", { name: "Lepas voucher" }).click();
    await c.page.locator("#voucher-code").waitFor();
    check("client: lepas voucher memulihkan harga promo Rp359.100", (await total()) === 359100);
    await retry(() => admin.from("projects").delete().eq("id", p.id));

    // 5. Instruksi khusus client untuk shopper.
    const pa = (await retry(() => admin.from("projects").insert({ code: "PRJ-E2E17A", client_id: clientUser.id, package_snapshot: { key: "essential", name: "SilentCX Essential", outlets: 1, visits: 1, purchase_allowance: 50000 }, outlet_count: 1, entitlements: ["report_basic"], status: "active", activated_at: new Date().toISOString() }).select("id").single())).data;
    const o = (await retry(() => admin.from("project_outlets").insert({ project_id: pa.id, position: 1, city: "Makassar", name: "Outlet Uji E2E17", address: "Jl. Uji No. 17" }).select("id").single())).data;
    await c.page.goto(`${BASE}/app/outlets`, { waitUntil: "networkidle" });
    const field = c.page.getByLabel("Instruksi khusus untuk shopper (opsional)").first();
    check("client Outlet: kolom instruksi khusus untuk shopper tampil", await field.isVisible());
    await field.fill(NOTE);
    await c.page.getByText(/Tampil langsung di tugas shopper/).first().screenshot({ path: path("client-instruksi-hint") }).catch(() => {});
    await c.page.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = async () => (await retry(() => admin.from("project_outlets").select("shopper_note").eq("id", o.id).single())).data.shopper_note;
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      ok = (await saved()) === NOTE;
      if (!ok) await c.page.waitForTimeout(500);
    }
    check("client: instruksi tersimpan", ok);
    await c.page.screenshot({ path: path("client-outlet-instruksi"), fullPage: true });
    check("client tanpa error JavaScript", c.errors.length === 0, c.errors.join(" | "));
    await c.ctx.close();

    // Penjadwalan butuh data proyek lengkap dan kuesioner yang disetujui client.
    await retry(() => admin.from("projects").update({ details_completed_at: new Date().toISOString() }).eq("id", pa.id));
    await attachQuestionnaire(pa.id);
    await a.page.goto(`${BASE}/admin/projects/${pa.id}`, { waitUntil: "load" });
    await a.page.getByRole("button", { name: "+ Tugas kunjungan" }).first().click();
    const adminNote = a.page.getByTestId("instruksi-client-admin");
    check("admin: instruksi client tampil di penjadwalan", await adminNote.waitFor({ timeout: 15000 }).then(() => true, () => false));
    await a.page.screenshot({ path: path("admin-instruksi-client"), fullPage: true });

    const task = (await retry(() => admin.from("audit_tasks").insert({ code: "TSK-E2E17A", project_id: pa.id, outlet_id: o.id, window_start: new Date().toISOString().slice(0, 10), window_end: new Date().toISOString().slice(0, 10), fee: 150000, reimburse_cap: 50000, scenario: "Pesan menu andalan.", shopper_id: shopperUser.id, status: "accepted" }).select("id").single())).data;
    const s = await loginAs(browser, "shopper@silentcx.demo", { width: 390, height: 844 });
    await s.page.goto(`${BASE}/shopper/assignments/${task.id}`, { waitUntil: "networkidle" });
    const block = s.page.getByTestId("instruksi-client");
    check("shopper: instruksi khusus dari client tampil terpisah dari instruksi admin", (await block.innerText()).includes(NOTE) && (await s.page.getByTestId("instruksi").innerText()).includes("Pesan menu andalan."));
    check("shopper: batas pembelian Rp50.000 di tugas", (await s.page.locator("main").innerText()).includes("50.000"));
    check("HP shopper: tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    await s.page.screenshot({ path: path("shopper-instruksi-client"), fullPage: true });
    check("shopper tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }
  check("admin tanpa error JavaScript", a.errors.length === 0, a.errors.join(" | "));
  await a.ctx.close();
} finally {
  if (WRITE) await cleanup();
  await browser.close();
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} lolos`);
process.exit(passed === results.length ? 0 : 1);
