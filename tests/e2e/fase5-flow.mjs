// Uji headless alur Fase 5 (payout shopper) dengan proyek dan dua shopper sementara:
// kunjungan yang sudah diputuskan QC disiapkan lewat service role → admin melihat antrian, mengisi kontak,
// mentransfer dua tugas sekaligus dengan satu bukti, lalu mengganti bukti → shopper melihat pembayaran,
// bukti, dan tombol hubungi admin → shopper tanpa rekening melihat peringatan dan notifikasinya.
// MENULIS DATA ke Supabase (termasuk kontak admin sementara, dikembalikan di akhir), lalu menghapus semuanya.
// Jalankan hanya dengan izin pemilik project: node --env-file=.env.local tests/e2e/fase5-flow.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const proofFile = fileURLToPath(new URL("fase5-bukti.png", OUT));
writeFileSync(proofFile, PNG);

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
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

async function loginAs(browser, email, viewport = { width: 1280, height: 900 }) {
  const { data, error } = await retry(async () => {
    const res = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (res.error && /fetch/i.test(res.error.message)) throw res.error;
    return res;
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport });
  // Koneksi ke Supabase kadang 1–4 detik per permintaan; halaman admin memanggil beberapa sekaligus.
  ctx.setDefaultNavigationTimeout(90000);
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(`fase5-${name}.png`, OUT)), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";

const stamp = Date.now();
const city = "Kota Uji Fase Lima";
const pw = `Uji${stamp}x9`;
const mk = async (email, meta) => must(await retry(() => admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: meta })), `buat ${email}`).user.id;
const emails = { client: `uji-fase5-client-${stamp}@silentcx.test`, a: `uji-fase5-a-${stamp}@silentcx.test`, b: `uji-fase5-b-${stamp}@silentcx.test` };
const names = { a: `Shopper A ${stamp}`, b: `Shopper B ${stamp}` };
const clientId = await mk(emails.client, { full_name: "Client Uji Lima", phone: "081200005555" });
const shopperA = await mk(emails.a, { account_type: "shopper", full_name: names.a, phone: "081200004444" });
const shopperB = await mk(emails.b, { account_type: "shopper", full_name: names.b, phone: "081200003333" });

