import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";

let t: TestDb;
let admin: string;
let client: string;
let other: string;
let shopper: string;

type Quote = {
  total: number;
  outlet_count: number;
  review_reasons: string[];
  unserved_cities: string[];
  entitlements: string[];
  lines: { kind: string; item_key: string; quantity: number; unit_price: number | null; amount: number | null; list_price: number | null }[];
};

const quote = async (pkg: string, cities: string[], addons: unknown[] = [], as: string | null = client) =>
  (await t.as<{ q: Quote }>(as, "select public.quote_order($1, $2::text[], $3::jsonb) as q", [pkg, cities, JSON.stringify(addons)])).rows[0].q;

const order = async (who: string, pkg: string, cities: string[], addons: unknown[] = []) =>
  (await t.as<{ id: string }>(who, "select public.create_order($1, $2::text[], $3::jsonb) as id", [pkg, cities, JSON.stringify(addons)])).rows[0].id;

const projectOf = async (id: string) =>
  (await t.db.query<{ status: string; code: string; review_reasons: string[]; entitlements: string[]; outlet_count: number; details_completed_at: string | null }>(
    "select status::text, code, review_reasons, entitlements, outlet_count, details_completed_at from public.projects where id = $1",
    [id],
  )).rows[0];

const invoiceOf = async (projectId: string) =>
  (await t.db.query<{ id: string; code: string; status: string; total: number; due_at: string | null; client_id: string }>(
    "select id, code, status::text, total, due_at, client_id from public.invoices where project_id = $1",
    [projectId],
  )).rows[0];

// Membersihkan pesanan terbuka milik client supaya setiap tes bisa memesan lagi.
const closeOpenOrders = (who: string) =>
  t.db.query("update public.projects set status = 'cancelled' where client_id = $1 and status in ('awaiting_review','awaiting_payment','verifying')", [who]);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client Satu" });
  other = await t.signUp("lain@contoh.test", { full_name: "Client Dua" });
  shopper = await t.signUp("shopper@contoh.test", { account_type: "shopper" });
  await t.db.query("insert into public.service_cities (name) values ('Jakarta'), ('Bandung')");
});

describe("katalog", () => {
  it("pengunjung tanpa login melihat paket, harga, dan add-on aktif", async () => {
    const pk = await t.as<{ key: string }>(null, "select key from public.packages order by sort_order");
    expect(pk.rows.map((r) => r.key)).toEqual(["essential", "insight", "performance"]);
    const prices = await t.as<{ n: number }>(null, "select count(*)::int as n from public.package_prices");
    expect(prices.rows[0].n).toBe(5);
    expect((await t.as(null, "select key from public.addons")).rows).toHaveLength(9);
  });

  it("paket nonaktif tersembunyi dari publik tapi terlihat admin", async () => {
    await t.db.query("insert into public.packages (key, name, active) values ('lama', 'Paket Lama', false)");
    expect((await t.as(null, "select 1 from public.packages where key = 'lama'")).rows).toHaveLength(0);
    expect((await t.as(admin, "select 1 from public.packages where key = 'lama'")).rows).toHaveLength(1);
  });

  it("hanya admin yang bisa mengubah harga", async () => {
    await t.as(client, "update public.package_prices set price = 1 where outlets = 1");
    const res = await t.db.query<{ price: number }>("select price from public.package_prices pp join public.packages p on p.id = pp.package_id where p.key = 'essential'");
    expect(res.rows[0].price).toBe(1099000);
    await expect(t.as(null, "update public.packages set name = 'x'")).rejects.toThrow(/permission denied/);
    await t.as(admin, "update public.package_prices pp set price = 1299000 from public.packages p where p.id = pp.package_id and p.key = 'essential'");
    const after = await t.db.query<{ price: number }>("select price from public.package_prices pp join public.packages p on p.id = pp.package_id where p.key = 'essential'");
    expect(after.rows[0].price).toBe(1299000);
    await t.db.query("update public.package_prices pp set price = 1099000 from public.packages p where p.id = pp.package_id and p.key = 'essential'");
  });

  it("pengaturan pembayaran dibaca pengguna login, bukan pengunjung", async () => {
    expect((await t.as(client, "select value from public.app_settings where key = 'payment'")).rows).toHaveLength(1);
    await expect(t.as(null, "select value from public.app_settings")).rejects.toThrow(/permission denied/);
    await t.as(client, "update public.app_settings set value = '{}'::jsonb");
    const res = await t.db.query<{ value: { bank_name: string } }>("select value from public.app_settings where key = 'payment'");
    expect(res.rows[0].value).toHaveProperty("bank_name", "");
  });
});

