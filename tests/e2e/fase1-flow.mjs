// Uji headless alur Fase 1 dari awal sampai akhir dengan akun uji sementara:
// pilih paket → invoice → (review admin bila perlu) → unggah bukti → verifikasi admin → proyek aktif → lengkapi data.
// MENULIS DATA ke Supabase, lalu menghapus akun uji beserta pesanan dan file buktinya di akhir.
// Jalankan hanya dengan izin pemilik project: node --env-file=.env.local tests/e2e/fase1-flow.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const retry = async (fn, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
};

async function loginAs(browser, email) {
  const { data, error } = await retry(async () => {
    const res = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (res.error && /fetch/i.test(res.error.message)) throw res.error;
    return res;
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}

const shot = (page, name) => page.screenshot({ path: new URL(`fase1-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";

// Gambar PNG 1x1 sebagai bukti bayar uji.
const proofPath = new URL("fase1-bukti.png", OUT).pathname.slice(1);
writeFileSync(proofPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));

const email = `uji-fase1-${Date.now()}@silentcx.test`;
const { data: created, error: createError } = await retry(() =>
  admin.auth.admin.createUser({ email, password: `Uji${Date.now()}x9`, email_confirm: true, user_metadata: { full_name: "Uji Fase Satu", phone: "081200009999" } }),
);
if (createError) throw new Error(`Gagal membuat akun uji: ${createError.message}`);
const clientId = created.user.id;

const { data: cities } = await admin.from("service_cities").select("name").eq("active", true).limit(1);
const city = cities?.[0]?.name ?? "Kota Uji";
const { data: payment } = await admin.from("app_settings").select("value").eq("key", "payment").single();
const paymentReady = Boolean((payment?.value?.bank_name && payment?.value?.account_number) || payment?.value?.qris_url);

const browser = await chromium.launch();
try {
  // 1. Client memilih paket.
  const c = await loginAs(browser, email);
  check("client baru di tahap Calon client", (await text(c.page)).includes("Calon client"));
  await c.page.goto(`${BASE}/app/paket?paket=insight`, { waitUntil: "networkidle" });
  await c.page.getByLabel("Laporan express").check();
  await c.page.fill("#city-0", city);
  await shot(c.page, "checkout");
  await c.page.getByRole("button", { name: "Buat pesanan" }).click();
  await c.page.waitForURL("**/app/billing", { timeout: 30000 });
  check("pesanan dibuat dan diarahkan ke Tagihan", c.page.url().endsWith("/app/billing"));
  const { data: project } = await admin.from("projects").select("id, code, status, invoices(id, total, status)").eq("client_id", clientId).single();
  check("total = Insight + Laporan express", [project.invoices].flat()[0].total === 1749000 + 599000 || project.status === "awaiting_review", `${[project.invoices].flat()[0].total} ${project.status}`);

  // 2. Kalau kota belum ada di daftar, admin meninjau dulu.
  const a = await loginAs(browser, "admin@silentcx.demo");
  if (project.status === "awaiting_review") {
    await a.page.goto(`${BASE}/admin/projects/${project.id}`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Setujui pesanan" }).click();
    await a.page.getByText("Pesanan disetujui").waitFor({ timeout: 30000 });
    check("admin menyetujui pesanan yang perlu review", true);
  }

  // 3. Client mengunggah bukti bayar.
  await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
  if (!paymentReady) {
    check("rekening/QRIS sudah diatur admin", false, "isi tab Pembayaran di Katalog dulu; langkah bayar dilewati");
  } else {
    check("instruksi bayar tampil", (await text(c.page)).includes("Bayar tepat sebesar"));
    await shot(c.page, "billing");
    await c.page.setInputFiles("#pay-file", proofPath);
    await c.page.fill("#pay-payer", "Uji Fase Satu");
    await c.page.getByRole("button", { name: "Kirim bukti" }).click();
    await c.page.getByText("Pembayaran sedang diverifikasi").waitFor({ timeout: 45000 });
    check("bukti terkirim, status Sedang diverifikasi", true);

    // 4. Admin memverifikasi.
    await a.page.goto(`${BASE}/admin/projects?tab=verify`, { waitUntil: "networkidle" });
    check("pesanan muncul di antrian verifikasi", (await text(a.page)).includes(project.code));
    await a.page.goto(`${BASE}/admin/projects/${project.id}`, { waitUntil: "networkidle" });
    await shot(a.page, "admin-verify");
    await a.page.getByRole("button", { name: "Pembayaran sesuai, aktifkan proyek" }).click();
    await a.page.getByText("Pembayaran diverifikasi").waitFor({ timeout: 30000 });
    check("admin memverifikasi pembayaran", true);

    // 5. Dashboard client aktif dan lengkapi data.
    await c.page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    check("dashboard client menjadi Lengkapi data outlet", (await text(c.page)).includes("Lengkapi data outlet"));
    await shot(c.page, "client-active");
    await c.page.goto(`${BASE}/app/outlets`, { waitUntil: "networkidle" });
    await c.page.fill("#c-name", "Kopi Uji");
    await c.page.fill("#c-pic", "Uji Fase Satu");
    await c.page.fill("#c-phone", "081200009999");
    await c.page.fill("#o-name-0", "Kopi Uji Pusat");
    await c.page.fill("#o-addr-0", "Jl. Uji Coba No. 1");
    await c.page.getByRole("button", { name: "Simpan dan tandai lengkap" }).click();
    await c.page.getByText("Data lengkap.").first().waitFor({ timeout: 30000 });
    await c.page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    check("setelah data lengkap: Audit sedang disiapkan", (await text(c.page)).includes("Audit sedang disiapkan"));
    await shot(c.page, "client-ready");
  }
  await c.ctx.close();
  await a.ctx.close();
} finally {
  await browser.close();
  // Bersihkan: file bukti, lalu akun uji (pesanan, invoice, dan outlet ikut terhapus).
  const { data: folders } = await admin.storage.from("payment-proofs").list(clientId);
  for (const f of folders ?? []) {
    const { data: files } = await admin.storage.from("payment-proofs").list(`${clientId}/${f.name}`);
    if (files?.length) await admin.storage.from("payment-proofs").remove(files.map((x) => `${clientId}/${f.name}/${x.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(clientId);
  console.log(error ? `! Akun uji ${email} gagal dihapus: ${error.message}` : `Akun uji dan datanya dihapus.`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