const original = must(await admin.from("app_settings").select("value").eq("key", "admin_contact").maybeSingle(), "kontak admin")?.value ?? { name: "", whatsapp: "" };
let projectId;
const browser = await chromium.launch();
try {
  for (const id of [shopperA, shopperB]) {
    await admin.from("profiles").update({ status: "active" }).eq("id", id);
    await admin.from("shopper_applications").insert({ shopper_id: id, status: "approved", reachable_cities: [city], decided_at: new Date().toISOString() });
  }
  must(await admin.from("shopper_bank_accounts").insert({ shopper_id: shopperA, bank_name: "BCA", account_number: "1234500000", account_holder: names.a }), "rekening A");
  projectId = must(
    await admin
      .from("projects")
      .insert({
        code: `PRJ-UJI5-${stamp}`,
        client_id: clientId,
        package_snapshot: { key: "insight", name: "SilentCX Insight", outlets: 2, visits: 1, purchase_allowance: 100000 },
        addons_snapshot: [],
        outlet_count: 2,
        entitlements: ["report_basic"],
        status: "active",
        activated_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "proyek",
  ).id;
  const outlets = must(
    await admin
      .from("project_outlets")
      .insert([1, 2].map((position) => ({ project_id: projectId, position, city, name: `Outlet Uji ${position} ${stamp}`, address: "Jl. Uji No. 5" })))
      .select("id, position"),
    "outlet",
  ).sort((x, y) => x.position - y.position);

  // Kunjungan yang sudah dikirim, lalu diputuskan QC (status diubah terpisah supaya pemicu notifikasi berjalan).
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const mkTask = async (n, outlet, shopper, purchase, decision) => {
    const row = must(
      await admin
        .from("audit_tasks")
        .insert({ code: `TGS-U5${n}-${stamp}`, project_id: projectId, outlet_id: outlet, status: "submitted", window_start: day, window_end: day, fee: 150000, reimburse_cap: 100000, shopper_id: shopper, purchase_amount: purchase, submitted_at: new Date().toISOString() })
        .select("id, code")
        .single(),
      `tugas ${n}`,
    );
    must(await admin.from("audit_tasks").update({ ...decision, qc_decided_at: new Date().toISOString() }).eq("id", row.id), `QC ${n}`);
    return row;
  };
  const a1 = await mkTask(1, outlets[0].id, shopperA, 50000, { status: "approved", fee_decision: "full" });
  const a2 = await mkTask(2, outlets[1].id, shopperA, 40000, { status: "rejected", fee_decision: "reimburse_only", qc_note: "Outlet tutup" });
  const b1 = await mkTask(3, outlets[0].id, shopperB, 0, { status: "approved", fee_decision: "full" });

  // 1. Admin: kontak, antrian, transfer kolektif, ganti bukti.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  check("beranda admin menghitung payout belum dibayar", (await a.page.locator("a[href='/admin/payouts']").last().textContent())?.match(/\d+/) !== null);
  await a.page.goto(`${BASE}/admin/payouts?tab=kontak`, { waitUntil: "networkidle" });
  await a.page.getByLabel("Nama kontak person").fill("Kontak Uji");
  await a.page.getByLabel("Nomor WhatsApp").fill("081200009999");
  await a.page.getByRole("button", { name: "Simpan kontak" }).click();
  await a.page.getByText("Kontak tersimpan.").first().waitFor();
  check("kontak admin tersimpan", true);

  // Antrian hanya ringkasan per shopper; rincian dan form transfer ada di halaman shopper.
  await a.page.goto(`${BASE}/admin/payouts`, { waitUntil: "networkidle" });
  const rowA = a.page.locator("tr", { hasText: names.a });
  const rowB = a.page.locator("tr", { hasText: names.b });
  check("antrian ringkas: total A dan rekening B belum diisi", ((await rowA.textContent()) ?? "").includes("Rp240.000") && ((await rowB.textContent()) ?? "").includes("Belum diisi"));
  await shot(a.page, "antrian");
  await a.page.goto(`${BASE}/admin/payouts/${shopperB}`, { waitUntil: "networkidle" });
  const cardB = a.page.locator("article", { hasText: names.b });
  const tb = (await cardB.textContent()) ?? "";
  check("B menunggu rekening", tb.includes("Menunggu rekening") && tb.includes("Belum mengisi rekening"));
  check("B tidak bisa ditransfer", (await cardB.getByRole("button", { name: "Tandai sudah ditransfer" }).count()) === 0);
  await a.page.goto(`${BASE}/admin/payouts`, { waitUntil: "networkidle" });
  await rowA.getByRole("link").click();
  await a.page.waitForURL(`**/admin/payouts/${shopperA}`);
  const cardA = a.page.locator("article", { hasText: names.a });
  const ta = (await cardA.textContent()) ?? "";
  check("antrian A: fee + reimburse dan reimburse saja", ta.includes("Rp200.000") && ta.includes("Rp40.000") && ta.includes("Rp240.000"), ta.slice(0, 160));
  check("rekening A tampil", ta.includes("1234500000"));
  await shot(a.page, "payout-shopper");

  await cardA.locator("input[type=file]").setInputFiles(proofFile);
  await cardA.getByLabel("Catatan (opsional)").fill("Transfer uji");
  await cardA.getByRole("button", { name: "Tandai sudah ditransfer" }).click();
  await a.page.getByText("Payout tercatat. Shopper sudah diberi tahu.").first().waitFor();
  await a.page.goto(`${BASE}/admin/payouts`, { waitUntil: "networkidle" });
  check("A hilang dari antrian setelah dibayar", (await a.page.locator("tr", { hasText: names.a }).count()) === 0);
  await a.page.goto(`${BASE}/admin/payouts?tab=dibayar`, { waitUntil: "networkidle" });
  const payout = must(await admin.from("payouts").select("id, code, total").eq("shopper_id", shopperA).single(), "payout A");
  check("satu payout untuk dua tugas", payout.total === 240000, `${payout.code} ${payout.total}`);
  const paidCard = a.page.locator("article", { hasText: payout.code });
  check("muncul di Sudah dibayar", (await paidCard.count()) === 1);
  const [popup] = await Promise.all([a.page.waitForEvent("popup"), paidCard.getByRole("button", { name: "Lihat bukti" }).click()]);
  check("Lihat bukti membuka file", popup.url().includes("payout-proofs"));
  await popup.close();
  await paidCard.getByRole("button", { name: "Ganti bukti" }).click();
  await paidCard.locator("input[type=file]").setInputFiles(proofFile);
  await paidCard.getByLabel("Alasan").fill("Bukti pertama terpotong");
  await paidCard.getByRole("button", { name: "Simpan" }).click();
  await a.page.getByText("Bukti diganti. Shopper sudah diberi tahu.").first().waitFor();
  check("bukti bisa diganti dengan alasan", true);
  await shot(a.page, "sudah-dibayar");
  await a.ctx.close();

  // 2. Shopper A: notifikasi, rincian, bukti, dan tombol hubungi admin.
  const s = await loginAs(browser, emails.a, { width: 390, height: 844 });
  await s.page.goto(`${BASE}/shopper`, { waitUntil: "networkidle" });
  check("notifikasi pembayaran", (await text(s.page)).includes(`Pembayaran ${payout.code} sebesar Rp240.000 sudah ditransfer`));
  await s.page.goto(`${BASE}/shopper/payments`, { waitUntil: "networkidle" });
  const ts = await text(s.page);
  check("rincian per tugas", ts.includes(a1.code) && ts.includes(a2.code) && ts.includes("Rp240.000") && ts.includes("Bukti diganti admin"));
  check("bukti transfer bisa dibuka", (await s.page.getByRole("link", { name: "Lihat bukti transfer" }).getAttribute("href"))?.includes("payout-proofs") ?? false);
  const wa = (await s.page.getByRole("link", { name: "Hubungi Kontak Uji" }).first().getAttribute("href")) ?? "";
  check("hubungi admin lewat WhatsApp berisi kode dan nominal", wa.startsWith("https://wa.me/6281200009999") && decodeURIComponent(wa).includes(payout.code) && !wa.includes("1234500000"));
  await shot(s.page, "shopper-pembayaran");
  await s.ctx.close();

  // 3. Shopper B: tanpa rekening.
  const sb = await loginAs(browser, emails.b, { width: 390, height: 844 });
  await sb.page.goto(`${BASE}/shopper`, { waitUntil: "networkidle" });
  check("notifikasi isi rekening", (await text(sb.page)).includes(`Kunjungan ${b1.code} siap dibayar`));
  await sb.page.goto(`${BASE}/shopper/payments`, { waitUntil: "networkidle" });
  const tsb = await text(sb.page);
  check("peringatan rekening dan menunggu rekening", tsb.includes("Rekening belum diisi") && tsb.includes("Menunggu rekening") && tsb.includes("Rp150.000"));
  check("B tidak melihat pembayaran A", !tsb.includes(payout.code));
  await sb.ctx.close();
} catch (e) {
  check("alur selesai tanpa error", false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  // Urutan hapus: proyek (beserta tugas) → payout → bukti → akun; payout menahan penghapusan akun shopper.
  // Error ditampilkan supaya jelas langkah mana yang menahan penghapusan akun.
  const logError = (step, res) => res.error && console.log(`! ${step} gagal: ${res.error.message}`);
  if (projectId) logError("hapus proyek uji", await admin.from("projects").delete().eq("id", projectId));
  logError("hapus payout uji", await admin.from("payouts").delete().in("shopper_id", [shopperA, shopperB]));
  for (const id of [shopperA, shopperB]) {
    const { data: files } = await admin.storage.from("payout-proofs").list(id);
    if (files?.length) await admin.storage.from("payout-proofs").remove(files.map((x) => `${id}/${x.name}`));
  }
  await admin.from("app_settings").update({ value: original }).eq("key", "admin_contact");
  for (const [id, email] of [
    [clientId, emails.client],
    [shopperA, emails.a],
    [shopperB, emails.b],
  ]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(error ? `! Akun uji ${email} gagal dihapus: ${error.message}` : `Akun uji ${email} dan datanya dihapus.`);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
