import { beforeAll, describe, expect, it } from "vitest";
import { EMAIL_KINDS } from "../src/lib/email-content";
import { notificationLink, notificationText } from "../src/lib/notification-text";
import { holderMismatch } from "../src/lib/profile-changes";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let other: string;
let shopper: string;
let project: string;
let outlet: string;
let template: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + 7 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

type Review = {
  status: string;
  version: number;
  revisions_left: number;
  due_at: string | null;
  sections: { title: string; questions: { id: string; prompt: string; photo: boolean }[] }[];
  previous: { flags: { prompt: string; note: string }[]; additions: string } | null;
};
const view = (who: string, p = project) => t.as<{ r: Review | null }>(who, "select public.client_questionnaire_review($1) as r", [p]).then((x) => x.rows[0].r);
const send = () => t.as<{ r: { version: number; final: boolean } }>(admin, "select public.admin_send_questionnaire($1) as r", [project]).then((x) => x.rows[0].r);
const respond = (approve: boolean, flags: unknown[] = [], additions = "") =>
  t.as(client, "select public.client_review_questionnaire($1, $2, $3::jsonb, $4)", [project, approve, JSON.stringify(flags), additions]);
const notes = (who: string, kind: string) => t.as<{ detail: Record<string, unknown>; email_status: string }>(who, "select detail, email_status from public.notifications where kind = $1 order by id", [kind]).then((x) => x.rows);
const latest = () => one<{ id: string; status: string; sent_at: string }>("select r.* from public.questionnaire_reviews r join public.project_questionnaires pq on pq.review_id = r.id where pq.project_id = $1", [project]);

beforeAll(async () => {
  t = await createTestDb();
  await t.db.query("insert into public.service_cities (name) values ('Jakarta'), ('Bandung')");
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Kopi Senja" });
  other = await t.signUp("lain@contoh.test", { full_name: "Lain" });
  shopper = await t.signUp("sari@contoh.test", { account_type: "shopper", full_name: "Sari Dewi", phone: "081233334444" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [shopper]);
  await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities, domicile, gender, birth_date, occupation, vehicle, industries) values ($1, 'approved', '{Jakarta}', 'Jakarta', 'female', '1995-05-01', 'Karyawan', 'motorcycle', '{fnb}')", [shopper]);
  project = (
    await one<{ id: string }>(
      `insert into public.projects (code, client_id, package_snapshot, outlet_count, status, details_completed_at)
       values ('PRJ-K1', $1, '{"name":"Essential","visits":1,"purchase_allowance":150000}', 1, 'active', now()) returning id`,
      [client],
    )
  ).id;
  outlet = (await one<{ id: string }>("insert into public.project_outlets (project_id, position, city, name, address) values ($1, 1, 'Jakarta', 'Kopi Pusat', 'Jl. Satu') returning id", [project])).id;
  template = (await one<{ id: string }>("select id from public.questionnaires where project_id is null order by name limit 1")).id;
  await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, template]);
});

