import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { QUIZ } from "../src/lib/shopper-application";

let t: TestDb;
let admin: string;
let client: string;
let applicant: string;
let other: string;

const RIGHT = [1, 0, 2, 1, 0];
const FORM = {
  domicile: "Jakarta Selatan",
  reachable_cities: ["jakarta", " Bandung "],
  birth_date: "1995-04-12",
  gender: "female",
  occupation: "Karyawan swasta",
  vehicle: "motorcycle",
  experience: "under_1y",
  experience_note: "Pernah survei harga untuk riset pasar.",
  industries: ["fnb", "retail"],
};

type App = {
  id: string;
  status: string;
  reachable_cities: string[];
  quiz_attempts: number;
  pact_version: string | null;
  submitted_at: string | null;
  decision_note: string | null;
};

const save = (who: string, data: Record<string, unknown> = FORM) =>
  t.as<{ id: string }>(who, "select public.save_shopper_application($1::jsonb) as id", [JSON.stringify(data)]).then((r) => r.rows[0].id);
const submit = (who: string, answers: number[] = RIGHT, pact = true) =>
  t.as<{ r: { submitted: boolean; correct: number } }>(who, "select public.submit_shopper_application($1::int[], $2) as r", [answers, pact]).then((r) => r.rows[0].r);
const decide = (who: string, app: string, approve: boolean, note: string | null = null) =>
  t.as(who, "select public.admin_decide_application($1, $2, $3)", [app, approve, note]);
const appOf = async (id: string) =>
  (await t.db.query<App>("select id, status::text, reachable_cities, quiz_attempts, pact_version, submitted_at, decision_note from public.shopper_applications where id = $1", [id])).rows[0];

// Shopper baru dengan nama dan WhatsApp, siap melamar.
const newApplicant = (email: string) => t.signUp(email, { account_type: "shopper", full_name: "Pelamar Uji", phone: "081211112222" });

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client" });
  applicant = await newApplicant("sari@contoh.test");
  other = await newApplicant("budi@contoh.test");
  await t.db.query("insert into public.service_cities (name) values ('Jakarta'), ('Bandung'), ('Surabaya')");
  await t.db.query("insert into public.service_cities (name, active) values ('Medan', false)");
});

describe("kunci jawaban kuis", () => {
  it("soal di aplikasi dan kunci di database sama jumlahnya", () => {
    expect(QUIZ).toHaveLength(RIGHT.length);
    QUIZ.forEach((q, i) => expect(q.options.length).toBeGreaterThan(RIGHT[i]));
  });
});

describe("mengisi lamaran", () => {
  it("draft tersimpan dengan nama kota resmi dari daftar kota dilayani", async () => {
    const id = await save(applicant);
    expect(await appOf(id)).toMatchObject({ status: "draft", reachable_cities: ["Jakarta", "Bandung"] });
  });

  it("menyimpan lagi memperbarui draft yang sama", async () => {
    const first = await save(applicant);
    const again = await save(applicant, { ...FORM, occupation: "Mahasiswa" });
    expect(again).toBe(first);
    const n = await t.db.query<{ n: number }>("select count(*)::int as n from public.shopper_applications where shopper_id = $1", [applicant]);
    expect(n.rows[0].n).toBe(1);
  });

  it("kota di luar daftar atau nonaktif ditolak", async () => {
    await expect(save(applicant, { ...FORM, reachable_cities: ["Makassar"] })).rejects.toThrow(/Makassar tidak ada/);
    await expect(save(applicant, { ...FORM, reachable_cities: ["Medan"] })).rejects.toThrow(/Medan tidak ada/);
  });

  it("pilihan di luar daftar ditolak", async () => {
    await expect(save(applicant, { ...FORM, gender: "x" })).rejects.toThrow(/check constraint/);
    // Industri dicek terhadap daftar jenis usaha yang diatur admin (Putaran 3).
    await expect(save(applicant, { ...FORM, industries: ["judi"] })).rejects.toThrow(/tidak ada di daftar/);
  });

  it("client dan admin tidak bisa mengisi lamaran", async () => {
    await expect(save(client)).rejects.toThrow(/Hanya akun shopper/);
    await expect(save(admin)).rejects.toThrow(/Hanya akun shopper/);
  });

  it("lamaran tidak bisa diubah langsung dari browser", async () => {
    await expect(t.as(applicant, "update public.shopper_applications set status = 'approved'")).rejects.toThrow(/permission denied/);
    await expect(t.as(applicant, "insert into public.shopper_applications (shopper_id) values ($1)", [applicant])).rejects.toThrow(/permission denied/);
  });
});

