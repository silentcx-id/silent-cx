import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { chatHoursLabel, normalizeChatSettings } from "../src/lib/chat";
import { isEmailKind } from "../src/lib/email-content";
import { notificationLink, notificationText } from "../src/lib/notification-text";
import { DEFAULT_CONTENT, normalizeContent } from "../src/lib/site-content";

let t: TestDb;
let admin: string;
let client: string;
let shopper: string;
let other: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
const inbox = async (who: string, kind: string) =>
  (await t.db.query<{ id: number; detail: Record<string, string>; read_at: string | null; email_status: string; email_not_before: string | null }>(
    "select id, detail, read_at, email_status, email_not_before from public.notifications where user_id = $1 and kind = $2 order by id",
    [who, kind],
  )).rows;
// Jam kerja selalu buka atau selalu tutup, supaya tes tidak bergantung jam sekarang.
const hours = (open: boolean) =>
  t.db.query("update public.app_settings set value = value || $1::jsonb where key = 'chat'", [JSON.stringify(open ? { days: [1, 2, 3, 4, 5, 6, 7], start: "00:00", end: "23:59" } : { days: [] })]);
const send = (who: string, body: string, attachment: string | null = null) => t.as<{ id: number }>(who, "select public.chat_send($1, $2) as id", [body, attachment]).then((r) => r.rows[0].id);
const reply = (thread: string, body: string, who = admin) => t.as<{ id: number }>(who, "select public.admin_chat_send($1, $2) as id", [thread, body]).then((r) => r.rows[0].id);
const threadOf = (user: string) =>
  one<{ id: string; admin_unread: number; user_unread: number; status: string; last_message: string; admin_read_at: string | null }>("select * from public.chat_threads where user_id = $1", [user]);
const messagesOf = (thread: string) => t.db.query<{ from_admin: boolean; auto: boolean; body: string }>("select from_admin, auto, body from public.chat_messages where thread_id = $1 order by id", [thread]).then((r) => r.rows);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Bu Client" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [client]);
  shopper = await t.signUp("sari@contoh.test", { account_type: "shopper", full_name: "Sari" });
  other = await t.signUp("lain@contoh.test", { full_name: "Client Lain" });
});

describe("landing: Fitur platform, Bisnis yang kami layani, Mitra kami", () => {
  it("tiga bagian baru ada dengan isi bawaan; dokumen lama mendapatkannya di posisi bawaan", () => {
    expect(DEFAULT_CONTENT.sections.features.items.map((x) => x.title.id)).toEqual(["Check-in GPS dan bukti foto", "Benchmark outlet", "Konsultasi", "Live chat Sisca"]);
    expect(DEFAULT_CONTENT.sections.industries.items).toHaveLength(8);
    expect(DEFAULT_CONTENT.sections.partners.items).toHaveLength(0);
    const c = normalizeContent({ order: ["hero", "audited", "why", "testimonials", "faq"], sections: {} });
    expect(c.order.indexOf("features")).toBe(c.order.indexOf("audited") + 1);
    expect(c.order.indexOf("industries")).toBe(c.order.indexOf("features") + 1);
    expect(c.order.indexOf("why")).toBe(c.order.indexOf("industries") + 1);
    expect(c.order.indexOf("partners")).toBe(c.order.indexOf("testimonials") + 1);
  });

  it("butir yang disembunyikan tersimpan, butir lama dianggap tampil", () => {
    const c = normalizeContent({ sections: { features: { visible: true, title: { id: "Fitur", en: "" }, items: [{ title: { id: "A", en: "" }, hidden: true }, { title: { id: "B", en: "" } }] } } });
    expect(c.sections.features.items.map((x) => x.hidden)).toEqual([true, false]);
  });

  // Tampilan di landing (butir tersembunyi, Mitra kami tanpa logo) dicek di tests/e2e/putaran11-landing-chat.mjs.
});

describe("daftar akun: shopper yang belum mengirim lamaran disembunyikan", () => {
  it("shopper tanpa lamaran terkirim tidak muncul; yang sudah mengirim muncul", async () => {
    const draft = await t.signUp("draf@contoh.test", { account_type: "shopper", full_name: "Masih Draf" });
    await t.db.query("insert into public.shopper_applications (shopper_id, status) values ($1, 'draft')", [draft]);
    const sent = await t.signUp("kirim@contoh.test", { account_type: "shopper", full_name: "Sudah Kirim" });
    await t.db.query("insert into public.shopper_applications (shopper_id, status, submitted_at) values ($1, 'submitted', now())", [sent]);
    const names = (await t.as<{ full_name: string }>(admin, "select full_name from public.admin_list_accounts(p_role => 'shopper', p_limit => 100)")).rows.map((r) => r.full_name);
    expect(names).toContain("Sudah Kirim");
    expect(names).not.toContain("Masih Draf");
    expect(names).not.toContain("Sari");
    const all = (await t.as<{ full_name: string }>(admin, "select full_name from public.admin_list_accounts(p_limit => 100)")).rows.map((r) => r.full_name);
    expect(all).toContain("Bu Client");
    expect(all).not.toContain("Masih Draf");
  });
});

