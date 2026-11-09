import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { articleBlocks, inlineParts } from "../src/lib/article-blocks";
import { voucherCodePreview } from "../src/lib/vouchers";

let t: TestDb;
let admin: string;
let client: string;
let other: string;

type Voucher = { id: string; code: string; brand_name: string; rules: unknown[] };
type Line = { kind: string; item_key: string; label: string; unit_price: number | null; amount: number | null; list_price: number | null };

const one = async <T>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
const LAUNCH = [
  { package: "essential", pct: 50 },
  { package: "insight", pct: 50 },
  { package: "performance", amount: 999000 },
];
const create = (brand: string, rules: unknown = LAUNCH, code: string | null = null, starts = "now() - interval '1 day'", ends = "now() + interval '30 days'") =>
  t
    .as<{ v: Voucher }>(admin, `select to_jsonb(public.admin_create_voucher($1, '', $2::jsonb, ${starts}, ${ends}, $3)) as v`, [brand, JSON.stringify(rules), code])
    .then((r) => r.rows[0].v);
const order = (who: string, pkg: string, cities: string[]) =>
  t.as<{ id: string }>(who, "select public.create_order($1, $2, '[]'::jsonb) as id", [pkg, cities]).then((r) => r.rows[0].id);
const invoiceOf = (project: string) =>
  one<{ id: string; total: number; status: string; dp_amount: number | null }>("select id, total, status::text, dp_amount from public.invoices where project_id = $1 and kind = 'order'", [project]);
const lines = async (invoice: string) => (await t.db.query<Line>("select kind, item_key, label, unit_price, amount, list_price from public.invoice_lines where invoice_id = $1 order by position", [invoice])).rows;
const apply = (who: string, invoice: string, code: string) => t.as<{ r: { discount: number; new_total: number } }>(who, "select public.client_apply_voucher($1, $2) as r", [invoice, code]).then((r) => r.rows[0].r);
const remove = (who: string, invoice: string) => t.as(who, "select public.client_remove_voucher($1)", [invoice]);
const cancelOrder = async (project: string) => {
  await t.db.query("update public.invoices set status = 'expired' where project_id = $1 and status in ('unpaid', 'draft', 'verifying')", [project]);
  await t.db.query("update public.projects set status = 'expired' where id = $1 and status in ('awaiting_review', 'awaiting_payment', 'verifying')", [project]);
};
const NONE = "promo_pct = null, promo_amount = null, promo_free_outlet = false, promo_starts_at = null, promo_ends_at = null";

beforeAll(async () => {
  t = await createTestDb({ catalog: "2026-10" });
  admin = await t.createAdmin("admin@silentcx.test");
  client = await t.signUp("client@contoh.test", { full_name: "Kopi Senja" });
  other = await t.signUp("lain@contoh.test", { full_name: "Lain" });
  await t.db.query("update public.profiles set status = 'active' where id in ($1, $2)", [client, other]);
  await t.db.query("insert into public.service_cities (name) values ('Jakarta')");
});

describe("membuat voucher", () => {
  it("kode otomatis dari nama brand ditambah 4 karakter acak", async () => {
    const v = await create("Kopi Senja!");
    expect(v.code).toMatch(/^KOPISENJA-[2-9A-HJKMNP-Z]{4}$/);
    expect(v.brand_name).toBe("Kopi Senja!");
    expect(v.rules).toEqual(LAUNCH);
    const long = await create("Bakso Pak De Malang Asli");
    expect(long.code).toMatch(/^BAKSOPAKDEMA-[A-Z0-9]{4}$/);
  });

  it("kode bisa diisi sendiri, harus unik dan berformat benar", async () => {
    const v = await create("Kedai Rasa", LAUNCH, "kedairasa2026");
    expect(v.code).toBe("KEDAIRASA2026");
    expect(await fails(create("Lain", LAUNCH, "KEDAIRASA2026"))).toMatch(/sudah dipakai voucher lain/);
    expect(await fails(create("Lain", LAUNCH, "a b"))).toMatch(/4 sampai 30 karakter/);
  });

  it("potongan diperiksa: persen 1–100, nominal di bawah harga termurah, satu jenis per paket", async () => {
    expect(await fails(create("X", [{ package: "essential", pct: 0 }]))).toMatch(/1 sampai 100 persen/);
    expect(await fails(create("X", [{ package: "essential", amount: 1099000 }]))).toMatch(/di bawah harga termurahnya \(Rp1\.099\.000\)/);
    expect(await fails(create("X", [{ package: "essential", pct: 10, amount: 1000 }]))).toMatch(/pilih salah satu/);
    expect(await fails(create("X", [{ package: "essential", pct: 10 }, { package: "essential", pct: 20 }]))).toMatch(/lebih dari sekali/);
    expect(await fails(create("X", []))).toMatch(/minimal satu paket/);
    expect(await fails(create("X", LAUNCH, null, "now()", "now() - interval '1 day'"))).toMatch(/setelah tanggal mulai/);
  });

  it("hanya admin yang bisa membuat, dan client tidak bisa membaca daftar voucher", async () => {
    expect(await fails(t.as(client, "select public.admin_create_voucher('X', '', $1::jsonb, now(), now() + interval '1 day')", [JSON.stringify(LAUNCH)]))).toMatch(/Hanya admin/);
    expect((await t.as(client, "select * from public.vouchers")).rows).toHaveLength(0);
    expect((await t.as(admin, "select * from public.vouchers")).rows.length).toBeGreaterThan(0);
  });

  it("kartu voucher publik hanya tampil dengan kode yang tepat", async () => {
    const v = await create("Roti Pagi");
    const card = (await t.as<{ c: { brand: string; state: string; rules: { name: string; pct?: number; amount?: number }[] } | null }>(null, "select public.voucher_card($1) as c", [v.code.toLowerCase()])).rows[0].c;
    expect(card).toMatchObject({ brand: "Roti Pagi", state: "active" });
    expect(card!.rules.map((r) => r.name)).toEqual(["SilentCX Essential", "SilentCX Insight", "SilentCX Performance"]);
    expect((await t.as<{ c: unknown }>(null, "select public.voucher_card('TIDAKADA-0000') as c")).rows[0].c).toBeNull();
  });
});

