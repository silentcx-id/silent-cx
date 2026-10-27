// Membuat akun demo untuk uji coba: 1 admin, 1 client, 1 shopper aktif, 1 shopper menunggu seleksi.
// Jalankan: npm run demo:akun
// Password dibuat acak dan hanya ditampilkan di terminal ini; simpan sendiri. Akun yang sudah ada dilewati.
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

const rows = [];
for (const a of ACCOUNTS) {
  if (list.users.some((u) => u.email === a.email)) {
    rows.push({ email: a.email, password: "(sudah ada, tidak diubah)" });
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
