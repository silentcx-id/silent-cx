import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { cleanTemplates, draftFromQuestionnaire, fillPlaceholders, INSTRUCTION_MAX } from "../src/lib/instructions";
import { contactPhone, followupTemplates, projectConfirmMessage } from "../src/lib/followups";

let t: TestDb;
let admin: string;
let cs: string;
let cs2: string;
let client: string;
let fresh: string;
let shopper: string;
let project: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
const order = (who: string, pkg: string, cities: string[]) =>
  t.as<{ id: string }>(who, "select public.create_order($1, $2, '[]'::jsonb) as id", [pkg, cities]).then((r) => r.rows[0].id);
const log = (who: string, client: string, extra: { project?: string | null; purpose?: string; outcome?: string; note?: string; next?: string | null } = {}) =>
  t
    .as<{ id: string }>(who, "select public.log_client_followup($1, $2, 'wa', $3, $4, $5, 'Halo', $6::date) as id", [
      client,
      extra.project ?? null,
      extra.purpose ?? "followup",
      extra.outcome ?? "sent",
      extra.note ?? "",
      extra.next ?? null,
    ])
    .then((r) => r.rows[0].id);
const wibDay = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
type Row = { id: string; stage: string; project_code: string | null; invoice_status: string | null; last_outcome: string | null; next_followup_at: string | null; followups: number; total: number };
const list = (who: string, stage = "", q = "") => t.as<Row>(who, "select * from public.cs_list_clients($1, $2)", [stage, q]).then((r) => r.rows);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  cs = await t.provision("cs@silentcx.test", "cs" as "admin", { full_name: "Sari CS" });
  cs2 = await t.provision("cs2@silentcx.test", "cs" as "admin", { full_name: "Budi CS" });
  client = await t.signUp("client@contoh.test", { full_name: "Kopi Senja", phone: "081234567890" });
  fresh = await t.signUp("baru@contoh.test", { full_name: "Toko Baru" });
  shopper = await t.signUp("shopper@contoh.test", { full_name: "Shopper", account_type: "shopper" });
  await t.db.query("insert into public.service_cities (name) values ('Jakarta'), ('Bandung')");
  await t.db.query("insert into public.companies (client_id, name, pic_name, pic_phone) values ($1, 'Kopi Senja', 'Rina', '081111111111')", [client]);
  project = await order(client, "essential", ["Jakarta"]);
  await t.db.query("update public.project_outlets set name = 'Senja Kemang', address = 'Jl. Kemang 1', notes = 'Ramai jam 7 malam' where project_id = $1", [project]);
});