describe("klaim voucher di tagihan", () => {
  it("Essential 50%: total jadi setengah, baris voucher tercatat", async () => {
    const v = await create("Kopi Senja");
    const project = await order(client, "essential", ["Jakarta"]);
    const inv = await invoiceOf(project);
    expect(inv.total).toBe(1099000);
    const res = await apply(client, inv.id, ` ${v.code.toLowerCase()} `);
    expect(res).toMatchObject({ discount: 549500, new_total: 549500 });
    expect((await invoiceOf(project)).total).toBe(549500);
    expect((await lines(inv.id)).at(-1)).toMatchObject({ kind: "promo", item_key: "voucher", amount: -549500, label: `Voucher ${v.code} · Kopi Senja` });
    const state = await one<{ s: string }>("select public.voucher_state(v) as s from public.vouchers v where id = $1", [v.id]);
    expect(state.s).toBe("claimed");
    await cancelOrder(project);
  });

  it("Performance potongan Rp999.000", async () => {
    const v = await create("Sate Nusantara");
    const project = await order(other, "performance", ["Jakarta", "Jakarta", "Jakarta"]);
    const inv = await invoiceOf(project);
    const res = await apply(other, inv.id, v.code);
    expect(res.new_total).toBe(3999000 - 999000);
    await cancelOrder(project);
  });

  it("voucher sekali pakai: client lain ditolak", async () => {
    const v = await create("Satu Brand");
    const p1 = await order(client, "insight", ["Jakarta"]);
    await apply(client, (await invoiceOf(p1)).id, v.code);
    const p2 = await order(other, "insight", ["Jakarta"]);
    expect(await fails(apply(other, (await invoiceOf(p2)).id, v.code))).toMatch(/sudah dipakai/);
    await cancelOrder(p1);
    await cancelOrder(p2);
  });

  it("pesan jelas untuk kode salah, belum mulai, berakhir, dibatalkan, dan paket yang tidak termasuk", async () => {
    const project = await order(client, "essential", ["Jakarta"]);
    const inv = await invoiceOf(project);
    expect(await fails(apply(client, inv.id, "SALAH-0000"))).toMatch(/tidak ditemukan/);
    expect(await fails(apply(client, inv.id, ""))).toMatch(/Masukkan kode voucher/);
    const later = await create("Nanti", LAUNCH, null, "now() + interval '2 days'", "now() + interval '9 days'");
    expect(await fails(apply(client, inv.id, later.code))).toMatch(/baru berlaku mulai/);
    const past = await create("Lewat", LAUNCH, null, "now() - interval '9 days'", "now() - interval '1 day'");
    expect(await fails(apply(client, inv.id, past.code))).toMatch(/sudah berakhir/);
    const off = await create("Batal");
    await t.as(admin, "select public.admin_cancel_voucher($1)", [off.id]);
    expect(await fails(apply(client, inv.id, off.code))).toMatch(/sudah tidak berlaku/);
    const perfOnly = await create("Khusus", [{ package: "performance", amount: 500000 }]);
    expect(await fails(apply(client, inv.id, perfOnly.code))).toMatch(/berlaku untuk paket SilentCX Performance\. Pesanan Anda paket SilentCX Essential/);
    expect(await fails(apply(other, inv.id, perfOnly.code))).toMatch(/Tagihan tidak ditemukan/);
    await cancelOrder(project);
  });

  it("promo paket dilepas saat voucher dipasang, lalu dipulihkan saat voucher dilepas", async () => {
    await t.db.query("update public.packages set promo_free_outlet = true, promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '1 day' where key = 'performance'");
    const v = await create("Promo Lepas");
    const project = await order(client, "performance", ["Jakarta", "Jakarta", "Jakarta", "Jakarta"]);
    const inv = await invoiceOf(project);
    expect(inv.total).toBe(3999000);
    const before = await lines(inv.id);
    expect(before.some((l) => l.item_key === "free_outlet")).toBe(true);

    const q = (await t.as<{ q: { promo: number; current_total: number; voucher_total: number; promo_label: string } }>(client, "select public.client_voucher_quote($1, $2) as q", [inv.id, v.code])).rows[0].q;
    expect(q).toMatchObject({ promo: 4999000 - 3999000, current_total: 3999000, voucher_total: 4999000 - 999000, promo_label: "Promo gratis 1 outlet" });

    await apply(client, inv.id, v.code);
    const after = await lines(inv.id);
    expect(after.some((l) => l.item_key === "free_outlet")).toBe(false);
    expect(after.find((l) => l.kind === "package")).toMatchObject({ amount: 4999000 });
    expect((await invoiceOf(project)).total).toBe(4000000);

    await remove(client, inv.id);
    expect((await invoiceOf(project)).total).toBe(3999000);
    expect((await lines(inv.id)).map((l) => [l.kind, l.item_key, l.amount])).toEqual(before.map((l) => [l.kind, l.item_key, l.amount]));
    expect((await one<{ invoice_id: string | null }>("select invoice_id from public.vouchers where id = $1", [v.id])).invoice_id).toBeNull();
    await t.db.query(`update public.packages set ${NONE} where key = 'performance'`);
    await cancelOrder(project);
  });

  it("DP ikut menyesuaikan total baru dan tetap minimal 80%", async () => {
    const v = await create("Dp Brand");
    const project = await order(client, "insight", ["Jakarta"]);
    const inv = await invoiceOf(project);
    await t.as(client, "select public.client_set_payment_plan($1, $2)", [inv.id, Math.ceil(inv.total * 0.9)]);
    await apply(client, inv.id, v.code);
    const now = await invoiceOf(project);
    expect(now.total).toBe(699500);
    expect(now.dp_amount).toBe(Math.ceil(Math.ceil(1399000 * 0.9) * 699500 / 1399000));
    expect(now.dp_amount!).toBeGreaterThanOrEqual(Math.ceil(699500 * 0.8));
    await cancelOrder(project);
  });

  it("setelah bukti bayar diunggah voucher terkunci; lunas = terpakai dan tidak bisa dibatalkan admin", async () => {
    const v = await create("Kunci Brand");
    const project = await order(client, "essential", ["Jakarta"]);
    const inv = await invoiceOf(project);
    await apply(client, inv.id, v.code);
    await t.as(client, "select public.submit_payment_proof($1, 'transfer', $2, 549500, 'Rina')", [inv.id, `${client}/${inv.id}/bukti.jpg`]);
    expect(await fails(remove(client, inv.id))).toMatch(/sebelum bukti bayar diunggah/);
    await t.as(admin, "select public.admin_verify_payment($1, true)", [inv.id]);
    expect((await one<{ s: string }>("select public.voucher_state(v) as s from public.vouchers v where id = $1", [v.id])).s).toBe("used");
    expect(await fails(t.as(admin, "select public.admin_cancel_voucher($1)", [v.id]))).toMatch(/sudah dipakai di tagihan/);
    expect(await fails(t.as(admin, "select public.admin_update_voucher($1, 'X', '', $2::jsonb, now(), now() + interval '1 day')", [v.id, JSON.stringify(LAUNCH)]))).toMatch(/tidak bisa diubah/);
  });

  it("tagihan kedaluwarsa melepas voucher sehingga bisa dipakai lagi", async () => {
    const v = await create("Ulang Brand");
    const project = await order(other, "essential", ["Jakarta"]);
    await apply(other, (await invoiceOf(project)).id, v.code);
    await cancelOrder(project);
    expect((await one<{ invoice_id: string | null }>("select invoice_id from public.vouchers where id = $1", [v.id])).invoice_id).toBeNull();
    const again = await order(other, "essential", ["Jakarta"]);
    expect((await apply(other, (await invoiceOf(again)).id, v.code)).new_total).toBe(549500);
    await cancelOrder(again);
  });
});

