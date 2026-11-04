import { beforeAll, describe, expect, it } from "vitest";
import { EMAIL_KINDS } from "../src/lib/email-content";
import { notificationLink, notificationText } from "../src/lib/notification-text";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let other: string;
let shopper: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const inAWeek = () => new Date(Date.now() + 7 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);
const order = (who: string, pkg: string, cities: string[], addons: unknown[] = []) =>
  t.as<{ id: string }>(who, "select public.create_order($1, $2, $3::jsonb) as id", [pkg, cities, JSON.stringify(addons)]).then((r) => r.rows[0].id);
const invoiceOf = (project: string, kind = "order") =>
  one<{ id: string; code: string; total: number; status: string; dp_amount: number | null; due_at: string | null }>(
    "select id, code, total, status::text, dp_amount, due_at from public.invoices where project_id = $1 and kind = $2",
    [project, kind],
  );
const plan = (who: string, invoice: string, dp: number | null) => t.as(who, "select public.client_set_payment_plan($1, $2)", [invoice, dp]);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Kopi Senja" });
  other = await t.signUp("lain@contoh.test", { full_name: "Lain" });
  shopper = await t.signUp("sari@contoh.test", { account_type: "shopper", full_name: "Sari", phone: "081233334444" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [shopper]);
  await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities) values ($1, 'approved', '{Jakarta}')", [shopper]);
  await t.db.query("insert into public.service_cities (name) values ('Jakarta')");
  await t.db.query("insert into public.companies (client_id, name, pic_name, pic_phone) values ($1, 'Kopi Senja', 'Rina', '081211112222')", [client]);
});

describe("pilihan cara bayar", () => {
  let project: string;
  let inv: Awaited<ReturnType<typeof invoiceOf>>;

  beforeAll(async () => {
    project = await order(client, "essential", ["Jakarta"]);
    inv = await invoiceOf(project);
  });

  it("bawaan bayar penuh", () => {
    expect(inv).toMatchObject({ status: "unpaid", dp_amount: null });
  });

  it("DP minimal 80%, nominal bebas di atasnya", async () => {
    const min = Math.ceil(inv.total * 0.8);
    await expect(plan(client, inv.id, min - 1)).rejects.toThrow(/DP minimal 80%/);
    await plan(client, inv.id, min);
    expect((await invoiceOf(project)).dp_amount).toBe(min);
    await plan(client, inv.id, inv.total - 1000);
    expect((await invoiceOf(project)).dp_amount).toBe(inv.total - 1000);
  });

  it("nominal sama dengan total atau kosong = bayar penuh", async () => {
    await plan(client, inv.id, inv.total);
    expect((await invoiceOf(project)).dp_amount).toBeNull();
    await plan(client, inv.id, Math.ceil(inv.total * 0.9));
    await plan(client, inv.id, null);
    expect((await invoiceOf(project)).dp_amount).toBeNull();
  });

  it("client lain tidak bisa mengatur, dan tidak bisa diganti setelah bukti diunggah", async () => {
    await expect(plan(other, inv.id, Math.ceil(inv.total * 0.8))).rejects.toThrow(/tidak ditemukan/);
    await plan(client, inv.id, Math.ceil(inv.total * 0.8));
    await t.as(client, "select public.submit_payment_proof($1, 'transfer', $2, $3, 'Rina')", [inv.id, `${client}/${inv.id}/bukti.jpg`, Math.ceil(inv.total * 0.8)]);
    await expect(plan(client, inv.id, null)).rejects.toThrow(/sebelum bukti bayar diunggah/);
    await t.as(admin, "select public.admin_verify_payment($1, true)", [inv.id]);
    expect((await invoiceOf(project)).status).toBe("paid");
  });

  it("tagihan selain pesanan paket tetap bayar penuh", async () => {
    const consult = (
      await one<{ id: string }>(
        "insert into public.invoices (code, project_id, client_id, status, total, due_at, kind) values ('INV-K1', $1, $2, 'unpaid', 399000, now() + interval '1 day', 'consultation') returning id",
        [project, client],
      )
    ).id;
    await expect(plan(client, consult, 350000)).rejects.toThrow(/hanya untuk pesanan paket/);
    await t.db.query("update public.invoices set status = 'cancelled' where id = $1", [consult]);
  });
});

