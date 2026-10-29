// Membuat akun admin asli (tanpa data demo), misalnya untuk project produksi.
// Jalankan: npm run admin:buat:prod -- email@domain.com "Nama Lengkap" 081234567890
// (atau npm run admin:buat -- … untuk project staging di .env.local)
// Password acak yang kuat ditampilkan sekali di terminal ini; ganti setelah masuk lewat menu Akun saya.
// Akun yang emailnya sudah terdaftar tidak diubah.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di file env.");
  process.exit(1);
}

const [email, name, phone] = process.argv.slice(2);
const cleanEmail = String(email ?? "").trim().toLowerCase();
const cleanPhone = String(phone ?? "").replace(/[\s-]/g, "");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !name?.trim() || !/^\+?[0-9]{8,15}$/.test(cleanPhone)) {
  console.error('Pemakaian: npm run admin:buat:prod -- email@domain.com "Nama Lengkap" 081234567890');
  process.exit(1);
}

console.log(`Project: ${new URL(url).host}`);
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error(`Tidak bisa membaca daftar akun: ${listError.message}`);
  process.exit(1);
}
if (list.users.some((u) => u.email === cleanEmail)) {
  console.error(`${cleanEmail} sudah terdaftar di project ini; tidak diubah.`);
  process.exit(1);
}

// 18 karakter acak, ditambah huruf dan angka supaya selalu lolos aturan password aplikasi.
const password = `${randomBytes(12).toString("base64url")}a7`;
const { error } = await admin.auth.admin.createUser({
  email: cleanEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: name.trim(), phone: cleanPhone },
  app_metadata: { provisioned_role: "admin" },
});
if (error) {
  console.error(`Gagal membuat admin: ${error.message}`);
  process.exit(1);
}
console.log(`\nAdmin dibuat: ${cleanEmail}`);
console.log(`Password sementara (tidak ditampilkan lagi): ${password}`);
console.log("Masuk, lalu ganti password di menu Akun saya.");
