import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let sari: string;
let budi: string;
let dewi: string;
let project: string;
let outlet: string;
let competitor: string;

type Snapshot = { sections: { id: string; questions: { id: string; kind: string; photo_required: boolean }[] }[] };

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const inAWeek = () => new Date(Date.now() + 7 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);
const taskOf = (id: string) =>
  one<{ status: string; fee_decision: string | null; excess_approved: boolean | null; location_check: string | null; revision_round: number; revision_questions: string[]; reopened_as: string | null; revision_expired: boolean }>(
    "select status::text, fee_decision, excess_approved, location_check, revision_round, revision_questions, reopened_as, revision_expired from public.audit_tasks where id = $1",
    [id],
  );
const snapshot = async () => (await one<{ snapshot: Snapshot }>("select snapshot from public.project_questionnaires where project_id = $1", [project])).snapshot;
const answersFor = (s: Snapshot, value: "yes" | "no" = "yes") =>
  Object.fromEntries(s.sections.flatMap((sec) => sec.questions.map((q) => [q.id, { value: q.kind === "yes_no" ? value : q.kind === "scale" ? 5 : "Catatan kunjungan.", na: false }])));

async function activeShopper(email: string, name: string) {
  const id = await t.signUp(email, { account_type: "shopper", full_name: name, phone: "081255556666" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [id]);
  await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities) values ($1, 'approved', '{Jakarta}')", [id]);
  return id;
}

