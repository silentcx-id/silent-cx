// Uji headless Putaran 16: instruksi shopper dengan template dari kuesioner, peran CS, dan Konfirmasi WA admin.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka halaman (tab Tim CS, /cs tertutup untuk tamu, tombol Konfirmasi WA).
// Dengan E2E_TULIS=1 skrip menulis data uji sementara di staging:
//   1. admin membuat akun CS "CS Uji E2E16" lewat tab Tim CS (password sementara tampil sekali);
//   2. CS masuk: daftar client per tahap, follow-up WA ke client demo (WhatsApp dibuka di tab baru lalu ditutup),
//      hasil "Tertarik" dengan jadwal hari ini → muncul di tab Perlu follow-up; detail client, outlet, catatan manual,
//      riwayat follow-up;
//   3. admin melihat riwayat follow-up di detail akun client;
//   4. kuesioner uji "Kuesioner Uji E2E16": admin membuat template instruksi dari isi kuesioner;
//   5. proyek uji PRJ-E2E16A: tombol Konfirmasi WA (pesan admin tersisip), lalu tugas kunjungan dibuat dengan template
//      instruksi (nama outlet terisi otomatis).
// Tidak ada pesan WhatsApp yang benar-benar terkirim. Akun CS, kuesioner, proyek, dan catatan follow-up uji dihapus di akhir.
// Butuh migration 20261104000026 dan 20261104000027 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran16-cs-instruksi.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const WRITE = process.env.E2E_TULIS === "1";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CS_EMAIL = "cs-uji-e2e16@silentcx.demo";
const CS_NAME = "CS Uji E2E16";
const QN = "Kuesioner Uji E2E16";
const OUTLET = "Outlet Uji E2E16";
const START = new Date().toISOString();

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const path = (name) => new URL(`p16-${name}.png`, OUT).pathname.slice(1);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

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
  // Tab WhatsApp yang dibuka tombol dicatat alamatnya lalu langsung ditutup, jadi tidak ada pesan yang terkirim.
  const popups = [];
  ctx.on("page", async (p) => {
    if (p === page) return;
    popups.push(p.url() === "about:blank" ? await p.waitForURL(/wa\.me/, { timeout: 10000 }).then(() => p.url(), () => p.url()) : p.url());
    await p.close().catch(() => {});
  });
  await ctx.route(/wa\.me|api\.whatsapp\.com|web\.whatsapp\.com/, (route) => route.fulfill({ status: 200, body: "wa" }));
  return { ctx, page, errors, popups };
}

async function loginAs(browser, email, viewport) {
  const { data } = await retry(() => admin.auth.admin.generateLink({ type: "magiclink", email }));
  const s = await context(browser, viewport);
  await s.page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return s;
}

const probe = await admin.from("client_followups").select("id").limit(1);
if (probe.error) {
  console.log("✗ migration 20261104000026 dan 20261104000027 belum terpasang di staging. Jalankan npm run db:migrate dulu.");
  process.exit(1);
}

const clientUser = (await retry(() => admin.from("profiles").select("id, full_name, phone").eq("email", "client@silentcx.demo").single())).data;

async function cleanup() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const csUser = list?.users.find((u) => u.email === CS_EMAIL);
  await retry(() => admin.from("client_followups").delete().eq("client_id", clientUser.id).gte("created_at", START));
  await retry(() => admin.from("projects").delete().like("code", "PRJ-E2E16%"));
  await retry(() => admin.from("questionnaires").delete().like("name", `${QN}%`));
  if (csUser) {
    await retry(() => admin.from("client_followups").delete().eq("staff_id", csUser.id));
    await admin.auth.admin.deleteUser(csUser.id);
  }
}

