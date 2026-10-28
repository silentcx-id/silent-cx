// Membuat akun demo untuk uji coba: 1 admin, 1 client, 1 shopper aktif, 1 shopper menunggu seleksi.
// Jalankan: npm run demo:akun
// Password dibuat acak dan hanya ditampilkan di terminal ini; simpan sendiri. Akun yang sudah ada dilewati.
// Lupa password: npm run demo:akun -- --reset memberi password baru untuk keempat akun demo saja (akun lain tidak disentuh).
// Fase 2: shopper@ diberi lamaran contoh yang sudah disetujui (sekali saja); pelamar@ sengaja belum mengisi lamaran.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.local.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const ACCOUNTS = [
  { email: "admin@silentcx.demo", name: "Admin Demo", phone: "081200000001", app: { provisioned_role: "admin" } },
  { email: "client@silentcx.demo", name: "Client Demo", phone: "081200000002", meta: { account_type: "client" } },
  { email: "shopper@silentcx.demo", name: "Shopper Aktif", phone: "081200000003", app: { provisioned_role: "shopper" } },
  { email: "pelamar@silentcx.demo", name: "Shopper Pelamar", phone: "081200000004", meta: { account_type: "shopper" } },
];

// Huruf dan angka, sesuai aturan password aplikasi.
const password = () => `Demo${randomBytes(4).toString("hex")}7`;

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error(`Tidak bisa membaca daftar akun: ${listError.message}`);
  process.exit(1);
}

const reset = process.argv.includes("--reset");

const rows = [];
for (const a of ACCOUNTS) {
  const existing = list.users.find((u) => u.email === a.email);
  if (existing && reset) {
    const pw = password();
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password: pw });
    rows.push({ email: a.email, password: error ? `GAGAL: ${error.message}` : pw });
    continue;
  }
  if (existing) {
    rows.push({ email: a.email, password: "(sudah ada, tidak diubah; pakai --reset untuk password baru)" });
    continue;
  }
  const pw = password();
  const { error } = await admin.auth.admin.createUser({
    email: a.email,
    password: pw,
    email_confirm: true,
    user_metadata: { full_name: a.name, phone: a.phone, ...(a.meta ?? {}) },
    app_metadata: a.app ?? {},
  });
  rows.push({ email: a.email, password: error ? `GAGAL: ${error.message}` : pw });
}

console.log("\nAkun demo silentCX (simpan password ini, tidak ditampilkan lagi):\n");
console.table(rows);

// Lamaran contoh untuk shopper aktif, supaya antrian admin dan pool per kota punya data.
const shopperUser = (await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users.find((u) => u.email === "shopper@silentcx.demo");
if (shopperUser) {
  const { data: existingApp, error: appError } = await admin.from("shopper_applications").select("id").eq("shopper_id", shopperUser.id).limit(1);
  if (appError) {
    console.log(`Lamaran contoh dilewati: ${appError.message} (sudah menjalankan npm run db:migrate?)`);
  } else if (existingApp.length) {
    console.log("Lamaran contoh shopper@silentcx.demo sudah ada, tidak diubah.");
  } else {
    const { data: cities } = await admin.from("service_cities").select("name").eq("active", true).order("name").limit(2);
    const now = new Date().toISOString();
    const { error } = await admin.from("shopper_applications").insert({
      shopper_id: shopperUser.id,
      status: "approved",
      domicile: cities?.[0]?.name ?? "Jakarta",
      reachable_cities: (cities ?? []).map((c) => c.name),
      birth_date: "1996-05-17",
      gender: "female",
      occupation: "Karyawan swasta",
      vehicle: "motorcycle",
      experience: "1_3y",
      experience_note: "Lamaran contoh untuk uji coba.",
      industries: ["fnb", "retail"],
      quiz_attempts: 1,
      quiz_passed_at: now,
      pact_version: "v1",
      pact_accepted_at: now,
      submitted_at: now,
      decided_at: now,
    });
    console.log(error ? `Gagal membuat lamaran contoh: ${error.message}` : "Lamaran contoh shopper@silentcx.demo dibuat (disetujui).");
    if (!error && !cities?.length) console.log("Belum ada kota dilayani, jadi jangkauan lamaran contoh masih kosong.");
  }
}
