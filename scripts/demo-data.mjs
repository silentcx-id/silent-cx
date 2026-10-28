// Data contoh untuk uji coba manual: setiap tahap bisnis punya contohnya, jadi tahap mana pun bisa langsung dicoba.
// Jalankan: npm run demo:data          → membuat data (berhenti kalau data contoh sudah ada)
//           npm run demo:data -- --hapus → menghapus semua data contoh, lalu bisa dibuat ulang
// Semua akun data contoh beremail data-…@silentcx.demo dan memakai satu password yang hanya tampil di terminal ini.
// Data dibuat lewat fungsi database yang sama dengan aplikasi (sesi admin, client, dan shopper), jadi status,
// kode, notifikasi, dan log terbentuk seperti pemakaian sungguhan. Foto memakai gambar contoh.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.local.");
  process.exit(1);
}

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const PHOTO = readFileSync(new URL("../assets/pdf/simbol-emas.png", import.meta.url));
const PROOF = readFileSync(new URL("../assets/pdf/logo-hitam.png", import.meta.url));
const DOMAIN = "@silentcx.demo";
const PREFIX = "data-";
const isDemo = (email) => Boolean(email?.startsWith(PREFIX) && email.endsWith(DOMAIN));

// Nilai contoh untuk pengaturan; saat --hapus hanya dikosongkan kalau belum diganti.
const DEMO_PAYMENT = { bank_name: "BCA (contoh)", account_number: "1234567890", account_holder: "PT SilentCX Contoh" };
const DEMO_CONTACT = { name: "Admin SilentCX (contoh)", whatsapp: "081200000001" };

// Koneksi ke Supabase kadang lambat atau terputus sesaat.
async function retry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !/fetch|network|ECONN|timeout/i.test(String(e?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}
async function must(promise, what) {
  const res = await retry(async () => {
    const r = await (typeof promise === "function" ? promise() : promise);
    if (r.error && /fetch|network|ECONN|timeout/i.test(r.error.message)) throw new Error(r.error.message);
    return r;
  });
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const data = await must(() => service.auth.admin.listUsers({ page, perPage: 1000 }), "daftar akun");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function removeFolder(bucket, prefix) {
  const { data } = await service.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id) await service.storage.from(bucket).remove([path]);
    else await removeFolder(bucket, path);
  }
}

// ---------------------------------------------------------------------------
// Hapus
// ---------------------------------------------------------------------------

async function wipe() {
  const users = (await allUsers()).filter((u) => isDemo(u.email));
  const ids = users.map((u) => u.id);
  if (ids.length) {
    // Proyek (beserta outlet, tugas, invoice, laporan) → payout → akun; payout menahan penghapusan akun shopper.
    await must(() => service.from("projects").delete().in("client_id", ids), "hapus proyek");
    await must(() => service.from("payouts").delete().in("shopper_id", ids), "hapus payout");
    for (const id of ids) {
      for (const bucket of ["payment-proofs", "audit-evidence", "payout-proofs"]) await removeFolder(bucket, id);
    }
    for (const u of users) await must(() => service.auth.admin.deleteUser(u.id), `hapus ${u.email}`);
  }
  await removeFolder("site-assets", "demo");
  const settings = await must(() => service.from("app_settings").select("key, value").in("key", ["payment", "admin_contact"]), "pengaturan");
  for (const s of settings) {
    if (s.key === "payment" && s.value?.account_number === DEMO_PAYMENT.account_number && s.value?.bank_name === DEMO_PAYMENT.bank_name) {
      await must(() => service.from("app_settings").update({ value: { bank_name: "", account_number: "", account_holder: "", qris_url: "" } }).eq("key", "payment"), "kosongkan rekening");
    }
    if (s.key === "admin_contact" && s.value?.name === DEMO_CONTACT.name) {
      await must(() => service.from("app_settings").update({ value: { name: "", whatsapp: "" } }).eq("key", "admin_contact"), "kosongkan kontak");
    }
  }
  console.log(`Data contoh dihapus: ${users.length} akun beserta proyek, tugas, payout, dan fotonya.`);
}