describe("peran CS", () => {
  it("akun CS hanya dari provisioning server, langsung aktif", async () => {
    expect(await t.profile(cs)).toMatchObject({ role: "cs", status: "active", full_name: "Sari CS" });
    // Pendaftaran publik yang meminta role cs tetap menjadi client.
    const sneaky = await t.signUp("nakal@contoh.test", { account_type: "cs" });
    expect((await t.profile(sneaky)).role).toBe("client");
    expect((await t.as<{ v: boolean }>(cs, "select public.is_cs() as v")).rows[0].v).toBe(true);
    expect((await t.as<{ v: boolean }>(cs, "select public.is_staff() as v")).rows[0].v).toBe(true);
    expect((await t.as<{ v: boolean }>(cs, "select public.is_admin() as v")).rows[0].v).toBe(false);
  });

  it("CS melihat semua client beserta tahap paketnya, tanpa shopper dan admin", async () => {
    const rows = await list(cs);
    expect(rows.map((r) => r.id).sort()).toEqual([client, fresh, (await one<{ id: string }>("select id from public.profiles where email = 'nakal@contoh.test'")).id].sort());
    const mine = rows.find((r) => r.id === client)!;
    expect(mine).toMatchObject({ stage: "payment", invoice_status: "unpaid" });
    expect(mine.project_code).toMatch(/^PRJ-/);
    expect(rows.find((r) => r.id === fresh)!.stage).toBe("new");
    expect(rows.some((r) => r.id === shopper)).toBe(false);
    expect((await list(cs, "payment")).map((r) => r.id)).toEqual([client]);
    expect((await list(cs, "", "senja")).map((r) => r.id)).toEqual([client]);
    expect((await list(cs, "", "08111111")).map((r) => r.id)).toEqual([client]);
    const counts = (await t.as<{ c: Record<string, number> }>(cs, "select public.cs_client_counts() as c")).rows[0].c;
    expect(counts).toMatchObject({ all: 3, new: 2, payment: 1, due: 0 });
  });

  it("tahap mengikuti proyek yang paling relevan", async () => {
    await t.db.query("update public.projects set status = 'active' where id = $1", [project]);
    expect((await list(cs, "running")).map((r) => r.id)).toEqual([client]);
    await t.db.query("update public.projects set status = 'completed' where id = $1", [project]);
    expect((await list(cs, "done")).map((r) => r.id)).toEqual([client]);
    await t.db.query("update public.projects set status = 'awaiting_payment' where id = $1", [project]);
  });

  it("detail client memuat perusahaan, proyek, invoice, dan outlet", async () => {
    const d = (await t.as<{ d: { company: { name: string }; projects: { code: string; outlets: { name: string; notes: string; city: string }[]; invoices: { status: string }[] }[] } }>(cs, "select public.cs_client_detail($1) as d", [client])).rows[0].d;
    expect(d.company.name).toBe("Kopi Senja");
    expect(d.projects).toHaveLength(1);
    expect(d.projects[0].outlets[0]).toMatchObject({ name: "Senja Kemang", city: "Jakarta", notes: "Ramai jam 7 malam" });
    expect(d.projects[0].invoices[0].status).toBe("unpaid");
    // Bukan client → kosong.
    expect((await t.as<{ d: unknown }>(cs, "select public.cs_client_detail($1) as d", [shopper])).rows[0].d).toBeNull();
  });

  it("client, shopper, dan CS yang ditangguhkan tidak bisa membuka data CS", async () => {
    expect(await fails(list(client))).toMatch(/Hanya admin dan CS/);
    expect(await fails(t.as(shopper, "select public.cs_client_detail($1)", [client]))).toMatch(/Hanya admin dan CS/);
    expect((await t.as(client, "select * from public.client_followups")).rows).toHaveLength(0);
    await t.db.query("update public.profiles set status = 'suspended' where id = $1", [cs2]);
    expect(await fails(list(cs2))).toMatch(/Hanya admin dan CS/);
    await t.db.query("update public.profiles set status = 'active' where id = $1", [cs2]);
    // Admin juga bisa membuka.
    expect((await list(admin)).length).toBe(3);
  });
});