describe("persetujuan kuesioner oleh client", () => {
  let task: string;

  it("sebelum dikirim, client belum melihat apa pun dan tugas belum bisa ditawarkan", async () => {
    expect(await view(client)).toBeNull();
    task = (await t.as<{ id: string }>(admin, "select public.admin_create_task($1, $2::date, $3::date) as id", [outlet, today(), addDays(7)])).rows[0].id;
    await expect(t.as(admin, "select public.admin_offer_task($1, $2)", [task, shopper])).rejects.toThrow(/belum disetujui client/);
  });

  it("dikirim: client mendapat notifikasi dan email dengan batas 3×24 jam", async () => {
    expect(await send()).toMatchObject({ version: 1, final: false });
    const [n] = await notes(client, "questionnaire.review");
    expect(n.email_status).toBe("pending");
    expect(n.detail).toMatchObject({ code: "PRJ-K1", version: 1 });
    const hours = (new Date(n.detail.due as string).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);
    await expect(send()).rejects.toThrow(/sedang ditinjau client/);
  });

  it("client melihat pertanyaan tanpa bobot; client lain tidak bisa membuka", async () => {
    const r = (await view(client))!;
    expect(r).toMatchObject({ status: "pending", version: 1, revisions_left: 2 });
    expect(r.sections.length).toBeGreaterThan(1);
    expect(JSON.stringify(r.sections)).not.toMatch(/"weight"|"kind"|"sop"/);
    await expect(view(other)).rejects.toThrow(/tidak ditemukan/);
    await expect(t.as(other, "select public.client_review_questionnaire($1, true)", [project])).rejects.toThrow(/tidak ditemukan/);
    expect((await t.as(client, "select 1 from public.questionnaire_reviews")).rows).toHaveLength(0);
  });

  it("perbaikan wajib berisi catatan dan pertanyaan dari kuesioner ini", async () => {
    const q = (await view(client))!.sections[0].questions[0];
    await expect(respond(false)).rejects.toThrow(/Tandai minimal satu/);
    await expect(respond(false, [{ question: q.id, note: "" }])).rejects.toThrow(/Tulis apa yang perlu diubah/);
    await expect(respond(false, [{ question: "00000000-0000-0000-0000-000000000000", note: "Ganti kalimat" }])).rejects.toThrow(/tidak ada di kuesioner/);
  });

  it("perbaikan pertama: admin mendapat notifikasi dan email, sisa 1 kali", async () => {
    const q = (await view(client))!.sections[0].questions;
    await respond(false, [{ question: q[0].id, note: "Pakai sapaan khas kami" }, { question: q[0].id, note: "duplikat" }, { question: q[1].id, note: "Hapus saja" }], "Tanyakan soal musik di outlet");
    const r = await one<{ status: string; flags: { prompt: string; note: string }[]; additions: string }>("select status, flags, additions from public.questionnaire_reviews where id = (select review_id from public.project_questionnaires where project_id = $1)", [project]);
    expect(r.status).toBe("changes_requested");
    expect(r.flags).toHaveLength(2);
    expect(r.flags[0]).toMatchObject({ prompt: q[0].prompt, note: "Pakai sapaan khas kami" });
    expect(r.additions).toBe("Tanyakan soal musik di outlet");
    const [n] = await notes(admin, "admin.questionnaire_changes");
    expect(n).toMatchObject({ email_status: "pending", detail: { code: "PRJ-K1", count: 2, name: "Kopi Senja" } });
    expect((await view(client))!).toMatchObject({ status: "changes_requested", revisions_left: 1 });
    await expect(respond(true)).rejects.toThrow(/sudah ditanggapi/);
  });

  it("salin untuk proyek ini: salinan khusus dipakai proyek, template tidak berubah", async () => {
    const copy = (await t.as<{ id: string }>(admin, "select public.admin_copy_questionnaire_for_project($1) as id", [project])).rows[0].id;
    expect(copy).not.toBe(template);
    const q = await one<{ name: string; project_id: string; active: boolean }>("select name, project_id, active from public.questionnaires where id = $1", [copy]);
    expect(q).toMatchObject({ name: expect.stringContaining("PRJ-K1"), project_id: project, active: true });
    expect((await one<{ questionnaire_id: string }>("select questionnaire_id from public.project_questionnaires where project_id = $1", [project])).questionnaire_id).toBe(copy);
    // Status kiriman tetap "perlu perbaikan" setelah disalin.
    expect((await latest()).status).toBe("changes_requested");
    // Menyalin lagi memakai salinan yang sama.
    expect((await t.as<{ id: string }>(admin, "select public.admin_copy_questionnaire_for_project($1) as id", [project])).rows[0].id).toBe(copy);
    await t.db.query(
      "update public.questionnaire_questions set prompt = 'Staf menyapa dengan salam khas Kopi Senja.' where id = (select q.id from public.questionnaire_questions q join public.questionnaire_sections s on s.id = q.section_id where s.questionnaire_id = $1 order by s.position, q.position limit 1)",
      [copy],
    );
    const elsewhere = (await one<{ id: string }>("insert into public.projects (code, client_id, package_snapshot, outlet_count, status) values ('PRJ-K2', $1, '{\"name\":\"Essential\"}', 1, 'active') returning id", [other])).id;
    await expect(t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [elsewhere, copy])).rejects.toThrow(/salinan khusus proyek lain/);
  });

  it("versi 2 memuat suntingan terbaru dan perbaikan sebelumnya", async () => {
    expect(await send()).toMatchObject({ version: 2, final: false });
    const r = (await view(client))!;
    expect(r).toMatchObject({ status: "pending", version: 2, revisions_left: 1 });
    expect(r.sections[0].questions[0].prompt).toBe("Staf menyapa dengan salam khas Kopi Senja.");
    expect(r.previous?.flags[0].note).toBe("Pakai sapaan khas kami");
    expect(r.previous?.additions).toBe("Tanyakan soal musik di outlet");
  });

  it("perbaikan kedua membuat kiriman berikutnya draft final yang langsung berlaku", async () => {
    const q = (await view(client))!.sections[0].questions[0];
    await respond(false, [{ question: q.id, note: "Sapaan masih kurang pas" }]);
    expect((await view(client))!.revisions_left).toBe(0);
    await expect(t.as(admin, "select public.admin_offer_task($1, $2)", [task, shopper])).rejects.toThrow(/belum disetujui/);
    expect(await send()).toMatchObject({ version: 3, final: true });
    const r = (await view(client))!;
    expect(r).toMatchObject({ status: "final", version: 3, due_at: null });
    await expect(respond(true)).rejects.toThrow(/sudah ditanggapi/);
    expect((await notes(client, "questionnaire.final"))[0].email_status).toBe("pending");
    await t.as(admin, "select public.admin_offer_task($1, $2)", [task, shopper]);
    await expect(send()).rejects.toThrow(/sudah disetujui/);
  });

  it("menetapkan ulang membuat kuesioner perlu dikirim lagi", async () => {
    await t.as(admin, "select public.admin_withdraw_offer($1)", [task]);
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [project, template]);
    expect(await view(client)).toBeNull();
    await expect(t.as(admin, "select public.admin_offer_task($1, $2)", [task, shopper])).rejects.toThrow(/belum disetujui/);
    // Sudah 2 kali perbaikan, jadi kiriman berikutnya tetap final.
    expect(await send()).toMatchObject({ final: true });
  });
});

