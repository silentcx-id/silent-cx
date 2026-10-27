import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let otherClient: string;
let shopper: string;

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("Client@Contoh.test", { full_name: "Budi Client", phone: "+6281234567890" });
  otherClient = await t.signUp("lain@contoh.test", { full_name: "Client Lain" });
  shopper = await t.signUp("shopper@contoh.test", { account_type: "shopper", full_name: "Sari Shopper" });
});

describe("pendaftaran akun", () => {
  it("client baru langsung aktif dengan email huruf kecil", async () => {
    expect(await t.profile(client)).toMatchObject({ role: "client", status: "active", email: "client@contoh.test", full_name: "Budi Client", phone: "+6281234567890" });
  });

  it("shopper baru menunggu seleksi", async () => {
    expect(await t.profile(shopper)).toMatchObject({ role: "shopper", status: "pending" });
  });

  it("tidak bisa mendaftar sebagai admin lewat metadata browser", async () => {
    const id = await t.signUp("nakal@contoh.test", { account_type: "admin", role: "admin" });
    expect(await t.profile(id)).toMatchObject({ role: "client", status: "active" });
  });

  it("admin hanya lewat app_metadata dari server", async () => {
    expect(await t.profile(admin)).toMatchObject({ role: "admin", status: "active" });
  });

  it("app_metadata yang langsung ada saat akun dibuat juga dikenali", async () => {
    const id = await t.signUp("langsung@silentcx.test", {}, { provisioned_role: "admin" });
    expect(await t.profile(id)).toMatchObject({ role: "admin", status: "active" });
  });

  it("shopper hasil provisioning langsung aktif dan tercatat di log", async () => {
    const id = await t.provision("shopper-aktif@contoh.test", "shopper", { account_type: "shopper" });
    expect(await t.profile(id)).toMatchObject({ role: "shopper", status: "active" });
    const log = await t.db.query<{ n: number }>("select count(*)::int as n from public.activity_log where action = 'account.provisioned' and target_id = $1", [id]);
    expect(log.rows[0].n).toBe(1);
  });

  it("perubahan app_metadata lain tidak mengubah role", async () => {
    const id = await t.signUp("biasa@contoh.test");
    await t.db.query("update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"providers\":[\"email\"]}'::jsonb where id = $1", [id]);
    expect(await t.profile(id)).toMatchObject({ role: "client", status: "active" });
  });

  it("provisioning tidak mengaktifkan ulang akun admin yang ditangguhkan lewat update lain", async () => {
    const id = await t.provision("admin-x@silentcx.test", "admin");
    await t.db.query("update public.profiles set status = 'suspended' where id = $1", [id]);
    await t.db.query("update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"note\":\"x\"}'::jsonb where id = $1", [id]);
    expect((await t.profile(id)).status).toBe("suspended");
  });

  it("nomor WhatsApp tidak valid diabaikan, bukan menggagalkan pendaftaran", async () => {
    const id = await t.signUp("wa@contoh.test", { phone: "bukan nomor" });
    expect((await t.profile(id)).phone).toBeNull();
  });

  it("pendaftaran tercatat di log aktivitas", async () => {
    const res = await t.db.query<{ n: number }>("select count(*)::int as n from public.activity_log where action = 'account.created' and target_id = $1", [shopper]);
    expect(res.rows[0].n).toBe(1);
  });
});

describe("role dan status dikunci", () => {
  it("pemilik tidak bisa mengubah role-nya sendiri", async () => {
    await expect(t.as(client, "update public.profiles set role = 'admin' where id = $1", [client])).rejects.toThrow(/permission denied/);
    expect((await t.profile(client)).role).toBe("client");
  });

  it("shopper pending tidak bisa mengaktifkan dirinya sendiri", async () => {
    await expect(t.as(shopper, "update public.profiles set status = 'active' where id = $1", [shopper])).rejects.toThrow(/permission denied/);
    expect((await t.profile(shopper)).status).toBe("pending");
  });

  it("pemilik bisa mengubah nama, WhatsApp, dan bahasa", async () => {
    await t.as(client, "update public.profiles set full_name = 'Budi Santoso', locale = 'en' where id = $1", [client]);
    expect((await t.profile(client)).full_name).toBe("Budi Santoso");
  });

  it("pengguna tidak bisa mengubah profil orang lain", async () => {
    await t.as(client, "update public.profiles set full_name = 'Diubah' where id = $1", [otherClient]);
    expect((await t.profile(otherClient)).full_name).toBe("Client Lain");
  });

  it("tidak ada yang bisa membuat atau menghapus profil dari browser", async () => {
    await expect(t.as(client, "delete from public.profiles where id = $1", [client])).rejects.toThrow(/permission denied/);
    await expect(t.as(admin, "delete from public.profiles where id = $1", [otherClient])).rejects.toThrow(/permission denied/);
  });
});