describe("log follow-up", () => {
  it("CS mencatat follow-up WA, lalu melengkapi hasil dan jadwal berikutnya", async () => {
    const id = await log(cs, client, { project });
    let row = (await list(cs, "", "senja"))[0];
    expect(row).toMatchObject({ last_outcome: "sent", followups: 1 });
    await t.as(cs, "select public.update_client_followup($1, 'interested', 'Minta dihubungi besok', $2::date)", [id, wibDay(0)]);
    row = (await list(cs, "due"))[0];
    expect(row).toMatchObject({ id: client, last_outcome: "interested" });
    expect((await one<{ d: string }>("select next_at::text as d from public.client_followups where id = $1", [id])).d).toBe(wibDay(0));
    const counts = (await t.as<{ c: Record<string, number> }>(cs, "select public.cs_client_counts() as c")).rows[0].c;
    expect(counts.due).toBe(1);
  });

  it("catatan terbaru menggantikan jadwal sebelumnya", async () => {
    await log(cs, client, { outcome: "replied", next: null });
    expect(await list(cs, "due")).toHaveLength(0);
  });

  it("validasi: client harus akun client, proyek milik client, jadwal tidak boleh lewat", async () => {
    expect(await fails(log(cs, shopper))).toMatch(/Akun client tidak ditemukan/);
    const other = await order(fresh, "essential", ["Bandung"]);
    expect(await fails(log(cs, client, { project: other }))).toMatch(/bukan milik client/);
    expect(await fails(log(cs, client, { next: wibDay(-1) }))).toMatch(/sudah lewat/);
    expect(await fails(log(cs, client, { purpose: "project_confirm" }))).toMatch(/butuh proyeknya/);
    expect(await fails(log(client, client))).toMatch(/Hanya admin dan CS/);
    expect(await fails(t.as(cs, "insert into public.client_followups (client_id) values ($1)", [client]))).toMatch(/permission denied/);
  });

  it("hanya pencatat atau admin yang bisa mengubah catatan", async () => {
    const id = await log(cs, client);
    expect(await fails(t.as(cs2, "select public.update_client_followup($1, 'replied')", [id]))).toMatch(/staf lain/);
    await t.as(admin, "select public.update_client_followup($1, 'replied', 'Dicek admin')", [id]);
    expect((await one<{ outcome: string; note: string }>("select outcome, note from public.client_followups where id = $1", [id]))).toEqual({ outcome: "replied", note: "Dicek admin" });
  });

  it("konfirmasi WA admin tercatat sebagai konfirmasi proyek, dan riwayat bisa disaring per staf", async () => {
    await log(admin, client, { project, purpose: "project_confirm" });
    const all = (await t.as<{ purpose: string; staff: string; staff_role: string; project_code: string | null; total: number }>(cs, "select * from public.cs_followup_log()")).rows;
    expect(all[0]).toMatchObject({ purpose: "project_confirm", staff: "Admin", staff_role: "admin" });
    expect(all[0].project_code).toMatch(/^PRJ-/);
    const mine = (await t.as<{ total: number }>(cs, "select * from public.cs_followup_log($1)", [cs2])).rows;
    expect(mine).toHaveLength(0);
    const staff = (await t.as<{ full_name: string; role: string }>(cs, "select * from public.cs_staff()")).rows;
    expect(staff.map((s) => s.role).sort()).toEqual(["admin", "cs", "cs"]);
  });
});

describe("instruksi shopper", () => {
  it("template instruksi disimpan di kuesioner dan ikut tersalin ke salinan proyek", async () => {
    const q = await one<{ id: string }>("insert into public.questionnaires (name, business_type, instruction_templates) values ('F&B Uji', 'fnb', $1::jsonb) returning id", [
      JSON.stringify([{ name: "Dine-in", scenario: "Makan di tempat di {outlet}.", purchase: "1 menu utama" }]),
    ]);
    await t.db.query("insert into public.project_questionnaires (project_id, questionnaire_id, snapshot) values ($1, $2, '{}'::jsonb)", [project, q.id]);
    const copy = (await t.as<{ id: string }>(admin, "select public.admin_copy_questionnaire_for_project($1) as id", [project])).rows[0].id;
    const c = await one<{ instruction_templates: unknown }>("select instruction_templates from public.questionnaires where id = $1", [copy]);
    expect(cleanTemplates(c.instruction_templates)).toEqual([{ name: "Dine-in", scenario: "Makan di tempat di {outlet}.", purchase: "1 menu utama" }]);
    expect(await fails(t.db.query("update public.questionnaires set instruction_templates = '{}'::jsonb where id = $1", [q.id]))).toMatch(/check/);
  });

  it("instruksi tugas boleh sampai 4000 karakter", async () => {
    const outlet = await one<{ id: string }>("select id from public.project_outlets where project_id = $1", [project]);
    const ins = (s: string) =>
      t.db.query("insert into public.audit_tasks (code, project_id, outlet_id, window_start, window_end, fee, reimburse_cap, scenario) values ($1, $2, $3, current_date, current_date, 1, 1, $4)", [
        `TSK-${s.length}`,
        project,
        outlet.id,
        s,
      ]);
    await ins("a".repeat(INSTRUCTION_MAX));
    expect(await fails(ins("a".repeat(INSTRUCTION_MAX + 1)))).toMatch(/audit_tasks_scenario_check/);
  });

  it("draf dari kuesioner memuat alur, foto wajib, dan petunjuk tanpa duplikat", () => {
    const d = draftFromQuestionnaire({
      photo_limit: 6,
      sections: [
        { title: "Kedatangan & sapaan", questions: [{ prompt: "Tampak depan bersih.", help: "Tanpa wajah orang.", photo_required: true }, { prompt: "Disapa dalam 10 detik", help: "Hitung sejak masuk pintu." }] },
        { title: "Pembayaran", questions: [{ prompt: "Kasir ramah", help: "Hitung sejak masuk pintu." }, { prompt: "Struk diberikan" }] },
      ],
    });
    expect(d.scenario).toContain("Alur kunjungan:\n1. Kedatangan & sapaan\n2. Pembayaran");
    expect(d.scenario).toContain("- Tampak depan bersih (Tanpa wajah orang)");
    expect(d.scenario).toContain("Maksimal 6 foto per kunjungan");
    expect(d.scenario.match(/Hitung sejak masuk pintu/g)).toHaveLength(1);
    expect(d.scenario).toContain("{outlet}");
  });

  it("draf dipangkas supaya tidak melebihi batas", () => {
    const long = "x".repeat(400);
    const d = draftFromQuestionnaire({ sections: [{ title: "A", questions: Array.from({ length: 30 }, (_, i) => ({ prompt: `Q${i}`, help: `${long}${i}` })) }] });
    expect(d.scenario.length).toBeLessThanOrEqual(INSTRUCTION_MAX);
    expect(d.scenario).toContain("Isi kuesioner segera");
  });

  it("penanda outlet diganti, template rusak dibuang", () => {
    expect(fillPlaceholders("Datang ke {outlet} di {kota} ({alamat}) untuk {brand}.", { outlet: "Senja Kemang", city: "Jakarta", address: "Jl. Kemang 1", brand: "Kopi Senja" })).toBe(
      "Datang ke Senja Kemang di Jakarta (Jl. Kemang 1) untuk Kopi Senja.",
    );
    expect(cleanTemplates([{ name: "", scenario: "x" }, { name: "A", scenario: "" }, null, { name: " B ", scenario: " isi ", purchase: 5 }])).toEqual([{ name: "B", scenario: "isi", purchase: "" }]);
    expect(cleanTemplates("rusak")).toEqual([]);
  });
});

