// Menjalankan migrasi database yang belum terpasang. Aman dijalankan berulang.
// Jalankan: npm run db:migrate   (butuh SUPABASE_DB_URL di .env.local, lihat docs/SETUP.md)
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
