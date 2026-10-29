import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let other: string;
let insight: string;
let essential: string;
let windowId: string;

type Consultation = { id: string; source: string; minutes: number; status: string; expires_at: string; starts_at: Date | null; reschedule_count: number; meeting_url: string };

const fails = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
// Tanggal WIB tiga hari dari sekarang, supaya jam-jamnya selalu lebih dari 24 jam ke depan.
const day = new Date(Date.now() + 7 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
const at = (hm: string, d = day) => new Date(`${d}T${hm}:00+07:00`).toISOString();
const mine = async (who: string, project?: string) =>
  (await t.as<Consultation>(who, `select * from public.consultations ${project ? "where project_id = $1" : ""} order by source desc, minutes, code`, project ? [project] : [])).rows;
const openTimes = async (minutes: number) =>
  (await t.as<{ starts_at: string }>(client, "select starts_at from public.consultation_open_times($1, $2, $3)", [minutes, at("00:00"), at("23:59")])).rows.map((r) =>
    new Date(r.starts_at).toISOString(),
  );
const notifications = async (who: string, kind: string) => (await t.db.query("select 1 from public.notifications where user_id = $1 and kind = $2", [who, kind])).rows.length;

async function project(who: string, pkg: string, extra: number, status = "completed") {
  const p = await one<{ id: string; entitlements: string[] }>("select id, entitlements from public.packages where key = $1", [pkg]);
  const addons = extra ? [{ item_key: "additional_consultation", label: "Konsultasi tambahan", quantity: extra }] : [];
  return (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_id, package_snapshot, addons_snapshot, outlet_count, entitlements, status)
       values ($1, $2, $3, $4, $5, 1, $6, $7) returning id`,
      [`PRJ-${pkg}-${Math.random().toString(36).slice(2, 6)}`, who, p.id, JSON.stringify({ key: pkg, name: pkg }), JSON.stringify(addons), p.entitlements, status],
    )
  ).id;
}

async function publish(projectId: string) {
  await t.db.query("insert into public.reports (project_id) values ($1)", [projectId]);
  await t.db.query("update public.reports set status = 'published', published_at = now() where project_id = $1", [projectId]);
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  other = await t.signUp("lain@contoh.test", { full_name: "Client lain" });
  insight = await project(client, "insight", 1);
  essential = await project(other, "essential", 0);
});

describe("jatah sesi", () => {
  it("durasi bawaan paket: Essential tidak dapat sesi, Insight 30 menit, Performance 60 menit", async () => {
    const rows = (await t.db.query<{ key: string; consultation_minutes: number; features: string[] }>("select key, consultation_minutes, features from public.packages")).rows;
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.essential.consultation_minutes).toBe(0);
    expect(by.insight.consultation_minutes).toBe(30);
    expect(by.performance.consultation_minutes).toBe(60);
    expect(by.essential.features).not.toContain("Debrief hasil 15 menit");
    expect(by.performance.features).toContain("Konsultasi 60 menit");
  });

  it("laporan terbit memberi jatah paket dan add-on pesanan, berlaku 30 hari", async () => {
    expect(await mine(client)).toHaveLength(0);
    await publish(insight);
    const rows = await mine(client, insight);
    expect(rows.map((r) => [r.source, r.minutes, r.status])).toEqual([
      ["package", 30, "available"],
      ["addon", 60, "available"],
    ]);
    const days = (new Date(rows[0].expires_at).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("jatah tidak terbuat dua kali untuk proyek yang sama", async () => {
    await t.db.query("select public.grant_report_consultations($1, now())", [insight]);
    expect(await mine(client, insight)).toHaveLength(2);
  });

  it("paket Essential tanpa add-on tidak mendapat jatah", async () => {
    await publish(essential);
    expect(await mine(other)).toHaveLength(0);
  });

  it("client lain tidak bisa melihat konsultasi client ini", async () => {
    expect(await mine(other, insight)).toHaveLength(0);
  });
});

describe("jadwal kosong admin", () => {
  it("hanya admin yang bisa membuka jadwal", async () => {
    expect(await fails(t.as(client, "select public.admin_add_consultation_window($1, $2)", [at("09:00"), at("11:00")]))).toMatch(/Hanya admin/);
  });

  it("jam harus kelipatan 30 menit dan tidak bertumpuk", async () => {
    expect(await fails(t.as(admin, "select public.admin_add_consultation_window($1, $2)", [at("09:15"), at("11:00")]))).toMatch(/setengah jam/);
    windowId = (await t.as<{ id: string }>(admin, "select public.admin_add_consultation_window($1, $2) as id", [at("09:00"), at("11:00")])).rows[0].id;
    expect(await fails(t.as(admin, "select public.admin_add_consultation_window($1, $2)", [at("10:30"), at("12:00")]))).toMatch(/bertumpuk/);
  });

  it("client tidak membaca tabel jadwal kosong secara langsung", async () => {
    expect((await t.as(client, "select * from public.consultation_windows")).rows).toHaveLength(0);
  });

  it("jam mulai yang ditawarkan menyesuaikan durasi sesi", async () => {
    expect(await openTimes(30)).toEqual([at("09:00"), at("09:30"), at("10:00"), at("10:30")]);
    expect(await openTimes(60)).toEqual([at("09:00"), at("09:30"), at("10:00")]);
  });
});

describe("booking client", () => {
  it("jam di luar jadwal kosong atau tidak tepat setengah jam ditolak", async () => {
    const [short] = await mine(client, insight);
    expect(await fails(t.as(client, "select public.client_book_consultation($1, $2, '')", [short.id, at("13:00")]))).toMatch(/tidak tersedia/);
    expect(await fails(t.as(client, "select public.client_book_consultation($1, $2, '')", [short.id, at("09:10")]))).toMatch(/setengah jam/);
  });

  it("client tidak bisa memakai jatah client lain", async () => {
    const [short] = await mine(client, insight);
    expect(await fails(t.as(other, "select public.client_book_consultation($1, $2, '')", [short.id, at("09:00")]))).toMatch(/tidak ditemukan/);
  });

  it("booking menutup jam yang bertumpuk untuk semua client", async () => {
    const [short] = await mine(client, insight);
    await t.as(client, "select public.client_book_consultation($1, $2, 'Bahas temuan kasir')", [short.id, at("09:30")]);
    expect((await mine(client, insight))[0]).toMatchObject({ status: "scheduled", starts_at: new Date(at("09:30")) });
    expect(await openTimes(60)).toEqual([at("10:00")]);
    const [, long] = await mine(client, insight);
    expect(await fails(t.as(client, "select public.client_book_consultation($1, $2, '')", [long.id, at("09:00")]))).toMatch(/terisi/);
  });

  it("jatah yang kedaluwarsa tidak bisa dibooking, dan sesi harus selesai sebelum jatah berakhir", async () => {
    const [, long] = await mine(client, insight);
    await t.db.query("update public.consultations set expires_at = now() - interval '1 hour' where id = $1", [long.id]);
    expect(await fails(t.as(client, "select public.client_book_consultation($1, $2, '')", [long.id, at("10:00")]))).toMatch(/kedaluwarsa/);
    await t.db.query("update public.consultations set expires_at = $2 where id = $1", [long.id, at("10:30")]);
    expect(await fails(t.as(client, "select public.client_book_consultation($1, $2, '')", [long.id, at("10:00")]))).toMatch(/sebelum jatah berakhir/);
    await t.db.query("update public.consultations set expires_at = now() + interval '30 days' where id = $1", [long.id]);
  });

  it("client menggeser jadwal satu kali saja", async () => {
    const [short] = await mine(client, insight);
    await t.as(client, "select public.client_reschedule_consultation($1, $2)", [short.id, at("10:30")]);
    expect((await mine(client, insight))[0]).toMatchObject({ reschedule_count: 1 });
    expect(await fails(t.as(client, "select public.client_reschedule_consultation($1, $2)", [short.id, at("09:00")]))).toMatch(/sudah pernah digeser/);
  });

  it("menggeser kurang dari 24 jam sebelum sesi ditolak", async () => {
    const [, long] = await mine(client, insight);
    await t.as(client, "select public.client_book_consultation($1, $2, '')", [long.id, at("09:00")]);
    await t.db.query("update public.consultations set starts_at = now() + interval '10 hours', ends_at = now() + interval '11 hours' where id = $1", [long.id]);
    expect(await fails(t.as(client, "select public.client_reschedule_consultation($1, $2)", [long.id, at("10:00")]))).toMatch(/24 jam sebelum sesi/);
  });
});

describe("sesi oleh admin", () => {
  it("link meeting wajib https dan memberi tahu client", async () => {
    const [short] = await mine(client, insight);
    expect(await fails(t.as(admin, "select public.admin_set_consultation_link($1, 'meet.google.com/abc')", [short.id]))).toMatch(/https/);
    await t.as(admin, "select public.admin_set_consultation_link($1, 'https://meet.google.com/abc-defg-hij')", [short.id]);
    expect((await mine(client, insight))[0].meeting_url).toBe("https://meet.google.com/abc-defg-hij");
    expect(await notifications(client, "consultation.link")).toBe(1);
  });

  it("admin menggeser dengan alasan, tanpa mengurangi kesempatan client", async () => {
    const [short] = await mine(client, insight);
    expect(await fails(t.as(admin, "select public.admin_reschedule_consultation($1, $2, '')", [short.id, at("14:00")]))).toMatch(/Alasan wajib/);
    await t.as(admin, "select public.admin_reschedule_consultation($1, $2, 'Konsultan berhalangan')", [short.id, at("14:00")]);
    expect((await mine(client, insight))[0]).toMatchObject({ reschedule_count: 1, starts_at: new Date(at("14:00")) });
    expect(await notifications(client, "consultation.rescheduled")).toBe(1);
  });

  it("rentang yang berisi sesi tidak bisa dihapus", async () => {
    await t.db.query("update public.consultations set starts_at = $2, ends_at = $3 where id = $1", [(await mine(client, insight))[0].id, at("09:30"), at("10:00")]);
    expect(await fails(t.as(admin, "select public.admin_delete_consultation_window($1)", [windowId]))).toMatch(/Masih ada sesi/);
  });

  it("membatalkan sesi mengembalikan jatah dan memperpanjangnya minimal 7 hari", async () => {
    const [short] = await mine(client, insight);
    await t.db.query("update public.consultations set expires_at = now() + interval '1 day' where id = $1", [short.id]);
    await t.as(admin, "select public.admin_cancel_consultation($1, 'Client minta dibatalkan')", [short.id]);
    const row = (await mine(client, insight))[0];
    expect(row).toMatchObject({ status: "available", starts_at: null, meeting_url: "", reschedule_count: 0 });
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400_000);
    await t.as(admin, "select public.admin_delete_consultation_window($1)", [windowId]);
  });

  it("sesi baru bisa ditutup setelah dimulai; selesai wajib berisi ringkasan", async () => {
    const [, long] = await mine(client, insight);
    await t.db.query("update public.consultations set starts_at = now() + interval '1 day', ends_at = now() + interval '25 hours' where id = $1", [long.id]);
    expect(await fails(t.as(admin, "select public.admin_complete_consultation($1, 'done', 'Ringkasan', '')", [long.id]))).toMatch(/belum dimulai/);
    await t.db.query("update public.consultations set starts_at = now() - interval '1 hour', ends_at = now() where id = $1", [long.id]);
    expect(await fails(t.as(admin, "select public.admin_complete_consultation($1, 'done', '  ', '')", [long.id]))).toMatch(/Ringkasan sesi wajib/);
    await t.as(admin, "select public.admin_complete_consultation($1, 'done', 'Fokus ke sapaan kasir.', 'Briefing pagi tiap Senin.')", [long.id]);
    expect((await mine(client, insight))[1]).toMatchObject({ status: "done" });
    expect(await notifications(client, "consultation.done")).toBe(1);
  });
});

describe("membeli sesi tambahan", () => {
  it("hanya setelah laporan proyek terbit", async () => {
    const running = await project(client, "insight", 0, "active");
    expect(await fails(t.as(client, "select public.client_buy_consultation($1, 1)", [running]))).toMatch(/setelah laporan/);
  });

  it("membuat tagihan dan menambah jatah setelah pembayaran diverifikasi", async () => {
    const invoice = (await t.as<{ id: string }>(other, "select public.client_buy_consultation($1, 2) as id", [essential])).rows[0].id;
    const inv = await one<{ total: number; kind: string; status: string }>("select total, kind, status from public.invoices where id = $1", [invoice]);
    expect(inv).toEqual({ total: 998000, kind: "consultation", status: "unpaid" });
    expect(await fails(t.as(other, "select public.client_buy_consultation($1, 1)", [essential]))).toMatch(/belum selesai/);

    await t.as(other, "select public.submit_payment_proof($1, 'transfer', $2, 998000, 'Client lain')", [invoice, `${other}/${invoice}/bukti.jpg`]);
    expect((await one<{ status: string }>("select status from public.projects where id = $1", [essential])).status).toBe("completed");
    await t.as(admin, "select public.admin_verify_payment($1, true, null)", [invoice]);
    const rows = await mine(other, essential);
    expect(rows.map((r) => [r.source, r.minutes, r.status])).toEqual([
      ["purchase", 60, "available"],
      ["purchase", 60, "available"],
    ]);
    expect(await notifications(other, "consultation.credited")).toBe(1);
  });

  it("tagihan konsultasi yang tidak dibayar 2x24 jam kedaluwarsa", async () => {
    const invoice = (await t.as<{ id: string }>(other, "select public.client_buy_consultation($1, 1) as id", [essential])).rows[0].id;
    await t.db.query("update public.invoices set due_at = now() - interval '1 minute' where id = $1", [invoice]);
    await t.as(other, "select public.expire_overdue()");
    expect((await one<{ status: string }>("select status from public.invoices where id = $1", [invoice])).status).toBe("expired");
    expect((await one<{ status: string }>("select status from public.projects where id = $1", [essential])).status).toBe("completed");
  });
});