describe("mengirim lamaran: kuis dan pakta", () => {
  it("isian belum lengkap ditolak", async () => {
    const id = await save(other, { ...FORM, industries: [] });
    await expect(submit(other)).rejects.toThrow(/minimal satu industri/);
    await save(other, { ...FORM, birth_date: "2015-01-01" });
    await expect(submit(other)).rejects.toThrow(/minimal 18 tahun/);
    expect((await appOf(id)).status).toBe("draft");
  });

  it("nomor WhatsApp wajib ada", async () => {
    const noPhone = await t.signUp("tanpa-wa@contoh.test", { account_type: "shopper", full_name: "Tanpa WA" });
    await save(noPhone);
    await expect(submit(noPhone)).rejects.toThrow(/nomor WhatsApp/);
  });

  it("pakta wajib disetujui", async () => {
    await expect(submit(applicant, RIGHT, false)).rejects.toThrow(/pakta kerahasiaan/);
  });

  it("kuis yang belum benar semua tidak mengirim lamaran, tapi percobaannya tercatat", async () => {
    const res = await submit(applicant, [1, 0, 0, 1, 0]);
    expect(res).toMatchObject({ submitted: false, correct: 4 });
    const app = (await t.db.query<App>("select status::text, quiz_attempts from public.shopper_applications where shopper_id = $1", [applicant])).rows[0];
    expect(app).toMatchObject({ status: "draft", quiz_attempts: 1 });
  });

  it("kuis benar semua mengirim lamaran ke antrian dan mencatat pakta", async () => {
    expect(await submit(applicant)).toMatchObject({ submitted: true, correct: 5 });
    const app = (await t.db.query<App>("select id, status::text, quiz_attempts, pact_version, submitted_at from public.shopper_applications where shopper_id = $1", [applicant])).rows[0];
    expect(app).toMatchObject({ status: "submitted", quiz_attempts: 2, pact_version: "v1" });
    expect(app.submitted_at).not.toBeNull();
    const log = await t.db.query("select 1 from public.activity_log where action = 'application.submitted' and target_id = $1", [app.id]);
    expect(log.rows).toHaveLength(1);
  });

  it("lamaran yang sedang ditinjau tidak bisa diubah atau dikirim ulang", async () => {
    await expect(save(applicant)).rejects.toThrow(/sedang ditinjau/);
    await expect(submit(applicant)).rejects.toThrow(/Isi dan simpan formulir/);
  });
});

describe("siapa melihat lamaran", () => {
  it("shopper hanya melihat lamarannya sendiri, admin melihat semua", async () => {
    expect((await t.as(applicant, "select 1 from public.shopper_applications")).rows).toHaveLength(1);
    expect((await t.as(client, "select 1 from public.shopper_applications")).rows).toHaveLength(0);
    expect((await t.as(admin, "select 1 from public.shopper_applications")).rows.length).toBeGreaterThanOrEqual(3);
    await expect(t.as(null, "select 1 from public.shopper_applications")).rejects.toThrow(/permission denied/);
  });
});

describe("keputusan admin", () => {
  let submitted: string;
  beforeAll(async () => {
    submitted = (await t.db.query<{ id: string }>("select id from public.shopper_applications where shopper_id = $1 and status = 'submitted'", [applicant])).rows[0].id;
  });

  it("selain admin tidak bisa memutuskan", async () => {
    await expect(decide(applicant, submitted, true)).rejects.toThrow(/Hanya admin/);
    await expect(decide(client, submitted, true)).rejects.toThrow(/Hanya admin/);
  });

  it("menolak wajib dengan alasan", async () => {
    await expect(decide(admin, submitted, false)).rejects.toThrow(/Alasan wajib/);
  });

  it("lamaran yang masih draft tidak bisa diputuskan", async () => {
    const draft = (await t.db.query<{ id: string }>("select id from public.shopper_applications where shopper_id = $1", [other])).rows[0].id;
    await expect(decide(admin, draft, true)).rejects.toThrow(/tidak sedang ditinjau/);
  });

  it("menyetujui mengaktifkan akun, mencatat log, dan memberi notifikasi", async () => {
    await decide(admin, submitted, true);
    expect((await appOf(submitted)).status).toBe("approved");
    expect(await t.profile(applicant)).toMatchObject({ status: "active", status_note: null });
    const log = await t.db.query<{ actor_id: string }>("select actor_id from public.activity_log where action = 'application.approved' and target_id = $1", [submitted]);
    expect(log.rows[0].actor_id).toBe(admin);
    const notes = await t.as<{ kind: string; read_at: string | null }>(applicant, "select kind, read_at from public.notifications");
    expect(notes.rows).toMatchObject([{ kind: "application.approved", read_at: null }]);
    await expect(decide(admin, submitted, false, "x")).rejects.toThrow(/tidak sedang ditinjau/);
  });

  it("shopper aktif tidak bisa mengisi lamaran lagi", async () => {
    await expect(save(applicant)).rejects.toThrow(/sudah disetujui/);
  });

  it("notifikasi hanya dibaca pemiliknya dan ditandai lewat fungsi", async () => {
    expect((await t.as(other, "select 1 from public.notifications")).rows).toHaveLength(0);
    await expect(t.as(applicant, "update public.notifications set read_at = now()")).rejects.toThrow(/permission denied/);
    await expect(t.as(applicant, "select public.notify($1, 'x', '{}'::jsonb)", [applicant])).rejects.toThrow(/permission denied/);
    await t.as(applicant, "select public.mark_notifications_read()");
    const notes = await t.as<{ read_at: string | null }>(applicant, "select read_at from public.notifications");
    expect(notes.rows[0].read_at).not.toBeNull();
  });
});

