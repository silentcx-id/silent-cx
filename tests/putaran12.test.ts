import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { displayPrice, freeOutletSaving, promoActive, promoSaving, withAddonPromo, type Addon, type Package } from "../src/lib/catalog-types";

let t: TestDb;
let admin: string;
let client: string;

type Line = { kind: string; item_key: string; label: string; unit_price: number | null; amount: number | null; list_price: number | null };
type Quote = { total: number; lines: Line[]; package: { price: number; list_price: number } };

const quote = async (pkg: string, cities: string[], addons: unknown[] = []) =>
  (await t.as<{ q: Quote }>(client, "select public.quote_order($1, $2::text[], $3::jsonb) as q", [pkg, cities, JSON.stringify(addons)])).rows[0].q;
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
const ACTIVE = "promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '1 day'";
const NONE = "promo_pct = null, promo_amount = null, promo_free_outlet = false, promo_starts_at = null, promo_ends_at = null";
const ADDON_NONE = "promo_pct = null, promo_amount = null, promo_starts_at = null, promo_ends_at = null";
const cities = (n: number) => Array.from({ length: n }, () => "Jakarta");
const setGlobal = (who: string, pct: number | null, amount: number | null, starts = "now() - interval '1 day'", ends = "now() + interval '1 day'") =>
  t.as(who, `select public.admin_set_addon_promo($1, $2, ${starts}, ${ends})`, [pct, amount]);
const clearGlobal = () => t.as(admin, "select public.admin_set_addon_promo(null, null, null, null)");

beforeAll(async () => {
  t = await createTestDb({ catalog: "2026-10" });
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Client Promo" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [client]);
});

describe("promo gratis 1 outlet (Performance)", () => {
  beforeAll(async () => {
    await t.db.query(`update public.packages set promo_free_outlet = true, ${ACTIVE} where key = 'performance'`);
  });

  it("4 outlet bayar harga 3 outlet, potongan jadi baris tersendiri", async () => {
    const q = await quote("performance", cities(4));
    expect(q.total).toBe(3999000);
    expect(q.lines[0]).toMatchObject({ kind: "package", label: "SilentCX Performance (4 outlet)", amount: 4999000, list_price: 4999000 });
    expect(q.lines[1]).toMatchObject({ kind: "promo", item_key: "free_outlet", label: "Promo gratis 1 outlet", amount: -1000000 });
    expect(q.package).toMatchObject({ price: 3999000, list_price: 4999000 });
  });

  it("5 outlet bayar harga 4; 3 outlet tidak dapat potongan", async () => {
    expect((await quote("performance", cities(5))).total).toBe(4999000);
    const three = await quote("performance", cities(3));
    expect(three.total).toBe(3999000);
    expect(three.lines.some((l) => l.kind === "promo")).toBe(false);
  });

  it("outlet tambahan di atas 5 tetap dihitung penuh", async () => {
    const q = await quote("performance", cities(6), [{ key: "additional_outlet", qty: 1 }]);
    expect(q.total).toBe(4999000 + 999000);
  });

  it("pesanan menyimpan baris potongan di invoice dan total sesuai", async () => {
    const id = (await t.as<{ id: string }>(client, "select public.create_order('performance', $1::text[], '[]'::jsonb) as id", [cities(4)])).rows[0].id;
    const inv = (await t.db.query<{ total: number }>("select total from public.invoices where project_id = $1", [id])).rows[0];
    expect(inv.total).toBe(3999000);
    const lines = (await t.db.query<Line>("select i.kind, i.item_key, i.label, i.unit_price, i.amount, i.list_price from public.invoice_lines i join public.invoices v on v.id = i.invoice_id where v.project_id = $1 order by position", [id])).rows;
    expect(lines.map((l) => [l.kind, l.amount])).toEqual([
      ["package", 4999000],
      ["promo", -1000000],
    ]);
    await t.db.query("update public.projects set status = 'cancelled' where id = $1", [id]);
  });

  it("promo yang belum mulai tidak memotong; satu paket hanya satu jenis promo", async () => {
    await t.db.query("update public.packages set promo_starts_at = now() + interval '1 day', promo_ends_at = now() + interval '2 days' where key = 'performance'");
    expect((await quote("performance", cities(4))).total).toBe(4999000);
    expect(await fails(t.db.query("update public.packages set promo_pct = 10 where key = 'performance'"))).toMatch(/promo_one_kind/);
    expect(await fails(t.db.query(`update public.packages set promo_starts_at = null, promo_ends_at = null where key = 'performance'`))).toMatch(/promo_dates/);
    await t.db.query(`update public.packages set ${NONE} where key = 'performance'`);
  });

  it("hanya untuk paket dengan beberapa pilihan jumlah outlet", async () => {
    expect(await fails(t.db.query(`update public.packages set promo_free_outlet = true, ${ACTIVE} where key = 'essential'`))).toMatch(/beberapa pilihan jumlah outlet/);
  });

  it("baris non-promo tetap tidak boleh negatif", async () => {
    const inv = (await t.db.query<{ id: string }>("select id from public.invoices limit 1")).rows[0].id;
    expect(await fails(t.db.query("insert into public.invoice_lines (invoice_id, position, kind, item_key, label, unit_price, amount) values ($1, 99, 'addon', 'x', 'x', -1, -1)", [inv]))).toMatch(/check/);
  });
});