describe("perhitungan harga", () => {
  it("paket Insight 1 outlet di kota yang dilayani", async () => {
    const q = await quote("insight", ["Jakarta"]);
    expect(q.total).toBe(1399000);
    expect(q.review_reasons).toEqual([]);
    expect(q.entitlements).toContain("sop");
  });

  it("Performance mengikuti harga per jumlah outlet", async () => {
    expect((await quote("performance", ["Jakarta", "Jakarta", "Bandung"])).total).toBe(3999000);
    expect((await quote("performance", ["Jakarta", "Jakarta", "Bandung", "Jakarta"])).total).toBe(4999000);
    await expect(quote("performance", ["Jakarta", "Jakarta"])).rejects.toThrow(/tidak tersedia untuk 2 outlet/);
  });

  it("outlet tambahan menambah jumlah outlet dan harga", async () => {
    const q = await quote("essential", ["Jakarta", "bandung", "Jakarta"], [{ key: "additional_outlet", qty: 2 }]);
    expect(q.outlet_count).toBe(3);
    expect(q.total).toBe(1099000 + 2 * 999000);
    expect(q.review_reasons).toEqual([]);
  });

  it("jumlah kota harus sama dengan jumlah outlet", async () => {
    await expect(quote("essential", ["Jakarta", "Bandung"])).rejects.toThrow(/tidak tersedia untuk 2 outlet/);
    await expect(quote("essential", [])).rejects.toThrow(/Isi kota/);
    await expect(quote("essential", [" "])).rejects.toThrow(/Kota setiap outlet/);
  });

  it("kota di luar jangkauan ditandai perlu review", async () => {
    const q = await quote("insight", ["Surabaya"]);
    expect(q.review_reasons).toEqual(["city"]);
    expect(q.unserved_cities).toEqual(["Surabaya"]);
  });

  it("add-on tanpa harga pasti ditandai perlu konfirmasi dan tidak masuk total", async () => {
    const q = await quote("insight", ["Jakarta"], [{ key: "custom_questionnaire", qty: 1 }]);
    expect(q.total).toBe(1399000);
    expect(q.review_reasons).toEqual(["quote"]);
    expect(q.lines.find((l) => l.item_key === "custom_questionnaire")?.amount).toBeNull();
  });

  it("add-on yang butuh persetujuan ditandai perlu review", async () => {
    expect((await quote("insight", ["Jakarta"], [{ key: "re_audit", qty: 1 }])).review_reasons).toEqual(["addon"]);
  });

  it("add-on hanya untuk paket yang berlaku, jumlah dalam batas, tidak dobel", async () => {
    await expect(quote("essential", ["Jakarta"], [{ key: "competitor_benchmark", qty: 1 }])).rejects.toThrow(/tidak tersedia untuk paket/);
    await expect(quote("insight", ["Jakarta"], [{ key: "priority_report", qty: 2 }])).rejects.toThrow(/Jumlah Laporan express/);
    await expect(
      quote("insight", ["Jakarta"], [
        { key: "priority_report", qty: 1 },
        { key: "priority_report", qty: 1 },
      ]),
    ).rejects.toThrow(/lebih dari sekali/);
  });

  it("add-on menambah hak akses fitur", async () => {
    expect((await quote("insight", ["Jakarta"], [{ key: "competitor_benchmark", qty: 1 }])).entitlements).toContain("competitor");
  });

  it("promo yang sedang berlaku memotong harga, yang belum mulai tidak", async () => {
    await t.db.query("update public.packages set promo_pct = 20, promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '1 day' where key = 'insight'");
    const q = await quote("insight", ["Jakarta"]);
    expect(q.total).toBe(1119200);
    expect(q.lines[0]).toMatchObject({ unit_price: 1119200, list_price: 1399000 });
    await t.db.query("update public.packages set promo_starts_at = now() + interval '1 day', promo_ends_at = now() + interval '2 days' where key = 'insight'");
    expect((await quote("insight", ["Jakarta"])).total).toBe(1399000);
    await t.db.query("update public.packages set promo_pct = null, promo_starts_at = null, promo_ends_at = null where key = 'insight'");
  });

  it("promo wajib punya tanggal mulai dan selesai", async () => {
    await expect(t.db.query("update public.packages set promo_pct = 10 where key = 'essential'")).rejects.toThrow(/packages_promo_dates/);
  });
});