describe("pesan WhatsApp", () => {
  const ctx = { name: "Rina", staff: "Sari", brand: "Kopi Senja", origin: "https://silentcx.com", projectCode: "PRJ-0001", packageName: "SilentCX Essential", invoiceCode: "INV-0001", invoiceTotal: 1099000, invoiceDue: "2026-11-10T16:00:00Z" };

  it("template mengikuti tahap client", () => {
    const pay = followupTemplates("payment", ctx);
    expect(pay[0].text).toContain("INV-0001 sebesar Rp1.099.000");
    expect(pay[0].text).toContain("https://silentcx.com/app/billing");
    // 16.00 UTC = 23.00 WIB, masih tanggal 10.
    expect(pay[0].text).toContain("batas bayar 10 Nov 2026");
    expect(followupTemplates("new", ctx).map((m) => m.id)).toEqual(["welcome", "promo", "blank"]);
    expect(followupTemplates("done", ctx)[0].text).toContain("/app/reports");
  });

  it("nomor WA memakai HP PIC dulu", () => {
    expect(contactPhone({ pic_phone: "0811", phone: "0812" })).toBe("0811");
    expect(contactPhone({ pic_phone: "", phone: "0812" })).toBe("0812");
  });

  it("pesan konfirmasi proyek memuat outlet, jadwal opsional, dan pesan admin", () => {
    const base = {
      name: "Rina",
      brand: "Kopi Senja",
      projectCode: "PRJ-0001",
      packageName: "SilentCX Essential",
      statusLabel: "Aktif",
      outlets: [{ position: 1, name: "Senja Kemang", city: "Jakarta", address: "Jl. Kemang 1", window: "10 Nov 2026 – 15 Nov 2026" }],
      withSchedule: false,
      note: "Mohon cek alamat outlet 1.",
      admin: "Dewi",
    };
    const m = projectConfirmMessage(base);
    expect(m).toContain("proyek PRJ-0001 untuk Kopi Senja");
    expect(m).toContain("1. Senja Kemang · Jakarta\n   Jl. Kemang 1");
    expect(m).toContain("Mohon cek alamat outlet 1.");
    expect(m).not.toContain("Jadwal kunjungan");
    expect(projectConfirmMessage({ ...base, withSchedule: true })).toContain("Jadwal kunjungan: 10 Nov 2026 – 15 Nov 2026");
  });
});