describe("promo global add-on", () => {
  it("hanya admin yang bisa mengatur", async () => {
    expect(await fails(setGlobal(client, 10, null))).toMatch(/Hanya admin/);
  });

  it("persen berlaku untuk semua add-on harga pasti, add-on harga dikonfirmasi admin tidak ikut", async () => {
    await setGlobal(admin, 10, null);
    const q = await quote("performance", cities(3), [
      { key: "re_audit", qty: 1 },
      { key: "custom_questionnaire", qty: 1 },
    ]);
    expect(q.lines.find((l) => l.item_key === "re_audit")).toMatchObject({ unit_price: 899000 * 0.9, list_price: 899000 });
    expect(q.lines.find((l) => l.item_key === "custom_questionnaire")).toMatchObject({ unit_price: null, amount: null });
  });

  it("promo per add-on ditolak selama promo global berlaku, dengan tanggal akhirnya", async () => {
    expect(await fails(t.as(admin, `update public.addons set promo_pct = 20, ${ACTIVE} where key = 're_audit'`))).toMatch(/Promo global add-on sedang berlaku s\.d\. \d+ \w+ \d{4}/);
    // Jadwal sesudah promo global berakhir tetap boleh.
    await t.db.query("update public.addons set promo_pct = 20, promo_starts_at = now() + interval '3 days', promo_ends_at = now() + interval '4 days' where key = 're_audit'");
    await t.db.query(`update public.addons set ${ADDON_NONE} where key = 're_audit'`);
  });

  it("promo global ditolak kalau ada add-on yang masih punya promo sendiri, dengan namanya", async () => {
    await clearGlobal();
    await t.db.query(`update public.addons set promo_amount = 100000, ${ACTIVE} where key = 'additional_outlet'`);
    await t.db.query("update public.addons set promo_pct = 15, promo_starts_at = now() + interval '1 day', promo_ends_at = now() + interval '5 days' where key = 're_audit'");
    const msg = await fails(setGlobal(admin, 10, null, "now()", "now() + interval '10 days'"));
    expect(msg).toMatch(/^Promo global tidak bisa disimpan\. Add-on ini masih punya promo sendiri: /);
    expect(msg).toContain("Hemat Rp100.000");
    expect(msg).toContain("Hemat 15%");
    expect(msg).toMatch(/Hentikan promonya dulu/);
    // Promo add-on yang sudah lewat, atau periodenya tidak bertabrakan, tidak menghalangi.
    await t.db.query("update public.addons set promo_starts_at = now() - interval '5 days', promo_ends_at = now() - interval '1 day' where key = 'additional_outlet'");
    await t.db.query("update public.addons set promo_starts_at = now() + interval '20 days', promo_ends_at = now() + interval '25 days' where key = 're_audit'");
    await setGlobal(admin, 10, null, "now()", "now() + interval '10 days'");
    await clearGlobal();
    await t.db.query(`update public.addons set ${ADDON_NONE}`);
  });

  it("potongan nominal harus di bawah harga add-on termurah, dengan nama add-on itu", async () => {
    const cheapest = (await t.db.query<{ name: string; price: number }>("select name, price from public.addons where active and pricing = 'fixed' order by price limit 1")).rows[0];
    const msg = await fails(setGlobal(admin, null, cheapest.price));
    expect(msg).toMatch(/tidak lebih kecil dari harga add-on ini/);
    expect(msg).toContain(cheapest.name);
    await setGlobal(admin, null, cheapest.price - 1);
    // Harga add-on tidak bisa diturunkan sampai di bawah potongan global.
    expect(await fails(t.as(admin, "update public.addons set price = 1 where key = 're_audit'"))).toMatch(/harus di atas potongan promo global/);
    await clearGlobal();
  });

  it("tanggal wajib dan selesai setelah mulai", async () => {
    expect(await fails(t.as(admin, "select public.admin_set_addon_promo(10, null, null, null)"))).toMatch(/Isi tanggal/);
    expect(await fails(setGlobal(admin, 10, null, "now()", "now() - interval '1 day'"))).toMatch(/setelah tanggal mulai/);
  });

  it("konsultasi tambahan dan audit ulang ikut promo global", async () => {
    await setGlobal(admin, null, 50000);
    const price = (await t.db.query<{ p: number }>("select public.addon_unit_price(a) as p from public.addons a where key = 'additional_consultation'")).rows[0].p;
    const list = (await t.db.query<{ price: number }>("select price from public.addons where key = 'additional_consultation'")).rows[0].price;
    expect(price).toBe(list - 50000);
    await clearGlobal();
  });
});

