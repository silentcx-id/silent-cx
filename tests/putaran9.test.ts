import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let sari: string;
let template: string;

type Question = { id: string; prompt: string; kind: string; photo_required: boolean; sop: boolean; red_flag: boolean; stage: string | null };
type Snapshot = { sections: { id: string; title: string; target: number; questions: Question[] }[] };

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const snapshotOf = async (project: string) => (await one<{ snapshot: Snapshot }>("select snapshot from public.project_questionnaires where project_id = $1", [project])).snapshot;

// Semua Ya / skala 5, kecuali pertanyaan yang teksnya ada di `no` dijawab Tidak / skala 1.
const answersFor = (s: Snapshot, no: string[] = []) =>
  Object.fromEntries(
    s.sections.flatMap((sec) =>
      sec.questions.map((q) => {
        const bad = no.some((p) => q.prompt.startsWith(p));
        return [q.id, { value: q.kind === "yes_no" ? (bad ? "no" : "yes") : q.kind === "scale" ? (bad ? 1 : 5) : "Catatan.", na: false }];
      }),
    ),
  );

async function project(code: string, entitlements: string[], addons: unknown[] = [], outlets = 1) {
  const id = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, addons_snapshot, outlet_count, entitlements, status)
       values ($1, $2, '{"key":"insight","name":"SilentCX Insight","visits":1,"purchase_allowance":150000}', $3::jsonb, $4, $5, 'active') returning id`,
      [code, client, JSON.stringify(addons), outlets, entitlements],
    )
  ).id;
  const ids: string[] = [];
  for (let i = 1; i <= outlets; i++)
    ids.push((await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, $2, 'Jakarta', $3, 'Jl. Satu') returning id", [id, i, `${code} Cabang ${i}`])).id);
  return { id, outlets: ids };
}

async function visit(projectId: string, outletId: string, no: string[] = [], start = 0) {
  const task = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date) as id", [outletId, day(start), day(start + 7)])).rows[0].id;
  await t.as(admin, "select public.admin_offer_task($1, $2)", [task, sari]);
  await t.as(sari, "select public.shopper_respond_offer($1, true)", [task]);
  await t.as(sari, "select public.shopper_check_in($1, -6.2, 106.8, 20, $2)", [task, `${sari}/${task}/checkin.jpg`]);
  const snap = await snapshotOf(projectId);
  await t.as(sari, "select public.shopper_save_visit($1, $2::jsonb, 50000, '')", [task, JSON.stringify(answersFor(snap, no))]);
  for (const q of snap.sections.flatMap((s) => s.questions).filter((q) => q.photo_required))
    await t.as(sari, "select public.shopper_add_photo($1, 'evidence', $2, $3)", [task, q.id, `${sari}/${task}/${q.id}.jpg`]);
  await t.as(sari, "select public.shopper_add_photo($1, 'receipt', null, $2)", [task, `${sari}/${task}/struk.jpg`]);
  await t.as(sari, "select public.shopper_submit_visit($1)", [task]);
  await t.as(admin, "select public.admin_qc_approve($1, false, null)", [task]);
  return task;
}

const reportData = async (projectId: string) => (await t.as<{ r: Record<string, unknown> }>(admin, "select public.project_report_data($1) as r", [projectId])).rows[0].r;
const blockers = async (projectId: string) => (await t.as<{ b: string[] }>(admin, "select public.report_blockers($1) as b", [projectId])).rows[0].b;

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [client]);
  sari = await t.signUp("sari@contoh.test", { account_type: "shopper", full_name: "Sari", phone: "081255556666" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [sari]);
  await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities) values ($1, 'approved', '{Jakarta}')", [sari]);
  await t.db.query("update public.app_settings set value = value || '{\"max_active_tasks\": 50}'::jsonb where key = 'field'");
  await t.db.query("insert into public.companies (client_id, name, pic_name, pic_phone) values ($1, 'Kopi Senja', 'Rina', '081211112222')", [client]);
  template = (await one<{ id: string }>("select id from public.questionnaires where name = 'Kafe & restoran — dasar'")).id;
});

describe("kuesioner: SOP, red flag, tahap journey, target", () => {
  it("setiap jenis usaha punya contoh tahap journey, dan template bawaan sudah ditandai", async () => {
    const n = await one<{ types: number; fnb: number }>("select count(distinct business_type)::int as types, count(*) filter (where business_type = 'fnb')::int as fnb from public.journey_stages");
    expect(n.types).toBe(9);
    expect(n.fnb).toBe(6);
    const q = await one<{ sop: number; flags: number; staged: number }>(
      `select count(*) filter (where is_sop)::int as sop, count(*) filter (where red_flag)::int as flags, count(journey_stage_id)::int as staged
       from public.questionnaire_questions q join public.questionnaire_sections s on s.id = q.section_id where s.questionnaire_id = $1`,
      [template],
    );
    expect(q).toEqual({ sop: 5, flags: 3, staged: 16 });
  });

  it("SOP hanya untuk Ya/Tidak; red flag tidak untuk isian teks", async () => {
    const sec = (await one<{ id: string }>("select id from public.questionnaire_sections where questionnaire_id = $1 limit 1", [template])).id;
    await expect(t.as(admin, "insert into public.questionnaire_questions (section_id, prompt, kind, is_sop) values ($1, 'Skala SOP', 'scale', true)", [sec])).rejects.toThrow(/sop_kind/);
    await expect(t.as(admin, "insert into public.questionnaire_questions (section_id, prompt, kind, red_flag) values ($1, 'Teks', 'text', true)", [sec])).rejects.toThrow(/red_flag_kind/);
  });

  it("hanya admin yang mengelola tahap journey", async () => {
    await expect(t.as(client, "insert into public.journey_stages (business_type, title) values ('fnb', 'Tahap palsu')")).rejects.toThrow();
    expect((await t.as<{ n: number }>(client, "select count(*)::int as n from public.journey_stages")).rows[0].n).toBe(0);
  });

  it("tahap dari jenis usaha lain membuat kuesioner belum siap", async () => {
    const copy = (await t.as<{ id: string }>(admin, "insert into public.questionnaires (name, business_type) values ('Uji tahap', 'retail') returning id")).rows[0].id;
    const sec = (await t.as<{ id: string }>(admin, "insert into public.questionnaire_sections (questionnaire_id, title, weight) values ($1, 'Semua', 100) returning id", [copy])).rows[0].id;
    const fnbStage = (await one<{ id: string }>("select id from public.journey_stages where business_type = 'fnb' limit 1")).id;
    await t.as(admin, "insert into public.questionnaire_questions (section_id, prompt, kind, journey_stage_id) values ($1, 'Disapa?', 'yes_no', $2)", [sec, fnbStage]);
    const issues = (await t.as<{ i: string[] }>(admin, "select public.questionnaire_issues($1) as i", [copy])).rows[0].i;
    expect(issues.join(" ")).toMatch(/jenis usaha lain/);
  });

  it("salinan proyek memuat target bagian dan tanda pertanyaan", async () => {
    const p = await project("PRJ-S1", ["report_basic", "report_detailed", "sop"]);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [p.id, template]);
    const snap = await snapshotOf(p.id);
    expect(snap.sections[0].target).toBe(85);
    const greet = snap.sections[0].questions[0];
    expect(greet).toMatchObject({ sop: true, red_flag: false, stage: "Kedatangan dan sapaan" });
  });

  it("paket ber-SOP menolak kuesioner tanpa SOP dan journey; Performance juga butuh red flag", async () => {
    await t.db.query(
      `update public.questionnaire_questions q set is_sop = false, journey_stage_id = null, red_flag = false
       from public.questionnaire_sections s where s.id = q.section_id and s.questionnaire_id = $1`,
      [template],
    );
    const insight = await project("PRJ-S2", ["report_basic", "sop"]);
    await expect(t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [insight.id, template])).rejects.toThrow(/pertanyaan SOP/);
    const essential = await project("PRJ-S3", ["report_basic"]);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [essential.id, template]);

    await t.db.query(
      `update public.questionnaire_questions q set is_sop = (q.kind = 'yes_no' and q.position = 1),
         journey_stage_id = (select id from public.journey_stages where business_type = 'fnb' and position = least(s.position, 6))
       from public.questionnaire_sections s where s.id = q.section_id and s.questionnaire_id = $1 and q.kind <> 'text'`,
      [template],
    );
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [insight.id, template]);
    const perf = await project("PRJ-S4", ["report_basic", "sop", "multi_outlet", "benchmarking"]);
    await expect(t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [perf.id, template])).rejects.toThrow(/red flag/);
  });
});

describe("laporan: kepatuhan SOP, journey, gap, red flag", () => {
  let p: { id: string; outlets: string[] };

  beforeAll(async () => {
    // Kembalikan tanda template bawaan seperti dari migrasi.
    await t.db.query("update public.questionnaire_questions set is_sop = false, red_flag = false, journey_stage_id = null");
    await t.db.query(`update public.questionnaire_questions q set is_sop = v.sop, red_flag = v.flag,
        journey_stage_id = (select id from public.journey_stages js where js.business_type = 'fnb' and js.title = v.stage)
      from (values ('Staf menyapa', true, false, 'Kedatangan dan sapaan'), ('Staf mengulang', true, false, 'Pemesanan'),
                   ('Pesanan yang diterima', false, true, 'Penyajian dan konsumsi'), ('Nominal di struk', true, true, 'Pembayaran'),
                   ('Meja dan kursi', false, true, 'Menunggu pesanan'))
        as v(prompt, sop, flag, stage) where q.prompt like v.prompt || '%'`);
    p = await project("PRJ-R1", ["report_basic", "report_detailed", "sop", "evidence", "multi_outlet", "benchmarking"], [], 2);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [p.id, template]);
    await t.db.query("update public.projects set details_completed_at = now() where id = $1", [p.id]);
    await visit(p.id, p.outlets[0], ["Staf menyapa", "Meja dan kursi"]);
    await visit(p.id, p.outlets[1], ["Staf menyapa", "Nominal di struk"]);
  });

  it("kepatuhan SOP = Ya / (Ya + Tidak), SOP yang dilanggar beserta outletnya", async () => {
    const r = await reportData(p.id);
    const sop = r.sop as { score: number; yes: number; no: number; items: { prompt: string; no: number; outlets: string[] }[] };
    // 3 pertanyaan SOP × 2 kunjungan = 6 jawaban; 3 Tidak.
    expect(sop.yes).toBe(3);
    expect(sop.no).toBe(3);
    expect(Number(sop.score)).toBe(50);
    expect(sop.items[0]).toMatchObject({ no: 2, outlets: ["PRJ-R1 Cabang 1", "PRJ-R1 Cabang 2"] });
    expect(sop.items[0].prompt).toMatch(/^Staf menyapa/);
  });

  it("customer journey per tahap sesuai urutan tahap", async () => {
    const journey = (await reportData(p.id)).journey as { title: string; score: number }[];
    expect(journey.map((j) => j.title)).toEqual(["Kedatangan dan sapaan", "Pemesanan", "Menunggu pesanan", "Penyajian dan konsumsi", "Pembayaran"]);
    expect(Number(journey[0].score)).toBe(0);
    expect(Number(journey[1].score)).toBe(100);
  });

  it("bagian memuat target; outlet memuat SOP dan jumlah red flag", async () => {
    const r = await reportData(p.id);
    expect((r.sections as { target: number }[])[0].target).toBe(85);
    const outlets = r.outlets as { name: string; sop: number; redFlags: number }[];
    expect(outlets.map((o) => o.redFlags)).toEqual([1, 1]);
    expect(Number(outlets[0].sop)).toBeCloseTo(66.7, 1);
    const flags = r.redFlags as { prompt: string; outlet: string }[];
    expect(flags.map((f) => f.outlet)).toEqual(["PRJ-R1 Cabang 1", "PRJ-R1 Cabang 2"]);
  });

  it("red flag tidak memotong skor", async () => {
    const r = await reportData(p.id);
    const sections = r.sections as { title: string; score: number }[];
    expect(Number(sections.find((s) => s.title === "Kebersihan dan suasana")?.score)).toBeGreaterThan(0);
  });
});

describe("kunjungan tambahan", () => {
  let p: { id: string; outlets: string[] };
  const save = (items: unknown[]) => t.as(client, "select public.client_save_extra_visits($1, $2::jsonb)", [p.id, JSON.stringify(items)]);
  const progress = async () => (await t.as<{ r: { outlet_id: string; visits_planned: number }[] }>(client, "select public.client_audit_progress() as r")).rows[0].r.filter((x) => p.outlets.includes(x.outlet_id));

  beforeAll(async () => {
    p = await project("PRJ-V1", ["report_basic", "additional_visit"], [{ item_key: "additional_visit", label: "Kunjungan tambahan", quantity: 2 }], 2);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [p.id, template]);
  });

  it("client membagikan ke outlet yang sudah bernama, tidak lebih dari yang dibeli", async () => {
    await expect(save([{ outlet_id: p.outlets[0], extra: 3 }])).rejects.toThrow(/tidak valid|membeli 2/);
    await expect(save([{ outlet_id: p.outlets[0], extra: 2 }, { outlet_id: p.outlets[1], extra: 1 }])).rejects.toThrow(/membeli 2 kunjungan tambahan, tetapi membagikan 3/);
    await save([{ outlet_id: p.outlets[0], extra: 1 }]);
    await expect(t.as(client, "select public.complete_project_details($1, '')", [p.id])).rejects.toThrow(/Bagikan 2 kunjungan tambahan/);
    await save([{ outlet_id: p.outlets[0], extra: 1 }, { outlet_id: p.outlets[1], extra: 1 }]);
    await t.as(client, "select public.complete_project_details($1, '')", [p.id]);
  });

  it("progres client dan penghalang laporan memakai kunjungan per outlet", async () => {
    expect((await progress()).map((r) => r.visits_planned)).toEqual([2, 2]);
    await visit(p.id, p.outlets[0]);
    expect((await blockers(p.id)).join(" ")).toMatch(/Cabang 1": 1 dari 2 kunjungan/);
  });

  it("pembagian terkunci setelah outlet dijadwalkan", async () => {
    await expect(save([{ outlet_id: p.outlets[0], extra: 0 }, { outlet_id: p.outlets[1], extra: 2 }])).rejects.toThrow(/sudah dijadwalkan/);
  });
});

describe("laporan express", () => {
  it("hari kerja melewati Sabtu dan Minggu", async () => {
    // 30 Okt 2026 hari Jumat.
    const d = async (days: number) => (await one<{ d: string }>("select public.add_working_days('2026-10-30 10:00+07', $1)::text as d", [days])).d;
    expect(await d(2)).toBe("2026-11-03");
    expect(await d(5)).toBe("2026-11-06");
  });

  it("perkiraan terbit muncul setelah semua kunjungan lolos QC: express 2 hari kerja, biasa 5", async () => {
    const fast = await project("PRJ-E1", ["report_basic", "priority"]);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [fast.id, template]);
    await t.db.query("update public.projects set details_completed_at = now() where id = $1", [fast.id]);
    const eta = async (id: string) => (await t.as<{ e: { express: boolean; days: number; due: string | null } }>(client, "select public.project_report_eta($1) as e", [id])).rows[0].e;
    expect(await eta(fast.id)).toMatchObject({ express: true, days: 2, due: null });
    await visit(fast.id, fast.outlets[0]);
    const e = await eta(fast.id);
    expect(e.due).toBe((await one<{ d: string }>("select public.add_working_days(now(), 2)::text as d")).d);
    expect(await t.as<{ e: unknown }>(sari, "select public.project_report_eta($1) as e", [fast.id]).then((r) => r.rows[0].e)).toBeNull();
  });
});

describe("kuesioner khusus", () => {
  it("brief wajib diisi sebelum data dianggap lengkap", async () => {
    const p = await project("PRJ-K1", ["report_basic", "custom_scope"]);
    await expect(t.as(client, "select public.complete_project_details($1, '')", [p.id])).rejects.toThrow(/kuesioner khusus/);
    await t.as(client, "select public.client_save_brief($1, $2)", [p.id, "Fokus ke SOP penyambutan tamu dan penawaran paket."]);
    await t.as(client, "select public.complete_project_details($1, '')", [p.id]);
    const other = await project("PRJ-K2", ["report_basic"]);
    await expect(t.as(client, "select public.client_save_brief($1, 'Brief yang cukup panjang di sini.')", [other.id])).rejects.toThrow(/tidak termasuk kuesioner khusus/);
  });
});

describe("audit ulang", () => {
  let parent: { id: string; outlets: string[] };
  let child: string;

  it("tidak bisa dipesan di checkout paket biasa", async () => {
    await expect(t.as(client, "select public.create_order('insight', '{Jakarta}', '[{\"key\":\"re_audit\",\"qty\":1}]'::jsonb)")).rejects.toThrow(/halaman laporan/);
  });

  it("hanya bisa dipesan setelah laporan terbit", async () => {
    parent = await project("PRJ-A1", ["report_basic", "report_detailed", "sop", "consultation", "priority"], [], 2);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [parent.id, template]);
    await t.db.query("update public.projects set details_completed_at = now(), objectives = 'Naikkan kepatuhan SOP' where id = $1", [parent.id]);
    await expect(t.as(client, "select public.client_order_reaudit($1)", [parent.id])).rejects.toThrow(/setelah laporan terbit/);
    for (const o of parent.outlets) await visit(parent.id, o, ["Staf menyapa"]);
    await t.as(admin, "select public.admin_save_report($1, 'Ringkasan', $2::jsonb, $3::jsonb, '{}')", [
      parent.id,
      JSON.stringify([{ title: "Sapaan lambat", detail: "", severity: "major", outlet: null }]),
      JSON.stringify([{ text: "Latih sapaan", priority: "now" }]),
    ]);
    await t.as(admin, "select public.admin_publish_report($1)", [parent.id]);
  });

  it("pesanan audit ulang menyalin outlet, tujuan, dan kuesioner; tanpa konsultasi dan express", async () => {
    child = (await t.as<{ id: string }>(client, "select public.client_order_reaudit($1) as id", [parent.id])).rows[0].id;
    const c = await one<{ status: string; outlet_count: number; parent_project_id: string; entitlements: string[]; objectives: string; visits: string; total: number }>(
      `select p.status::text, p.outlet_count, p.parent_project_id, p.entitlements, p.objectives, p.package_snapshot ->> 'visits' as visits, i.total
       from public.projects p join public.invoices i on i.project_id = p.id where p.id = $1`,
      [child],
    );
    expect(c).toMatchObject({ status: "awaiting_review", outlet_count: 2, parent_project_id: parent.id, objectives: "Naikkan kepatuhan SOP", visits: "1", total: 2 * 899000 });
    expect(c.entitlements).toContain("re_audit");
    expect(c.entitlements).toContain("sop");
    expect(c.entitlements).not.toContain("consultation");
    expect(c.entitlements).not.toContain("priority");
    expect((await one<{ n: number }>("select count(*)::int as n from public.project_outlets where project_id = $1 and name <> ''", [child])).n).toBe(2);
    expect(await snapshotOf(child)).toEqual(await snapshotOf(parent.id));
    await expect(t.as(client, "select public.client_order_reaudit($1)", [parent.id])).rejects.toThrow(/sudah dipesan/);
  });

  it("kunjungan paling cepat 30 hari setelah laporan terbit, dan laporan memuat audit sebelumnya", async () => {
    await t.db.query("update public.projects set status = 'active' where id = $1", [child]);
    const outlet = (await one<{ id: string }>("select id from public.project_outlets where project_id = $1 order by position limit 1", [child])).id;
    await expect(t.as(admin, "select public.admin_create_task($1, $2::date, $3::date)", [outlet, day(0), day(7)])).rejects.toThrow(/paling cepat/);
    await t.as(admin, "select public.admin_create_task($1, $2::date, $3::date)", [outlet, day(30), day(37)]);
    const r = await reportData(child);
    expect(r.previous).toMatchObject({ code: "PRJ-A1" });
    expect((r.previous as { sections: unknown[] }).sections.length).toBeGreaterThan(0);
  });
});

describe("teks paket", () => {
  it("Performance tanpa Review manajemen, tren diganti pola antar outlet", async () => {
    const f = (await one<{ features: string[] }>("select features from public.packages where key = 'performance'")).features;
    expect(f).not.toContain("Review manajemen");
    expect(f).not.toContain("Analisis tren antar outlet");
    expect(f).toContain("Pola antar outlet");
  });
});

describe("setiap fitur di daftar harga ada di laporan", () => {
  it("fitur paket bawaan tercatat dan muncul di laporan contoh paketnya", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ReportView } = await import("../src/components/report-view");
    const { SAMPLES } = await import("../src/lib/report/sample");
    const { FEATURE_COVERAGE } = await import("../src/lib/report/coverage");
    const packages = (await t.db.query<{ key: keyof typeof SAMPLES; features: string[]; entitlements: string[] }>("select key, features, entitlements from public.packages order by sort_order")).rows;
    expect(packages.map((p) => p.key)).toEqual(["essential", "insight", "performance"]);
    for (const p of packages) {
      const sample = SAMPLES[p.key];
      // Contoh laporan memakai fitur paket sungguhan (ditambah add-on kompetitor di contoh Performance).
      expect(p.entitlements.every((e) => sample.entitlements.includes(e)), p.key).toBe(true);
      const html = renderToStaticMarkup(createElement(ReportView, { data: sample }));
      for (const feature of p.features) {
        const c = FEATURE_COVERAGE[feature];
        expect(c, `${p.key}: fitur "${feature}" belum dipetakan di coverage.ts`).toBeDefined();
        if (c.kind === "report") expect(html, `${p.key}: "${feature}" tidak muncul di laporan`).toContain(c.text);
      }
    }
  });

  it("bagian Insight dan Performance tidak muncul di laporan Essential", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ReportView } = await import("../src/components/report-view");
    const { essentialSample, insightSample } = await import("../src/lib/report/sample");
    const essential = renderToStaticMarkup(createElement(ReportView, { data: essentialSample }));
    for (const text of ["Kepatuhan SOP", "Customer journey", "Analisis gap", "Red flag", "Pola antar outlet"]) expect(essential).not.toContain(text);
    const insight = renderToStaticMarkup(createElement(ReportView, { data: insightSample }));
    expect(insight).toContain("Analisis gap");
    expect(insight).not.toContain("Red flag");
    expect(insight).toContain("Ringkasan manajemen");
  });
});
