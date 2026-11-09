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

// Katalog sebelum Putaran 17 (harga 30 Okt 2026, tanpa promo, Performance 3–5 outlet, batas pembelian Rp150.000).
// Tes lama menguji logika harga, promo, dan voucher dengan angka ini; harga baru diuji di tests/putaran17.test.ts.
const CATALOG_2026_10 = `
update public.packages set promo_pct = null, promo_amount = null, promo_free_outlet = false, promo_starts_at = null, promo_ends_at = null,
  purchase_allowance = 150000;
insert into public.package_prices (package_id, outlets, price)
select id, n, 0 from public.packages, unnest(array[4, 5]) n where key = 'performance';
update public.package_prices pp set price = v.price from public.packages p
join (values ('essential', 1, 1099000), ('insight', 1, 1399000), ('performance', 3, 3999000), ('performance', 4, 4999000), ('performance', 5, 5999000)) as v(key, outlets, price)
  on v.key = p.key
where pp.package_id = p.id and pp.outlets = v.outlets;
update public.addons a set price = v.price from (values ('additional_outlet', 999000), ('additional_visit', 899000), ('re_audit', 899000),
  ('competitor_benchmark', 1299000), ('custom_questionnaire', 399000), ('additional_consultation', 399000), ('priority_report', 399000)) as v(key, price)
where a.key = v.key;
update public.addons set active = true where key = 'custom_questionnaire';
`;

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb(opts: { catalog?: "2026-10" } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(new URL("migrations/", root)).sort()) {
    await db.exec(readFileSync(new URL(`migrations/${file}`, root), "utf8"));
  }
  if (opts.catalog === "2026-10") await db.exec(CATALOG_2026_10);

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

  // Kuesioner proyek dikirim admin lalu disetujui client pemilik proyek (Putaran 13), supaya tugas bisa ditawarkan.
  async function approveQuestionnaire(adminId: string, projectId: string) {
    await as(adminId, "select public.admin_send_questionnaire($1)", [projectId]);
    const owner = (await db.query<{ client_id: string }>("select client_id from public.projects where id = $1", [projectId])).rows[0].client_id;
    await as(owner, "select public.client_review_questionnaire($1, true)", [projectId]);
  }

  return { db, signUp, provision, createAdmin, as, profile, approveQuestionnaire };
}