if (process.argv.includes("--hapus")) {
  await wipe();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Persiapan
// ---------------------------------------------------------------------------

if ((await allUsers()).some((u) => isDemo(u.email))) {
  console.error("Data contoh sudah ada. Hapus dulu dengan: npm run demo:data -- --hapus");
  process.exit(1);
}

const cities = await must(() => service.from("service_cities").select("name").eq("active", true).order("name"), "kota dilayani");
if (!cities.length) {
  console.error("Belum ada kota dilayani yang aktif. Tambahkan dulu di Katalog.");
  process.exit(1);
}
const city = cities[0].name;
const questionnaire = (await must(() => service.from("questionnaires").select("id, name").eq("active", true).order("created_at").limit(1), "kuesioner"))[0];
if (!questionnaire) {
  console.error("Belum ada kuesioner aktif. Buat dulu di menu Kuesioner.");
  process.exit(1);
}

const password = `Demo${randomBytes(4).toString("hex")}7`;
const accounts = [];

async function sessionFor(email) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await must(() => c.auth.signInWithPassword({ email, password }), `masuk ${email}`);
  return c;
}

async function createAccount(key, name, phone, meta, note) {
  const email = `${PREFIX}${key}${DOMAIN}`;
  const user = (await must(() => service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, phone, ...meta } }), `buat ${email}`)).user;
  accounts.push({ akun: email, peran: note });
  return { id: user.id, email, name };
}

