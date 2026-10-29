import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let shopper: string;
let project: string;
let task: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
type Row = { kind: string; detail: Record<string, unknown> };
const inbox = async (who: string, kind: string) =>
  (await t.db.query<Row>("select kind, detail from public.notifications where user_id = $1 and kind = $2 order by id", [who, kind])).rows;
// Perubahan langsung di tabel atas nama pengguna tertentu (untuk trigger yang memeriksa siapa pelakunya).
async function actingAs(who: string | null, sql: string, params: unknown[] = []) {
  await t.db.query("select set_config('request.jwt.claim.sub', $1, false)", [who ?? ""]);
  try {
    await t.db.query(sql, params);
  } finally {
    await t.db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Bu Client" });
  shopper = await t.signUp("sari@contoh.test", { account_type: "shopper", full_name: "Sari" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [shopper]);
  project = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, outlet_count, status)
       values ('PRJ-N1', $1, '{"name":"Insight"}', 1, 'awaiting_review') returning id`,
      [client],
    )
  ).id;
  const outlet = (await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name) values ($1, 1, 'Jakarta', 'Kopi') returning id", [project])).id;
  task = (
    await one<{ id: string }>(
      `insert into public.audit_tasks (code, project_id, outlet_id, status, window_start, window_end, fee, reimburse_cap, shopper_id)
       values ('TSK-N1', $1, $2, 'offered', current_date, current_date + 3, 100000, 50000, $3) returning id`,
      [project, outlet, shopper],
    )
  ).id;
});

describe("notifikasi untuk admin", () => {
  it("lamaran shopper yang dikirim masuk ke admin aktif", async () => {
    const app = (await one<{ id: string }>("insert into public.shopper_applications (shopper_id) values ($1) returning id", [shopper])).id;
    await t.db.query("update public.shopper_applications set status = 'submitted', submitted_at = now() where id = $1", [app]);
    const rows = await inbox(admin, "admin.application");
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toMatchObject({ application: app, name: "Sari" });
    expect(await inbox(client, "admin.application")).toHaveLength(0);
  });

  it("tawaran yang ditolak dan kedaluwarsa dilaporkan beserta alasannya", async () => {
    await t.db.query("insert into public.task_offers (task_id, shopper_id, respond_by) values ($1, $2, now() + interval '1 day')", [task, shopper]);
    await t.db.query("update public.task_offers set status = 'declined', decline_reason = 'Sedang di luar kota' where task_id = $1", [task]);
    expect((await inbox(admin, "admin.offer_declined"))[0].detail).toMatchObject({ code: "TSK-N1", project, name: "Sari", note: "Sedang di luar kota" });
    await t.db.query("insert into public.task_offers (task_id, shopper_id, respond_by) values ($1, $2, now() - interval '1 minute')", [task, shopper]);
    await t.db.query("select public.expire_offers()");
    expect(await inbox(admin, "admin.offer_expired")).toHaveLength(1);
  });

  it("hasil kunjungan yang dikirim masuk ke admin, revisi yang kedaluwarsa tidak", async () => {
    await t.db.query("update public.audit_tasks set status = 'submitted', submitted_at = now() where id = $1", [task]);
    expect((await inbox(admin, "admin.visit_submitted"))[0].detail).toMatchObject({ task, resubmitted: false });
    await t.db.query("update public.audit_tasks set status = 'revision', revision_due = now() - interval '1 minute' where id = $1", [task]);
    await t.db.query("select public.expire_offers()");
    expect(await inbox(admin, "admin.visit_submitted")).toHaveLength(1);
  });

  it("konsultasi yang dibooking dan digeser client masuk ke admin, perubahan oleh admin tidak", async () => {
    const id = (
      await one<{ id: string }>(
        `insert into public.consultations (code, project_id, client_id, source, minutes, expires_at)
         values ('KNS-N1', $1, $2, 'package', 30, now() + interval '30 days') returning id`,
        [project, client],
      )
    ).id;
    await actingAs(client, "update public.consultations set status = 'scheduled', starts_at = now() + interval '3 days', ends_at = now() + interval '3 days 30 minutes' where id = $1", [id]);
    expect((await inbox(admin, "admin.consultation_booked"))[0].detail).toMatchObject({ consultation: id, name: "Bu Client" });
    await actingAs(client, "update public.consultations set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1", [id]);
    await actingAs(admin, "update public.consultations set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1", [id]);
    expect(await inbox(admin, "admin.consultation_rescheduled")).toHaveLength(1);
  });
});

describe("notifikasi untuk client", () => {
  let invoice: string;

  it("pesanan yang dikonfirmasi admin siap dibayar", async () => {
    await t.db.query("update public.projects set status = 'awaiting_payment' where id = $1", [project]);
    expect((await inbox(client, "order.ready"))[0].detail).toMatchObject({ project, code: "PRJ-N1" });
  });

  it("bukti bayar masuk ke admin; ditolak lalu diverifikasi sampai ke client", async () => {
    invoice = (
      await one<{ id: string }>(
        "insert into public.invoices (code, project_id, client_id, status, total, due_at) values ('INV-N1', $1, $2, 'unpaid', 500000, now() + interval '2 days') returning id",
        [project, client],
      )
    ).id;
    await t.db.query("update public.invoices set status = 'verifying' where id = $1", [invoice]);
    expect((await inbox(admin, "admin.payment"))[0].detail).toMatchObject({ invoice, code: "INV-N1", name: "Bu Client", total: 500000 });
    await t.db.query("update public.invoices set status = 'unpaid', status_note = 'Nominal kurang' where id = $1", [invoice]);
    expect((await inbox(client, "invoice.rejected"))[0].detail).toMatchObject({ code: "INV-N1", note: "Nominal kurang" });
    await t.db.query("update public.invoices set status = 'verifying' where id = $1", [invoice]);
    await t.db.query("update public.invoices set status = 'paid', paid_at = now() where id = $1", [invoice]);
    expect(await inbox(client, "invoice.paid")).toHaveLength(1);
  });

  it("pengingat jatuh tempo dikirim sekali untuk setiap batas waktu", async () => {
    const due = (
      await one<{ id: string }>(
        "insert into public.invoices (code, project_id, client_id, status, kind, total, due_at) values ('INV-N2', $1, $2, 'unpaid', 'consultation', 250000, now() + interval '5 hours') returning id",
        [project, client],
      )
    ).id;
    await t.db.query("insert into public.invoices (code, project_id, client_id, status, kind, total, due_at) values ('INV-N3', $1, $2, 'unpaid', 'consultation', 250000, now() + interval '3 days')", [project, client]);
    expect((await one<{ n: number }>("select public.remind_due_invoices() as n")).n).toBe(1);
    expect((await one<{ n: number }>("select public.remind_due_invoices() as n")).n).toBe(0);
    await t.db.query("update public.invoices set due_at = now() + interval '20 hours' where id = $1", [due]);
    expect((await one<{ n: number }>("select public.remind_due_invoices() as n")).n).toBe(1);
    expect((await inbox(client, "invoice.due_soon")).map((r) => r.detail.code)).toEqual(["INV-N2", "INV-N2"]);
  });

  it("audit mulai berjalan saat shopper pertama menerima tugas, cukup sekali per proyek", async () => {
    await t.db.query("update public.audit_tasks set status = 'offered', shopper_id = $2 where id = $1", [task, shopper]);
    await t.db.query("update public.audit_tasks set status = 'accepted' where id = $1", [task]);
    await t.db.query("update public.audit_tasks set status = 'offered' where id = $1", [task]);
    await t.db.query("update public.audit_tasks set status = 'accepted' where id = $1", [task]);
    expect(await inbox(client, "project.started")).toHaveLength(1);
  });

  it("pesanan yang dibatalkan admin sampai ke client beserta alasannya", async () => {
    await actingAs(admin, "update public.projects set status = 'cancelled', status_note = 'Kota belum terjangkau' where id = $1", [project]);
    expect((await inbox(client, "order.cancelled"))[0].detail).toMatchObject({ note: "Kota belum terjangkau" });
  });
});

describe("membaca notifikasi", () => {
  it("satu notifikasi bisa ditandai dibaca, hanya oleh pemiliknya", async () => {
    const n = await one<{ id: number }>("select id from public.notifications where user_id = $1 order by id limit 1", [client]);
    await t.as(admin, "select public.mark_notification_read($1)", [n.id]);
    expect((await one<{ read_at: Date | null }>("select read_at from public.notifications where id = $1", [n.id])).read_at).toBeNull();
    await t.as(client, "select public.mark_notification_read($1)", [n.id]);
    expect((await one<{ read_at: Date | null }>("select read_at from public.notifications where id = $1", [n.id])).read_at).not.toBeNull();
  });

  it("fungsi pengirim notifikasi tidak bisa dipanggil dari browser", async () => {
    await expect(t.as(client, "select public.notify_admins('admin.payment', '{}')")).rejects.toThrow(/permission denied/);
    expect((await t.as(client, "select 1 from public.notifications where user_id <> $1", [client])).rows).toHaveLength(0);
  });
});

describe("teks notifikasi dan rekening", () => {
  it("setiap jenis notifikasi baru punya teks dan tujuan", async () => {
    const { notificationLink, notificationText } = await import("../src/lib/notification-text");
    const kinds: [string, Record<string, unknown>, string][] = [
      ["admin.application", { application: "a1", name: "Sari" }, "/admin/accounts/applications/a1"],
      ["admin.payment", { project: "p1", code: "INV-1", name: "Bu Client", total: 500000 }, "/admin/projects/p1"],
      ["admin.visit_submitted", { task: "t1", code: "TSK-1" }, "/admin/qc/t1"],
      ["admin.offer_declined", { project: "p1", code: "TSK-1", name: "Sari", note: "Sakit" }, "/admin/projects/p1"],
      ["admin.consultation_booked", { consultation: "k1", code: "KNS-1", name: "Bu Client" }, "/admin/consultations/k1"],
      ["invoice.rejected", { code: "INV-1", note: "Nominal kurang" }, "/app/billing"],
      ["invoice.due_soon", { code: "INV-1", total: 250000, due: "2026-10-30T03:00:00Z" }, "/app/billing"],
      ["order.ready", { code: "PRJ-1" }, "/app/billing"],
      ["project.started", { code: "PRJ-1" }, "/app/audits"],
    ];
    for (const [kind, detail, href] of kinds) {
      const n = { id: 1, kind, detail, read_at: null, created_at: "2026-10-29T03:00:00Z" };
      expect(notificationText(n, "id")).not.toBe(kind);
      expect(notificationLink(n, "id")?.href).toBe(href);
    }
    expect(notificationText({ id: 1, kind: "admin.payment", detail: { code: "INV-1", name: "Bu Client", total: 500000 }, read_at: null, created_at: "" }, "id")).toContain("Rp500.000");
  });

  it("rekening disamarkan: 4 angka terakhir dan inisial nama", async () => {
    const { maskAccountNumber, maskName } = await import("../src/lib/mask");
    expect(maskAccountNumber("1234567890")).toBe("•••• 7890");
    expect(maskName("Budi Santoso Wijaya")).toBe("Budi S*** W***");
    expect(maskName("Sari")).toBe("Sari");
  });
});
