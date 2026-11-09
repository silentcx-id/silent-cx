import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { FEATURE_COVERAGE } from "../src/lib/report/coverage";
import { LAUNCH_DRAFT } from "../src/lib/vouchers";
import { DEFAULT_CONTENT } from "../src/lib/site-content";

// Putaran 17: harga 9 Nov 2026, promo launching 10% paket, voucher brand 20%, batas pembelian Rp50.000,
// instruksi khusus client untuk shopper.
let t: TestDb;
let admin: string;
let client: string;
let shopper: string;

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261109000028_pricing_nov.sql", import.meta.url), "utf8");
// Satu pernyataan dari migrasi, untuk dijalankan ulang terhadap data lama yang dibuat tes.
const statement = (start: string) => {
  const from = MIGRATION.indexOf(start);
  return MIGRATION.slice(from, MIGRATION.indexOf(";\n", from) + 1);
};

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
const quote = async (pkg: string, cities: string[], addons: unknown[] = []) =>
  (await t.as<{ q: { total: number; lines: { kind: string; item_key: string; amount: number; list_price: number | null }[] } }>(
    client,
    "select public.quote_order($1, $2::text[], $3::jsonb) as q",
    [pkg, cities, JSON.stringify(addons)],
  )).rows[0].q;
const order = (pkg: string, cities: string[]) =>
  t.as<{ id: string }>(client, "select public.create_order($1, $2, '[]'::jsonb) as id", [pkg, cities]).then((r) => r.rows[0].id);
const invoiceOf = (project: string) => one<{ id: string; total: number }>("select id, total from public.invoices where project_id = $1 and kind = 'order'", [project]);
const closeOrder = async (project: string) => {
  await t.db.query("update public.invoices set status = 'expired' where project_id = $1", [project]);
  await t.db.query("update public.projects set status = 'expired' where id = $1", [project]);
};
const voucher = (brand: string, rules: unknown) =>
  t
    .as<{ v: { id: string; code: string; starts_at: string; ends_at: string } }>(
      admin,
      "select to_jsonb(public.admin_create_voucher($1, '', $2::jsonb, now() - interval '1 day', now() + interval '30 days')) as v",
      [brand, JSON.stringify(rules)],
    )
    .then((r) => r.rows[0].v);

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Kopi Senja" });
  shopper = await t.provision("shopper@contoh.test", "shopper", { full_name: "Rina" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [client]);
  await t.db.query("insert into public.service_cities (name) values ('Makassar')");
  // Masa promo dibuat relatif terhadap hari tes supaya tes tetap berlaku setelah 5 Des 2026.
  await t.db.query("update public.packages set promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '30 days' where promo_pct is not null");
});

describe("harga paket dan add-on", () => {
  it("harga normal paket; Performance hanya 3 outlet", async () => {
    const rows = (await t.db.query<{ key: string; outlets: number; price: number }>(
      "select p.key, pp.outlets, pp.price from public.package_prices pp join public.packages p on p.id = pp.package_id order by p.sort_order, pp.outlets",
    )).rows;
    expect(rows).toEqual([
      { key: "essential", outlets: 1, price: 399000 },
      { key: "insight", outlets: 1, price: 599000 },
      { key: "performance", outlets: 3, price: 1299000 },
    ]);
  });

  it("harga add-on; kuesioner khusus nonaktif dan tidak terlihat publik", async () => {
    const rows = (await t.db.query<{ key: string; price: number; pricing: string; active: boolean }>("select key, price, pricing, active from public.addons")).rows;
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.additional_outlet.price).toBe(349000);
    expect(by.additional_visit.price).toBe(349000);
    expect(by.re_audit.price).toBe(399000);
    expect(by.competitor_benchmark.price).toBe(699000);
    expect(by.additional_consultation.price).toBe(199000);
    expect(by.priority_report.price).toBe(349000);
    expect(by.out_of_city.pricing).toBe("quote");
    expect(by.excess_purchase.pricing).toBe("quote");
    expect(by.custom_questionnaire.active).toBe(false);
    const visible = (await t.as<{ key: string }>(null, "select key from public.addons")).rows.map((r) => r.key);
    expect(visible).not.toContain("custom_questionnaire");
    expect(visible).toContain("additional_outlet");
  });

  it("batas pembelian Rp50.000 di paket, fitur, dan add-on kelebihan pembelian; fee shopper Rp150.000", async () => {
    const pkgs = (await t.db.query<{ purchase_allowance: number; features: string[] }>("select purchase_allowance, features from public.packages")).rows;
    for (const p of pkgs) {
      expect(p.purchase_allowance).toBe(50000);
      expect(p.features).toContain("Biaya pembelian hingga Rp50.000 per kunjungan");
      expect(p.features.join(" ")).not.toMatch(/150\.000|3–5 outlet/);
      for (const f of p.features) expect(FEATURE_COVERAGE[f], `fitur "${f}" belum dipetakan`).toBeDefined();
    }
    expect((await one<{ description: string }>("select description from public.addons where key = 'excess_purchase'")).description).toMatch(/di atas Rp50\.000/);
    expect((await one<{ fee: number }>("select (value ->> 'default_fee')::int as fee from public.app_settings where key = 'field'")).fee).toBe(150000);
  });
});