describe("artikel", () => {
  it("publik hanya membaca artikel yang terbit", async () => {
    await t.as(admin, "insert into public.articles (category, slug, title, body, status, published_at) values ('promo', 'terbit', 'Artikel terbit', 'Isi', 'published', now() - interval '1 hour')");
    await t.as(admin, "insert into public.articles (category, slug, title, body) values ('promo', 'draf', 'Artikel draf', 'Isi')");
    await t.as(admin, "insert into public.articles (category, slug, title, body, status, published_at) values ('promo', 'nanti', 'Artikel terjadwal', 'Isi', 'published', now() + interval '1 day')");
    expect((await t.as<{ slug: string }>(null, "select slug from public.articles where slug in ('terbit', 'draf', 'nanti')")).rows.map((r) => r.slug)).toEqual(["terbit"]);
    expect((await t.as<{ slug: string }>(admin, "select slug from public.articles where slug in ('terbit', 'draf', 'nanti')")).rows).toHaveLength(3);
    const seeded = (await t.db.query<{ slug: string; published_at: string }>("select slug, published_at from public.articles where category = 'promo' and status = 'published' and slug like '%promo%' or slug like 'cara-klaim%' order by slug")).rows;
    expect(seeded.map((r) => r.slug)).toEqual(["cara-klaim-voucher-silentcx", "promo-launching-silentcx", "syarat-ketentuan-promo-launching"]);
    expect(new Date(seeded[0].published_at).toISOString()).toBe("2026-11-04T17:00:00.000Z");
  });

  it("hanya admin yang menulis; slug unik per kategori dan berformat URL", async () => {
    expect(await fails(t.as(client, "insert into public.articles (category, slug, title) values ('promo', 'x-y', 'Judul')"))).toMatch(/row-level security/);
    expect(await fails(t.as(admin, "insert into public.articles (category, slug, title) values ('promo', 'terbit', 'Dobel')"))).toMatch(/duplicate key|unique/);
    expect(await fails(t.as(admin, "insert into public.articles (category, slug, title) values ('promo', 'Ada Spasi', 'Judul')"))).toMatch(/check constraint/);
    expect(await fails(t.as(admin, "insert into public.articles (category, slug, title, status) values ('promo', 'tanpa-tanggal', 'Judul', 'published')"))).toMatch(/articles_published/);
  });
});

