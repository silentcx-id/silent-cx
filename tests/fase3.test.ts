import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let sari: string;
let budi: string;
let dewi: string;
let project: string;
let jakarta: string;
let bandung: string;
let template: string;

type Snapshot = { photo_limit: number; sections: { id: string; weight: number; questions: { id: string; kind: string; photo_required: boolean }[] }[] };

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const taskOf = (id: string) =>
  one<{ status: string; shopper_id: string | null; fee: number; reimburse_cap: number; score: string | null; excess_amount: number; location_check: string | null }>(
    "select status::text, shopper_id, fee, reimburse_cap, score, excess_amount, location_check from public.audit_tasks where id = $1",
    [id],
  );
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + 7 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

const createTask = (outlet: string, start = today(), end = addDays(7), extra: unknown[] = [null, null, null, null]) =>
  t
    .as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date, null, null, $4, $5, coalesce($6, ''), coalesce($7, '')) as id", [outlet, start, end, ...extra])
    .then((r) => r.rows[0].id);
const offer = (task: string, shopper: string, hours: number | null = null, urgent = false) =>
  t.as(admin, "select public.admin_offer_task($1, $2, $3, $4)", [task, shopper, hours, urgent]);
const respond = (who: string, task: string, accept: boolean, reason: string | null = null) =>
  t.as(who, "select public.shopper_respond_offer($1, $2, $3)", [task, accept, reason]);
const checkIn = (who: string, task: string, path?: string) =>
  t.as(who, "select public.shopper_check_in($1, -6.2, 106.8, 25, $2)", [task, path ?? `${who}/${task}/checkin.jpg`]);
const saveVisit = (who: string, task: string, answers: unknown, purchase: number | null = null) =>
  t.as(who, "select public.shopper_save_visit($1, $2::jsonb, $3, '')", [task, JSON.stringify(answers), purchase]);
const addPhoto = (who: string, task: string, kind: string, question: string | null, name: string) =>
  t.as<{ id: string }>(who, "select public.shopper_add_photo($1, $2, $3, $4) as id", [task, kind, question, `${who}/${task}/${name}`]).then((r) => r.rows[0].id);
const snapshot = async () => (await one<{ snapshot: Snapshot }>("select snapshot from public.project_questionnaires where project_id = $1", [project])).snapshot;