describe("promo launching 10%", () => {
  it("hanya paket yang mendapat promo 10%, berakhir 5 Des 2026 23.59 WIB", async () => {
    const fresh = await createTestDb();
    const p = (await fresh.db.query<{ key: string; promo_pct: number; promo_amount: number | null; promo_free_outlet: boolean; ends: string }>(
      "select key, promo_pct, promo_amount, promo_free_outlet, to_char(promo_ends_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') as ends from public.packages order by sort_order",
    )).rows;
    expect(p.map((x) => [x.key, x.promo_pct, x.promo_amount, x.promo_free_outlet, x.ends])).toEqual([
      ["essential", 10, null, false, "2026-12-06 00:00"],
      ["insight", 10, null, false, "2026-12-06 00:00"],
      ["performance", 10, null, false, "2026-12-06 00:00"],
    ]);
    expect((await fresh.db.query("select 1 from public.addons where promo_pct is not null or promo_amount is not null")).rows).toHaveLength(0);
    expect((await fresh.db.query<{ p: number | null }>("select coalesce(promo_pct, promo_amount) as p from public.addon_promo")).rows[0].p).toBeNull();
  });

  it("harga promo: Essential Rp359.100, Insight Rp539.100, Performance Rp1.169.100", async () => {
    expect((await quote("essential", ["Makassar"])).total).toBe(359100);
    expect((await quote("insight", ["Makassar"])).total).toBe(539100);
    expect((await quote("performance", ["Makassar", "Makassar", "Makassar"])).total).toBe(1169100);
  });

  it("add-on memakai harga normal; outlet ke-4 Performance lewat Outlet tambahan", async () => {
    const q = await quote("performance", ["Makassar", "Makassar", "Makassar", "Makassar"], [{ key: "additional_outlet", qty: 1 }, { key: "priority_report", qty: 1 }]);
    expect(q.total).toBe(1169100 + 349000 + 349000);
    await expect(quote("performance", ["Makassar", "Makassar", "Makassar", "Makassar"])).rejects.toThrow(/tidak tersedia untuk 4 outlet/);
  });

  it("tanggal berakhir yang sudah diatur admin tetap dipakai", async () => {
    const fresh = await createTestDb({ catalog: "2026-10" });
    await fresh.db.query("update public.packages set promo_amount = 300000, promo_starts_at = now() - interval '1 day', promo_ends_at = '2026-12-31 00:00+07' where key = 'essential'");
    await fresh.db.query("update public.packages set promo_free_outlet = true, promo_starts_at = now() - interval '1 day', promo_ends_at = '2026-12-31 00:00+07' where key = 'performance'");
    await fresh.db.query("update public.addon_promo set promo_pct = 20, promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '20 days'");
    await fresh.db.exec(MIGRATION.slice(0, MIGRATION.indexOf("-- 2. Harga paket")));
    const ends = (await fresh.db.query<{ key: string; pct: number; free: boolean; ends: string }>(
      "select key, promo_pct as pct, promo_free_outlet as free, to_char(promo_ends_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as ends from public.packages order by sort_order",
    )).rows;
    expect(ends).toEqual([
      { key: "essential", pct: 10, free: false, ends: "2026-12-31" },
      { key: "insight", pct: 10, free: false, ends: "2026-12-31" },
      { key: "performance", pct: 10, free: false, ends: "2026-12-31" },
    ]);
    expect((await fresh.db.query<{ p: number | null }>("select promo_pct as p from public.addon_promo")).rows[0].p).toBeNull();
  });
});