describe("isi artikel dan pratinjau kode", () => {
  it("subjudul, daftar, langkah bernomor, dan paragraf", () => {
    const b = articleBlocks("## Judul\nParagraf satu\nbaris dua\n\n- a\n- b\n\n1. satu\n2. dua\n### Kecil");
    expect(b).toEqual([
      { kind: "h2", text: "Judul" },
      { kind: "p", text: "Paragraf satu\nbaris dua" },
      { kind: "ul", items: ["a", "b"] },
      { kind: "ol", items: ["satu", "dua"] },
      { kind: "h3", text: "Kecil" },
    ]);
  });

  it("tebal dan tautan; tautan hanya https atau alamat situs sendiri", () => {
    expect(inlineParts("Hemat **50%** di [paket](/app/paket) atau [x](javascript:alert(1))")).toEqual([
      { kind: "text", text: "Hemat " },
      { kind: "bold", text: "50%" },
      { kind: "text", text: " di " },
      { kind: "link", text: "paket", href: "/app/paket" },
      { kind: "text", text: " atau [x](javascript:alert(1))" },
    ]);
  });

  it("pratinjau kode sama dengan aturan database", () => {
    expect(voucherCodePreview("Kopi Senja!")).toBe("KOPISENJA-XXXX");
    expect(voucherCodePreview("Bakso Pak De Malang Asli")).toBe("BAKSOPAKDEMA-XXXX");
    expect(voucherCodePreview("  ")).toBe("SCX-XXXX");
  });
});

describe("syarat & ketentuan voucher", () => {
  it("memuat kewajiban testimoni (dengan nama) dan logo brand sebagai mitra, satu kali", async () => {
    const { body } = await one<{ body: string }>("select body from public.articles where slug = 'syarat-ketentuan-promo-launching'");
    expect(body).toContain("## Kewajiban brand penerima voucher");
    expect(body).toContain("beserta nama pemberi testimoni");
    expect(body).toContain("Logo brand ditampilkan di landing page SilentCX sebagai mitra SilentCX");
    expect(body.indexOf("## Kewajiban brand")).toBeLessThan(body.indexOf("## Lain-lain"));
    expect(body.split("## Kewajiban brand").length).toBe(2);
  });
});