let otherClient: string;

describe("pengingat 24 jam dan persetujuan otomatis 3×24 jam", () => {
  let p: string;
  beforeAll(async () => {
    otherClient = await t.signUp("pemilik2@contoh.test", { full_name: "Roti Pagi" });
    p = (
      await one<{ id: string }>(
        `insert into public.projects (code, client_id, package_snapshot, outlet_count, status, details_completed_at)
         values ('PRJ-K3', $1, '{"name":"Essential","visits":1}', 1, 'active', now()) returning id`,
        [otherClient],
      )
    ).id;
    await t.as(admin, "select public.admin_assign_questionnaire($1, $2)", [p, template]);
    await t.as(admin, "select public.admin_send_questionnaire($1)", [p]);
  });
  const tick = () => t.as(admin, "select public.questionnaire_review_tick()");
  const shift = (hours: number) =>
    t.db.query("update public.questionnaire_reviews set sent_at = sent_at - make_interval(hours => $2), due_at = due_at - make_interval(hours => $2) where project_id = $1", [p, hours]);

  it("belum 24 jam: tidak ada pengingat", async () => {
    await tick();
    expect(await notes(otherClient, "questionnaire.reminder")).toHaveLength(0);
  });

  it("setelah 24 jam: satu pengingat email", async () => {
    await shift(25);
    await tick();
    await tick();
    const rows = await notes(otherClient, "questionnaire.reminder");
    expect(rows).toHaveLength(1);
    expect(rows[0].email_status).toBe("pending");
  });

  it("lewat 3×24 jam: disetujui otomatis, client dan admin diberi tahu", async () => {
    await shift(48);
    await tick();
    expect((await one<{ status: string }>("select status from public.questionnaire_reviews where project_id = $1", [p])).status).toBe("auto_approved");
    expect((await notes(otherClient, "questionnaire.auto_approved"))[0].email_status).toBe("pending");
    const adminNote = (await notes(admin, "admin.questionnaire_approved")).find((n) => n.detail.code === "PRJ-K3");
    expect(adminNote?.detail).toMatchObject({ auto: true });
    expect(adminNote?.email_status).toBe("none");
    await expect(t.as(otherClient, "select public.client_review_questionnaire($1, true)", [p])).rejects.toThrow(/disetujui otomatis/);
    expect(await t.as<{ ok: boolean }>(admin, "select public.questionnaire_approved($1) as ok", [p]).then((r) => r.rows[0].ok)).toBe(true);
  });
});