describe("voucher brand 20%", () => {
  it("voucher 20% dari harga normal, tidak digabung dengan promo 10%; add-on tidak dipotong", async () => {
    const cases: [string, string[], number][] = [
      ["essential", ["Makassar"], 319200],
      ["insight", ["Makassar"], 479200],
      ["performance", ["Makassar", "Makassar", "Makassar"], 1039200],
    ];
    for (const [pkg, cities, expected] of cases) {
      const v = await voucher(`Brand ${pkg}`, LAUNCH_DRAFT.rules);
      const project = await order(pkg, cities);
      const inv = await invoiceOf(project);
      const r = (await t.as<{ r: { new_total: number } }>(client, "select public.client_apply_voucher($1, $2) as r", [inv.id, v.code])).rows[0].r;
      expect(r.new_total, pkg).toBe(expected);
      const promoLines = (await t.db.query<{ item_key: string }>("select item_key from public.invoice_lines where invoice_id = $1 and kind = 'promo'", [inv.id])).rows;
      expect(promoLines.map((l) => l.item_key)).toEqual(["voucher"]);
      await closeOrder(project);
    }
  });

  it("voucher lama (50% dan Rp999.000) diubah ke 20% untuk paket yang sama; kode dan masa berlaku tetap", async () => {
    const fresh = await createTestDb({ catalog: "2026-10" });
    const freshAdmin = await fresh.createAdmin("a@silentcx.test");
    const make = (brand: string, rules: unknown) =>
      fresh
        .as<{ v: { id: string; code: string; starts_at: string; ends_at: string } }>(
          freshAdmin,
          "select to_jsonb(public.admin_create_voucher($1, '', $2::jsonb, '2026-11-05 00:00+07', '2026-12-06 00:00+07', $3)) as v",
          [brand, JSON.stringify(rules), brand === "Jajan" ? "JAJANSCX26" : null],
        )
        .then((r) => r.rows[0].v);
    const full = await make("Jajan", [{ package: "essential", pct: 50 }, { package: "insight", pct: 50 }, { package: "performance", amount: 999000 }]);
    const partial = await make("Kopi", [{ package: "essential", pct: 50 }, { package: "insight", pct: 50 }]);
    await fresh.db.exec(statement("update public.vouchers v"));
    const rows = (await fresh.db.query<{ code: string; rules: unknown; starts_at: string; ends_at: string }>(
      "select code, rules, starts_at::text, ends_at::text from public.vouchers order by brand_name",
    )).rows;
    expect(rows).toEqual([
      { code: "JAJANSCX26", rules: [{ package: "essential", pct: 20 }, { package: "insight", pct: 20 }, { package: "performance", pct: 20 }], starts_at: expect.any(String), ends_at: expect.any(String) },
      { code: partial.code, rules: [{ package: "essential", pct: 20 }, { package: "insight", pct: 20 }], starts_at: expect.any(String), ends_at: expect.any(String) },
    ].sort((a, b) => (a.code === "JAJANSCX26" ? 0 : 1) - (b.code === "JAJANSCX26" ? 0 : 1)));
    const jajan = (await fresh.db.query<{ starts_at: string; ends_at: string }>("select starts_at, ends_at from public.vouchers where code = 'JAJANSCX26'")).rows[0];
    expect(new Date(jajan.starts_at).toISOString()).toBe(new Date(full.starts_at).toISOString());
    expect(new Date(jajan.ends_at).toISOString()).toBe(new Date(full.ends_at).toISOString());
  });

  it("aturan bawaan voucher baru di admin: 20% semua paket", () => {
    expect(LAUNCH_DRAFT.rules).toEqual([
      { package: "essential", pct: 20 },
      { package: "insight", pct: 20 },
      { package: "performance", pct: 20 },
    ]);
  });
});

