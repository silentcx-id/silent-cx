import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTestDb, type TestDb } from "./db-helpers";
import { EMAIL_KINDS, isEmailKind, notificationEmail } from "../src/lib/email-content";
import { ENGLISH_ENABLED } from "../src/lib/i18n";
import { isCaptchaError } from "../src/lib/auth-errors";
import { errorDigest } from "../src/lib/error-digest";

const n = (kind: string, detail: Record<string, unknown> = {}) => ({ id: 7, kind, detail, read_at: null, created_at: "2026-10-30T03:00:00Z" });

describe("isi email notifikasi", () => {
  it("subjek, sapaan, teks lonceng, dan tautan lengkap ke halaman terkait", () => {
    const m = notificationEmail(n("report.published", { project: "p-1", code: "PRJ-0009" }), "Budi", "https://silentcx.com");
    expect(m.subject).toBe("Laporan audit Anda sudah terbit · SilentCX");
    expect(m.text).toContain("Halo, Budi.");
    expect(m.text).toContain("https://silentcx.com/app/reports/p-1");
    expect(m.html).toContain('href="https://silentcx.com/app/reports/p-1"');
  });

  it("isian dari pengguna di-escape di HTML", () => {
    const m = notificationEmail(n("application.rejected", { note: "<script>alert(1)</script>" }), "<b>Ana</b>", "https://silentcx.com");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("Halo, &lt;b&gt;Ana&lt;/b&gt;.");
  });

  it("hanya kejadian penting yang dikirim lewat email", () => {
    expect(isEmailKind("task.offered")).toBe(true);
    expect(isEmailKind("invoice.due_soon")).toBe(true);
    expect(isEmailKind("admin.payment")).toBe(false);
    expect(isEmailKind("consultation.link")).toBe(false);
  });
});

describe("kotak keluar email di database", () => {
  let t: TestDb;
  let client: string;
  let admin: string;

  beforeAll(async () => {
    t = await createTestDb();
    client = await t.signUp("client@contoh.test", { full_name: "Budi" });
    admin = await t.createAdmin("admin@contoh.test");
  });
  afterAll(async () => {
    await t?.db.close();
  });

  const status = async (user: string, kind: string) => {
    await t.db.query("select public.notify($1, $2, '{}'::jsonb)", [user, kind]);
    const r = await t.db.query<{ email_status: string }>("select email_status from public.notifications where user_id = $1 and kind = $2 order by id desc limit 1", [user, kind]);
    return r.rows[0].email_status;
  };

  it("daftar kejadian email di database sama dengan di aplikasi", async () => {
    const kinds = Object.keys(EMAIL_KINDS);
    for (const k of kinds) expect((await t.db.query<{ ok: boolean }>("select public.is_email_kind($1) as ok", [k])).rows[0].ok, k).toBe(true);
    for (const k of ["admin.payment", "task.withdrawn", "consultation.link", "payout.need_bank"]) expect((await t.db.query<{ ok: boolean }>("select public.is_email_kind($1) as ok", [k])).rows[0].ok, k).toBe(false);
  });

  it("notifikasi penting untuk client masuk antrean email; yang lain tidak", async () => {
    expect(await status(client, "order.ready")).toBe("pending");
    expect(await status(client, "consultation.link")).toBe("none");
  });

  it("admin tidak menerima email", async () => {
    expect(await status(admin, "order.ready")).toBe("none");
  });

  it("pengguna tidak bisa memanggil pemicu pengiriman atau membaca pengaturannya", async () => {
    await expect(t.as(client, "select app_private.dispatch_emails()")).rejects.toThrow();
    await expect(t.as(client, "select * from app_private.settings")).rejects.toThrow();
  });

  it("tanpa alamat pengiriman, pemicu tidak melakukan apa-apa", async () => {
    await expect(t.db.query("select app_private.dispatch_emails()")).resolves.toBeTruthy();
  });
});

describe("pengiriman email lewat /api/email/dispatch", () => {
  it("permintaan tanpa kunci rahasia yang cocok ditolak", async () => {
    process.env.EMAIL_DISPATCH_SECRET = "rahasia-uji-yang-cukup-panjang-123";
    const { POST } = await import("../src/app/api/email/dispatch/route");
    const req = (auth?: string) => ({ headers: new Headers(auth ? { authorization: auth } : {}), nextUrl: new URL("http://localhost/api/email/dispatch") }) as never;
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer salah"))).status).toBe(401);
    delete process.env.RESEND_API_KEY;
    // Kunci benar tetapi Resend belum diisi: tidak mengirim apa pun.
    expect((await POST(req("Bearer rahasia-uji-yang-cukup-panjang-123"))).status).toBe(503);
  });
});

describe("lain-lain sebelum peluncuran", () => {
  it("pilihan bahasa Inggris disembunyikan sampai terjemahan lengkap", () => {
    expect(ENGLISH_ENABLED).toBe(false);
  });

  it("error captcha dari Supabase dikenali", () => {
    expect(isCaptchaError({ code: "captcha_failed", status: 400 })).toBe(true);
    expect(isCaptchaError({ message: "captcha protection: request disallowed (no-captcha-response)" })).toBe(true);
    expect(isCaptchaError({ code: "invalid_credentials" })).toBe(false);
  });

  it("halaman error hanya menampilkan kode error dari server", () => {
    expect(errorDigest(Object.assign(new Error("rahasia"), { digest: "123abc" }))).toBe("123abc");
    expect(errorDigest("bukan error")).toBe("");
  });
});
