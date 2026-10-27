// Postgres sungguhan (PGlite) dengan tiruan minimal skema auth dan hak bawaan Supabase,
// lalu semua migrasi dijalankan berurutan persis seperti di Supabase.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../supabase/", import.meta.url);

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Seperti Supabase: tabel dan sequence baru di public otomatis bisa diakses anon dan authenticated,
-- jadi migrasi wajib mempersempitnya sendiri.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(new URL("migrations/", root)).sort()) {
    await db.exec(readFileSync(new URL(`migrations/${file}`, root), "utf8"));
  }

  // Meniru pendaftaran lewat Supabase Auth: metadata user bisa diisi siapa saja dari browser,
  // app_metadata hanya dari server dengan service role.
  async function signUp(email: string, meta: Record<string, unknown> = {}, app: Record<string, unknown> = {}) {
    const res = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3) returning id",
      [email, JSON.stringify(meta), JSON.stringify(app)],
    );
    return res.rows[0].id;
  }

  // Meniru admin.createUser di Supabase: baris auth.users dibuat dulu tanpa app_metadata kustom,
  // lalu app_metadata disimpan dengan update terpisah.
  async function provision(email: string, role: "admin" | "shopper", meta: Record<string, unknown> = {}) {
    const id = await signUp(email, meta, { provider: "email" });
    await db.query("update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1", [id, JSON.stringify({ provisioned_role: role })]);
    return id;
  }

  const createAdmin = (email: string) => provision(email, "admin", { full_name: "Admin" });

  // Menjalankan query sebagai pengguna tertentu (atau anon), lalu kembali ke superuser.
  async function as<T>(userId: string | null, sql: string, params: unknown[] = []) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    await db.exec(userId ? "set role authenticated" : "set role anon");
    try {
      return await db.query<T>(sql, params);
    } finally {
      await db.exec("reset role");
    }
  }

  async function profile(userId: string) {
    const res = await db.query<{ role: string; status: string; status_note: string | null; full_name: string; email: string; phone: string | null }>(
      "select role::text, status::text, status_note, full_name, email, phone from public.profiles where id = $1",
      [userId],
    );
    return res.rows[0];
  }

  return { db, signUp, provision, createAdmin, as, profile };
}
