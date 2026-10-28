import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let sari: string;
let budi: string;
let project: string;
const outlets: string[] = [];
// Tugas: A dan B disetujui (B dengan kelebihan pembelian yang disetujui), C ditolak reimburse saja (Sari);
// D ditolak tanpa fee dan E disetujui (Budi, belum punya rekening).
const task: Record<"A" | "B" | "C" | "D" | "E", string> = { A: "", B: "", C: "", D: "", E: "" };

type Snapshot = { sections: { id: string; questions: { id: string; kind: string; photo_required: boolean }[] }[] };
type QueueRow = { task_id: string; code: string; shopper_id: string; fee: number; reimburse: number; total: number; due_at: string | null; decided_at: string; payout_status: string };

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const inAWeek = () => new Date(Date.now() + 7 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);
const queue = async () => (await t.as<QueueRow>(admin, "select * from public.admin_payout_queue()")).rows;
const notifications = async (who: string, kind: string) =>
  (await t.db.query<{ detail: Record<string, unknown> }>("select detail from public.notifications where user_id = $1 and kind = $2 order by created_at", [who, kind])).rows;

async function activeShopper(email: string, name: string) {
  const id = await t.signUp(email, { account_type: "shopper", full_name: name, phone: "081255556666" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [id]);
  await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities) values ($1, 'approved', '{Jakarta}')", [id]);
  return id;
}

