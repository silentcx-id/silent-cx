// Uji headless alur konsultasi dengan client dan proyek Insight sementara (laporan sudah terbit):
// admin membuka jadwal kosong di kalender → client booking jam dan mengunduh .ics → admin menempelkan link →
// client menggeser jadwal sekali → admin menutup sesi dengan ringkasan → client membaca ringkasan →
// client membeli sesi tambahan → admin menghapus jadwal kosong.
// MENULIS DATA ke Supabase, lalu menghapus akun uji (beserta proyek, sesi, dan tagihannya) dan jadwal kosong uji.
// Jalankan hanya dengan izin pemilik project: node --env-file=.env.local tests/e2e/fase5-konsultasi.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const retry = async (fn, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
};
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

async function loginAs(browser, email, viewport = { width: 1280, height: 900 }) {
  const { data, error } = await retry(async () => {
    const res = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (res.error && /fetch/i.test(res.error.message)) throw res.error;
    return res;
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultNavigationTimeout(90000);
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: new URL(`konsultasi-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";

// Tanggal WIB tiga hari lagi, supaya semua jam lebih dari 24 jam ke depan.
const day = new Date(Date.now() + 7 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
const month = day.slice(0, 7);
const at = (hm) => new Date(`${day}T${hm}:00+07:00`).toISOString();

const stamp = Date.now();
const email = `uji-konsultasi-${stamp}@silentcx.test`;
const clientId = must(
  await retry(() => admin.auth.admin.createUser({ email, password: `Uji${stamp}x9`, email_confirm: true, user_metadata: { full_name: "Client Uji Konsultasi", phone: "081200007777" } })),
  "buat client",
).user.id;
let windowId = null;

const browser = await chromium.launch();
try {
  const pkg = must(await admin.from("packages").select("id, entitlements").eq("key", "insight").single(), "paket insight");
  const project = must(
    await admin
      .from("projects")
      .insert({
        code: `UJI-KNS-${stamp}`,
        client_id: clientId,
        package_id: pkg.id,
        package_snapshot: { key: "insight", name: "SilentCX Insight", outlets: 1, visits: 1, purchase_allowance: 150000 },
        outlet_count: 1,
        entitlements: pkg.entitlements,
        status: "completed",
      })
      .select("id")
      .single(),
    "buat proyek",
  );
  must(await admin.from("reports").insert({ project_id: project.id }), "buat laporan");
  must(await admin.from("reports").update({ status: "published", published_at: new Date().toISOString() }).eq("project_id", project.id), "terbitkan laporan");
  const credits = must(await admin.from("consultations").select("id, minutes, status").eq("client_id", clientId), "jatah");
  check("laporan terbit memberi 1 jatah 30 menit", credits.length === 1 && credits[0].minutes === 30, JSON.stringify(credits));
  const sessionId = credits[0]?.id;

  // Admin membuka jadwal kosong lewat form di samping kalender.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/consultations?tab=kalender&bulan=${month}&tgl=${day}`, { waitUntil: "networkidle" });
  check("menu Konsultasi admin terbuka", (await text(a.page)).includes("Buka jadwal kosong"));
  await a.page.getByRole("button", { name: "Tambah jadwal kosong" }).click();
  await a.page.getByText("Jadwal kosong ditambahkan.").first().waitFor();
  windowId = must(await admin.from("consultation_windows").select("id").eq("starts_at", at("09:00")).eq("ends_at", at("12:00")).maybeSingle(), "cari jadwal kosong")?.id ?? null;
  check("jadwal kosong 09.00–12.00 tersimpan", !!windowId);
  await a.page.reload({ waitUntil: "networkidle" });
  check("kalender admin menampilkan jadwal kosong", (await text(a.page)).includes("09.00–12.00 kosong"));
  await shot(a.page, "admin-kalender");

  // Client booking jam 09.00.
  const c = await loginAs(browser, email);
  await c.page.goto(`${BASE}/app/consultation?bulan=${month}&tgl=${day}`, { waitUntil: "networkidle" });
  const before = await text(c.page);
  check("client melihat jatah dan jam kosong", before.includes("Jatah sesi Anda") && before.includes("jam kosong"));
  await shot(c.page, "client-kalender");
  await c.page.locator("label", { hasText: /^09\.00$/ }).click();
  await c.page.getByLabel("Topik yang ingin dibahas (opsional)").fill("Temuan di kasir");
  await c.page.getByRole("button", { name: "Booking sesi" }).click();
  await c.page.getByText("Sesi dibooking.").first().waitFor();
  const booked = must(await admin.from("consultations").select("status, starts_at, topic").eq("id", sessionId).single(), "baca sesi");
  check("sesi terjadwal jam 09.00 dengan topik", booked.status === "scheduled" && new Date(booked.starts_at).toISOString() === at("09:00") && booked.topic === "Temuan di kasir");
  await c.page.waitForURL(/\/app\/consultation$/);
  check("kartu sesi menunggu link meeting", (await text(c.page)).includes("Link meeting dikirim admin sebelum sesi dimulai."));
  const ics = await c.page.request.get(`${BASE}/app/consultation/${sessionId}/ics`);
  const icsBody = await ics.text();
  check("file .ics bisa diunduh", ics.ok() && icsBody.includes("BEGIN:VCALENDAR") && icsBody.includes("DTSTART:"), ics.headers()["content-type"]);

  // Admin menempelkan link meeting.
  await a.page.goto(`${BASE}/admin/consultations/${sessionId}`, { waitUntil: "networkidle" });
  await a.page.getByPlaceholder("https://meet.google.com/…").fill("https://meet.google.com/uji-kons-ult");
  await a.page.getByRole("button", { name: "Simpan link" }).click();
  await a.page.getByText("Link meeting disimpan").first().waitFor();
  await c.page.goto(`${BASE}/app/consultation`, { waitUntil: "networkidle" });
  check("client melihat tombol link meeting", (await c.page.getByRole("link", { name: /Buka link meeting/ }).getAttribute("href")) === "https://meet.google.com/uji-kons-ult");
  check("client mendapat notifikasi link", (await admin.from("notifications").select("id").eq("user_id", clientId).eq("kind", "consultation.link")).data?.length === 1);

  // Client menggeser ke 10.00.
  await c.page.getByRole("link", { name: "Geser jadwal" }).click();
  await c.page.waitForURL(/ubah=/);
  await c.page.goto(`${BASE}/app/consultation?ubah=${sessionId}&bulan=${month}&tgl=${day}`, { waitUntil: "networkidle" });
  await c.page.locator("label", { hasText: /^10\.00$/ }).click();
  await c.page.getByRole("button", { name: "Simpan jadwal baru" }).click();
  await c.page.getByText("Jadwal sesi digeser.").first().waitFor();
  const moved = must(await admin.from("consultations").select("starts_at, reschedule_count").eq("id", sessionId).single(), "baca sesi");
  check("jadwal pindah ke 10.00 dan kesempatan geser habis", new Date(moved.starts_at).toISOString() === at("10:00") && moved.reschedule_count === 1);
  await c.page.goto(`${BASE}/app/consultation`, { waitUntil: "networkidle" });
  check("tombol geser jadwal hilang", (await c.page.getByRole("link", { name: "Geser jadwal" }).count()) === 0 && (await text(c.page)).includes("sudah pernah digeser"));

  // Sesi dianggap sudah berlangsung, lalu admin menutupnya dengan ringkasan.
  must(
    await admin.from("consultations").update({ starts_at: new Date(Date.now() - 3600_000).toISOString(), ends_at: new Date(Date.now() - 1800_000).toISOString() }).eq("id", sessionId),
    "mundurkan sesi",
  );
  await a.page.goto(`${BASE}/admin/consultations/${sessionId}`, { waitUntil: "networkidle" });
  await a.page.getByLabel("Ringkasan sesi *").fill("Kasir perlu sapaan standar.");
  await a.page.getByLabel("Action plan").fill("Briefing pagi tiap Senin.");
  await a.page.getByRole("button", { name: "Tandai selesai" }).click();
  await a.page.getByText("Sesi ditandai selesai.").first().waitFor();
  await c.page.goto(`${BASE}/app/consultation/${sessionId}`, { waitUntil: "networkidle" });
  const summary = await text(c.page);
  check("client membaca ringkasan dan action plan", summary.includes("Kasir perlu sapaan standar.") && summary.includes("Briefing pagi tiap Senin."));
  await shot(c.page, "client-ringkasan");

  // Client membeli satu sesi tambahan.
  await c.page.goto(`${BASE}/app/consultation`, { waitUntil: "networkidle" });
  await c.page.getByRole("button", { name: "Buat tagihan" }).click();
  await c.page.waitForURL(/\/app\/billing/);
  await c.page.waitForLoadState("networkidle");
  check("tagihan konsultasi tambahan tampil di Tagihan", (await text(c.page)).includes("Konsultasi tambahan"));
  const inv = must(await admin.from("invoices").select("kind, status, total").eq("client_id", clientId).eq("kind", "consultation"), "baca tagihan");
  check("tagihan dibuat dengan harga add-on", inv.length === 1 && inv[0].status === "unpaid" && inv[0].total > 0, JSON.stringify(inv));

  // Tampilan ponsel: kalender berubah jadi daftar tanggal.
  const m = await loginAs(browser, "admin@silentcx.demo", { width: 390, height: 844 });
  await m.page.goto(`${BASE}/admin/consultations?tab=kalender&bulan=${month}&tgl=${day}`, { waitUntil: "networkidle" });
  const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("kalender di ponsel tanpa geser samping", !overflow);
  await shot(m.page, "admin-ponsel");
  await m.ctx.close();

  // Admin menghapus jadwal kosong (sudah tidak ada sesi di dalamnya).
  await a.page.goto(`${BASE}/admin/consultations?tab=kalender&bulan=${month}&tgl=${day}`, { waitUntil: "networkidle" });
  a.page.once("dialog", (d) => d.accept());
  await a.page.getByRole("button", { name: "Hapus jadwal kosong 09.00–12.00" }).click();
  await a.page.getByText("Jadwal kosong dihapus.").first().waitFor();
  check("jadwal kosong terhapus", (await admin.from("consultation_windows").select("id").eq("id", windowId)).data?.length === 0);
  if ((await admin.from("consultation_windows").select("id").eq("id", windowId)).data?.length === 0) windowId = null;

  await Promise.all([a.ctx.close(), c.ctx.close()]);
} finally {
  await browser.close();
  if (windowId) {
    const { error } = await admin.from("consultation_windows").delete().eq("id", windowId);
    console.log(error ? `! Jadwal kosong uji gagal dihapus: ${error.message}` : "Jadwal kosong uji dihapus.");
  }
  const { error } = await admin.auth.admin.deleteUser(clientId);
  console.log(error ? `! Akun uji ${email} gagal dihapus: ${error.message}` : `Akun uji ${email} dan datanya dihapus.`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
