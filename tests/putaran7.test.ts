import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "kunci-uji";

import { createTestDb, type TestDb } from "./db-helpers";
import { dict } from "../src/lib/i18n";
import { legalBlocks } from "../src/lib/legal-blocks";
import { isValidResetValue, resetCookieValue } from "../src/lib/reset-token";
import { DEFAULT_CONTENT, legalPlaceholders, legalVersion, normalizeContent } from "../src/lib/site-content";

describe("tautan reset password", () => {
  const user = "11111111-1111-1111-1111-111111111111";
  const now = Date.UTC(2026, 9, 30, 3, 0, 0);

  it("penanda berlaku 15 menit untuk akun yang sama saja", () => {
    const { value, maxAge } = resetCookieValue(user, now);
    expect(maxAge).toBe(900);
    expect(isValidResetValue(value, user, now + 14 * 60_000)).toBe(true);
    expect(isValidResetValue(value, user, now + 16 * 60_000)).toBe(false);
    expect(isValidResetValue(value, "22222222-2222-2222-2222-222222222222", now)).toBe(false);
    expect(isValidResetValue(undefined, user, now)).toBe(false);
  });

  it("penanda yang diubah tangan ditolak", () => {
    const { value } = resetCookieValue(user, now);
    const [id, exp, mac] = value.split(".");
    expect(isValidResetValue(`${id}.${Number(exp) + 3600}.${mac}`, user, now)).toBe(false);
    expect(isValidResetValue(`${id}.${exp}.${mac.slice(0, -2)}xx`, user, now)).toBe(false);
  });

  it("teks lupa password, password baru, dan akun saya tersedia", () => {
    const t = dict("id");
    expect(t.auth.resetSent("a@b.com")).toContain("a@b.com");
    for (const v of [t.auth.forgotLink, t.auth.resetTitle, t.auth.resetExpired, t.password.mismatch, t.password.same, t.account.wrongCurrent, t.account.changed]) expect(v).toBeTruthy();
  });
});

describe("halaman hukum di CMS", () => {
  it("dokumen konten lama tanpa halaman hukum mendapat draf bawaan", () => {
    const c = normalizeContent({ order: [], sections: {}, site: {} });
    expect(c.legal.privacy.title.id).toBe("Kebijakan Privasi");
    expect(c.legal.terms.body.id).toBe(DEFAULT_CONTENT.legal.terms.body.id);
    expect(legalVersion(c)).toBe("privasi 2026-10-29, syarat 2026-10-29");
  });

  it("isian bertanda kurung siku terdeteksi sampai dilengkapi", () => {
    expect(legalPlaceholders(DEFAULT_CONTENT)).toContain("[Nama badan usaha]");
    const filled = normalizeContent({
      ...DEFAULT_CONTENT,
      legal: {
        privacy: { ...DEFAULT_CONTENT.legal.privacy, body: { id: "Dikelola PT Contoh.", en: "" } },
        terms: { ...DEFAULT_CONTENT.legal.terms, body: { id: "Berlaku untuk semua pengguna.", en: "" }, updated: "2026-11-01" },
      },
    });
    expect(legalPlaceholders(filled)).toEqual([]);
    expect(legalVersion(filled)).toBe("privasi 2026-10-29, syarat 2026-11-01");
  });

  it("tanggal yang tidak valid kembali ke bawaan", () => {
    const c = normalizeContent({ ...DEFAULT_CONTENT, legal: { privacy: { ...DEFAULT_CONTENT.legal.privacy, updated: "kemarin" } } });
    expect(c.legal.privacy.updated).toBe("2026-10-29");
  });

  it("teks dipecah menjadi subjudul, paragraf, dan daftar", () => {
    expect(legalBlocks("Pembuka\nbaris dua\n\n## Data\n- satu\n- dua\nPenutup")).toEqual([
      { kind: "p", text: "Pembuka\nbaris dua" },
      { kind: "h2", text: "Data" },
      { kind: "ul", items: ["satu", "dua"] },
      { kind: "p", text: "Penutup" },
    ]);
  });
});

describe("persetujuan saat daftar dan data akun", () => {
  let t: TestDb;
  let client: string;
  let other: string;

  beforeAll(async () => {
    t = await createTestDb();
    client = await t.signUp("setuju@contoh.test", { full_name: "Budi", phone: "081234567890", terms_version: "privasi 2026-10-29, syarat 2026-10-29" });
    other = await t.signUp("lain@contoh.test", { full_name: "Lain" });
  });
  afterAll(async () => {
    await t?.db.close();
  });

  it("versi dokumen dan waktunya tercatat, juga di log aktivitas", async () => {
    const res = await t.db.query<{ terms_version: string; terms_accepted_at: string | null }>("select terms_version, terms_accepted_at from public.profiles where id = $1", [client]);
    expect(res.rows[0].terms_version).toBe("privasi 2026-10-29, syarat 2026-10-29");
    expect(res.rows[0].terms_accepted_at).not.toBeNull();
    const log = await t.db.query<{ n: number }>("select count(*)::int as n from public.activity_log where action = 'account.terms_accepted' and target_id = $1", [client]);
    expect(log.rows[0].n).toBe(1);
  });

  it("akun buatan admin atau tanpa persetujuan tidak punya catatan", async () => {
    const res = await t.db.query<{ terms_version: string | null }>("select terms_version from public.profiles where id = $1", [other]);
    expect(res.rows[0].terms_version).toBeNull();
  });

  it("pengguna mengubah nama dan nomornya sendiri, tetapi tidak bisa mengubah catatan persetujuan", async () => {
    await t.as(client, "update public.profiles set full_name = 'Budi Baru', phone = '+6281111111111' where id = $1", [client]);
    expect(await t.profile(client)).toMatchObject({ full_name: "Budi Baru", phone: "+6281111111111" });
    await expect(t.as(client, "update public.profiles set terms_version = 'palsu' where id = $1", [client])).rejects.toThrow(/permission denied/);
  });

  it("pengguna tidak bisa mengubah profil orang lain", async () => {
    await t.as(client, "update public.profiles set full_name = 'Diubah' where id = $1", [other]);
    expect((await t.profile(other)).full_name).toBe("Lain");
  });

  it("fungsi pencatat persetujuan tidak bisa dipanggil pengguna", async () => {
    await expect(t.as(client, "select public.record_signup_consent()")).rejects.toThrow();
  });
});
