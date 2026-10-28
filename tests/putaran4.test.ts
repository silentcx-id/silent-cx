import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;

const fails = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
const pub = async (who: string | null) => (await t.as<{ c: Record<string, unknown> | null }>(who, "select public.public_site_content() as c")).rows[0].c;
const state = async () =>
  (await t.as<{ s: { draft: Record<string, unknown>; unpublished: boolean; published_at: string | null } | null }>(admin, "select public.admin_site_content() as s")).rows[0].s;
const save = (doc: unknown) => t.as(admin, "select public.admin_save_site_draft($1::jsonb)", [JSON.stringify(doc)]);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
});

describe("konten halaman publik", () => {
  it("sebelum ada isi, versi terbit dan status editor kosong", async () => {
    expect(await pub(null)).toBeNull();
    expect(await state()).toBeNull();
  });

  it("menerbitkan sebelum ada draf ditolak", async () => {
    expect(await fails(t.as(admin, "select public.admin_publish_site()"))).toMatch(/Simpan draf dulu/);
  });

  it("draf yang disimpan belum terlihat pengunjung", async () => {
    await save({ hero: "Judul draf" });
    expect(await pub(null)).toBeNull();
    expect(await state()).toMatchObject({ draft: { hero: "Judul draf" }, unpublished: true, published_at: null });
  });

  it("setelah diterbitkan, pengunjung dan akun lain membaca versi terbit", async () => {
    await t.as(admin, "select public.admin_publish_site()");
    expect(await pub(null)).toEqual({ hero: "Judul draf" });
    expect(await pub(client)).toEqual({ hero: "Judul draf" });
    expect((await state())?.unpublished).toBe(false);
    const { rows } = await t.db.query<{ n: number }>("select count(*)::int as n from public.activity_log where action = 'site.published'");
    expect(rows[0].n).toBe(1);
  });

  it("perubahan draf berikutnya tidak mengubah versi terbit sampai diterbitkan lagi", async () => {
    await save({ hero: "Judul baru" });
    expect(await pub(null)).toEqual({ hero: "Judul draf" });
    expect((await state())?.unpublished).toBe(true);
  });

  it("buang draf mengembalikan isi ke versi terbit", async () => {
    await t.as(admin, "select public.admin_discard_site_draft()");
    expect(await state()).toMatchObject({ draft: { hero: "Judul draf" }, unpublished: false });
  });

  it("selain admin tidak bisa membaca draf, menyimpan, atau menerbitkan", async () => {
    expect(await fails(t.as(client, "select public.admin_site_content()"))).toMatch(/Hanya admin/);
    expect(await fails(t.as(client, "select public.admin_save_site_draft('{}'::jsonb)"))).toMatch(/Hanya admin/);
    expect(await fails(t.as(client, "select public.admin_publish_site()"))).toMatch(/Hanya admin/);
    expect(await fails(t.as(null, "select public.admin_save_site_draft('{}'::jsonb)"))).toMatch(/permission denied/);
  });

  it("tabelnya tidak bisa dibaca atau diubah langsung", async () => {
    expect(await fails(t.as(client, "select draft from public.site_content"))).toMatch(/permission denied/);
    expect(await fails(t.as(admin, "update public.site_content set published = '{}'::jsonb"))).toMatch(/permission denied/);
  });

  it("draf harus berupa objek", async () => {
    expect(await fails(t.as(admin, "select public.admin_save_site_draft('[1,2]'::jsonb)"))).toMatch(/tidak valid/);
  });
});
