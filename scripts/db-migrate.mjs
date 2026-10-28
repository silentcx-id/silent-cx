// Menjalankan migrasi database yang belum terpasang. Aman dijalankan berulang.
// Jalankan: npm run db:migrate   (butuh SUPABASE_DB_URL di .env.local, lihat docs/SETUP.md)
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL belum diisi di .env.local (lihat docs/SETUP.md).");
  process.exit(1);
}

const sql = postgres(dbUrl, { ssl: "require", max: 1, onnotice: () => {} });
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

try {
  await sql`create schema if not exists app_private`;
  await sql`create table if not exists app_private.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;

  const applied = new Set((await sql`select name from app_private.schema_migrations`).map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  for (const file of pending) {
    const body = readFileSync(new URL(file, dir), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into app_private.schema_migrations (name) values (${file})`;
    });
    console.log(`Terpasang: ${file}`);
  }
  if (pending.length === 0) console.log("Semua migrasi sudah terpasang.");
} catch (error) {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}

// Bucket penyimpanan. Bukti bayar privat (dibuka admin lewat tautan sementara);
// site-assets publik untuk gambar yang memang boleh dilihat siapa pun, seperti QRIS.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.exitCode && url && serviceKey) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const buckets = [
    { name: "payment-proofs", options: { public: false, fileSizeLimit: "5MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"] } },
    { name: "site-assets", options: { public: true, fileSizeLimit: "2MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] } },
    // Foto kunjungan (check-in, struk, bukti): privat, hanya diunggah shopper pemilik tugas lewat tautan sekali pakai.
    { name: "audit-evidence", options: { public: false, fileSizeLimit: "5MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] } },
    // Bukti transfer payout: privat, diunggah admin; shopper hanya membuka buktinya sendiri lewat tautan sementara.
    { name: "payout-proofs", options: { public: false, fileSizeLimit: "5MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"] } },
  ];
  const { data: existing, error } = await admin.storage.listBuckets();
  if (error) console.error(`Tidak bisa membaca bucket: ${error.message}`);
  for (const b of buckets) {
    if (error || existing?.some((x) => x.name === b.name)) continue;
    const res = await admin.storage.createBucket(b.name, b.options);
    console.log(res.error ? `Gagal membuat bucket ${b.name}: ${res.error.message}` : `Bucket dibuat: ${b.name}`);
  }
}