describe("notifikasi dan email kuesioner", () => {
  it("teks dan tautan notifikasi", () => {
    const n = (kind: string, detail: Record<string, unknown>) => ({ id: 1, kind, detail, read_at: null, created_at: new Date().toISOString() });
    const review = n("questionnaire.review", { project: "p1", code: "PRJ-K1", due: "2026-11-07T03:00:00Z" });
    expect(notificationText(review, "id")).toMatch(/PRJ-K1 siap Anda tinjau.*dianggap disetujui/);
    expect(notificationLink(review, "id")).toEqual({ href: "/app/questionnaire/p1", label: "Tinjau kuesioner" });
    expect(notificationLink(n("admin.questionnaire_changes", { project: "p1", code: "PRJ-K1", name: "Kopi", count: 2 }), "id")?.href).toBe("/admin/projects/p1?tab=jadwal");
    expect(notificationText(n("admin.questionnaire_approved", { code: "PRJ-K1", name: "Kopi", auto: true }), "id")).toMatch(/otomatis/);
    expect(notificationText(n("account.email_changed", { old_email: "a@x.id", new_email: "b@x.id" }), "id")).toMatch(/a@x\.id ke b@x\.id/);
  });

  it("jenis email baru terdaftar di database dan di aplikasi", async () => {
    for (const k of ["questionnaire.review", "questionnaire.reminder", "questionnaire.auto_approved", "questionnaire.final", "admin.questionnaire_changes", "account.email_changed"]) {
      expect(EMAIL_KINDS[k], k).toBeTruthy();
      expect((await one<{ ok: boolean }>("select public.is_email_kind($1) as ok", [k])).ok, k).toBe(true);
    }
    expect((await one<{ ok: boolean }>("select public.is_email_kind('admin.questionnaire_approved') as ok")).ok).toBe(false);
  });
});

