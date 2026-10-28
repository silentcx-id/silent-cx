import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let shopper: string;

const fails = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  shopper = await t.signUp("shopper@contoh.test", { account_type: "shopper", full_name: "Sari", phone: "081255556666" });
});

describe("daftar jenis usaha", () => {
  it("terisi 9 jenis bawaan dengan Lainnya di urutan terakhir", async () => {
    const { rows } = await t.as<{ key: string }>(client, "select key from public.business_types order by sort_order");
    expect(rows.map((r) => r.key)).toEqual(["fnb", "retail", "hospitality", "banking", "automotive", "health", "beauty", "telco", "other"]);
  });

  it("pengunjung tanpa login bisa membaca daftar", async () => {
    const { rows } = await t.as<{ n: number }>(null, "select count(*)::int as n from public.business_types");
    expect(rows[0].n).toBe(9);
  });

  it("admin menambah, mengganti nama, dan menonaktifkan", async () => {
    await t.as(admin, "insert into public.business_types (key, label_id, label_en, sort_order) values ('edu', 'Pendidikan', 'Education', 90)");
    await t.as(admin, "update public.business_types set label_id = 'Pendidikan & kursus' where key = 'edu'");
    await t.as(admin, "update public.business_types set active = false where key = 'edu'");
    // Tetap terbaca supaya data lama yang memakainya tetap menampilkan nama.
    expect((await t.as<{ label_id: string; active: boolean }>(client, "select label_id, active from public.business_types where key = 'edu'")).rows[0]).toEqual({ label_id: "Pendidikan & kursus", active: false });
  });

  it("kode tidak bisa diganti, dan selain admin tidak bisa mengubah daftar", async () => {
    expect(await fails(t.as(admin, "update public.business_types set key = 'edu2' where key = 'edu'"))).toMatch(/permission denied/);
    await t.as(client, "update public.business_types set label_id = 'X' where key = 'fnb'");
    expect((await t.as<{ label_id: string }>(admin, "select label_id from public.business_types where key = 'fnb'")).rows[0].label_id).toBe("F&B");
    expect(await fails(t.as(client, "insert into public.business_types (key, label_id) values ('hack', 'Hack')"))).toMatch(/row-level security/);
  });

  it("nama jenis tidak boleh kembar", async () => {
    expect(await fails(t.as(admin, "insert into public.business_types (key, label_id) values ('fnb2', 'f&b')"))).toMatch(/duplicate key/);
  });
});

describe("kolom yang memakai daftar", () => {
  it("lamaran shopper hanya menerima industri yang ada di daftar, termasuk jenis baru", async () => {
    await t.as(admin, "insert into public.business_types (key, label_id) values ('gym', 'Gym & kebugaran')");
    await t.db.query("insert into public.shopper_applications (shopper_id, industries) values ($1, '{fnb,gym}')", [shopper]);
    expect(await fails(t.db.query("update public.shopper_applications set industries = '{fnb,tidakada}' where shopper_id = $1", [shopper]))).toMatch(/tidak ada di daftar/);
  });

  it("kuesioner merujuk ke daftar, dan jenis yang dipakai kuesioner tidak bisa dihapus", async () => {
    await t.as(admin, "insert into public.questionnaires (name, business_type) values ('Gym dasar', 'gym')");
    expect(await fails(t.as(admin, "insert into public.questionnaires (name, business_type) values ('Asal', 'tidakada')"))).toMatch(/foreign key/);
    expect(await fails(t.as(admin, "delete from public.business_types where key = 'gym'"))).toMatch(/foreign key/);
  });

  it("data perusahaan client menyimpan kode jenis usaha yang aktif", async () => {
    await t.as(client, "insert into public.companies (client_id, name, industry) values ($1, 'PT ABC', 'fnb')", [client]);
    expect(await fails(t.as(client, "update public.companies set industry = 'F&B Bebas' where client_id = $1", [client]))).toMatch(/Pilih jenis usaha/);
    expect(await fails(t.as(client, "update public.companies set industry = 'edu' where client_id = $1", [client]))).toMatch(/Pilih jenis usaha/);
    await t.as(client, "update public.companies set industry = '' where client_id = $1", [client]);
  });

  it("isian lama yang tidak cocok tetap boleh disimpan selama jenis usahanya tidak diubah", async () => {
    // Meniru isian teks bebas dari sebelum migrasi.
    await t.db.exec("alter table public.companies disable trigger companies_industry");
    await t.db.query("update public.companies set industry = 'Warung kopi' where client_id = $1", [client]);
    await t.db.exec("alter table public.companies enable trigger companies_industry");
    await t.as(client, "update public.companies set name = 'PT ABC Baru' where client_id = $1", [client]);
    const { rows } = await t.db.query<{ name: string; industry: string }>("select name, industry from public.companies where client_id = $1", [client]);
    expect(rows[0]).toEqual({ name: "PT ABC Baru", industry: "Warung kopi" });
  });
});