describe("tampilan promo", () => {
  const now = Date.now();
  const period = { promo_starts_at: new Date(now - 86400_000).toISOString(), promo_ends_at: new Date(now + 86400_000).toISOString() };
  const perf = { promo_pct: null, promo_amount: null, promo_free_outlet: true, ...period, prices: [{ outlets: 3, price: 3999000 }, { outlets: 4, price: 4999000 }, { outlets: 5, price: 5999000 }] } as unknown as Package;

  it("gratis 1 outlet: label, harga per jumlah outlet tidak dipotong, potongan mulai 4 outlet", () => {
    expect(promoActive(perf)).toBe(true);
    expect(promoSaving(perf, "id")).toBe("Gratis 1 outlet");
    expect(promoSaving(perf, "en")).toBe("1 outlet free");
    expect(displayPrice(3999000, perf)).toBe(3999000);
    expect(freeOutletSaving(perf, 3)).toBe(0);
    expect(freeOutletSaving(perf, 4)).toBe(1000000);
    expect(freeOutletSaving(perf, 5)).toBe(1000000);
  });

  it("promo global dipakai kalau add-on tidak punya promo sendiri; harga dikonfirmasi admin tidak ikut", () => {
    const base = { promo_pct: null, promo_amount: null, promo_starts_at: null, promo_ends_at: null, pricing: "fixed", price: 899000 } as unknown as Addon;
    const global = { promo_pct: 10, promo_amount: null, ...period };
    const [a, own, quoted] = withAddonPromo([base, { ...base, promo_amount: 100000, ...period }, { ...base, pricing: "quote" }] as Addon[], global);
    expect(displayPrice(a.price, a)).toBe(809100);
    expect(a.promo_global).toBe(true);
    expect(displayPrice(own.price, own)).toBe(799000);
    expect(own.promo_global).toBeFalsy();
    expect(promoActive(quoted)).toBe(false);
  });
});