// Admin demo dipakai lewat tautan masuk sekali pakai; passwordnya tidak disentuh.
async function adminSession() {
  const link = await must(() => service.auth.admin.generateLink({ type: "magiclink", email: "admin@silentcx.demo" }), "tautan admin (sudah menjalankan npm run demo:akun?)");
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await must(() => c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" }), "sesi admin");
  return c;
}
const admin = await adminSession();

const upload = (bucket, path, body) => must(() => service.storage.from(bucket).upload(path, body, { contentType: "image/png", upsert: true }), `unggah ${path}`);
const today = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Pengaturan contoh: rekening dan QRIS SilentCX, kontak admin untuk shopper
// ---------------------------------------------------------------------------

// Hanya diisi kalau masih kosong, supaya rekening atau kontak asli yang sudah diisi tidak tertimpa.
const current = Object.fromEntries((await must(() => service.from("app_settings").select("key, value").in("key", ["payment", "admin_contact"]), "pengaturan")).map((s) => [s.key, s.value ?? {}]));
const filled = [];
if (!current.payment?.account_number && !current.payment?.qris_url) {
  await upload("site-assets", "demo/qris-contoh.png", PHOTO);
  const qris = service.storage.from("site-assets").getPublicUrl("demo/qris-contoh.png").data.publicUrl;
  await must(() => service.from("app_settings").upsert({ key: "payment", value: { ...DEMO_PAYMENT, qris_url: qris } }), "rekening contoh");
  filled.push("rekening dan QRIS SilentCX");
}
if (!current.admin_contact?.whatsapp) {
  await must(() => service.from("app_settings").upsert({ key: "admin_contact", value: DEMO_CONTACT }), "kontak contoh");
  filled.push("kontak admin untuk shopper");
}

// ---------------------------------------------------------------------------
// Shopper
// ---------------------------------------------------------------------------

async function activeShopper(key, name, phone, gender, bank) {
  const s = await createAccount(key, name, phone, { account_type: "shopper" }, `Shopper aktif${bank ? ", rekening terisi" : ", belum isi rekening"}`);
  const now = new Date().toISOString();
  await must(() => service.from("profiles").update({ status: "active" }).eq("id", s.id), "aktifkan shopper");
  await must(
    () =>
      service.from("shopper_applications").insert({
        shopper_id: s.id, status: "approved", domicile: city, reachable_cities: [city], birth_date: "1995-03-12", gender, occupation: "Karyawan swasta",
        vehicle: "motorcycle", experience: "1_3y", industries: ["fnb", "retail"], quiz_attempts: 1, quiz_passed_at: now, pact_version: "2026-10", pact_accepted_at: now,
        submitted_at: now, decided_at: now, decision_note: null,
      }),
    "lamaran disetujui",
  );
  s.api = await sessionFor(s.email);
  if (bank) await must(() => s.api.rpc("save_bank_account", { p_bank: bank[0], p_number: bank[1], p_holder: name }), "rekening shopper");
  return s;
}

async function applicant(key, name, phone, gender) {
  const s = await createAccount(key, name, phone, { account_type: "shopper" }, "Pelamar, menunggu seleksi");
  const now = new Date().toISOString();
  await must(
    () =>
      service.from("shopper_applications").insert({
        shopper_id: s.id, status: "submitted", domicile: city, reachable_cities: [city], birth_date: "1999-08-21", gender, occupation: "Mahasiswa",
        vehicle: "motorcycle", experience: "none", industries: ["fnb", "beauty"], quiz_attempts: 1, quiz_passed_at: now, pact_version: "2026-10", pact_accepted_at: now, submitted_at: now,
      }),
    "lamaran pelamar",
  );
}

const rina = await activeShopper("shopper-rina", "Rina Lestari", "081300000101", "female", ["BCA", "5550001111"]);
const dimas = await activeShopper("shopper-dimas", "Dimas Pratama", "081300000102", "male", null);
const sinta = await activeShopper("shopper-sinta", "Sinta Wulandari", "081300000103", "female", ["Mandiri", "5550002222"]);
await applicant("pelamar-ayu", "Ayu Puspita", "081300000201", "female");
await applicant("pelamar-bagas", "Bagas Saputra", "081300000202", "male");

// ---------------------------------------------------------------------------
// Client dan proyek
// ---------------------------------------------------------------------------

async function newClient(key, name, company, note) {
  const c = await createAccount(key, name, "081400000" + String(accounts.length).padStart(3, "0"), { account_type: "client" }, note);
  c.api = await sessionFor(c.email);
  c.company = company;
  return c;
}

async function order(c, pkg, outlets, addons = []) {
  const projectId = await must(() => c.api.rpc("create_order", { p_package: pkg, p_cities: Array(outlets).fill(city), p_addons: addons }), `pesanan ${c.email}`);
  const invoice = (await must(() => c.api.from("invoices").select("id, total").eq("project_id", projectId).eq("kind", "order").single(), "invoice"));
  return { projectId, invoice };
}

async function pay(c, invoice) {
  const path = `${c.id}/${invoice.id}/bukti-contoh.png`;
  await upload("payment-proofs", path, PROOF);
  await must(() => c.api.rpc("submit_payment_proof", { p_invoice: invoice.id, p_method: "transfer", p_path: path, p_amount: invoice.total, p_payer: c.name }), "bukti bayar");
}

// Pembayaran diverifikasi, data perusahaan dan outlet diisi, kuesioner ditetapkan.
async function activate(c, project, outletNames, competitor) {
  await pay(c, project.invoice);
  await must(() => admin.rpc("admin_verify_payment", { p_invoice: project.invoice.id, p_approve: true, p_note: null }), "verifikasi bayar");
  await must(
    () =>
      c.api.from("companies").insert({ client_id: c.id, name: c.company, industry: "fnb", address: `Jl. Merdeka No. ${accounts.length}`, city, instagram: "", pic_name: c.name, pic_position: "Pemilik", pic_phone: "081211112222" }),
    "data perusahaan",
  );
  const outlets = await must(() => c.api.from("project_outlets").select("id, position").eq("project_id", project.projectId).eq("is_competitor", false).order("position"), "outlet");
  for (const [i, o] of outlets.entries()) {
    await must(() => c.api.from("project_outlets").update({ name: `${c.company} ${outletNames[i]}`, address: `Jl. ${outletNames[i]} No. ${i + 7}` }).eq("id", o.id), "isi outlet");
  }
  if (competitor) {
    await must(() => c.api.rpc("client_save_competitors", { p_project: project.projectId, p_items: [{ name: competitor, address: "Jl. Sudirman No. 21", city, maps_url: "", paired_outlet_id: outlets[0].id }] }), "kompetitor");
  }
  await must(() => c.api.rpc("complete_project_details", { p_project: project.projectId, p_objectives: "Meningkatkan konsistensi pelayanan dan penjualan di semua outlet." }), "data lengkap");
  await must(() => admin.rpc("admin_assign_questionnaire", { p_project: project.projectId, p_questionnaire: questionnaire.id }), "tetapkan kuesioner");
  return must(() => service.from("project_outlets").select("id, name, is_competitor").eq("project_id", project.projectId).order("is_competitor").order("position"), "daftar outlet");
}

async function task(outletId) {
  return must(() => admin.rpc("admin_create_task", { p_outlet: outletId, p_window_start: today(), p_window_end: today(7), p_scenario: "Datang sebagai pelanggan biasa, pesan satu menu andalan dan satu minuman.", p_purchase: "Satu menu andalan dan satu minuman" }), "buat tugas");
}
const offer = (taskId, shopper) => must(() => admin.rpc("admin_offer_task", { p_task: taskId, p_shopper: shopper.id, p_hours: 24, p_urgent: false }), "tawarkan");

// Kunjungan sampai dikirim. `mood` mengatur jawaban supaya skor tiap outlet berbeda.
async function visit(taskId, shopper, purchase, mood) {
  await offer(taskId, shopper);
  await must(() => shopper.api.rpc("shopper_respond_offer", { p_task: taskId, p_accept: true }), "terima tugas");
  const base = `${shopper.id}/${taskId}`;
  await upload("audit-evidence", `${base}/checkin.png`, PHOTO);
  await must(() => shopper.api.rpc("shopper_check_in", { p_task: taskId, p_lat: -6.2, p_lng: 106.82, p_accuracy: 15, p_photo: `${base}/checkin.png` }), "check-in");
  const detail = await must(() => shopper.api.rpc("shopper_task", { p_task: taskId }), "detail tugas");
  const qs = detail.questionnaire.sections.flatMap((s) => s.questions);
  const answers = Object.fromEntries(
    qs.map((q, i) => {
      const weak = (i + mood) % 4 === 0;
      const value = q.kind === "yes_no" ? (weak ? "no" : "yes") : q.kind === "scale" ? (weak ? 2 : 4 + ((i + mood) % 2)) : weak ? "Staf terlihat sibuk dan kurang menyapa." : "Pelayanan ramah dan cepat.";
      return [q.id, { value, na: false, note: weak ? "Perlu perbaikan." : "" }];
    }),
  );
  await must(() => shopper.api.rpc("shopper_save_visit", { p_task: taskId, p_answers: answers, p_purchase: purchase, p_purchase_note: "Menu andalan dan minuman" }), "simpan jawaban");
  for (const q of qs.filter((x) => x.photo_required)) {
    await upload("audit-evidence", `${base}/bukti-${q.id}.png`, PHOTO);
    await must(() => shopper.api.rpc("shopper_add_photo", { p_task: taskId, p_kind: "evidence", p_question: q.id, p_path: `${base}/bukti-${q.id}.png` }), "foto bukti");
  }
  if (purchase > 0) {
    await upload("audit-evidence", `${base}/struk.png`, PHOTO);
    await must(() => shopper.api.rpc("shopper_add_photo", { p_task: taskId, p_kind: "receipt", p_question: null, p_path: `${base}/struk.png` }), "struk");
  }
  await must(() => shopper.api.rpc("shopper_submit_visit", { p_task: taskId }), "kirim kunjungan");
  return qs;
}
const approve = (taskId, excess = false) => must(() => admin.rpc("admin_qc_approve", { p_task: taskId, p_excess: excess, p_note: "Bukti lengkap dan konsisten." }), "setujui QC");

const REPORT = {
  summary: "Pelayanan secara umum ramah, tetapi sapaan dan penawaran menu tambahan belum konsisten antar shift. Kebersihan area makan baik; waktu tunggu pesanan perlu dipercepat saat jam ramai.",
  findings: [
    { title: "Sapaan pertama tidak selalu diberikan", detail: "Pelanggan menunggu sekitar 20 detik sebelum disapa.", severity: "major" },
    { title: "Upselling belum dilakukan", detail: "Staf tidak menawarkan menu pendamping atau ukuran lebih besar.", severity: "major" },
    { title: "Area makan bersih dan rapi", detail: "Meja dibersihkan segera setelah pelanggan pergi.", severity: "minor" },
  ],
  recommendations: [
    { text: "Terapkan aturan sapa dalam 5 detik untuk semua staf kasir.", priority: "now" },
    { text: "Latih staf menawarkan satu menu pendamping di setiap pesanan.", priority: "soon" },
    { text: "Tambah satu staf saat jam makan siang untuk memangkas waktu tunggu.", priority: "later" },
  ],
};
const saveReport = (projectId) => must(() => admin.rpc("admin_save_report", { p_project: projectId, p_summary: REPORT.summary, p_findings: REPORT.findings, p_recommendations: REPORT.recommendations, p_photo_ids: [] }), "simpan laporan");

// Client 1: pesanan baru, invoice belum dibayar.
const c1 = await newClient("client-1", "Andi Wijaya", "Kopi Senja", "Client: invoice belum dibayar");
await order(c1, "essential", 1);

// Client 2: bukti bayar terkirim, menunggu verifikasi admin.
const c2 = await newClient("client-2", "Bella Kurnia", "Roti Pagi", "Client: bukti bayar menunggu verifikasi");
await pay(c2, (await order(c2, "insight", 1)).invoice);

// Client 5 dulu, supaya payout Rina yang sudah dibayar adalah yang paling lama.
// Client 5: laporan terbit, tagihan tambahan kelebihan pembelian belum dibayar.
const c5 = await newClient("client-5", "Eko Santoso", "Bakso Mantap", "Client: laporan terbit, tagihan tambahan belum dibayar");
const p5 = await order(c5, "essential", 1);
const o5 = await activate(c5, p5, ["Pusat"]);
const t5 = await task(o5[0].id);
await visit(t5, rina, 185000, 2);
await approve(t5, true);
await saveReport(p5.projectId);
await must(() => admin.rpc("admin_publish_report", { p_project: p5.projectId }), "terbitkan laporan");
await upload("payout-proofs", `${rina.id}/transfer-contoh.png`, PROOF);
await must(() => admin.rpc("admin_record_payout", { p_tasks: [t5], p_proof: `${rina.id}/transfer-contoh.png`, p_note: "Transfer BCA" }), "payout Rina");

// Client 4: semua kunjungan lolos QC, draf laporan tersimpan, siap diterbitkan admin.
const c4 = await newClient("client-4", "Dewi Anggraini", "Resto Nusantara", "Client: draf laporan siap diterbitkan");
const p4 = await order(c4, "insight", 2, [{ key: "additional_outlet", qty: 1 }]);
const o4 = await activate(c4, p4, ["Kemang", "Menteng"]);
const t4a = await task(o4[0].id);
await visit(t4a, rina, 90000, 1);
await approve(t4a);
const t4b = await task(o4[1].id);
await visit(t4b, dimas, 60000, 3);
await approve(t4b);
await saveReport(p4.projectId);

// Client 3: proyek berjalan dengan kunjungan di berbagai status.
const c3 = await newClient("client-3", "Citra Maharani", "Kedai Rasa", "Client: audit berjalan, kunjungan di berbagai status");
const p3 = await order(c3, "performance", 3, [{ key: "competitor_benchmark", qty: 1 }]);
const o3 = await activate(c3, p3, ["Blok M", "Senayan", "Kuningan"], "Kopi Tetangga");
const [o3a, o3b, o3c, o3k] = o3;
const t3a = await task(o3a.id);
await visit(t3a, rina, 70000, 0);
await approve(t3a);
const t3b = await task(o3b.id);
await visit(t3b, dimas, 55000, 1);
const t3c = await task(o3c.id);
const qs3c = await visit(t3c, sinta, 65000, 2);
await must(() => admin.rpc("admin_qc_revision", { p_task: t3c, p_items: [qs3c[0].id], p_note: "Tambahkan berapa detik sampai Anda disapa." }), "minta revisi");
const t3k = await task(o3k.id);
await offer(t3k, sinta);

// Payout Rina di Resto Nusantara dibuat sudah lewat 48 jam; rekeningnya sudah lama diisi.
await must(() => service.from("shopper_bank_accounts").update({ created_at: new Date(Date.now() - 10 * 86400_000).toISOString() }).eq("shopper_id", rina.id), "umur rekening");
await must(() => service.from("audit_tasks").update({ qc_decided_at: new Date(Date.now() - 3 * 86400_000).toISOString() }).eq("id", t4a), "payout terlambat");

console.log(`\nData contoh silentCX dibuat (kota: ${city}, kuesioner: ${questionnaire.name}).`);
console.log(`Password semua akun di bawah: ${password}`);
console.log("Simpan password ini; tidak ditampilkan lagi. Admin tetap memakai admin@silentcx.demo.\n");
console.table(accounts);
console.log(`
Yang bisa langsung dicoba:
- Admin › Akun: 2 pelamar menunggu seleksi.
- Admin › Proyek & verifikasi: bukti bayar Roti Pagi menunggu verifikasi.
- Admin › Quality control: 1 kunjungan menunggu QC (Kedai Rasa Senayan) dan 1 menunggu revisi shopper.
- Admin › Laporan: Resto Nusantara siap diterbitkan; Kedai Rasa masih berjalan.
- Admin › Keuangan: 1 payout lewat 48 jam, 1 masih dalam batas, 1 menunggu rekening Dimas, 1 sudah dibayar.
- Shopper Sinta: tawaran kunjungan (kompetitor Kedai Rasa) dan revisi yang harus dikirim.
- Client Kopi Senja: bayar invoice. Bakso Mantap: baca laporan, unduh PDF, bayar tagihan tambahan.
Hapus semuanya dengan: npm run demo:data -- --hapus
`);
console.log(filled.length ? `Diisi data contoh karena masih kosong: ${filled.join(", ")}.` : "Rekening, QRIS, dan kontak admin sudah terisi sebelumnya, jadi tidak diubah.");
