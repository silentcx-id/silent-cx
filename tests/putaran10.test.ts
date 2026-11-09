import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { displayPrice, promoActive, promoSaving, promoUntil } from "../src/lib/catalog-types";

let t: TestDb;
let admin: string;
let client: string;

type Quote = { total: number; lines: { item_key: string; unit_price: number | null; list_price: number | null; amount: number | null }[] };
type Account = { id: string; full_name: string; role: string; status: string; cities: string[]; interests: string[]; gender: string | null; company: string | null; total: number };

const quote = async (pkg: string, cities: string[], addons: unknown[] = []) =>
  (await t.as<{ q: Quote }>(client, "select public.quote_order($1, $2::text[], $3::jsonb) as q", [pkg, cities, JSON.stringify(addons)])).rows[0].q;
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
const ACTIVE = "promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '1 day'";

const list = async (filters: Record<string, unknown> = {}, who = admin) =>
  (
    await t.as<Account>(
      who,
      "select * from public.admin_list_accounts(p_role => $1, p_status => $2, p_q => $3, p_city => $4, p_interest => $5, p_gender => $6, p_limit => $7, p_offset => $8)",
      [filters.role ?? null, filters.status ?? null, filters.q ?? "", filters.city ?? "", filters.interest ?? "", filters.gender ?? "", filters.limit ?? 10, filters.offset ?? 0],
    )
  ).rows;

beforeAll(async () => {
  t = await createTestDb({ catalog: "2026-10" });
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client Promo" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [client]);
});