describe("rincian biaya Tugas luar kota", () => {
  let project: string;
  let lineId: string;

  beforeAll(async () => {
    project = await order(other, "essential", ["Jakarta"], [{ key: "out_of_city", qty: 2 }]);
    lineId = (await one<{ id: string }>("select l.id from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where i.project_id = $1 and l.item_key = 'out_of_city'", [project])).id;
  });
  const review = (prices: unknown) => t.as(admin, "select public.admin_review_order($1, true, null, $2::jsonb)", [project, JSON.stringify(prices)]);

  it("jumlah rincian harus sama dengan jumlah unit", async () => {
    await expect(review({ [lineId]: { groups: [{ name: "Medan", items: [{ label: "Transportasi", amount: 250000 }] }] } })).rejects.toThrow(/2 rincian/);
    await expect(review({ [lineId]: { groups: [{ name: "Medan", items: [] }, { name: "Makassar", items: [{ label: "Tiket", amount: 1 }] }] } })).rejects.toThrow(/1 sampai 10 biaya/);
    await expect(review({ [lineId]: { groups: [{ name: "Medan", items: [{ label: "", amount: 5 }] }, { name: "Makassar", items: [{ label: "Tiket", amount: 1 }] }] } })).rejects.toThrow(/Isi nama dan jumlah/);
  });

  it("dipecah per outlet dengan rincian, total invoice ikut", async () => {
    await review({
      [lineId]: {
        groups: [
          { name: "Medan", items: [{ label: "Transportasi", amount: 250000 }, { label: "Penginapan", amount: 350000 }, { label: "Uang makan", amount: 100000 }] },
          { name: "Makassar", items: [{ label: "Transportasi", amount: 400000 }] },
        ],
      },
    });
    const lines = (
      await t.db.query<{ position: number; label: string; quantity: number; amount: number; details: { label: string; amount: number }[] }>(
        "select l.position, l.label, l.quantity, l.amount, l.details from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where i.project_id = $1 order by l.position",
        [project],
      )
    ).rows;
    expect(lines.map((l) => l.position)).toEqual(lines.map((_, i) => i + 1));
    const ooc = lines.filter((l) => l.label.startsWith("Tugas luar kota"));
    expect(ooc).toHaveLength(2);
    expect(ooc[0]).toMatchObject({ label: "Tugas luar kota · Medan", quantity: 1, amount: 700000 });
    expect(ooc[0].details).toEqual([
      { label: "Transportasi", amount: 250000 },
      { label: "Penginapan", amount: 350000 },
      { label: "Uang makan", amount: 100000 },
    ]);
    expect(ooc[1]).toMatchObject({ label: "Tugas luar kota · Makassar", amount: 400000 });
    const inv = await invoiceOf(project);
    expect(inv.status).toBe("unpaid");
    expect(inv.total).toBe(lines.reduce((s, l) => s + l.amount, 0));
  });
});