describe("teks halaman", () => {
  it("konten landing dan legal: tanpa keterangan PPN, batas pembelian Rp50.000", async () => {
    const fresh = await createTestDb();
    const doc = { faq: "Pembelian ditanggung hingga Rp150.000 per kunjungan.", lede: "Harga sudah termasuk PPN. Pilih paket.", en: "Prices include VAT. Choose.", legal: "Harga mengikuti pesanan. Semua harga sudah termasuk PPN." };
    await fresh.db.query("insert into public.site_content (draft, published) values ($1, $1)", [JSON.stringify(doc)]);
    await fresh.db.exec(statement("update public.site_content"));
    const { draft, published } = (await fresh.db.query<{ draft: typeof doc; published: typeof doc }>("select draft, published from public.site_content")).rows[0];
    for (const d of [draft, published]) {
      expect(d).toEqual({ faq: "Pembelian ditanggung hingga Rp50.000 per kunjungan.", lede: "Pilih paket.", en: "Choose.", legal: "Harga mengikuti pesanan." });
    }
  });

  it("isi bawaan landing dan legal tidak lagi menyebut PPN", () => {
    expect(JSON.stringify(DEFAULT_CONTENT)).not.toMatch(/PPN|include VAT/);
  });

  it("artikel promo ditulis ulang: diskon 10%, voucher 20%, harga baru", async () => {
    const rows = (await t.db.query<{ slug: string; title: string; body: string }>("select slug, title, body from public.articles where category = 'promo' order by slug")).rows;
    const all = rows.map((r) => r.title + r.body).join("\n");
    expect(all).not.toMatch(/50%|999\.000|1\.099\.000|1\.399\.000|Rp150\.000/);
    const launch = rows.find((r) => r.slug === "promo-launching-silentcx")!;
    expect(launch.title).toMatch(/Diskon 10%/);
    for (const price of ["Rp359.100", "Rp539.100", "Rp1.169.100", "Rp319.200", "Rp479.200", "Rp1.039.200"]) expect(launch.body).toContain(price);
    const terms = rows.find((r) => r.slug === "syarat-ketentuan-promo-launching")!;
    expect(terms.body).toMatch(/Add-on tidak mendapat diskon promo/);
    expect(terms.body).toMatch(/Kewajiban brand penerima voucher/);
  });
});

describe("instruksi khusus client untuk shopper", () => {
  let outlet: string;
  let task: string;

  beforeAll(async () => {
    const project = await order("essential", ["Makassar"]);
    // Data outlet diisi client setelah proyek aktif (pembayaran diverifikasi).
    await t.db.query("update public.projects set status = 'active' where id = $1", [project]);
    outlet = (await one<{ id: string }>("select id from public.project_outlets where project_id = $1", [project])).id;
    task = (await one<{ id: string }>(
      "insert into public.audit_tasks (code, project_id, outlet_id, window_start, window_end, fee, reimburse_cap, scenario, shopper_id, status) values ('T-17', $1, $2, current_date, current_date, 150000, 50000, 'Pesan menu andalan.', $3, 'accepted') returning id",
      [project, outlet, shopper],
    )).id;
  });

  it("client mengisi instruksi per outlet, maksimal 1000 karakter", async () => {
    await t.as(client, "update public.project_outlets set shopper_note = 'Pesan Kopi Gula Aren, cek apakah kasir menawarkan member card.' where id = $1", [outlet]);
    expect((await one<{ shopper_note: string }>("select shopper_note from public.project_outlets where id = $1", [outlet])).shopper_note).toMatch(/member card/);
    expect(await fails(t.as(client, "update public.project_outlets set shopper_note = $2 where id = $1", [outlet, "a".repeat(1001)]))).toMatch(/shopper_note/);
  });

  it("instruksi tampil langsung di tugas shopper, terpisah dari instruksi admin", async () => {
    const r = (await t.as<{ j: { scenario: string; client_note: string } }>(shopper, "select public.shopper_task($1) as j", [task])).rows[0].j;
    expect(r.scenario).toBe("Pesan menu andalan.");
    expect(r.client_note).toMatch(/member card/);
  });

  it("client lain tidak bisa mengubah instruksi outlet ini", async () => {
    const other = await t.signUp("lain@contoh.test", { full_name: "Lain" });
    await t.as(other, "update public.project_outlets set shopper_note = 'ganti' where id = $1", [outlet]);
    expect((await one<{ shopper_note: string }>("select shopper_note from public.project_outlets where id = $1", [outlet])).shopper_note).toMatch(/member card/);
  });
});