describe("promo potongan nominal", () => {
  it("potongan nominal mengurangi harga paket; harga asli tetap tercatat untuk dicoret", async () => {
    await t.db.query(`update public.packages set promo_amount = 300000, ${ACTIVE} where key = 'insight'`);
    const q = await quote("insight", ["Jakarta"]);
    expect(q.total).toBe(1399000 - 300000);
    expect(q.lines[0]).toMatchObject({ unit_price: 1099000, list_price: 1399000 });
  });

  it("Performance: potongan yang sama untuk setiap jumlah outlet", async () => {
    await t.db.query(`update public.packages set promo_amount = 500000, ${ACTIVE} where key = 'performance'`);
    expect((await quote("performance", ["Jakarta", "Jakarta", "Bandung"])).total).toBe(3999000 - 500000);
    expect((await quote("performance", ["Jakarta", "Jakarta", "Bandung", "Jakarta"])).total).toBe(4999000 - 500000);
    await t.db.query("update public.packages set promo_amount = null, promo_starts_at = null, promo_ends_at = null where key = 'performance'");
  });

  it("potongan nominal add-on dihitung per unit", async () => {
    await t.db.query(`update public.addons set promo_amount = 100000, ${ACTIVE} where key = 'additional_outlet'`);
    await t.db.query("update public.packages set promo_amount = null, promo_starts_at = null, promo_ends_at = null where key = 'insight'");
    const q = await quote("essential", ["Jakarta", "Bandung", "Jakarta"], [{ key: "additional_outlet", qty: 2 }]);
    expect(q.total).toBe(1099000 + 2 * (999000 - 100000));
    expect(q.lines.find((l) => l.item_key === "additional_outlet")).toMatchObject({ unit_price: 899000, list_price: 999000, amount: 2 * 899000 });
    await t.db.query("update public.addons set promo_amount = null, promo_starts_at = null, promo_ends_at = null where key = 'additional_outlet'");
  });

  it("promo yang belum mulai atau sudah selesai tidak memotong harga", async () => {
    await t.db.query("update public.packages set promo_amount = 300000, promo_starts_at = now() + interval '1 day', promo_ends_at = now() + interval '2 days' where key = 'insight'");
    expect((await quote("insight", ["Jakarta"])).total).toBe(1399000);
    await t.db.query("update public.packages set promo_starts_at = now() - interval '2 days', promo_ends_at = now() - interval '1 day' where key = 'insight'");
    expect((await quote("insight", ["Jakarta"])).total).toBe(1399000);
    await t.db.query("update public.packages set promo_amount = null, promo_starts_at = null, promo_ends_at = null where key = 'insight'");
  });

  it("promo persen dan nominal tidak bisa dipakai bersamaan, dan wajib bertanggal", async () => {
    expect(await fails(t.db.query(`update public.packages set promo_pct = 10, promo_amount = 100000, ${ACTIVE} where key = 'insight'`))).toMatch(/promo_one_kind/);
    expect(await fails(t.db.query("update public.packages set promo_amount = 100000 where key = 'insight'"))).toMatch(/promo_dates/);
    expect(await fails(t.db.query(`update public.addons set promo_pct = 10, promo_amount = 100000, ${ACTIVE} where key = 'additional_outlet'`))).toMatch(/promo_one_kind/);
  });

  it("potongan harus di bawah harga termurah paket atau harga add-on, juga saat harga diturunkan sesudahnya", async () => {
    expect(await fails(t.db.query(`update public.packages set promo_amount = 1099000, ${ACTIVE} where key = 'essential'`))).toMatch(/lebih kecil dari harga termurah/);
    expect(await fails(t.db.query(`update public.packages set promo_amount = 3999000, ${ACTIVE} where key = 'performance'`))).toMatch(/lebih kecil dari harga termurah/);
    expect(await fails(t.db.query(`update public.addons set promo_amount = 999000, ${ACTIVE} where key = 'additional_outlet'`))).toMatch(/below_price/);
    await t.db.query(`update public.packages set promo_amount = 500000, ${ACTIVE} where key = 'essential'`);
    expect(
      await fails(t.db.query("update public.package_prices pp set price = 400000 from public.packages p where p.id = pp.package_id and p.key = 'essential'")),
    ).toMatch(/lebih kecil dari harga termurah/);
    await t.db.query("update public.packages set promo_amount = null, promo_starts_at = null, promo_ends_at = null where key = 'essential'");
  });

  it("fungsi harga promo: persen, nominal, tidak pernah di bawah nol", async () => {
    const price = async (pct: number | null, amount: number | null) =>
      (await t.db.query<{ p: number }>("select public.promo_price(500000, $1, $2, now() - interval '1 day', now() + interval '1 day') as p", [pct, amount])).rows[0].p;
    expect(await price(20, null)).toBe(400000);
    expect(await price(null, 100000)).toBe(400000);
    expect(await price(null, 900000)).toBe(0);
    expect(await price(null, null)).toBe(500000);
  });

  it("tampilan: label Hemat persen atau rupiah, dan tanggal akhir promo", () => {
    const now = Date.now();
    const base = { promo_starts_at: new Date(now - 86400_000).toISOString(), promo_ends_at: "2099-11-15T16:59:00.000Z" };
    const pct = { ...base, promo_pct: 20, promo_amount: null };
    const amount = { ...base, promo_pct: null, promo_amount: 300000 };
    expect(promoActive(amount)).toBe(true);
    expect(displayPrice(1099000, pct)).toBe(879200);
    expect(displayPrice(1099000, amount)).toBe(799000);
    expect(promoSaving(pct, "id")).toBe("Hemat 20%");
    expect(promoSaving(amount, "id")).toBe("Hemat Rp300.000");
    expect(promoSaving(amount, "en")).toBe("Save Rp300.000");
    expect(promoUntil(amount, "id")).toMatch(/^Promo s\.d\. 15 Nov 2099.*23[.:]59 WIB$/);
    expect(displayPrice(1099000, { ...amount, promo_starts_at: new Date(now + 86400_000).toISOString() })).toBe(1099000);
  });
});