// Satu kunjungan sampai submit dengan fee 150.000 dan batas reimburse 100.000.
async function visit(outletId: string, shopper: string, purchase: number) {
  const id = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date, null, null, 150000, 100000) as id", [outletId, today(), inAWeek()])).rows[0].id;
  await t.as(admin, "select public.admin_offer_task($1, $2)", [id, shopper]);
  await t.as(shopper, "select public.shopper_respond_offer($1, true)", [id]);
  await t.as(shopper, "select public.shopper_check_in($1, -6.2, 106.8, 20, $2)", [id, `${shopper}/${id}/checkin.jpg`]);
  const snap = (await one<{ snapshot: Snapshot }>("select snapshot from public.project_questionnaires where project_id = $1", [project])).snapshot;
  const answers = Object.fromEntries(snap.sections.flatMap((s) => s.questions.map((q) => [q.id, { value: q.kind === "yes_no" ? "yes" : q.kind === "scale" ? 5 : "Catatan.", na: false }])));
  await t.as(shopper, "select public.shopper_save_visit($1, $2::jsonb, $3, '')", [id, JSON.stringify(answers), purchase]);
  for (const q of snap.sections.flatMap((s) => s.questions).filter((q) => q.photo_required)) {
    await t.as(shopper, "select public.shopper_add_photo($1, 'evidence', $2, $3)", [id, q.id, `${shopper}/${id}/${q.id}.jpg`]);
  }
  if (purchase > 0) await t.as(shopper, "select public.shopper_add_photo($1, 'receipt', null, $2)", [id, `${shopper}/${id}/struk.jpg`]);
  await t.as(shopper, "select public.shopper_submit_visit($1)", [id]);
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  sari = await activeShopper("sari@contoh.test", "Sari");
  budi = await activeShopper("budi@contoh.test", "Budi");
  await t.as(sari, "select public.save_bank_account('BCA', '1234567890', 'Sari Lestari')");
  project = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, addons_snapshot, outlet_count, entitlements, status, details_completed_at)
       values ('PRJ-T5', $1, '{"name":"SilentCX Insight","visits":1,"purchase_allowance":100000}', '[]', 3, '{report_basic}', 'active', now()) returning id`,
      [client],
    )
  ).id;
  for (let i = 1; i <= 3; i++) {
    outlets.push((await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, $2, 'Jakarta', $3, 'Jl. Satu') returning id", [project, i, `Outlet ${i}`])).id);
  }
  const template = (await one<{ id: string }>("select id from public.questionnaires limit 1")).id;
  await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, template]);

  task.A = await visit(outlets[0], sari, 50000);
  await t.as(admin, "select public.admin_qc_approve($1, false, null)", [task.A]);
  task.B = await visit(outlets[1], sari, 130000);
  await t.as(admin, "select public.admin_qc_approve($1, true, null)", [task.B]);
  task.C = await visit(outlets[2], sari, 40000);
  await t.as(admin, "select public.admin_qc_reject($1, 'reimburse_only', 'Outlet tutup', false)", [task.C]);
  task.D = await visit(outlets[0], budi, 20000);
  await t.as(admin, "select public.admin_qc_reject($1, 'none', 'Tidak sesuai', false)", [task.D]);
  task.E = await visit(outlets[1], budi, 0);
  await t.as(admin, "select public.admin_qc_approve($1, false, null)", [task.E]);
});

describe("antrian payout", () => {
  it("hanya admin yang bisa melihat antrian", async () => {
    await expect(t.as(sari, "select * from public.admin_payout_queue()")).rejects.toThrow(/Hanya admin/);
    await expect(t.as(client, "select * from public.admin_payout_queue()")).rejects.toThrow(/Hanya admin/);
  });

  it("isi: fee + reimburse sampai batas, seluruh pembelian kalau kelebihan disetujui, reimburse saja, tanpa fee tidak ikut", async () => {
    const rows = new Map((await queue()).map((r) => [r.task_id, r]));
    expect(rows.get(task.A)).toMatchObject({ fee: 150000, reimburse: 50000, total: 200000 });
    expect(rows.get(task.B)).toMatchObject({ fee: 150000, reimburse: 130000, total: 280000 });
    expect(rows.get(task.C)).toMatchObject({ fee: 0, reimburse: 40000, total: 40000 });
    expect(rows.has(task.D)).toBe(false);
    expect(rows.get(task.E)).toMatchObject({ fee: 150000, reimburse: 0, total: 150000 });
  });

  it("tanpa rekening: menunggu rekening, shopper diberi tahu, tampil paling akhir", async () => {
    const rows = await queue();
    expect(rows.at(-1)).toMatchObject({ task_id: task.E, payout_status: "waiting_bank", due_at: null });
    expect((await notifications(budi, "payout.need_bank")).map((n) => n.detail.task)).toEqual([task.E]);
    // Sari sudah punya rekening, jadi tidak mendapat pengingat.
    expect(await notifications(sari, "payout.need_bank")).toEqual([]);
  });

  it("batas 48 jam sejak QC; lewat batas ditandai overdue dan naik ke atas", async () => {
    const a = (await queue()).find((r) => r.task_id === task.A)!;
    expect(new Date(a.due_at!).getTime() - new Date(a.decided_at).getTime()).toBe(48 * 3600_000);
    expect(a.payout_status).toBe("pending");
    // Rekening Sari sudah lama diisi, jadi hitungan mulai dari QC.
    await t.db.query("update public.shopper_bank_accounts set created_at = now() - interval '4 days' where shopper_id = $1", [sari]);
    await t.db.query("update public.audit_tasks set qc_decided_at = now() - interval '49 hours' where id = $1", [task.C]);
    const rows = await queue();
    expect(rows[0]).toMatchObject({ task_id: task.C, payout_status: "overdue" });
  });

  it("rekening diisi belakangan: hitungan 48 jam mulai dari saat itu", async () => {
    await t.db.query("update public.audit_tasks set qc_decided_at = now() - interval '3 days' where id = $1", [task.E]);
    await t.as(budi, "select public.save_bank_account('Mandiri', '9876543210', 'Budi Santoso')");
    const e = (await queue()).find((r) => r.task_id === task.E)!;
    expect(e.payout_status).toBe("pending");
    const left = new Date(e.due_at!).getTime() - Date.now();
    expect(left).toBeGreaterThan(47 * 3600_000);
    expect(left).toBeLessThanOrEqual(48 * 3600_000);
  });
});

describe("mencatat payout", () => {
  const pay = (who: string, tasks: string[], proof: string, note: string | null = null) =>
    t.as<{ id: string }>(who, "select public.admin_record_payout($1::uuid[], $2, $3) as id", [tasks, proof, note]);
  let payout: string;

  it("hanya admin, satu shopper per transfer, bukti dari folder shopper itu", async () => {
    await expect(pay(sari, [task.A], `${sari}/x.jpg`)).rejects.toThrow(/Hanya admin/);
    await expect(pay(admin, [task.A, task.E], `${sari}/x.jpg`)).rejects.toThrow(/shopper yang sama/);
    await expect(pay(admin, [task.A], `${budi}/x.jpg`)).rejects.toThrow(/bukti transfer/);
    await expect(pay(admin, [task.D], `${budi}/x.jpg`)).rejects.toThrow(/tidak punya fee atau reimburse/);
    await expect(pay(admin, [], `${sari}/x.jpg`)).rejects.toThrow(/minimal satu tugas/);
  });

  it("transfer kolektif: total, rekening disalin, nominal per tugas dibekukan, shopper diberi tahu", async () => {
    payout = (await pay(admin, [task.A, task.B], `${sari}/transfer-1.jpg`, "Transfer BCA pagi")).rows[0].id;
    const po = await one<{ code: string; total: number; fee_total: number; reimburse_total: number; account_number: string; bank_name: string }>(
      "select code, total, fee_total, reimburse_total, account_number, bank_name from public.payouts where id = $1",
      [payout],
    );
    expect(po).toMatchObject({ total: 480000, fee_total: 300000, reimburse_total: 180000, account_number: "1234567890", bank_name: "BCA" });
    expect(po.code).toMatch(/^PAY-\d{4}$/);
    const frozen = (await t.db.query<{ id: string; payout_fee: number; payout_reimburse: number }>("select id, payout_fee, payout_reimburse from public.audit_tasks where payout_id = $1 order by code", [payout])).rows;
    expect(frozen.map((r) => [r.id, r.payout_fee, r.payout_reimburse])).toEqual([
      [task.A, 150000, 50000],
      [task.B, 150000, 130000],
    ]);
    expect((await notifications(sari, "payout.paid")).map((n) => n.detail)).toEqual([{ payout, code: po.code, total: 480000 }]);
    const ids = (await queue()).map((r) => r.task_id);
    expect(ids).not.toContain(task.A);
    expect(ids).not.toContain(task.B);
  });

  it("tidak bisa dibayar dua kali", async () => {
    await expect(pay(admin, [task.A], `${sari}/lagi.jpg`)).rejects.toThrow(/sudah dibayar/);
  });

  it("log tidak memuat nomor rekening; rekening di payout tidak ikut berubah", async () => {
    const log = await one<{ detail: Record<string, unknown> }>("select detail from public.activity_log where action = 'payout.paid' and target_id = $1", [payout]);
    expect(JSON.stringify(log.detail)).not.toContain("1234567890");
    await t.as(sari, "select public.save_bank_account('BRI', '5555566666', 'Sari Lestari')");
    expect((await one<{ account_number: string }>("select account_number from public.payouts where id = $1", [payout])).account_number).toBe("1234567890");
  });

  it("tidak bisa ditulis langsung dari browser", async () => {
    await expect(t.as(admin, "update public.payouts set total = 1 where id = $1", [payout])).rejects.toThrow(/permission denied/);
    await expect(t.as(admin, "update public.audit_tasks set payout_id = null where id = $1", [task.A])).rejects.toThrow(/permission denied/);
  });

  it("ganti bukti: alasan wajib, bukti lama tercatat, shopper diberi tahu", async () => {
    const replace = (proof: string, note: string) => t.as(admin, "select public.admin_replace_payout_proof($1, $2, $3)", [payout, proof, note]);
    await expect(replace(`${sari}/transfer-2.jpg`, " ")).rejects.toThrow(/alasan/);
    await expect(replace(`${sari}/transfer-1.jpg`, "Salah file")).rejects.toThrow(/bukti transfer yang baru/);
    await expect(t.as(sari, "select public.admin_replace_payout_proof($1, $2, 'x')", [payout, `${sari}/y.jpg`])).rejects.toThrow(/Hanya admin/);
    await replace(`${sari}/transfer-2.jpg`, "Salah file");
    const po = await one<{ proof_path: string; note: string; proof_replaced_at: string | null }>("select proof_path, note, proof_replaced_at from public.payouts where id = $1", [payout]);
    expect(po).toMatchObject({ proof_path: `${sari}/transfer-2.jpg`, note: "Salah file" });
    expect(po.proof_replaced_at).not.toBeNull();
    const log = await one<{ detail: Record<string, unknown> }>("select detail from public.activity_log where action = 'payout.proof_replaced' and target_id = $1", [payout]);
    expect(log.detail.old_proof).toBe(`${sari}/transfer-1.jpg`);
    expect(await notifications(sari, "payout.proof_replaced")).toHaveLength(1);
  });
});

describe("pembayaran di sisi shopper", () => {
  type Mine = {
    has_bank: boolean;
    pending: { task: string; fee: number; reimburse: number; due_at: string | null }[];
    paid: { id: string; total: number; items: { code: string; fee: number; reimburse: number }[] }[];
  };
  const mine = async (who: string) => (await t.as<{ v: Mine }>(who, "select public.shopper_payouts() as v")).rows[0].v;

  it("shopper melihat yang belum dibayar dan yang sudah dibayar beserta rincian per tugas", async () => {
    const m = await mine(sari);
    expect(m.has_bank).toBe(true);
    expect(m.pending.map((p) => [p.task, p.fee, p.reimburse])).toEqual([[task.C, 0, 40000]]);
    expect(m.paid).toHaveLength(1);
    expect(m.paid[0].total).toBe(480000);
    expect(m.paid[0].items.map((i) => [i.fee, i.reimburse])).toEqual([
      [150000, 50000],
      [150000, 130000],
    ]);
  });

  it("shopper lain dan client tidak bisa melihatnya", async () => {
    expect((await mine(budi)).paid).toEqual([]);
    expect((await t.as(budi, "select id from public.payouts")).rows).toEqual([]);
    expect((await t.as(sari, "select id from public.payouts")).rows).toHaveLength(1);
    await expect(t.as(client, "select public.shopper_payouts()")).rejects.toThrow(/Hanya shopper/);
    await expect(t.as(null, "select public.shopper_payouts()")).rejects.toThrow();
  });

  it("kontak admin tersedia sebagai pengaturan yang diubah admin", async () => {
    const row = await one<{ value: Record<string, string> }>("select value from public.app_settings where key = 'admin_contact'");
    expect(row.value).toEqual({ name: "", whatsapp: "" });
    await expect(t.as(sari, "update public.app_settings set value = '{}'::jsonb where key = 'admin_contact'")).resolves.toMatchObject({ affectedRows: 0 });
    await t.as(admin, `update public.app_settings set value = '{"name":"Rina","whatsapp":"081200000000"}'::jsonb where key = 'admin_contact'`);
    expect((await t.as<{ value: Record<string, string> }>(sari, "select value from public.app_settings where key = 'admin_contact'")).rows[0].value.name).toBe("Rina");
  });
});