// Shopper aktif dengan lamaran disetujui yang menjangkau kota tertentu.
async function activeShopper(email: string, name: string, cities: string[]) {
  const id = await t.signUp(email, { account_type: "shopper", full_name: name, phone: "081233334444" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [id]);
  await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities) values ($1, 'approved', $2)", [id, cities]);
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  sari = await activeShopper("sari@contoh.test", "Sari", ["Jakarta"]);
  budi = await activeShopper("budi@contoh.test", "Budi", ["Bandung"]);
  dewi = await activeShopper("dewi@contoh.test", "Dewi", ["Jakarta", "Bandung"]);
  project = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, outlet_count, status, details_completed_at)
       values ('PRJ-T1', $1, '{"name":"Insight","visits":1,"purchase_allowance":150000}', 2, 'active', now()) returning id`,
      [client],
    )
  ).id;
  jakarta = (await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, 1, 'Jakarta', 'Kopi Pusat', 'Jl. Satu') returning id", [project])).id;
  bandung = (await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, 2, 'Bandung', 'Kopi Dago', 'Jl. Dua') returning id", [project])).id;
  template = (await one<{ id: string }>("select id from public.questionnaires limit 1")).id;
});

describe("kuesioner", () => {
  it("template awal siap dipakai", async () => {
    const res = await t.as<{ issues: string[] }>(admin, "select public.questionnaire_issues($1) as issues", [template]);
    expect(res.rows[0].issues).toEqual([]);
  });

  it("masalah bobot dan jatah foto terdeteksi", async () => {
    const q = (await one<{ id: string }>("insert into public.questionnaires (name, photo_limit) values ('Uji', 3) returning id")).id;
    const s = (await one<{ id: string }>("insert into public.questionnaire_sections (questionnaire_id, title, weight) values ($1, 'Bagian A', 60) returning id", [q])).id;
    await t.db.query("insert into public.questionnaire_questions (section_id, prompt, kind, photo_required) values ($1, 'Pertanyaan satu', 'yes_no', true), ($1, 'Pertanyaan dua', 'yes_no', true)", [s]);
    await t.db.query("insert into public.questionnaire_sections (questionnaire_id, title, weight) values ($1, 'Bagian B', 0)", [q]);
    const issues = (await t.as<{ issues: string[] }>(admin, "select public.questionnaire_issues($1) as issues", [q])).rows[0].issues;
    expect(issues.join(" ")).toMatch(/Total bobot 60/);
    expect(issues.join(" ")).toMatch(/Bagian B" belum punya pertanyaan/);
    expect(issues.join(" ")).toMatch(/wajib foto 2, maksimal 1/);
    await expect(t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, q])).rejects.toThrow(/belum siap/);
  });

  it("hanya admin yang melihat dan mengubah template", async () => {
    expect((await t.as(sari, "select 1 from public.questionnaires")).rows).toHaveLength(0);
    expect((await t.as(client, "select 1 from public.questionnaire_questions")).rows).toHaveLength(0);
    await expect(t.as(null, "select 1 from public.questionnaires")).rejects.toThrow(/permission denied/);
    await t.as(sari, "update public.questionnaires set name = 'x'");
    expect((await one<{ name: string }>("select name from public.questionnaires where id = $1", [template])).name).not.toBe("x");
  });

  it("tugas belum bisa dibuat sebelum kuesioner ditetapkan", async () => {
    await expect(createTask(jakarta)).rejects.toThrow(/Tetapkan kuesioner/);
  });

  it("menetapkan kuesioner menyimpan salinan yang tidak terlihat client", async () => {
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, template]);
    const snap = await snapshot();
    expect(snap.sections).toHaveLength(7);
    expect(snap.photo_limit).toBe(5);
    await t.db.query("update public.questionnaire_questions set prompt = 'Diubah setelah ditetapkan' where section_id in (select id from public.questionnaire_sections where questionnaire_id = $1)", [template]);
    expect(JSON.stringify(await snapshot())).not.toContain("Diubah setelah ditetapkan");
    expect((await t.as(client, "select 1 from public.project_questionnaires")).rows).toHaveLength(0);
    expect((await t.as(sari, "select 1 from public.project_questionnaires")).rows).toHaveLength(0);
  });
});

describe("membuat dan menawarkan tugas", () => {
  let task: string;

  it("fee dan batas reimburse bawaan dipakai", async () => {
    task = await createTask(jakarta);
    expect(await taskOf(task)).toMatchObject({ status: "open", fee: 150000, reimburse_cap: 150000 });
  });

  it("jendela yang sudah lewat atau jam setengah diisi ditolak", async () => {
    await expect(createTask(jakarta, addDays(-5), addDays(-2))).rejects.toThrow(/sudah lewat/);
    await expect(t.as(admin, "select public.admin_create_task($1, $2::date, $3::date, '10:00'::time, null)", [jakarta, today(), addDays(3)])).rejects.toThrow(/Jam kunjungan/);
  });

  it("selain admin tidak bisa membuat atau menawarkan tugas", async () => {
    await expect(t.as(client, "select public.admin_create_task($1, $2::date, $3::date)", [jakarta, today(), addDays(3)])).rejects.toThrow(/Hanya admin/);
    await expect(t.as(sari, "select public.admin_offer_task($1, $2)", [task, sari])).rejects.toThrow(/Hanya admin/);
  });

  it("calon shopper diurutkan dari yang menjangkau kota outlet", async () => {
    const res = await t.as<{ shopper_id: string; reaches_city: boolean; eligible: boolean }>(admin, "select * from public.admin_task_candidates($1)", [task]);
    const reach = Object.fromEntries(res.rows.map((r) => [r.shopper_id, r.reaches_city]));
    expect(reach).toMatchObject({ [sari]: true, [dewi]: true, [budi]: false });
    expect(res.rows.at(-1)?.shopper_id).toBe(budi);
  });

  it("menawarkan tugas memberi notifikasi tanpa nama client", async () => {
    await offer(task, sari, 24, true);
    expect(await taskOf(task)).toMatchObject({ status: "offered", shopper_id: sari });
    const n = await t.as<{ kind: string; detail: Record<string, unknown> }>(sari, "select kind, detail from public.notifications");
    expect(n.rows[0]).toMatchObject({ kind: "task.offered", detail: { city: "Jakarta", urgent: true } });
    expect(JSON.stringify(n.rows[0].detail)).not.toMatch(/Kopi|Client/);
  });

  it("shopper melihat brief tapi belum melihat kuesioner sebelum menerima", async () => {
    const list = (await t.as<{ r: { id: string; urgent: boolean; outlet_name: string }[] }>(sari, "select public.shopper_tasks() as r")).rows[0].r;
    expect(list).toMatchObject([{ id: task, urgent: true, outlet_name: "Kopi Pusat" }]);
    const detail = (await t.as<{ r: { questionnaire: unknown; outlet: Record<string, string> } }>(sari, "select public.shopper_task($1) as r", [task])).rows[0].r;
    expect(detail.questionnaire).toBeNull();
    expect(Object.keys(detail.outlet).sort()).toEqual(["address", "city", "maps_url", "name"]);
    expect((await t.as<{ r: unknown }>(budi, "select public.shopper_task($1) as r", [task])).rows[0].r).toBeNull();
  });

  it("tabel tugas tidak bisa dibaca langsung oleh shopper atau client", async () => {
    expect((await t.as(sari, "select 1 from public.audit_tasks")).rows).toHaveLength(0);
    expect((await t.as(client, "select 1 from public.audit_tasks")).rows).toHaveLength(0);
    await expect(t.as(sari, "update public.audit_tasks set status = 'submitted'")).rejects.toThrow(/permission denied/);
  });

  it("follow up mengembalikan nomor WhatsApp dan tercatat", async () => {
    const phone = (await t.as<{ p: string }>(admin, "select public.admin_record_followup($1) as p", [task])).rows[0].p;
    expect(phone).toBe("081233334444");
    expect((await one<{ followups: number }>("select followups from public.task_offers where task_id = $1 and status = 'offered'", [task])).followups).toBe(1);
    expect((await t.db.query("select 1 from public.activity_log where action = 'task.followed_up' and target_id = $1", [task])).rows).toHaveLength(1);
  });

  it("tawaran yang lewat batas respons kedaluwarsa dan tugas kembali terbuka", async () => {
    await t.db.query("update public.task_offers set respond_by = now() - interval '1 minute' where task_id = $1 and status = 'offered'", [task]);
    // Jawaban terlambat ditolak; kedaluwarsanya tercatat pada pembacaan berikutnya (transaksi yang gagal dibatalkan).
    await expect(respond(sari, task, true)).rejects.toThrow(/sudah tidak berlaku/);
    await t.as(sari, "select public.shopper_tasks()");
    expect(await taskOf(task)).toMatchObject({ status: "open", shopper_id: null });
    expect((await one<{ status: string }>("select status::text from public.task_offers where task_id = $1", [task])).status).toBe("expired");
  });

  it("menolak mengembalikan tugas ke admin; menarik tawaran juga", async () => {
    await offer(task, sari);
    await respond(sari, task, false, "Sedang di luar kota");
    expect(await taskOf(task)).toMatchObject({ status: "open", shopper_id: null });
    await offer(task, dewi);
    await t.as(admin, "select public.admin_withdraw_offer($1)", [task]);
    expect(await taskOf(task)).toMatchObject({ status: "open", shopper_id: null });
    const kinds = (await t.as<{ kind: string }>(dewi, "select kind from public.notifications order by id")).rows.map((r) => r.kind);
    expect(kinds).toEqual(["task.offered", "task.withdrawn"]);
  });

  it("batas tugas aktif per shopper dan larangan outlet yang sama", async () => {
    await t.db.query("update public.app_settings set value = value || '{\"max_active_tasks\": 1}' where key = 'field'");
    const other = await createTask(bandung);
    await offer(other, dewi);
    await expect(offer(task, dewi)).rejects.toThrow(/sudah memegang 1 tugas aktif/);
    await t.db.query("update public.app_settings set value = value || '{\"max_active_tasks\": 3}' where key = 'field'");
    await t.as(admin, "select public.admin_withdraw_offer($1)", [other]);

    const second = await createTask(jakarta);
    await offer(second, sari);
    await expect(offer(task, sari)).rejects.toThrow(/outlet yang sama/);
    await t.as(admin, "select public.admin_cancel_task($1, 'Uji')", [second]);
    const kinds = (await t.as<{ kind: string; detail: { note: string } }>(sari, "select kind, detail from public.notifications order by id desc limit 1")).rows[0];
    expect(kinds).toMatchObject({ kind: "task.cancelled", detail: { note: "Uji" } });
  });
});

describe("kunjungan", () => {
  let task: string;
  let snap: Snapshot;
  const answersFor = (s: Snapshot, value: "yes" | "no" = "yes") =>
    Object.fromEntries(
      s.sections.flatMap((sec) => sec.questions.map((q) => [q.id, { value: q.kind === "yes_no" ? value : q.kind === "scale" ? 5 : "Pelayanan ramah.", na: false }])),
    );

  beforeAll(async () => {
    task = await createTask(jakarta);
    await offer(task, sari);
    await respond(sari, task, true);
    snap = await snapshot();
  });

  it("setelah diterima, shopper melihat kuesioner", async () => {
    expect(await taskOf(task)).toMatchObject({ status: "accepted" });
    const detail = (await t.as<{ r: { questionnaire: { sections: unknown[] } } }>(sari, "select public.shopper_task($1) as r", [task])).rows[0].r;
    expect(detail.questionnaire.sections).toHaveLength(7);
  });

  it("check-in di luar jendela atau dengan foto di folder lain ditolak", async () => {
    await t.db.query("update public.audit_tasks set window_start = $2::date, window_end = $3::date where id = $1", [task, addDays(2), addDays(4)]);
    await expect(checkIn(sari, task)).rejects.toThrow(/Check-in hanya bisa dilakukan pada/);
    await t.db.query("update public.audit_tasks set window_start = $2::date, window_end = $3::date where id = $1", [task, today(), addDays(4)]);
    await expect(checkIn(sari, task, `${budi}/${task}/x.jpg`)).rejects.toThrow(/Foto check-in tidak valid/);
    await expect(t.as(sari, "select public.shopper_check_in($1, null, null, null, $2)", [task, `${sari}/${task}/c.jpg`])).rejects.toThrow(/Lokasi tidak terbaca/);
  });

  it("check-in mencatat lokasi dan foto, lalu kunjungan dimulai", async () => {
    await checkIn(sari, task);
    const row = await one<{ status: string; checkin_lat: number; checkin_accuracy: number }>("select status::text, checkin_lat, checkin_accuracy from public.audit_tasks where id = $1", [task]);
    expect(row).toMatchObject({ status: "in_progress", checkin_lat: -6.2, checkin_accuracy: 25 });
    expect((await t.db.query("select 1 from public.visit_photos where task_id = $1 and kind = 'checkin'", [task])).rows).toHaveLength(1);
  });

  it("jawaban yang tidak dikenal atau tidak sesuai jenisnya ditolak", async () => {
    await expect(saveVisit(sari, task, { "bukan-id": { value: "yes" } })).rejects.toThrow(/tidak dikenal/);
    const yesNo = snap.sections[0].questions[0].id;
    const scale = snap.sections[0].questions[2].id;
    await expect(saveVisit(sari, task, { [yesNo]: { value: "mungkin" } })).rejects.toThrow(/tidak valid/);
    await expect(saveVisit(sari, task, { [scale]: { value: 7 } })).rejects.toThrow(/tidak valid/);
  });

  it("submit menolak jawaban belum lengkap, foto wajib, dan struk yang belum ada", async () => {
    await saveVisit(sari, task, { [snap.sections[0].questions[0].id]: { value: "yes" } });
    await expect(t.as(sari, "select public.shopper_submit_visit($1)", [task])).rejects.toThrow(/pertanyaan belum dijawab/);
    await saveVisit(sari, task, answersFor(snap), 180000);
    await expect(t.as(sari, "select public.shopper_submit_visit($1)", [task])).rejects.toThrow(/2 pertanyaan wajib foto/);
    for (const q of snap.sections.flatMap((s) => s.questions).filter((q) => q.photo_required)) await addPhoto(sari, task, "evidence", q.id, `${q.id}.jpg`);
    await expect(t.as(sari, "select public.shopper_submit_visit($1)", [task])).rejects.toThrow(/foto struk/);
  });

  it("batas foto per kunjungan berlaku dan foto bisa dihapus", async () => {
    const receipt = await addPhoto(sari, task, "receipt", null, "struk-1.jpg");
    await addPhoto(sari, task, "receipt", null, "struk-2.jpg");
    await expect(addPhoto(sari, task, "receipt", null, "struk-3.jpg")).rejects.toThrow(/Batas 5 foto/);
    const path = (await t.as<{ p: string }>(sari, "select public.shopper_remove_photo($1) as p", [receipt])).rows[0].p;
    expect(path).toBe(`${sari}/${task}/struk-1.jpg`);
    const checkin = (await one<{ id: string }>("select id from public.visit_photos where task_id = $1 and kind = 'checkin'", [task])).id;
    await expect(t.as(sari, "select public.shopper_remove_photo($1)", [checkin])).rejects.toThrow(/check-in tidak bisa dihapus/);
  });

  it("submit menghitung skor dan selisih pembelian, lalu isian terkunci", async () => {
    const res = (await t.as<{ r: { score: number } }>(sari, "select public.shopper_submit_visit($1) as r", [task])).rows[0].r;
    expect(Number(res.score)).toBe(100);
    expect(await taskOf(task)).toMatchObject({ status: "submitted", excess_amount: 30000 });
    await expect(saveVisit(sari, task, {})).rejects.toThrow(/berstatus submitted/);
    expect((await t.db.query("select 1 from public.activity_log where action = 'task.submitted' and target_id = $1", [task])).rows).toHaveLength(1);
  });

  it("admin menandai hasil pencocokan lokasi", async () => {
    await t.as(admin, "select public.admin_check_location($1, true, null)", [task]);
    expect((await taskOf(task)).location_check).toBe("match");
    await expect(t.as(admin, "select public.admin_cancel_task($1, 'x')", [task])).rejects.toThrow(/sudah disubmit/);
  });
});

describe("skor", () => {
  const snap = {
    sections: [
      { id: "a", weight: 60, questions: [{ id: "a1", kind: "yes_no" }, { id: "a2", kind: "scale" }, { id: "a3", kind: "text" }] },
      { id: "b", weight: 40, questions: [{ id: "b1", kind: "yes_no" }] },
      { id: "c", weight: 0, questions: [{ id: "c1", kind: "yes_no" }] },
    ],
  };
  const score = async (answers: unknown) =>
    (await t.db.query<{ r: { score: string | null; sections: Record<string, string> } }>("select public.visit_score($1::jsonb, $2::jsonb) as r", [JSON.stringify(snap), JSON.stringify(answers)])).rows[0].r;

  it("rata-rata berbobot; teks dan bagian berbobot 0 tidak dihitung", async () => {
    // a: (1 + 0.5) / 2 = 0.75 → 75; b: 0 → 0; total = (60 × 0.75 + 40 × 0) / 100 = 45.
    const r = await score({ a1: { value: "yes" }, a2: { value: 3 }, a3: { value: "x" }, b1: { value: "no" }, c1: { value: "no" } });
    expect(Number(r.score)).toBe(45);
    expect(Number(r.sections.a)).toBe(75);
  });

  it("bagian yang seluruhnya tidak teramati tidak menurunkan skor", async () => {
    const r = await score({ a1: { value: "yes" }, a2: { value: 5 }, b1: { na: true } });
    expect(Number(r.score)).toBe(100);
  });
});

describe("tampilan client", () => {
  it("progres per outlet tanpa nama shopper, tanggal, atau jawaban", async () => {
    const rows = (await t.as<{ r: Record<string, unknown>[] }>(client, "select public.client_audit_progress() as r")).rows[0].r;
    const pusat = rows.find((r) => r.outlet_id === jakarta);
    expect(pusat).toMatchObject({ name: "Kopi Pusat", awaiting_qc: 1 });
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/Sari|window|answers|score|081/);
    expect((await t.as<{ r: unknown[] }>(sari, "select public.client_audit_progress() as r")).rows[0].r).toEqual([]);
  });

  it("kunjungan yang sedang berlangsung tetap tampil dijadwalkan", async () => {
    const task = await createTask(bandung);
    await offer(task, budi);
    await respond(budi, task, true);
    await checkIn(budi, task);
    const rows = (await t.as<{ r: { outlet_id: string; scheduled: number; awaiting_qc: number }[] }>(client, "select public.client_audit_progress() as r")).rows[0].r;
    // Satu tugas terbuka dari tes sebelumnya ditambah kunjungan yang sedang berlangsung.
    expect(rows.find((r) => r.outlet_id === bandung)).toMatchObject({ scheduled: 2, awaiting_qc: 0 });
  });
});