// Satu kunjungan lengkap sampai submit: tugas → tawaran → terima → check-in → jawaban, foto, struk → submit.
async function visit(outletId: string, shopper: string, value: "yes" | "no" = "yes", purchase = 50000) {
  const task = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date) as id", [outletId, today(), inAWeek()])).rows[0].id;
  await t.as(admin, "select public.admin_offer_task($1, $2)", [task, shopper]);
  await t.as(shopper, "select public.shopper_respond_offer($1, true)", [task]);
  await t.as(shopper, "select public.shopper_check_in($1, -6.2, 106.8, 20, $2)", [task, `${shopper}/${task}/checkin.jpg`]);
  const snap = await snapshot();
  await t.as(shopper, "select public.shopper_save_visit($1, $2::jsonb, $3, '')", [task, JSON.stringify(answersFor(snap, value)), purchase]);
  for (const q of snap.sections.flatMap((s) => s.questions).filter((q) => q.photo_required)) {
    await t.as(shopper, "select public.shopper_add_photo($1, 'evidence', $2, $3)", [task, q.id, `${shopper}/${task}/${q.id}.jpg`]);
  }
  if (purchase > 0) await t.as(shopper, "select public.shopper_add_photo($1, 'receipt', null, $2)", [task, `${shopper}/${task}/struk.jpg`]);
  await t.as(shopper, "select public.shopper_submit_visit($1)", [task]);
  return task;
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  sari = await activeShopper("sari@contoh.test", "Sari");
  budi = await activeShopper("budi@contoh.test", "Budi");
  dewi = await activeShopper("dewi@contoh.test", "Dewi");
  await t.db.query("insert into public.companies (client_id, name, pic_name, pic_phone) values ($1, 'Kopi Senja', 'Rina', '081211112222')", [client]);
  project = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, addons_snapshot, outlet_count, entitlements, status)
       values ('PRJ-T4', $1, '{"name":"SilentCX Insight","visits":1,"purchase_allowance":150000}',
               '[{"item_key":"competitor_benchmark","label":"Benchmark kompetitor","quantity":1}]', 1,
               '{report_basic,report_detailed,evidence,competitor}', 'active') returning id`,
      [client],
    )
  ).id;
  outlet = (await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, 1, 'Jakarta', 'Kopi Senja Kemang', 'Jl. Satu') returning id", [project])).id;
  const template = (await one<{ id: string }>("select id from public.questionnaires limit 1")).id;
  await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, template]);
});

describe("kompetitor diisi client", () => {
  const save = (who: string, items: unknown[]) => t.as(who, "select public.client_save_competitors($1, $2::jsonb)", [project, JSON.stringify(items)]);

  it("jumlah kompetitor dibatasi sesuai add-on", async () => {
    expect((await t.as<{ n: number }>(client, "select public.competitor_allowance($1) as n", [project])).rows[0].n).toBe(1);
    const k = { name: "Kopi Pagi", address: "Jl. Dua", city: "Jakarta", maps_url: "", paired_outlet_id: outlet };
    await expect(save(client, [k, k])).rejects.toThrow(/Maksimal 1 kompetitor/);
    await expect(save(client, [{ ...k, maps_url: "http://x" }])).rejects.toThrow(/https/);
    await expect(save(budi, [k])).rejects.toThrow(/Proyek tidak ditemukan/);
  });

  it("data lengkap mensyaratkan kompetitor terisi", async () => {
    await expect(t.as(client, "select public.complete_project_details($1, '')", [project])).rejects.toThrow(/Isi 1 kompetitor/);
    await save(client, [{ name: "Kopi Pagi", address: "Jl. Dua", city: "Jakarta", maps_url: "https://maps.app.goo.gl/x", paired_outlet_id: outlet }]);
    competitor = (await one<{ id: string }>("select id from public.project_outlets where project_id = $1 and is_competitor", [project])).id;
    await t.as(client, "select public.complete_project_details($1, '')", [project]);
    expect((await one<{ d: string | null }>("select details_completed_at as d from public.projects where id = $1", [project])).d).not.toBeNull();
  });

  it("shopper tidak tahu outlet itu kompetitor", async () => {
    const task = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date) as id", [competitor, today(), inAWeek()])).rows[0].id;
    await t.as(admin, "select public.admin_offer_task($1, $2)", [task, dewi]);
    const detail = (await t.as<{ r: Record<string, unknown> }>(dewi, "select public.shopper_task($1) as r", [task])).rows[0].r;
    expect(JSON.stringify(detail)).not.toMatch(/competitor|kompetitor/i);
    await t.as(admin, "select public.admin_cancel_task($1, 'uji')", [task]);
  });

  it("kompetitor yang sudah dijadwalkan tidak bisa diubah", async () => {
    const task = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date) as id", [competitor, today(), inAWeek()])).rows[0].id;
    await expect(save(client, [{ name: "Kopi Lain", address: "Jl. Tiga", city: "Jakarta" }])).rejects.toThrow(/sudah dijadwalkan/);
    await expect(save(client, [])).rejects.toThrow(/tidak bisa dihapus/);
    await t.as(admin, "select public.admin_cancel_task($1, 'uji')", [task]);
  });
});

describe("QC", () => {
  let approved: string;
  let revised: string;

  it("selain admin tidak bisa memutuskan QC", async () => {
    approved = await visit(outlet, sari, "yes", 180000);
    await expect(t.as(sari, "select public.admin_qc_approve($1, true, null)", [approved])).rejects.toThrow(/Hanya admin/);
    await expect(t.as(client, "select public.admin_qc_reject($1, 'none', 'x')", [approved])).rejects.toThrow(/Hanya admin/);
  });

  it("menyetujui: lokasi sesuai, fee penuh, selisih pembelian disetujui, shopper diberi tahu", async () => {
    await t.as(admin, "select public.admin_qc_approve($1, true, 'Rapi')", [approved]);
    expect(await taskOf(approved)).toMatchObject({ status: "approved", fee_decision: "full", excess_approved: true, location_check: "match" });
    const n = await t.as<{ kind: string }>(sari, "select kind from public.notifications order by id desc limit 1");
    expect(n.rows[0].kind).toBe("task.approved");
    await expect(t.as(admin, "select public.admin_qc_approve($1, false, null)", [approved])).rejects.toThrow(/tidak sedang menunggu QC/);
  });

  it("revisi wajib menandai pertanyaan dan menulis catatan", async () => {
    revised = await visit(competitor, budi);
    await expect(t.as(admin, "select public.admin_qc_revision($1, '{}', 'x')", [revised])).rejects.toThrow(/minimal satu pertanyaan/);
    const q = (await snapshot()).sections[0].questions[0].id;
    await expect(t.as(admin, "select public.admin_qc_revision($1, $2, '')", [revised, [q]])).rejects.toThrow(/catatan revisi/);
    await expect(t.as(admin, "select public.admin_qc_revision($1, '{bukan-id}', 'x')", [revised])).rejects.toThrow(/tidak dikenal/);
  });

  it("saat revisi, shopper hanya bisa mengubah bagian yang ditandai", async () => {
    const snap = await snapshot();
    const flagged = snap.sections[0].questions[0].id;
    const other = snap.sections[1].questions[0].id;
    await t.as(admin, "select public.admin_qc_revision($1, $2, 'Sapaan tidak sesuai foto')", [revised, [flagged]]);
    expect(await taskOf(revised)).toMatchObject({ status: "revision", revision_round: 1, revision_questions: [flagged] });
    const n = await t.as<{ kind: string; detail: { due: string } }>(budi, "select kind, detail from public.notifications order by id desc limit 1");
    expect(n.rows[0]).toMatchObject({ kind: "task.revision" });

    const current = answersFor(snap);
    await expect(t.as(budi, "select public.shopper_save_visit($1, $2::jsonb, 50000, '')", [revised, JSON.stringify({ ...current, [other]: { value: "no" } })])).rejects.toThrow(
      /Hanya pertanyaan yang ditandai/,
    );
    await expect(t.as(budi, "select public.shopper_save_visit($1, $2::jsonb, 99000, '')", [revised, JSON.stringify(current)])).rejects.toThrow(/Nominal pembelian tidak termasuk/);
    await expect(t.as(budi, "select public.shopper_add_photo($1, 'receipt', null, $2)", [revised, `${budi}/${revised}/s2.jpg`])).rejects.toThrow(/tidak termasuk yang diminta/);
    await t.as(budi, "select public.shopper_save_visit($1, $2::jsonb, 50000, '')", [revised, JSON.stringify({ ...current, [flagged]: { value: "no" } })]);
    await t.as(budi, "select public.shopper_submit_visit($1)", [revised]);
    expect((await taskOf(revised)).status).toBe("submitted");
    expect((await t.db.query("select 1 from public.activity_log where action = 'task.resubmitted' and target_id = $1", [revised])).rows).toHaveLength(1);
  });

  it("follow up revisi, kedaluwarsa 24 jam, dan batas 2 putaran", async () => {
    const q = (await snapshot()).sections[0].questions[1].id;
    await t.as(admin, "select public.admin_qc_revision($1, $2, 'Putaran dua')", [revised, [q]]);
    expect((await t.as<{ p: string }>(admin, "select public.admin_record_revision_followup($1) as p", [revised])).rows[0].p).toBe("081255556666");
    await t.db.query("update public.audit_tasks set revision_due = now() - interval '1 minute' where id = $1", [revised]);
    await t.as(admin, "select public.expire_offers()");
    expect(await taskOf(revised)).toMatchObject({ status: "submitted", revision_expired: true, revision_round: 2 });
    await expect(t.as(admin, "select public.admin_qc_revision($1, $2, 'Putaran tiga')", [revised, [q]])).rejects.toThrow(/Sudah 2 kali revisi/);
    await t.as(admin, "select public.admin_qc_approve($1, false, null)", [revised]);
  });

  it("menolak: keputusan fee, tugas dibuka lagi, shopper diberi tahu", async () => {
    const bad = await visit(outlet, dewi, "no");
    await expect(t.as(admin, "select public.admin_qc_reject($1, 'full', 'x')", [bad])).rejects.toThrow(/keputusan fee/);
    await expect(t.as(admin, "select public.admin_qc_reject($1, 'none', '')", [bad])).rejects.toThrow(/Alasan wajib/);
    const fresh = (await t.as<{ id: string }>(admin, "select public.admin_qc_reject($1, 'reimburse_only', 'Outlet tutup saat dikunjungi') as id", [bad])).rows[0].id;
    expect(await taskOf(bad)).toMatchObject({ status: "rejected", fee_decision: "reimburse_only", reopened_as: fresh });
    expect((await taskOf(fresh)).status).toBe("open");
    const n = await t.as<{ kind: string; detail: { fee: string } }>(dewi, "select kind, detail from public.notifications order by id desc limit 1");
    expect(n.rows[0]).toMatchObject({ kind: "task.rejected", detail: { fee: "reimburse_only" } });
  });
});

describe("laporan", () => {
  let photo: string;

  it("angka laporan dari kunjungan yang disetujui; kompetitor terpisah", async () => {
    const data = (await t.as<{ d: { score: number; outletCount: number; visitCount: number; outlets: { score: number }[]; competitors: { name: string; score: number }[]; company: string } }>(
      admin,
      "select public.project_report_data($1) as d",
      [project],
    )).rows[0].d;
    expect(data).toMatchObject({ company: "Kopi Senja", outletCount: 1, visitCount: 1 });
    expect(Number(data.score)).toBe(100);
    expect(data.competitors).toHaveLength(1);
    expect(data.competitors[0].name).toBe("Kopi Pagi");
    await expect(t.as(client, "select public.project_report_data($1)", [project])).rejects.toThrow(/Hanya admin/);
  });

  it("belum bisa terbit sebelum draf lengkap", async () => {
    const blockers = (await t.as<{ b: string[] }>(admin, "select public.report_blockers($1) as b", [project])).rows[0].b;
    expect(blockers.join(" ")).toMatch(/Ringkasan belum diisi/);
    await expect(t.as(admin, "select public.admin_publish_report($1)", [project])).rejects.toThrow(/belum bisa terbit/);
  });

  it("foto kompetitor dan foto check-in tidak bisa masuk laporan", async () => {
    const compPhoto = (
      await one<{ id: string }>(
        "select ph.id from public.visit_photos ph join public.audit_tasks t on t.id = ph.task_id join public.project_outlets o on o.id = t.outlet_id where o.is_competitor and ph.kind <> 'checkin' limit 1",
      )
    ).id;
    const checkin = (await one<{ id: string }>("select ph.id from public.visit_photos ph join public.audit_tasks t on t.id = ph.task_id where t.outlet_id = $1 and t.status = 'approved' and ph.kind = 'checkin'", [outlet])).id;
    photo = (await one<{ id: string }>("select ph.id from public.visit_photos ph join public.audit_tasks t on t.id = ph.task_id where t.outlet_id = $1 and t.status = 'approved' and ph.kind = 'evidence' limit 1", [outlet])).id;
    const saveWith = (ids: string[]) =>
      t.as(admin, "select public.admin_save_report($1, 'Ringkasan.', $2::jsonb, $3::jsonb, $4::uuid[])", [
        project,
        JSON.stringify([{ title: "Waktu tunggu lama", detail: "19 menit", severity: "major", outlet: null }]),
        JSON.stringify([{ text: "Pisahkan kasir dan barista", priority: "now" }]),
        ids,
      ]);
    await expect(saveWith([compPhoto])).rejects.toThrow(/bukan kompetitor/);
    await expect(saveWith([checkin])).rejects.toThrow(/bukan foto check-in/);
    await expect(t.as(admin, "select public.admin_save_report($1, '', '[{\"title\":\"x\"}]'::jsonb, '[]'::jsonb, '{}')", [project])).rejects.toThrow(/Setiap temuan/);
    await saveWith([photo]);
  });

  it("client belum bisa membaca draf", async () => {
    expect((await t.as(client, "select 1 from public.reports")).rows).toHaveLength(0);
  });

  it("terbit: proyek selesai, angka dibekukan, tagihan tambahan dibuat, client diberi tahu", async () => {
    // Tugas pengganti dari kunjungan yang ditolak masih terbuka; ikut dibatalkan saat terbit.
    const invoice = (await t.as<{ id: string }>(admin, "select public.admin_publish_report($1) as id", [project])).rows[0].id;
    expect((await one<{ status: string }>("select status::text from public.projects where id = $1", [project])).status).toBe("completed");
    expect((await t.db.query("select 1 from public.audit_tasks where project_id = $1 and status = 'open'", [project])).rows).toHaveLength(0);
    const inv = await one<{ kind: string; total: number; status: string }>("select kind, total, status::text from public.invoices where id = $1", [invoice]);
    expect(inv).toMatchObject({ kind: "excess", total: 30000, status: "unpaid" });
    const report = (await t.as<{ status: string; data: { score: number } }>(client, "select status, data from public.reports")).rows[0];
    expect(report.status).toBe("published");
    expect(Number(report.data.score)).toBe(100);
    expect((await t.as(sari, "select 1 from public.reports")).rows).toHaveLength(0);
    const n = await t.as<{ kind: string }>(client, "select kind from public.notifications");
    expect(n.rows.map((r) => r.kind)).toContain("report.published");
    await expect(t.as(admin, "select public.admin_save_report($1, 'x', '[]'::jsonb, '[]'::jsonb, '{}')", [project])).rejects.toThrow(/sudah terbit/);
  });

  it("tagihan tambahan dibayar tanpa mengubah status proyek dan tidak kedaluwarsa", async () => {
    const inv = (await one<{ id: string }>("select id from public.invoices where project_id = $1 and kind = 'excess'", [project])).id;
    await t.db.query("update public.invoices set due_at = now() - interval '1 day' where id = $1", [inv]);
    await t.as(client, "select public.expire_overdue()");
    expect((await one<{ status: string }>("select status::text from public.invoices where id = $1", [inv])).status).toBe("unpaid");
    await t.as(client, "select public.submit_payment_proof($1, 'qris', $2, 30000, 'Rina')", [inv, `${client}/${inv}/bukti.jpg`]);
    expect((await one<{ status: string }>("select status::text from public.projects where id = $1", [project])).status).toBe("completed");
    await t.as(admin, "select public.admin_verify_payment($1, true, null)", [inv]);
    expect((await one<{ status: string }>("select status::text from public.invoices where id = $1", [inv])).status).toBe("paid");
    expect((await one<{ status: string }>("select status::text from public.projects where id = $1", [project])).status).toBe("completed");
  });

  it("progres client menghitung kunjungan yang lolos QC dan menandai kompetitor", async () => {
    const rows = (await t.as<{ r: { outlet_id: string; approved: number; is_competitor: boolean }[] }>(client, "select public.client_audit_progress() as r")).rows[0].r;
    expect(rows.find((r) => r.outlet_id === outlet)).toMatchObject({ approved: 1, is_competitor: false });
    expect(rows.find((r) => r.outlet_id === competitor)).toMatchObject({ approved: 1, is_competitor: true });
  });
});