describe("ditolak lalu melamar ulang setelah 30 hari", () => {
  let rejectedApp: string;

  it("menolak menyimpan alasan untuk pelamar dan memberi notifikasi", async () => {
    await save(other);
    await submit(other);
    rejectedApp = (await t.db.query<{ id: string }>("select id from public.shopper_applications where shopper_id = $1 and status = 'submitted'", [other])).rows[0].id;
    await decide(admin, rejectedApp, false, "Belum ada pengalaman di kota yang dibutuhkan.");
    expect(await appOf(rejectedApp)).toMatchObject({ status: "rejected", decision_note: "Belum ada pengalaman di kota yang dibutuhkan." });
    expect(await t.profile(other)).toMatchObject({ status: "rejected", status_note: "Belum ada pengalaman di kota yang dibutuhkan." });
    const notes = await t.as<{ kind: string; detail: { note: string; reapply_at: string } }>(other, "select kind, detail from public.notifications");
    expect(notes.rows[0]).toMatchObject({ kind: "application.rejected", detail: { note: "Belum ada pengalaman di kota yang dibutuhkan." } });
    expect(notes.rows[0].detail.reapply_at).toBeTruthy();
  });

  it("belum 30 hari: melamar ulang ditolak dengan tanggalnya", async () => {
    await expect(save(other)).rejects.toThrow(/melamar lagi mulai \d{2}-\d{2}-\d{4}/);
  });

  it("setelah 30 hari: lamaran baru dibuat dan akun kembali menunggu seleksi", async () => {
    await t.db.query("update public.shopper_applications set decided_at = now() - interval '31 days' where id = $1", [rejectedApp]);
    const fresh = await save(other);
    expect(fresh).not.toBe(rejectedApp);
    expect((await appOf(fresh)).status).toBe("draft");
    expect(await t.profile(other)).toMatchObject({ status: "pending", status_note: null });
    expect((await appOf(rejectedApp)).status).toBe("rejected");
    const log = await t.db.query("select 1 from public.activity_log where action = 'application.reapplied' and target_id = $1", [other]);
    expect(log.rows).toHaveLength(1);
  });
});

describe("rekening setelah disetujui", () => {
  const saveBank = (who: string, bank = "BCA", num = "1234-567 890", holder = "Pelamar Uji") =>
    t.as(who, "select public.save_bank_account($1, $2, $3)", [bank, num, holder]);

  it("pelamar yang belum disetujui tidak bisa mengisi rekening", async () => {
    await expect(saveBank(other)).rejects.toThrow(/setelah lamaran disetujui/);
    await expect(saveBank(client)).rejects.toThrow(/setelah lamaran disetujui/);
  });

  it("shopper aktif menyimpan rekening; nomor dirapikan dan tidak masuk log", async () => {
    await saveBank(applicant);
    await saveBank(applicant, "Mandiri", "9876543210");
    const row = await t.as<{ bank_name: string; account_number: string }>(applicant, "select bank_name, account_number from public.shopper_bank_accounts");
    expect(row.rows).toEqual([{ bank_name: "Mandiri", account_number: "9876543210" }]);
    const log = await t.db.query<{ detail: Record<string, unknown> }>("select detail from public.activity_log where action = 'shopper.bank_updated' and target_id = $1", [applicant]);
    expect(log.rows).toHaveLength(2);
    expect(JSON.stringify(log.rows)).not.toContain("9876543210");
  });

  it("nomor rekening tidak valid ditolak", async () => {
    await expect(saveBank(applicant, "BCA", "12ab")).rejects.toThrow(/5 sampai 20 angka/);
  });

  it("rekening hanya terlihat oleh pemiliknya dan admin", async () => {
    expect((await t.as(other, "select 1 from public.shopper_bank_accounts")).rows).toHaveLength(0);
    expect((await t.as(admin, "select 1 from public.shopper_bank_accounts")).rows).toHaveLength(1);
    await expect(t.as(applicant, "update public.shopper_bank_accounts set account_number = '11111'")).rejects.toThrow(/permission denied/);
  });
});

describe("pool shopper per kota", () => {
  it("shopper aktif bisa dicari berdasarkan kota yang dijangkau", async () => {
    const res = await t.as<{ shopper_id: string }>(
      admin,
      "select a.shopper_id from public.shopper_applications a join public.profiles p on p.id = a.shopper_id where a.status = 'approved' and p.status = 'active' and 'Bandung' = any (a.reachable_cities)",
    );
    expect(res.rows.map((r) => r.shopper_id)).toEqual([applicant]);
  });
});