describe("edit profil shopper", () => {
  const update = (data: Record<string, unknown>, who = shopper) => t.as(who, "select public.shopper_update_profile($1::jsonb)", [JSON.stringify(data)]);
  const app = () =>
    one<{ domicile: string; reachable_cities: string[]; gender: string; birth_date: string; industries: string[]; available_days: string[]; available_times: string[] }>(
      "select domicile, reachable_cities, gender, birth_date::text, industries, available_days, available_times from public.shopper_applications where shopper_id = $1 and status = 'approved'",
      [shopper],
    );
  const changes = (who = shopper) => one<{ n: number }>("select count(*)::int as n from public.profile_changes where user_id = $1", [who]).then((r) => r.n);

  it("hanya bagian yang dikirim yang berubah", async () => {
    await update({ available_days: ["sat", "sun"], available_times: ["morning"] });
    expect(await app()).toMatchObject({ domicile: "Jakarta", gender: "female", available_days: ["sat", "sun"], available_times: ["morning"] });
    await update({ gender: "male", birth_date: "1990-01-02", domicile: "Depok", reachable_cities: ["jakarta"], industries: ["fnb", "retail"] });
    expect(await app()).toMatchObject({ gender: "male", birth_date: "1990-01-02", domicile: "Depok", reachable_cities: ["Jakarta"], industries: ["fnb", "retail"] });
  });

  it("isian tidak valid ditolak", async () => {
    await expect(update({ birth_date: addDays(-365 * 10) })).rejects.toThrow(/minimal 18 tahun/);
    await expect(update({ reachable_cities: ["Atlantis"] })).rejects.toThrow(/tidak ada di daftar kota/);
    await expect(update({ reachable_cities: [] })).rejects.toThrow(/minimal satu kota/);
    await expect(update({ industries: [] })).rejects.toThrow(/minimal satu jenis bisnis/);
    await expect(update({ available_days: ["holiday"] })).rejects.toThrow(/available_days/);
    await expect(update({ domicile: "" })).rejects.toThrow(/domisili/);
    await expect(update({ domicile: "Bogor" }, client)).rejects.toThrow(/akun shopper aktif/);
  });

  it("setiap perubahan tercatat untuk admin, tidak terbaca pengguna", async () => {
    const before = await changes();
    await t.as(shopper, "update public.profiles set full_name = 'Sari Dewi Putri' where id = $1", [shopper]);
    await t.as(shopper, "select public.save_bank_account('BCA', '1234567890', 'Sari Dewi')");
    await t.as(shopper, "select public.save_bank_account('BCA', '9876543210', 'Budi')");
    const rows = (await t.db.query<{ field: string; old_value: string; new_value: string; changed_by: string }>("select field, old_value, new_value, changed_by from public.profile_changes where user_id = $1 order by id", [shopper])).rows;
    expect(rows.find((r) => r.field === "gender")).toMatchObject({ old_value: "female", new_value: "male", changed_by: shopper });
    expect(rows.find((r) => r.field === "full_name")).toMatchObject({ old_value: "Sari Dewi", new_value: "Sari Dewi Putri" });
    expect(rows.find((r) => r.field === "account_number")).toMatchObject({ old_value: "••••7890", new_value: "••••3210" });
    expect(rows.find((r) => r.field === "account_holder")).toMatchObject({ old_value: "Sari Dewi", new_value: "Budi" });
    expect(await changes()).toBe(before + 3);
    expect((await t.as(shopper, "select 1 from public.profile_changes")).rows).toHaveLength(0);
    expect((await t.as(admin, "select 1 from public.profile_changes where user_id = $1", [shopper])).rows.length).toBeGreaterThan(0);
    await expect(t.as(shopper, "insert into public.profile_changes (user_id, field) values ($1, 'x')", [shopper])).rejects.toThrow(/permission denied/);
  });

  it("akun shopper buatan admin dibuatkan data profil saat pertama diubah", async () => {
    const made = await t.provision("baru@silentcx.test", "shopper", { full_name: "Shopper Baru" });
    await t.db.query("update public.profiles set status = 'active' where id = $1", [made]);
    await update({ domicile: "Bandung", reachable_cities: ["bandung"] }, made);
    const row = await one<{ status: string; domicile: string }>("select status::text, domicile from public.shopper_applications where shopper_id = $1", [made]);
    expect(row).toMatchObject({ status: "approved", domicile: "Bandung" });
  });

  it("draf lamaran tidak tercatat sebagai perubahan profil", async () => {
    const applicant = await t.signUp("pelamar@contoh.test", { account_type: "shopper", full_name: "Pelamar" });
    await t.as(applicant, "select public.save_shopper_application($1::jsonb)", [JSON.stringify({ domicile: "Jakarta" })]);
    await t.as(applicant, "select public.save_shopper_application($1::jsonb)", [JSON.stringify({ domicile: "Bogor" })]);
    expect(await changes(applicant)).toBe(0);
  });

  it("tanda nama rekening berbeda dengan nama akun", () => {
    expect(holderMismatch("Sari Dewi Putri", "SARI DEWI")).toBe(false);
    expect(holderMismatch("Sari Dewi", "Sari Dewi Putri")).toBe(false);
    expect(holderMismatch("Ir. Sari Dewi, S.E.", "sari dewi")).toBe(false);
    expect(holderMismatch("Sari Dewi Putri", "Budi")).toBe(true);
    expect(holderMismatch("", "Budi")).toBe(false);
  });
});

describe("edit profil client dan ganti email", () => {
  it("data perusahaan yang diubah tercatat", async () => {
    await t.as(client, "insert into public.companies (client_id, name, city) values ($1, 'Kopi Senja', 'Jakarta')", [client]);
    await t.as(client, "update public.companies set name = 'Kopi Senja Group', industry = 'fnb', address = 'Jl. Baru 1' where client_id = $1", [client]);
    const rows = (await t.db.query<{ field: string; new_value: string }>("select field, new_value from public.profile_changes where user_id = $1 order by id", [client])).rows;
    expect(rows.map((r) => r.field)).toEqual(["company_name", "company_industry", "company_address"]);
  });

  it("email baru yang dikonfirmasi: profil ikut berubah, email lama diberi tahu", async () => {
    await t.db.query("update auth.users set email = 'Baru@Contoh.test' where id = $1", [client]);
    expect((await t.profile(client)).email).toBe("baru@contoh.test");
    const [n] = await notes(client, "account.email_changed");
    expect(n).toMatchObject({ email_status: "pending", detail: { old_email: "client@contoh.test", new_email: "baru@contoh.test" } });
    const log = await one<{ old_value: string; new_value: string; changed_by: string | null }>("select old_value, new_value, changed_by from public.profile_changes where user_id = $1 and field = 'email'", [client]);
    expect(log).toMatchObject({ old_value: "client@contoh.test", new_value: "baru@contoh.test" });
  });
});