// Proyek aktif dengan satu kunjungan lolos QC (kelebihan belanja Rp30.000 disetujui), siap diterbitkan.
async function readyProject(code: string, owner: string, dp: number | null) {
  const project = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, outlet_count, entitlements, status, details_completed_at)
       values ($1, $2, '{"name":"SilentCX Essential","visits":1,"purchase_allowance":150000}', 1, '{report_basic}', 'active', now()) returning id`,
      [code, owner],
    )
  ).id;
  await t.db.query(
    "insert into public.invoices (code, project_id, client_id, status, total, dp_amount, paid_at, kind) values ($1, $2, $3, 'paid', 2000000, $4, now(), 'order')",
    [`INV-${code}`, project, owner, dp],
  );
  const outlet = (await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, 1, 'Jakarta', 'Kopi Senja Kemang', 'Jl. Satu') returning id", [project])).id;
  const template = (await one<{ id: string }>("select id from public.questionnaires where project_id is null order by name limit 1")).id;
  await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, template]);
  await t.approveQuestionnaire(admin, project);
  const task = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date) as id", [outlet, today(), inAWeek()])).rows[0].id;
  await t.as(admin, "select public.admin_offer_task($1, $2)", [task, shopper]);
  await t.as(shopper, "select public.shopper_respond_offer($1, true)", [task]);
  await t.as(shopper, "select public.shopper_check_in($1, -6.2, 106.8, 20, $2)", [task, `${shopper}/${task}/checkin.jpg`]);
  const snap = (await one<{ snapshot: { sections: { questions: { id: string; kind: string; photo_required: boolean }[] }[] } }>("select snapshot from public.project_questionnaires where project_id = $1", [project])).snapshot;
  const answers = Object.fromEntries(snap.sections.flatMap((s) => s.questions.map((q) => [q.id, { value: q.kind === "yes_no" ? "yes" : q.kind === "scale" ? 5 : "Catatan.", na: false }])));
  await t.as(shopper, "select public.shopper_save_visit($1, $2::jsonb, 180000, '')", [task, JSON.stringify(answers)]);
  for (const q of snap.sections.flatMap((s) => s.questions).filter((q) => q.photo_required)) {
    await t.as(shopper, "select public.shopper_add_photo($1, 'evidence', $2, $3)", [task, q.id, `${shopper}/${task}/${q.id}.jpg`]);
  }
  await t.as(shopper, "select public.shopper_add_photo($1, 'receipt', null, $2)", [task, `${shopper}/${task}/struk.jpg`]);
  await t.as(shopper, "select public.shopper_submit_visit($1)", [task]);
  await t.as(admin, "select public.admin_check_location($1, true)", [task]);
  await t.as(admin, "select public.admin_qc_approve($1, true, 'Rapi')", [task]);
  await t.as(admin, "select public.admin_save_report($1, 'Ringkasan.', $2::jsonb, '[{\"text\":\"Latih staf kasir\",\"priority\":\"now\"}]'::jsonb, '{}')", [
    project,
    JSON.stringify([
      { title: "Minor satu", detail: "a", severity: "minor", outlet: null },
      { title: "Kritis", detail: "b", severity: "critical", outlet: null },
      { title: "Mayor", detail: "c", severity: "major", outlet: null },
      { title: "Minor dua", detail: "d", severity: "minor", outlet: null },
    ]),
  ]);
  return project;
}

describe("pelunasan dan laporan terkunci", () => {
  let dpProject: string;
  let fullProject: string;

  beforeAll(async () => {
    dpProject = await readyProject("PRJ-DP", client, 1600000);
    fullProject = await readyProject("PRJ-FULL", other, null);
  });

  it("client DP: tagihan pelunasan berisi sisa dan kelebihan belanja, tanpa batas waktu", async () => {
    await t.as(admin, "select public.admin_publish_report($1)", [dpProject]);
    const st = await invoiceOf(dpProject, "settlement");
    expect(st).toMatchObject({ status: "unpaid", total: 400000 + 30000, due_at: null });
    const lines = (await t.db.query<{ kind: string; label: string; amount: number }>("select kind, label, amount from public.invoice_lines where invoice_id = $1 order by position", [st.id])).rows;
    expect(lines[0]).toMatchObject({ kind: "settlement", amount: 400000 });
    expect(lines[0].label).toMatch(/Pelunasan pesanan INV-PRJ-DP \(total Rp2\.000\.000, DP Rp1\.600\.000\)/);
    expect(lines[1]).toMatchObject({ amount: 30000 });
    expect(lines[1].label).toMatch(/Kelebihan biaya pembelian/);
    expect(await t.db.query("select 1 from public.invoices where project_id = $1 and kind = 'excess'", [dpProject]).then((r) => r.rows.length)).toBe(0);
    const n = (await t.as<{ detail: Record<string, unknown> }>(client, "select detail from public.notifications where kind = 'report.published'")).rows[0];
    expect(n.detail).toMatchObject({ locked: true, total: 430000 });
  });

  it("laporan lengkap tidak terbaca, ringkasan terbatas tersedia", async () => {
    expect((await t.as(client, "select 1 from public.reports where project_id = $1", [dpProject])).rows).toHaveLength(0);
    const p = (await t.as<{ p: Record<string, unknown> & { outlets: { name: string; score: unknown }[]; findings: { title: string }[] } }>(client, "select public.client_report_preview($1) as p", [dpProject])).rows[0].p;
    expect(p).toMatchObject({ code: "PRJ-DP", company: "Kopi Senja", settlement: { total: 430000, status: "unpaid" } });
    expect(Number(p.score)).toBe(100);
    expect(p.outlets[0]).toMatchObject({ name: "Kopi Senja Kemang" });
    expect(p.findings.map((f) => f.title)).toEqual(["Kritis", "Mayor", "Minor satu"]);
    expect(JSON.stringify(p)).not.toMatch(/sections|recommendations|photo/);
    expect((await t.as<{ p: unknown }>(other, "select public.client_report_preview($1) as p", [dpProject])).rows[0].p).toBeNull();
    const locked = (await t.as<{ code: string }>(client, "select * from public.client_locked_reports()")).rows;
    expect(locked.map((r) => r.code)).toEqual(["PRJ-DP"]);
  });

  it("pelunasan diverifikasi: laporan terbuka penuh dan client diberi tahu", async () => {
    const st = await invoiceOf(dpProject, "settlement");
    await t.as(client, "select public.submit_payment_proof($1, 'transfer', $2, 430000, 'Rina')", [st.id, `${client}/${st.id}/lunas.jpg`]);
    expect((await t.as(client, "select 1 from public.reports where project_id = $1", [dpProject])).rows).toHaveLength(0);
    await t.as(admin, "select public.admin_verify_payment($1, true)", [st.id]);
    expect((await t.as(client, "select 1 from public.reports where project_id = $1", [dpProject])).rows).toHaveLength(1);
    expect((await t.as<{ p: unknown }>(client, "select public.client_report_preview($1) as p", [dpProject])).rows[0].p).toBeNull();
    const n = (await t.as<{ email_status: string }>(client, "select email_status from public.notifications where kind = 'report.unlocked'")).rows;
    expect(n).toHaveLength(1);
    expect(n[0].email_status).toBe("pending");
  });

  it("client bayar penuh: laporan langsung terbuka, kelebihan ditagih terpisah", async () => {
    await t.as(admin, "select public.admin_publish_report($1)", [fullProject]);
    expect(await t.db.query("select 1 from public.invoices where project_id = $1 and kind = 'settlement'", [fullProject]).then((r) => r.rows.length)).toBe(0);
    expect(await invoiceOf(fullProject, "excess")).toMatchObject({ total: 30000, status: "unpaid" });
    expect((await t.as(other, "select 1 from public.reports where project_id = $1", [fullProject])).rows).toHaveLength(1);
    const n = (await t.as<{ detail: Record<string, unknown> }>(other, "select detail from public.notifications where kind = 'report.published'")).rows[0];
    expect(n.detail).toMatchObject({ locked: false });
  });
});

describe("notifikasi", () => {
  const n = (kind: string, detail: Record<string, unknown>) => ({ id: 1, kind, detail, read_at: null, created_at: new Date().toISOString() });

  it("laporan terkunci menyebut pelunasan; laporan terbuka punya tautan", () => {
    expect(notificationText(n("report.published", { code: "PRJ-1", locked: true, total: 430000 }), "id")).toMatch(/pelunasan Rp430\.000/);
    expect(notificationText(n("report.published", { code: "PRJ-1" }), "id")).not.toMatch(/pelunasan/);
    expect(notificationLink(n("report.published", { project: "p1", locked: true }), "id")).toEqual({ href: "/app/billing", label: "Bayar pelunasan" });
    expect(notificationText(n("report.unlocked", { code: "PRJ-1" }), "id")).toMatch(/terbuka penuh/);
    expect(notificationLink(n("report.unlocked", { project: "p1" }), "id")?.href).toBe("/app/reports/p1");
  });

  it("report.unlocked dikirim lewat email", async () => {
    expect(EMAIL_KINDS["report.unlocked"]).toBeTruthy();
    expect((await one<{ ok: boolean }>("select public.is_email_kind('report.unlocked') as ok")).ok).toBe(true);
  });
});