describe("pesanan dan pembayaran", () => {
  it("client memesan: proyek menunggu bayar, invoice 2x24 jam dengan baris harga", async () => {
    const id = await order(client, "insight", ["Jakarta"], [{ key: "priority_report", qty: 1 }]);
    const p = await projectOf(id);
    expect(p).toMatchObject({ status: "awaiting_payment", outlet_count: 1 });
    expect(p.code).toMatch(/^PRJ-\d{4}$/);
    const inv = await invoiceOf(id);
    expect(inv).toMatchObject({ status: "unpaid", total: 1399000 + 399000, client_id: client });
    expect(inv.code).toMatch(/^INV-\d{4}$/);
    const hours = (new Date(inv.due_at!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
    const lines = await t.as<{ n: number }>(client, "select count(*)::int as n from public.invoice_lines");
    expect(lines.rows[0].n).toBe(2);
    await closeOpenOrders(client);
  });

  it("satu client hanya punya satu pesanan terbuka", async () => {
    await order(client, "essential", ["Jakarta"]);
    await expect(order(client, "insight", ["Jakarta"])).rejects.toThrow(/belum selesai/);
    await closeOpenOrders(client);
  });

  it("hanya client aktif yang bisa memesan", async () => {
    await expect(order(shopper, "essential", ["Jakarta"])).rejects.toThrow(/Hanya pemilik bisnis/);
    await expect(order(admin, "essential", ["Jakarta"])).rejects.toThrow(/Hanya pemilik bisnis/);
    await expect(t.as(null, "select public.create_order('essential', array['Jakarta'], '[]')")).rejects.toThrow(/permission denied/);
  });

  it("client tidak bisa membuat atau mengubah pesanan dan invoice langsung", async () => {
    const id = await order(client, "essential", ["Jakarta"]);
    await expect(t.as(client, "update public.invoices set status = 'paid' where project_id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(t.as(client, "update public.projects set status = 'active' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(t.as(client, "update public.invoice_lines set amount = 1")).rejects.toThrow(/permission denied/);
    await expect(
      t.as(client, "insert into public.projects (code, client_id, package_snapshot, outlet_count, status) values ('X', $1, '{}', 1, 'active')", [client]),
    ).rejects.toThrow(/permission denied/);
    await closeOpenOrders(client);
  });

  it("client lain tidak melihat pesanan, invoice, dan outlet milik client lain", async () => {
    const id = await order(client, "essential", ["Jakarta"]);
    expect((await t.as(other, "select id from public.projects where id = $1", [id])).rows).toHaveLength(0);
    expect((await t.as(other, "select id from public.invoices where project_id = $1", [id])).rows).toHaveLength(0);
    expect((await t.as(other, "select id from public.project_outlets where project_id = $1", [id])).rows).toHaveLength(0);
    expect((await t.as(admin, "select id from public.projects where id = $1", [id])).rows).toHaveLength(1);
    await closeOpenOrders(client);
  });

  it("alur lengkap: bukti bayar → ditolak → kirim ulang → diverifikasi → proyek aktif", async () => {
    const id = await order(client, "essential", ["Jakarta"]);
    const inv = await invoiceOf(id);
    const path = `${client}/${inv.id}/bukti.jpg`;
    const submit = (who: string, p = path) =>
      t.as(who, "select public.submit_payment_proof($1, 'qris', $2, $3, 'Budi')", [inv.id, p, inv.total]);

    await expect(submit(other)).rejects.toThrow(/tidak ditemukan/);
    await expect(submit(client, `${other}/${inv.id}/bukti.jpg`)).rejects.toThrow(/File bukti tidak valid/);
    await submit(client);
    expect((await invoiceOf(id)).status).toBe("verifying");
    expect((await projectOf(id)).status).toBe("verifying");
    await expect(submit(client)).rejects.toThrow(/tidak sedang menunggu pembayaran/);

    const verify = (who: string, approve: boolean, note: string | null = null) =>
      t.as(who, "select public.admin_verify_payment($1, $2, $3)", [inv.id, approve, note]);
    await expect(verify(client, true)).rejects.toThrow(/Hanya admin/);
    await expect(verify(admin, false)).rejects.toThrow(/Alasan wajib/);
    await verify(admin, false, "Nominal tidak sesuai tagihan");
    expect(await invoiceOf(id)).toMatchObject({ status: "unpaid" });
    expect((await projectOf(id)).status).toBe("awaiting_payment");

    await submit(client);
    await verify(admin, true);
    expect((await invoiceOf(id)).status).toBe("paid");
    expect((await projectOf(id)).status).toBe("active");
    const proofs = await t.as<{ status: string }>(client, "select status from public.payment_proofs order by uploaded_at");
    expect(proofs.rows.map((r) => r.status)).toEqual(["rejected", "accepted"]);
    const log = await t.db.query<{ action: string }>(
      "select action from public.activity_log where target_id in ($1, $2) order by id",
      [id, inv.id],
    );
    expect(log.rows.map((r) => r.action)).toEqual(["order.created", "payment.submitted", "payment.rejected", "payment.submitted", "payment.verified"]);
  });

  it("invoice lewat 2x24 jam kedaluwarsa dan client bisa memesan lagi", async () => {
    const id = await order(other, "essential", ["Bandung"]);
    await t.db.query("update public.invoices set due_at = now() - interval '1 minute' where project_id = $1", [id]);
    const inv = await invoiceOf(id);
    await expect(
      t.as(other, "select public.submit_payment_proof($1, 'transfer', $2, 100, '')", [inv.id, `${other}/${inv.id}/a.jpg`]),
    ).rejects.toThrow(/kedaluwarsa/);
    // Error membatalkan seluruh transaksi; status kedaluwarsa disimpan saat halaman memanggil expire_overdue.
    await t.as(other, "select public.expire_overdue()");
    expect((await invoiceOf(id)).status).toBe("expired");
    expect((await projectOf(id)).status).toBe("expired");
    const again = await order(other, "essential", ["Bandung"]);
    expect((await projectOf(again)).status).toBe("awaiting_payment");
    await closeOpenOrders(other);
  });
});

describe("pesanan yang perlu review admin", () => {
  it("add-on quote: invoice belum bisa dibayar sampai admin mengisi harga", async () => {
    const id = await order(other, "insight", ["Jakarta"], [{ key: "custom_questionnaire", qty: 1 }]);
    expect(await projectOf(id)).toMatchObject({ status: "awaiting_review", review_reasons: ["quote"] });
    const inv = await invoiceOf(id);
    expect(inv).toMatchObject({ status: "draft", due_at: null });
    await expect(
      t.as(other, "select public.submit_payment_proof($1, 'qris', $2, 100, '')", [inv.id, `${other}/${inv.id}/a.jpg`]),
    ).rejects.toThrow(/tidak sedang menunggu pembayaran/);

    const line = (await t.db.query<{ id: string }>("select id from public.invoice_lines where invoice_id = $1 and amount is null", [inv.id])).rows[0];
    const review = (prices: object) => t.as(admin, "select public.admin_review_order($1, true, 'Harga kuesioner disesuaikan', $2::jsonb)", [id, JSON.stringify(prices)]);
    await expect(review({})).rejects.toThrow(/Harga untuk Kuesioner khusus wajib diisi/);
    await review({ [line.id]: 800000 });
    expect(await invoiceOf(id)).toMatchObject({ status: "unpaid", total: 1399000 + 800000 });
    expect((await invoiceOf(id)).due_at).not.toBeNull();
    expect((await projectOf(id)).status).toBe("awaiting_payment");
    await closeOpenOrders(other);
  });

  it("admin membatalkan pesanan di kota yang belum terjangkau dengan alasan", async () => {
    const id = await order(other, "essential", ["Medan"]);
    expect((await projectOf(id)).review_reasons).toEqual(["city"]);
    await expect(t.as(admin, "select public.admin_review_order($1, false, null)", [id])).rejects.toThrow(/Alasan wajib/);
    await t.as(admin, "select public.admin_review_order($1, false, 'Medan belum terjangkau shopper kami')", [id]);
    expect((await projectOf(id)).status).toBe("cancelled");
    expect((await invoiceOf(id)).status).toBe("cancelled");
  });

  it("admin bisa membatalkan pesanan yang belum aktif, tidak yang sudah aktif", async () => {
    const id = await order(other, "essential", ["Jakarta"]);
    await t.as(admin, "select public.admin_cancel_order($1, 'Client minta batal')", [id]);
    expect((await projectOf(id)).status).toBe("cancelled");
    const active = (await t.db.query<{ id: string }>("select id from public.projects where status = 'active' limit 1")).rows[0];
    await expect(t.as(admin, "select public.admin_cancel_order($1, 'x')", [active.id])).rejects.toThrow(/tidak bisa dibatalkan/);
  });
});

describe("lengkapi data setelah aktif", () => {
  let projectId: string;

  beforeAll(async () => {
    projectId = (await t.db.query<{ id: string }>("select id from public.projects where client_id = $1 and status = 'active'", [client])).rows[0].id;
  });

  it("client mengisi perusahaan dan outlet, tapi tidak bisa mengubah kota", async () => {
    await t.as(client, "insert into public.companies (client_id, name, pic_name, pic_phone) values ($1, 'Kopi Senja', 'Budi', '081234567890')", [client]);
    await t.as(client, "update public.project_outlets set name = 'Kopi Senja Kemang', address = 'Jl. Kemang Raya 1' where project_id = $1", [projectId]);
    await expect(t.as(client, "update public.project_outlets set city = 'Bali' where project_id = $1", [projectId])).rejects.toThrow(/permission denied/);
    const outlet = await t.as<{ name: string; city: string }>(client, "select name, city from public.project_outlets where project_id = $1", [projectId]);
    expect(outlet.rows[0]).toEqual({ name: "Kopi Senja Kemang", city: "Jakarta" });
  });

  it("client lain tidak bisa mengisi perusahaan atas nama orang lain", async () => {
    await expect(t.as(other, "insert into public.companies (client_id, name) values ($1, 'Palsu')", [client])).rejects.toThrow(/row-level security/);
  });

  it("data outlet pesanan yang belum aktif tidak bisa diisi", async () => {
    const id = await order(other, "essential", ["Jakarta"]);
    await t.as(other, "update public.project_outlets set name = 'X' where project_id = $1", [id]);
    expect((await t.db.query<{ name: string }>("select name from public.project_outlets where project_id = $1", [id])).rows[0].name).toBe("");
    await closeOpenOrders(other);
  });

  it("menandai lengkap mewajibkan data perusahaan dan setiap outlet", async () => {
    await t.db.query("update public.project_outlets set address = '' where project_id = $1", [projectId]);
    await expect(t.as(client, "select public.complete_project_details($1, 'Cek kecepatan layanan')", [projectId])).rejects.toThrow(/alamat setiap outlet/);
    await t.as(client, "update public.project_outlets set address = 'Jl. Kemang Raya 1' where project_id = $1", [projectId]);
    await t.as(client, "select public.complete_project_details($1, 'Cek kecepatan layanan')", [projectId]);
    expect((await projectOf(projectId)).details_completed_at).not.toBeNull();
    await expect(t.as(other, "select public.complete_project_details($1, '')", [projectId])).rejects.toThrow(/tidak ditemukan/);
  });
});