describe("email admin untuk bukti bayar", () => {
  it("bukti bayar mengantre email ke admin; notifikasi admin lain tetap tanpa email", async () => {
    expect(isEmailKind("admin.payment")).toBe(true);
    await t.db.query("select public.notify_admins('admin.payment', '{\"code\":\"INV-0001\",\"total\":1399000,\"name\":\"Bu Client\",\"project\":\"p1\"}'::jsonb)");
    await t.db.query("select public.notify_admins('admin.application', '{\"name\":\"Sari\"}'::jsonb)");
    expect((await inbox(admin, "admin.payment"))[0].email_status).toBe("pending");
    expect((await inbox(admin, "admin.application"))[0].email_status).toBe("none");
    // Jenis admin.* tidak pernah dikirim ke email client atau shopper.
    await t.db.query("insert into public.notifications (user_id, kind) values ($1, 'admin.payment')", [client]);
    expect((await inbox(client, "admin.payment"))[0].email_status).toBe("none");
  });
});

describe("live chat Sisca", () => {
  it("client menulis: percakapan dibuat, admin diberi tahu sekali untuk rangkaian pesan yang belum dibaca", async () => {
    await hours(true);
    await send(client, "Halo, kapan laporan saya terbit?");
    await send(client, "Proyek PRJ-0001");
    const th = await threadOf(client);
    expect(th).toMatchObject({ admin_unread: 2, status: "open", last_message: "Proyek PRJ-0001" });
    const notes = await inbox(admin, "admin.chat");
    expect(notes).toHaveLength(1);
    expect(notes[0].detail).toMatchObject({ thread: th.id, name: "Bu Client", preview: "Halo, kapan laporan saya terbit?" });
    expect(notificationText({ id: 1, kind: "admin.chat", detail: notes[0].detail, read_at: null, created_at: "" }, "id")).toContain("Bu Client mengirim pesan");
    expect(notificationLink({ id: 1, kind: "admin.chat", detail: notes[0].detail, read_at: null, created_at: "" }, "id")?.href).toBe(`/admin/chat?t=${th.id}`);
  });

  it("admin membalas sebagai Sisca: pengguna diberi tahu, email ditunda 5 menit dan batal kalau sudah dibaca", async () => {
    const th = await threadOf(client);
    await reply(th.id, "Halo Bu, laporan terbit Jumat ini.");
    await reply(th.id, "Ada lagi yang bisa dibantu?");
    const after = await threadOf(client);
    expect(after).toMatchObject({ admin_unread: 0, user_unread: 2 });
    expect(after.admin_read_at).not.toBeNull();
    expect((await inbox(admin, "admin.chat")).every((n) => n.read_at)).toBe(true);
    const notes = await inbox(client, "chat.reply");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ email_status: "pending" });
    const wait = (new Date(notes[0].email_not_before!).getTime() - Date.now()) / 60_000;
    expect(wait).toBeGreaterThan(4.5);
    expect(notificationLink({ id: 1, kind: "chat.reply", detail: notes[0].detail, read_at: null, created_at: "" }, "id")?.href).toBe("/app?chat=1");

    await t.as(client, "select public.chat_mark_read()");
    expect((await threadOf(client)).user_unread).toBe(0);
    expect((await inbox(client, "chat.reply"))[0]).toMatchObject({ email_status: "skipped" });
    expect((await inbox(client, "chat.reply"))[0].read_at).not.toBeNull();
  });

  it("di luar jam kerja: balasan otomatis sekali sampai admin membalas", async () => {
    await hours(false);
    await send(shopper, "Halo, tugas saya belum muncul");
    await send(shopper, "Mohon dicek");
    const th = await threadOf(shopper);
    let msgs = await messagesOf(th.id);
    expect(msgs.filter((m) => m.auto)).toHaveLength(1);
    expect(msgs[1]).toMatchObject({ from_admin: true, auto: true });
    expect(msgs[1].body).toContain("di luar jam kerja");
    await reply(th.id, "Sudah kami cek.");
    await send(shopper, "Terima kasih");
    msgs = await messagesOf(th.id);
    expect(msgs.filter((m) => m.auto)).toHaveLength(2);
    expect((await inbox(shopper, "chat.reply"))[0].detail.home).toBe("/shopper");
    await hours(true);
  });

  it("pengguna hanya melihat percakapannya sendiri; admin melihat semua", async () => {
    await send(other, "Pesan rahasia client lain");
    const mine = (await t.as<{ body: string }>(client, "select body from public.chat_messages")).rows.map((r) => r.body);
    expect(mine).toContain("Halo, kapan laporan saya terbit?");
    expect(mine).not.toContain("Pesan rahasia client lain");
    expect((await t.as(client, "select id from public.chat_threads")).rows).toHaveLength(1);
    expect((await t.as(admin, "select id from public.chat_threads")).rows.length).toBeGreaterThanOrEqual(3);
  });

  it("pesan hanya lewat fungsi: tabel tidak bisa ditulis langsung, client tidak bisa membalas sebagai Sisca", async () => {
    const th = await threadOf(client);
    expect(await fails(t.as(client, "insert into public.chat_messages (thread_id, from_admin, body) values ($1, true, 'palsu')", [th.id]))).toMatch(/permission denied/);
    expect(await fails(t.as(client, "update public.chat_threads set admin_unread = 0"))).toMatch(/permission denied/);
    expect(await fails(reply(th.id, "Saya Sisca palsu", client))).toMatch(/Hanya admin/);
    expect(await fails(t.as(admin, "select public.chat_send('admin tidak menulis sebagai pengguna')"))).toMatch(/hanya untuk client dan shopper/);
  });

  it("lampiran harus di folder milik pengirim; pesan kosong dan terlalu panjang ditolak", async () => {
    expect(await fails(send(client, "", `${other}/foto.jpg`))).toMatch(/Lampiran tidak valid/);
    expect(await send(client, "", `${client}/foto.jpg`)).toBeGreaterThan(0);
    expect((await threadOf(client)).last_message).toBe("📷 Foto");
    expect(await fails(send(client, "   "))).toMatch(/Tulis pesan atau lampirkan foto/);
    expect(await fails(send(client, "x".repeat(2001)))).toMatch(/maksimal 2.000/);
    const th = await threadOf(client);
    expect(await fails(t.as(admin, "select public.admin_chat_send($1, '', $2)", [th.id, `admin/${(await threadOf(other)).id}/x.jpg`]))).toMatch(/Lampiran tidak valid/);
    expect(await t.as(admin, "select public.admin_chat_send($1, '', $2)", [th.id, `admin/${th.id}/x.jpg`]).then(() => "ok")).toBe("ok");
  });

  it("maksimal 20 pesan per menit per pengguna", async () => {
    const spam = await t.signUp("spam@contoh.test", { full_name: "Spam" });
    for (let i = 0; i < 20; i++) await send(spam, `pesan ${i}`);
    expect(await fails(send(spam, "satu lagi"))).toMatch(/Terlalu banyak pesan/);
  });

  it("admin menandai selesai; pesan baru dari pengguna membukanya lagi", async () => {
    const th = await threadOf(other);
    await t.as(admin, "select public.admin_chat_set_status($1, 'closed')", [th.id]);
    expect(await threadOf(other)).toMatchObject({ status: "closed", admin_unread: 0 });
    await send(other, "Masih ada pertanyaan");
    expect(await threadOf(other)).toMatchObject({ status: "open", admin_unread: 1 });
    expect(await fails(t.as(client, "select public.admin_chat_set_status($1, 'closed')", [th.id]))).toMatch(/Hanya admin/);
  });

  it("jam kerja: label dari pengaturan dan pengecekan jam WIB", async () => {
    expect(chatHoursLabel(normalizeChatSettings({ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }))).toBe("Senin–Jumat, 09.00–17.00 WIB");
    expect(chatHoursLabel(normalizeChatSettings({ days: [6, 7], start: "10:00", end: "14:00" }))).toBe("Sabtu, Minggu, 10.00–14.00 WIB");
    await t.db.query("update public.app_settings set value = value || '{\"days\":[1,2,3,4,5],\"start\":\"09:00\",\"end\":\"17:00\"}'::jsonb where key = 'chat'");
    const open = async (iso: string) => (await one<{ ok: boolean }>("select public.chat_is_open($1::timestamptz) as ok", [iso])).ok;
    expect(await open("2026-11-02T02:00:00Z")).toBe(true); // Senin 09.00 WIB
    expect(await open("2026-11-02T01:59:00Z")).toBe(false); // Senin 08.59 WIB
    expect(await open("2026-11-06T09:59:00Z")).toBe(true); // Jumat 16.59 WIB
    expect(await open("2026-11-06T10:00:00Z")).toBe(false); // Jumat 17.00 WIB
    expect(await open("2026-11-07T03:00:00Z")).toBe(false); // Sabtu
  });
});
