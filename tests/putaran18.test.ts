import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-helpers";
import { FEATURE_COVERAGE } from "../src/lib/report/coverage";
import { DEFAULT_CONTENT } from "../src/lib/site-content";
import { MILESTONES, ROLE_MENU } from "../src/lib/roles";
import { insightSample, performanceSample } from "../src/lib/report/sample";

// Putaran 18: fitur konsultasi dihapus. Paket hanya berisi kunjungan dan laporan.
let t: TestDb;
let client: string;

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261109000029_remove_consultation.sql", import.meta.url), "utf8");
const between = (from: string, to: string) => MIGRATION.slice(MIGRATION.indexOf(from), MIGRATION.indexOf(to) + to.length);
const fails = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);

beforeAll(async () => {
  t = await createTestDb();
  client = await t.signUp("client@contoh.test", { full_name: "Kopi Senja" });
  await t.db.query("update public.profiles set status = 'active' where id = $1", [client]);
  await t.db.query("insert into public.service_cities (name) values ('Makassar')");
});

describe("katalog tanpa konsultasi", () => {
  it("paket tanpa jatah, hak, dan teks fitur konsultasi", async () => {
    const rows = (await t.db.query<{ key: string; consultation_minutes: number; entitlements: string[]; features: string[] }>(
      "select key, consultation_minutes, entitlements, features from public.packages order by sort_order",
    )).rows;
    expect(rows.map((r) => r.key)).toEqual(["essential", "insight", "performance"]);
    for (const r of rows) {
      expect(r.consultation_minutes, r.key).toBe(0);
      expect(r.entitlements, r.key).not.toContain("consultation");
      expect(r.features.filter((f) => /konsultasi|debrief/i.test(f)), r.key).toEqual([]);
      // Setiap fitur yang tersisa tetap punya tempat di laporan atau layanan.
      for (const f of r.features) expect(FEATURE_COVERAGE[f], f).toBeDefined();
    }
    expect(Object.keys(FEATURE_COVERAGE).filter((k) => /konsultasi|debrief/i.test(k))).toEqual([]);
  });

  it("add-on Konsultasi tambahan nonaktif, tidak terlihat publik, dan tidak bisa dipesan", async () => {
    expect((await t.db.query<{ active: boolean }>("select active from public.addons where key = 'additional_consultation'")).rows[0].active).toBe(false);
    expect((await t.as(null, "select 1 from public.addons where key = 'additional_consultation'")).rows).toHaveLength(0);
    const err = await fails(
      t.as(client, "select public.create_order('essential', array['Makassar'], $1::jsonb)", [JSON.stringify([{ key: "additional_consultation", qty: 1 }])]),
    );
    expect(err).toMatch(/Add-on tidak tersedia/);
  });

  it("client tidak bisa membeli sesi tambahan, dan laporan terbit tidak memberi jatah sesi", async () => {
    expect(await fails(t.as(client, "select public.client_buy_consultation(gen_random_uuid(), 1)"))).toMatch(/permission denied/);
    const trig = await t.db.query("select 1 from pg_trigger where tgname = 'reports_grant_consultations'");
    expect(trig.rows).toHaveLength(0);
    // Tabel riwayat tetap ada.
    expect((await t.db.query<{ n: number }>("select count(*)::int as n from public.consultations")).rows[0].n).toBe(0);
  });
});

describe("konten tanpa konsultasi", () => {
  it("kartu fitur Konsultasi dihapus dari draft dan versi terbit; kartu lain tetap urut", async () => {
    const fresh = await createTestDb();
    const card = (id: string) => ({ title: { id, en: id }, body: { id: "", en: "" }, icon: "users" });
    const doc = { order: ["features"], sections: { features: { title: "Fitur", items: [card("Check-in GPS"), card("Konsultasi"), card("Live chat Sisca")] } } };
    await fresh.db.query("insert into public.site_content (draft, published) values ($1, $1)", [JSON.stringify(doc)]);
    await fresh.db.exec(between("create or replace function public.drop_consultation_card", "drop function public.drop_consultation_card(jsonb);"));
    const { draft, published } = (await fresh.db.query<{ draft: typeof doc; published: typeof doc }>("select draft, published from public.site_content")).rows[0];
    for (const d of [draft, published]) {
      expect(d.sections.features.items.map((i) => i.title.id)).toEqual(["Check-in GPS", "Live chat Sisca"]);
      expect(d.sections.features.title).toBe("Fitur");
    }
    expect((await fresh.db.query("select 1 from pg_proc where proname = 'drop_consultation_card'")).rows).toHaveLength(0);
  });

  it("artikel promo tidak lagi menyebut konsultasi", async () => {
    const rows = (await t.db.query<{ slug: string; body: string; excerpt: string }>("select slug, body, excerpt from public.articles")).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(`${r.excerpt}\n${r.body}`, r.slug).not.toMatch(/konsultasi/i);
    const promo = rows.find((r) => r.slug === "promo-launching-silentcx")!;
    expect(promo.body).toContain("tingkat keparahan temuan, dan analisis gap.");
  });

  it("isi bawaan landing, menu, dan tahap perjalanan tanpa konsultasi", () => {
    expect(DEFAULT_CONTENT.sections.features.items.map((x) => x.title.id)).not.toContain("Konsultasi");
    expect(ROLE_MENU.client.map((m) => m.slug)).not.toContain("consultation");
    expect(ROLE_MENU.admin.map((m) => m.slug)).not.toContain("consultations");
    expect(JSON.stringify(MILESTONES.client)).not.toMatch(/konsultasi|consultation/i);
    expect(insightSample.entitlements).not.toContain("consultation");
    expect(performanceSample.entitlements).not.toContain("consultation");
  });
});