describe("siapa melihat apa", () => {
  it("client hanya melihat profilnya sendiri", async () => {
    const res = await t.as<{ id: string }>(client, "select id from public.profiles");
    expect(res.rows.map((r) => r.id)).toEqual([client]);
  });

  it("pengunjung tanpa login tidak melihat profil apa pun", async () => {
    await expect(t.as(null, "select id from public.profiles")).rejects.toThrow(/permission denied/);
  });

  it("admin melihat semua profil", async () => {
    const res = await t.as<{ n: number }>(admin, "select count(*)::int as n from public.profiles");
    expect(res.rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it("log aktivitas hanya untuk admin", async () => {
    expect((await t.as(client, "select id from public.activity_log")).rows).toHaveLength(0);
    expect((await t.as(admin, "select id from public.activity_log")).rows.length).toBeGreaterThan(0);
    await expect(t.as(client, "insert into public.activity_log (action, target_type, target_id) values ('palsu', 'x', 'y')")).rejects.toThrow(/permission denied/);
  });

  it("fungsi pencatat log tidak bisa dipanggil dari browser", async () => {
    await expect(t.as(client, "select public.log_activity('palsu', 'x', 'y')")).rejects.toThrow(/permission denied/);
  });

  it("my_role mengenali role pengguna yang sedang masuk", async () => {
    expect((await t.as<{ r: string }>(shopper, "select public.my_role()::text as r")).rows[0].r).toBe("shopper");
    expect((await t.as<{ r: string | null }>(null, "select public.my_role()::text as r")).rows[0].r).toBeNull();
  });
});

describe("admin mengubah status akun", () => {
  const setStatus = (actor: string, user: string, status: string, note: string | null = null) =>
    t.as(actor, "select public.admin_set_account_status($1, $2::public.account_status, $3)", [user, status, note]);

  it("selain admin ditolak", async () => {
    await expect(setStatus(client, shopper, "active")).rejects.toThrow(/Hanya admin/);
    await expect(setStatus(shopper, shopper, "active")).rejects.toThrow(/Hanya admin/);
  });

  it("menolak shopper wajib dengan alasan", async () => {
    await expect(setStatus(admin, shopper, "rejected")).rejects.toThrow(/Alasan wajib/);
  });

  it("admin menyetujui shopper dan tercatat di log", async () => {
    await setStatus(admin, shopper, "active");
    expect(await t.profile(shopper)).toMatchObject({ status: "active", status_note: null });
    const log = await t.db.query<{ actor_id: string; detail: { from: string; to: string } }>(
      "select actor_id, detail from public.activity_log where action = 'account.status_changed' and target_id = $1",
      [shopper],
    );
    expect(log.rows[0]).toMatchObject({ actor_id: admin, detail: { from: "pending", to: "active" } });
  });

  it("menangguhkan menyimpan alasan, mengaktifkan kembali menghapusnya", async () => {
    await setStatus(admin, shopper, "suspended", "Laporan tidak sesuai bukti");
    expect(await t.profile(shopper)).toMatchObject({ status: "suspended", status_note: "Laporan tidak sesuai bukti" });
    await setStatus(admin, shopper, "active");
    expect(await t.profile(shopper)).toMatchObject({ status: "active", status_note: null });
  });

  it("transisi yang tidak sah ditolak", async () => {
    await expect(setStatus(admin, client, "pending")).rejects.toThrow(/tidak diizinkan/);
    await expect(setStatus(admin, client, "rejected", "x")).rejects.toThrow(/tidak diizinkan/);
  });

  it("admin tidak bisa mengubah akunnya sendiri atau admin lain", async () => {
    const admin2 = await t.createAdmin("admin2@silentcx.test");
    await expect(setStatus(admin, admin, "suspended", "x")).rejects.toThrow(/sendiri/);
    await expect(setStatus(admin, admin2, "suspended", "x")).rejects.toThrow(/akun admin/);
  });

  it("akun yang ditangguhkan kehilangan aksesnya", async () => {
    await setStatus(admin, otherClient, "suspended", "Pembayaran bermasalah");
    expect((await t.as<{ r: string | null }>(otherClient, "select public.my_role()::text as r")).rows[0].r).toBeNull();
    await setStatus(admin, otherClient, "active");
  });

  it("admin yang ditangguhkan bukan admin lagi", async () => {
    const admin3 = await t.createAdmin("admin3@silentcx.test");
    await t.db.query("update public.profiles set status = 'suspended' where id = $1", [admin3]);
    await expect(setStatus(admin3, client, "suspended", "x")).rejects.toThrow(/Hanya admin/);
    expect((await t.as(admin3, "select id from public.profiles")).rows).toHaveLength(1);
  });
});