// Proyek uji aktif dengan satu outlet, data outlet lengkap, dan kuesioner uji yang sudah disetujui client.
async function setupProject() {
  const q = (await retry(() => admin.from("questionnaires").insert({ name: QN, business_type: "fnb", photo_limit: 6 }).select("id").single())).data;
  const sec = (await retry(() => admin.from("questionnaire_sections").insert({ questionnaire_id: q.id, position: 1, title: "Kedatangan & sapaan", weight: 100, target: 80 }).select("id").single())).data;
  await retry(() =>
    admin.from("questionnaire_questions").insert([
      { section_id: sec.id, position: 1, prompt: "Tampak depan outlet bersih.", help: "Foto tanpa wajah orang.", kind: "yes_no", photo_required: true, is_sop: false, red_flag: false },
      { section_id: sec.id, position: 2, prompt: "Staf menyapa dalam 10 detik.", help: "Hitung sejak melewati pintu.", kind: "yes_no", photo_required: false, is_sop: true, red_flag: false },
    ]),
  );
  const pkg = { key: "essential", name: "SilentCX Essential", outlets: 1, visits: 1, purchase_allowance: 150000 };
  const p = (
    await retry(() =>
      admin
        .from("projects")
        .insert({ code: "PRJ-E2E16A", client_id: clientUser.id, package_snapshot: pkg, outlet_count: 1, entitlements: ["report_basic"], status: "active", details_completed_at: new Date().toISOString(), activated_at: new Date().toISOString() })
        .select("id")
        .single(),
    )
  ).data;
  await retry(() => admin.from("project_outlets").insert({ project_id: p.id, position: 1, city: "Jakarta", name: OUTLET, address: "Jl. Uji No. 16", notes: "Parkir di basement" }));
  const snapshot = (await retry(() => admin.rpc("questionnaire_snapshot", { p_questionnaire: q.id }))).data;
  const review = (await retry(() => admin.from("questionnaire_reviews").insert({ project_id: p.id, version: 1, snapshot, sent_at: new Date().toISOString(), due_at: new Date(Date.now() + 3 * 86400_000).toISOString(), status: "approved", decided_at: new Date().toISOString() }).select("id").single())).data;
  await retry(() => admin.from("project_questionnaires").insert({ project_id: p.id, questionnaire_id: q.id, snapshot, review_id: review.id }));
  return { project: p.id, questionnaire: q.id };
}