describe("daftar akun admin", () => {
  beforeAll(async () => {
    // 12 shopper: jenis kelamin, kota, dan minat bergantian; satu ditangguhkan.
    for (let i = 1; i <= 12; i++) {
      const id = await t.signUp(`shopper${i}@contoh.test`, { account_type: "shopper", full_name: `Shopper ${String(i).padStart(2, "0")}`, phone: `0812000000${String(i).padStart(2, "0")}` });
      await t.db.query("update public.profiles set status = $2 where id = $1", [id, i === 12 ? "suspended" : "active"]);
      await t.db.query("insert into public.shopper_applications (shopper_id, status, reachable_cities, gender, industries, submitted_at) values ($1, 'approved', $2, $3, $4, now())", [
        id,
        i % 2 ? ["Jakarta"] : ["Bandung", "Jakarta"],
        i % 3 ? "female" : "male",
        i % 4 ? ["fnb"] : ["retail", "fnb"],
      ]);
    }
    const owner = await t.signUp("owner@contoh.test", { full_name: "Pemilik Toko" });
    await t.db.query("update public.profiles set status = 'active' where id = $1", [owner]);
    await t.db.query("insert into public.companies (client_id, name, city, industry) values ($1, 'Toko 100% Jaya', 'Surabaya', 'retail')", [owner]);
    const p = (
      await t.db.query<{ id: string }>(
        `insert into public.projects (code, client_id, package_snapshot, outlet_count, status) values ('PRJ-9001', $1, '{"key":"essential","name":"SilentCX Essential"}', 1, 'active') returning id`,
        [owner],
      )
    ).rows[0].id;
    await t.db.query("insert into public.project_outlets (project_id, position, city, name) values ($1, 1, 'Malang', 'Cabang Malang')", [p]);
  });

  it("hanya admin yang bisa membuka daftar akun", async () => {
    expect(await fails(list({}, client))).toMatch(/Hanya admin/);
  });

  it("10 per halaman dengan jumlah total, admin tidak ikut", async () => {
    const first = await list({ role: "shopper" });
    expect(first).toHaveLength(10);
    expect(Number(first[0].total)).toBe(12);
    const second = await list({ role: "shopper", offset: 10 });
    expect(second.map((r) => r.full_name)).toEqual(["Shopper 02", "Shopper 01"]);
    expect((await list({ limit: 100 })).some((r) => r.role === "admin")).toBe(false);
  });

  it("pencarian nama, email, HP, dan nama perusahaan; tanda % dicari apa adanya", async () => {
    expect((await list({ q: "shopper 07" })).map((r) => r.full_name)).toEqual(["Shopper 07"]);
    expect((await list({ q: "shopper11@" })).map((r) => r.full_name)).toEqual(["Shopper 11"]);
    expect((await list({ q: "081200000003" })).map((r) => r.full_name)).toEqual(["Shopper 03"]);
    expect((await list({ q: "100% jaya" })).map((r) => r.company)).toEqual(["Toko 100% Jaya"]);
    expect(await list({ q: "%" })).toHaveLength(1);
  });

  it("filter status, jangkauan kota, minat bisnis, dan jenis kelamin shopper", async () => {
    expect((await list({ role: "shopper", status: "suspended" })).map((r) => r.full_name)).toEqual(["Shopper 12"]);
    expect(Number((await list({ role: "shopper", city: "Bandung" }))[0].total)).toBe(6);
    expect(Number((await list({ role: "shopper", interest: "retail" }))[0].total)).toBe(3);
    const male = await list({ role: "shopper", gender: "male" });
    expect(male.map((r) => r.full_name)).toEqual(["Shopper 12", "Shopper 09", "Shopper 06", "Shopper 03"]);
    expect(male[0]).toMatchObject({ gender: "male", cities: ["Bandung", "Jakarta"], interests: ["retail", "fnb"] });
    expect(await list({ role: "shopper", gender: "male", city: "Bandung", interest: "retail" })).toHaveLength(1);
  });

  it("pemilik bisnis: kota perusahaan atau kota outlet pesanan, dan jenis usaha", async () => {
    const byCompany = await list({ role: "client", city: "surabaya" });
    expect(byCompany).toHaveLength(1);
    expect(byCompany[0]).toMatchObject({ company: "Toko 100% Jaya", cities: ["Surabaya"], interests: ["retail"] });
    expect(await list({ role: "client", city: "Malang" })).toHaveLength(1);
    expect(await list({ role: "client", interest: "retail" })).toHaveLength(1);
    expect(await list({ role: "client", interest: "fnb" })).toHaveLength(0);
  });
});