const browser = await chromium.launch();
let a = null;
let s = null;
try {
  if (WRITE) await cleanup();

  // Tamu tidak bisa membuka area CS.
  {
    const g = await context(browser);
    await g.page.goto(`${BASE}/cs`, { waitUntil: "networkidle" });
    check("tamu: /cs dialihkan ke halaman masuk", g.page.url().includes("/login") && g.page.url().includes("next=%2Fcs"));
    const robots = await (await g.page.request.get(`${BASE}/robots.txt`)).text();
    check("robots.txt menutup /cs", robots.includes("Disallow: /cs"));
    await g.ctx.close();
  }

  // Admin: tab Tim CS dan tombol Konfirmasi WA di proyek demo.
  a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/accounts?tab=cs`, { waitUntil: "networkidle" });
  check("admin: tab Tim CS dengan form Buat akun CS", (await a.page.getByRole("button", { name: "Buat akun CS" }).count()) === 1);
  const demo = (await retry(() => admin.from("projects").select("id, code").eq("client_id", clientUser.id).not("code", "like", "PRJ-E2E%").order("created_at", { ascending: false }).limit(1).single())).data;
  await a.page.goto(`${BASE}/admin/projects/${demo.id}`, { waitUntil: "networkidle" });
  await a.page.getByRole("button", { name: "Konfirmasi WA" }).click();
  const confirmText = await a.page.getByLabel("Pesan WhatsApp").inputValue();
  check(`admin: Konfirmasi WA ${demo.code} berisi kode proyek, paket, dan daftar outlet`, confirmText.includes(demo.code) && confirmText.includes("Paket:") && confirmText.includes("Outlet:\n1."), confirmText.slice(0, 80));
  await a.page.getByLabel(/Pesan dari admin/).fill("Mohon cek titik Maps outlet 1.");
  check("admin: pesan admin langsung tersisip ke pesan WA", (await a.page.getByLabel("Pesan WhatsApp").inputValue()).includes("Mohon cek titik Maps outlet 1."));
  await a.page.screenshot({ path: path("admin-konfirmasi-wa"), fullPage: true });
  await a.page.getByRole("button", { name: "Batal" }).click();

  if (!WRITE) {
    console.log("\n(Mode baca saja. Jalankan dengan E2E_TULIS=1 untuk menguji akun CS, follow-up, dan instruksi.)");
  } else {
    // 1. Admin membuat akun CS.
    await a.page.goto(`${BASE}/admin/accounts?tab=cs`, { waitUntil: "networkidle" });
    await a.page.getByLabel("Nama lengkap").fill(CS_NAME);
    await a.page.getByLabel("Email").fill(CS_EMAIL);
    await a.page.getByLabel("Nomor HP").fill("081200001616");
    await a.page.getByRole("button", { name: "Buat akun CS" }).click();
    await a.page.getByText(`Akun CS ${CS_EMAIL} dibuat`).waitFor({ timeout: 30000 }).catch(() => {});
    const pw = await a.page.locator("code").first().innerText().catch(() => "");
    check("admin: akun CS dibuat, password sementara tampil sekali", pw.length >= 16);
    await a.page.screenshot({ path: path("admin-tim-cs"), fullPage: true });
    const csProfile = (await retry(() => admin.from("profiles").select("id, role, status").eq("email", CS_EMAIL).single())).data;
    check("akun CS tercatat role cs dan aktif", csProfile.role === "cs" && csProfile.status === "active");
    await a.page.reload({ waitUntil: "networkidle" });
    check("admin: akun CS tampil di daftar Tim CS", (await a.page.getByText(CS_EMAIL).count()) >= 1);

    // 2. CS masuk.
    s = await loginAs(browser, CS_EMAIL);
    await s.page.goto(`${BASE}/cs`, { waitUntil: "networkidle" });
    check("CS: masuk ke /cs, judul Client", s.page.url().startsWith(`${BASE}/cs`) && (await s.page.locator("h1").innerText()) === "Client");
    const tabs = await s.page.getByRole("navigation", { name: "Tahap client" }).innerText();
    check("CS: tab tahap client lengkap", ["Perlu follow-up", "Semua", "Belum pesan", "Menunggu bayar", "Audit berjalan", "Laporan terbit"].every((n) => tabs.includes(n)));
    check("CS: menu Client dan Riwayat follow-up, tanpa menu admin", (await s.page.locator("nav").getByRole("link", { name: "Riwayat follow-up" }).count()) >= 1 && (await s.page.locator("nav").getByRole("link", { name: "Katalog" }).count()) === 0);
    await s.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    check("CS: /admin dialihkan kembali ke /cs", new URL(s.page.url()).pathname === "/cs");

    await s.page.goto(`${BASE}/cs?tab=all&q=client%40silentcx.demo`, { waitUntil: "networkidle" });
    const card = s.page.locator("li.card").first();
    check("CS: cari client demo lewat email", (await s.page.locator("li.card").count()) === 1 && (await card.innerText()).includes("client@silentcx.demo"));
    check("CS: kartu client menampilkan status paket dan kode proyek", /Audit berjalan|Menunggu bayar|Laporan terbit|Ditinjau admin|Verifikasi bayar|Belum pesan|Batal/.test(await card.innerText()));
    await s.page.screenshot({ path: path("cs-daftar"), fullPage: true });

    await card.getByRole("button", { name: "Follow-up WA" }).click();
    const msg = await s.page.getByLabel("Pesan WhatsApp").inputValue();
    check("CS: template pesan menyapa dengan nama CS", msg.includes(`saya ${CS_NAME} dari SilentCX`), msg.slice(0, 70));
    await s.page.getByRole("button", { name: "Pesan bebas" }).click();
    await s.page.getByLabel("Pesan WhatsApp").fill(`Halo, ini uji follow-up ${CS_NAME}.`);
    await s.page.screenshot({ path: path("cs-follow-up"), fullPage: true });
    await s.page.getByRole("button", { name: "Buka WhatsApp" }).click();
    await s.page.getByText("WhatsApp dibuka dan tercatat").waitFor({ timeout: 30000 }).catch(() => {});
    await s.page.waitForTimeout(500);
    check("CS: WhatsApp dibuka di tab baru ke nomor client", s.popups.some((u) => /wa\.me\/\d{8,}/.test(u)), s.popups.join(" "));
    const logged = (await retry(() => admin.from("client_followups").select("id, outcome, message, staff_id").eq("client_id", clientUser.id).eq("staff_id", csProfile.id))).data;
    check("follow-up tercatat dengan pesan yang dikirim", logged.length === 1 && logged[0].outcome === "sent" && logged[0].message.includes(CS_NAME));
    await s.page.getByLabel("Hasil").selectOption("interested");
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    await s.page.getByLabel("Follow-up berikutnya").fill(today);
    await s.page.getByLabel(/Catatan/).fill("Tertarik audit ulang, hubungi lagi hari ini (uji E2E16).");
    await s.page.getByRole("button", { name: "Simpan hasil" }).click();
    await s.page.getByText("Hasil follow-up disimpan.").first().waitFor({ timeout: 30000 }).catch(() => {});
    const after = (await retry(() => admin.from("client_followups").select("outcome, next_at, note").eq("id", logged[0].id).single())).data;
    check("CS: hasil Tertarik dan jadwal hari ini tersimpan", after.outcome === "interested" && after.next_at === today);

    await s.page.goto(`${BASE}/cs?tab=due`, { waitUntil: "networkidle" });
    check("CS: client muncul di tab Perlu follow-up", (await s.page.getByText("client@silentcx.demo").count()) >= 1);

    await s.page.goto(`${BASE}/cs/clients/${clientUser.id}`, { waitUntil: "networkidle" });
    const detail = (await s.page.locator("body").innerText()).toLowerCase();
    check("CS: detail client menampilkan pesanan, outlet, dan riwayat", detail.includes("pesanan & outlet") && detail.includes(demo.code.toLowerCase()) && detail.includes("riwayat follow-up") && detail.includes("tertarik"));
    await s.page.getByRole("button", { name: "+ Catat manual" }).click();
    await s.page.getByLabel("Kanal").selectOption("call");
    await s.page.getByLabel("Catatan", { exact: true }).fill("Telepon: minta penawaran paket Insight (uji E2E16).");
    await s.page.getByRole("button", { name: "Simpan catatan" }).click();
    await s.page.getByText("Follow-up dicatat.").first().waitFor({ timeout: 60000 }).catch(() => {});
    await s.page.getByText("minta penawaran paket Insight").first().waitFor({ timeout: 30000 }).catch(() => {});
    check("CS: catatan manual (telepon) tampil di riwayat", (await s.page.getByText("minta penawaran paket Insight").count()) >= 1 && (await s.page.getByText(/Telepon ·/).count()) >= 1);
    await s.page.screenshot({ path: path("cs-detail"), fullPage: true });

    await s.page.goto(`${BASE}/cs/followups`, { waitUntil: "networkidle" });
    check("CS: Riwayat follow-up menampilkan 2 catatan saya", (await s.page.locator("tbody tr").count()) === 2);
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(`${BASE}/cs`, { waitUntil: "networkidle" });
    check("HP: /cs tidak bergeser ke samping", (await overflow(s.page)) <= 1);
    await s.page.screenshot({ path: path("cs-hp"), fullPage: true });
    check("CS: tanpa error JavaScript", s.errors.length === 0, s.errors.join(" | "));

    // 3. Admin melihat riwayat follow-up di detail akun client.
    // Prefetch tautan di halaman ini membuat jaringan tidak pernah diam, jadi cukup tunggu sampai halaman termuat.
    await a.page.goto(`${BASE}/admin/accounts/${clientUser.id}`, { waitUntil: "load" });
    await a.page.getByText("Riwayat follow-up").first().waitFor({ timeout: 30000 }).catch(() => {});
    check("admin: riwayat follow-up CS tampil di detail akun client", (await a.page.getByText("minta penawaran paket Insight").count()) >= 1 && (await a.page.getByText(CS_NAME).count()) >= 1);

    // 4. Template instruksi dari kuesioner.
    const { project, questionnaire } = await setupProject();
    await a.page.goto(`${BASE}/admin/questionnaires/${questionnaire}`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Buat dari isi kuesioner" }).click();
    await a.page.getByLabel("Nama template").fill("Dine-in");
    const drafted = await a.page.getByLabel("Instruksi kunjungan").inputValue();
    check("admin: draf instruksi disusun dari kuesioner (alur, foto wajib, petunjuk)", drafted.includes("1. Kedatangan & sapaan") && drafted.includes("Tampak depan outlet bersih") && drafted.includes("Hitung sejak melewati pintu"));
    await a.page.getByLabel(/Pembelian wajib/).fill("1 minuman andalan");
    await a.page.getByRole("button", { name: "Tambah template" }).click();
    await a.page.getByText("Template instruksi disimpan.").first().waitFor({ timeout: 30000 }).catch(() => {});
    const saved = (await retry(() => admin.from("questionnaires").select("instruction_templates").eq("id", questionnaire).single())).data.instruction_templates;
    check("admin: template Dine-in tersimpan di kuesioner", saved.length === 1 && saved[0].name === "Dine-in" && saved[0].purchase === "1 minuman andalan");
    await a.page.screenshot({ path: path("admin-template-instruksi"), fullPage: true });

    // 5. Konfirmasi WA dan tugas dengan template di proyek uji.
    await a.page.goto(`${BASE}/admin/projects/${project}?tab=jadwal`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Konfirmasi WA" }).click();
    const confirmMsg = await a.page.getByLabel("Pesan WhatsApp").inputValue();
    check("admin: Konfirmasi WA proyek uji memuat outlet dan alamatnya", confirmMsg.includes("PRJ-E2E16A") && confirmMsg.includes(`1. ${OUTLET} · Jakarta`) && confirmMsg.includes("Jl. Uji No. 16"));
    await a.page.getByLabel(/Pesan dari admin/).fill("Uji konfirmasi E2E16.");
    await a.page.getByRole("button", { name: "Buka WhatsApp" }).click();
    await a.page.getByText("WhatsApp dibuka dan tercatat").waitFor({ timeout: 30000 }).catch(() => {});
    const conf = (await retry(() => admin.from("client_followups").select("purpose, message").eq("project_id", project))).data;
    check("admin: konfirmasi tercatat sebagai konfirmasi proyek dengan pesan admin", conf.length === 1 && conf[0].purpose === "project_confirm" && conf[0].message.includes("Uji konfirmasi E2E16."));
    await a.page.getByRole("button", { name: "Nanti saja" }).click();
    await a.page.reload({ waitUntil: "networkidle" });
    check("admin: keterangan Terakhir dikonfirmasi tampil", (await a.page.getByText(/Terakhir dikonfirmasi/).count()) === 1);

    await a.page.getByRole("button", { name: "+ Tugas kunjungan" }).click();
    const picker = a.page.getByLabel("Template instruksi");
    const options = await picker.locator("option").allInnerTexts();
    check("admin: pilihan template = draf otomatis + Dine-in", options[0] === "Susun otomatis dari kuesioner" && options.includes("Dine-in"), options.join(", "));
    check("admin: catatan client untuk outlet tampil di form", (await a.page.getByText("Parkir di basement").count()) >= 1);
    await picker.selectOption({ label: "Dine-in" });
    await a.page.getByRole("button", { name: "Pakai template" }).click();
    const filled = await a.page.getByLabel(/Instruksi untuk shopper/).inputValue();
    check("admin: template dipakai, nama dan kota outlet terisi otomatis", filled.includes(`${OUTLET}, Jakarta`) && !filled.includes("{outlet}"));
    check("admin: pembelian wajib ikut terisi dari template", (await a.page.getByLabel("Pembelian wajib").inputValue()) === "1 minuman andalan");
    await a.page.getByRole("button", { name: "Sisipkan ke instruksi" }).click();
    await a.page.screenshot({ path: path("admin-tugas-instruksi"), fullPage: true });
    await a.page.getByRole("button", { name: "Buat tugas" }).click();
    await a.page.getByText("Tugas dibuat.").first().waitFor({ timeout: 30000 }).catch(() => {});
    const task = (await retry(() => admin.from("audit_tasks").select("scenario, mandatory_purchase").eq("project_id", project).single())).data;
    check("tugas tersimpan dengan instruksi outlet ini dan catatan client", task.scenario.includes(`${OUTLET}, Jakarta`) && task.scenario.includes("Catatan outlet: Parkir di basement") && task.mandatory_purchase === "1 minuman andalan");
    check("admin: tanpa error JavaScript", a.errors.length === 0, a.errors.join(" | "));
  }
} catch (e) {
  check("skrip berjalan tanpa error", false, e.message);
} finally {
  if (WRITE) await cleanup().catch((e) => console.log(`Pembersihan gagal: ${e.message}`));
  await browser.close();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} lolos`);
process.exit(passed === results.length ? 0 : 1);
