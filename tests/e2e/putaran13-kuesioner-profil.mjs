// Uji headless Putaran 13: persetujuan kuesioner oleh client dan edit profil di Akun saya.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka halaman (Akun saya client dan shopper, Detail akun admin, kartu kuesioner
// proyek) dan menekan Ubah lalu Batal, tanpa menyimpan apa pun.
// Dengan E2E_TULIS=1 skrip membuat proyek uji sementara (PRJ-E2E13) untuk client demo, lalu menjalankan alur lengkap
// lewat browser: admin menetapkan dan mengirim kuesioner → client menandai 2 pertanyaan dan mengajukan perbaikan →
// admin melihat sorotan dan menekan Salin untuk proyek ini → kirim versi 2 → client menyetujui → tugas bisa ditawarkan.
// Shopper demo mengubah hari berkunjung lalu dikembalikan. Di akhir proyek uji dan salinan kuesionernya dihapus;
// riwayat perubahan profil shopper demo tetap tercatat (memang begitu fungsinya).
// Butuh migration 20261104000022 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran13-kuesioner-profil.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const WRITE = process.env.E2E_TULIS === "1";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
// Menunggu sampai teks muncul (halaman dimuat ulang setelah aksi), paling lama 20 detik.
const waitText = (loc, re) => loc.filter({ hasText: re }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
const path = (name) => new URL(`p13-${name}.png`, OUT).pathname.slice(1);

async function loginAs(browser, email, viewport = { width: 1280, height: 900 }) {
  let res;
  for (let i = 0; i < 3; i++) {
    res = await admin.auth.admin.generateLink({ type: "magiclink", email }).catch((e) => ({ data: null, error: e }));
    if (!res.error) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const { data, error } = res;
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}

// Koneksi ke Supabase kadang putus sesaat: perintah tulis dicoba sampai 4 kali.
async function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      const r = await fn();
      if (r.error) throw new Error(r.error.message);
      return r;
    } catch (e) {
      if (i >= 3) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const probe = await admin.from("questionnaire_reviews").select("id").limit(1);
if (probe.error) {
  console.log("✗ migration 20261104000022 belum terpasang di staging. Jalankan npm run db:migrate dulu.");
  process.exit(1);
}

const userId = async (email) => (await admin.from("profiles").select("id, full_name").eq("email", email).single()).data;
const clientUser = await userId("client@silentcx.demo");
const shopperUser = await userId("shopper@silentcx.demo");
let temp = null;
// Sisa proyek uji dari percobaan sebelumnya yang gagal dibersihkan.
if (WRITE) await retry(() => admin.from("projects").delete().eq("code", "PRJ-E2E13"));
let copyId = null;

const browser = await chromium.launch();
try {
  // 1. Client: Akun saya dibagi per bagian, Ubah membuka form di tempat.
  const c = await loginAs(browser, "client@silentcx.demo");
  await c.page.goto(`${BASE}/app/account`, { waitUntil: "networkidle" });
  for (const id of ["personal", "contact", "company"]) check(`client: bagian ${id} tampil`, (await c.page.getByTestId(`section-${id}`).count()) === 1);
  await c.page.getByTestId("section-company").getByRole("button", { name: /^Ubah/ }).click();
  check("client: form perusahaan berisi nama, jenis usaha, kota, alamat", (await c.page.locator("#co-name, #co-industry, #co-city, #co-address").count()) === 4);
  await c.page.getByTestId("section-contact").getByRole("button", { name: /^Ubah/ }).click();
  await c.page.fill("#account-email", "client-baru@silentcx.demo");
  check("client: ganti email memakai tombol Kirim tautan konfirmasi", (await c.page.getByRole("button", { name: "Kirim tautan konfirmasi" }).count()) === 1);
  await c.page.screenshot({ path: path("akun-client"), fullPage: true });
  await c.page.getByTestId("section-contact").getByRole("button", { name: "Batal" }).click();
  await c.page.getByTestId("section-company").getByRole("button", { name: "Batal" }).click();
  check("client: Batal menutup form tanpa menyimpan", (await c.page.locator("#co-name").count()) === 0 && (await c.page.locator("#account-email").count()) === 0);

  // 2. Shopper: semua data bisa diubah.
  const s = await loginAs(browser, "shopper@silentcx.demo");
  await s.page.goto(`${BASE}/shopper/account`, { waitUntil: "networkidle" });
  for (const id of ["personal", "contact", "area", "interest", "bank"]) check(`shopper: bagian ${id} tampil`, (await s.page.getByTestId(`section-${id}`).count()) === 1);
  await s.page.getByTestId("section-personal").getByRole("button", { name: /^Ubah/ }).click();
  check("shopper: nama, jenis kelamin, tanggal lahir bisa diubah", (await s.page.locator("#sp-name, #sp-gender, #sp-birth").count()) === 3);
  await s.page.getByTestId("section-personal").getByRole("button", { name: "Batal" }).click();
  const before = (await admin.from("shopper_applications").select("id, available_days").eq("shopper_id", shopperUser.id).eq("status", "approved").maybeSingle()).data;
  if (WRITE) {
    const interest = s.page.getByTestId("section-interest");
    await interest.getByRole("button", { name: /^Ubah/ }).click();
    const sat = interest.getByLabel("Sabtu");
    const wasSat = await sat.isChecked();
    await sat.click();
    await interest.getByRole("button", { name: "Simpan perubahan" }).click();
    await interest.getByRole("button", { name: /^Ubah/ }).waitFor({ timeout: 20000 });
    await s.page.waitForTimeout(1500);
    const after = (await admin.from("shopper_applications").select("available_days").eq("id", before.id).single()).data;
    check("shopper: hari berkunjung tersimpan", after.available_days.includes("sat") !== wasSat, after.available_days.join(","));
    await s.page.screenshot({ path: path("akun-shopper"), fullPage: true });
    // Kembalikan seperti semula lewat browser juga.
    await interest.getByRole("button", { name: /^Ubah/ }).click();
    await interest.getByLabel("Sabtu").click();
    await interest.getByRole("button", { name: "Simpan perubahan" }).click();
    await interest.getByRole("button", { name: /^Ubah/ }).waitFor({ timeout: 20000 });
    await s.page.waitForTimeout(1500);
    const back = (await admin.from("shopper_applications").select("available_days").eq("id", before.id).single()).data;
    check("shopper: hari berkunjung dikembalikan", back.available_days.includes("sat") === wasSat);
  } else {
    await s.page.screenshot({ path: path("akun-shopper"), fullPage: true });
  }
  await s.page.setViewportSize({ width: 390, height: 844 });
  await s.page.goto(`${BASE}/shopper/account`, { waitUntil: "networkidle" });
  check("HP: Akun saya tidak bergeser ke samping", (await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);

  // 3. Admin: riwayat perubahan di Detail akun.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/accounts/${shopperUser.id}`, { waitUntil: "networkidle" });
  check("admin: Detail akun punya Riwayat perubahan data", (await a.page.getByRole("heading", { name: "Riwayat perubahan data" }).count()) === 1);
  if (WRITE) check("admin: perubahan hari berkunjung tercatat", (await a.page.getByTestId("change-history").getByText("Hari bisa berkunjung").count()) >= 2);
  await a.page.locator("section", { has: a.page.getByRole("heading", { name: "Riwayat perubahan data" }) }).screenshot({ path: path("riwayat-perubahan") });

  // 4. Admin: kartu kuesioner di proyek aktif client demo (hanya dibuka).
  const live = (await admin.from("projects").select("id, code").eq("client_id", clientUser.id).eq("status", "active").limit(1).maybeSingle()).data;
  if (live) {
    await a.page.goto(`${BASE}/admin/projects/${live.id}?tab=jadwal`, { waitUntil: "networkidle" });
    check(`admin: kartu Kuesioner proyek ${live.code} punya status`, (await a.page.getByTestId("questionnaire-status").count()) <= 1 && (await a.page.getByRole("heading", { name: "Kuesioner proyek" }).count()) === 1);
  }

  if (WRITE) {
    // 5. Proyek uji sementara.
    const src = (await admin.from("projects").select("package_snapshot, entitlements, package_id").eq("client_id", clientUser.id).limit(1).single()).data;
    const essential = { ...src.package_snapshot };
    temp = (
      await retry(() => admin
        .from("projects")
        .insert({ code: "PRJ-E2E13", client_id: clientUser.id, package_id: src.package_id, package_snapshot: essential, entitlements: src.entitlements, outlet_count: 1, status: "active", details_completed_at: new Date().toISOString() })
        .select("id")
        .single())
    ).data;
    await retry(() => admin.from("project_outlets").insert({ project_id: temp.id, position: 1, city: "Jakarta", name: "Outlet Uji E2E", address: "Jl. Uji 1" }));

    await a.page.goto(`${BASE}/admin/projects/${temp.id}?tab=jadwal`, { waitUntil: "networkidle" });
    const card = a.page.getByRole("region", { name: "Kuesioner proyek" });
    const ready = await card.locator("#pick-q option:not([disabled])").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
    let assigned = false;
    for (const v of ready) {
      await card.locator("#pick-q").selectOption(v);
      await card.getByRole("button", { name: "Tetapkan" }).click();
      if (await waitText(card.getByTestId("questionnaire-status"), /Belum dikirim/)) {
        assigned = true;
        break;
      }
    }
    check("admin: kuesioner ditetapkan, status Belum dikirim", assigned && (await card.getByTestId("questionnaire-status").innerText()).includes("Belum dikirim"));
    await a.page.getByRole("button", { name: "+ Tugas kunjungan" }).click();
    await a.page.getByRole("button", { name: "Buat tugas" }).click();
    await waitText(a.page.locator("p"), /Tugas bisa ditawarkan ke shopper setelah/);
    check("admin: tugas dibuat tapi belum bisa ditawarkan", (await a.page.getByText("Tugas bisa ditawarkan ke shopper setelah kuesioner proyek disetujui client.").count()) === 1);
    await card.getByRole("button", { name: "Kirim ke client" }).click();
    await waitText(card.getByTestId("questionnaire-status"), /Menunggu client/);
    check("admin: status Menunggu client dengan batas waktu", (await card.getByTestId("questionnaire-status").innerText()).includes("Menunggu client") && (await card.getByText(/Menunggu tanggapan client sampai/).count()) === 1);
    await card.screenshot({ path: path("admin-menunggu") });

    // 6. Client: tinjau dan ajukan perbaikan.
    await c.page.goto(`${BASE}/app/audits`, { waitUntil: "networkidle" });
    check("client: Audit berjalan punya tombol Tinjau kuesioner", (await c.page.getByRole("link", { name: /Tinjau kuesioner/ }).count()) >= 1);
    await c.page.goto(`${BASE}/app/questionnaire/${temp.id}`, { waitUntil: "networkidle" });
    await c.page.screenshot({ path: path("client-tinjau"), fullPage: true });
    check("client: batas 3×24 jam disampaikan", (await c.page.getByText(/Mohon tinjau sebelum .* WIB\. Kalau belum ada tanggapan/).count()) === 1);
    check("client: sisa kesempatan perbaikan tampil", (await c.page.getByTestId("revisions-left").innerText()).includes("2 kali"));
    check("client: tanpa bobot penilaian", !(await c.page.locator("main").innerText()).match(/bobot/i));
    await c.page.screenshot({ path: path("client-tinjau"), fullPage: true });
    await c.page.getByRole("button", { name: "Ajukan perbaikan" }).click();
    const qs = c.page.getByTestId("review-question");
    for (const i of [0, 2]) {
      await qs.nth(i).getByRole("button", { name: "Perlu diubah" }).click();
      await qs.nth(i).locator("textarea").fill(i === 0 ? "Pakai salam khas Kopi Senja" : "Pertanyaan ini kurang relevan, hapus saja");
    }
    await c.page.fill("#additions", "Apakah musik di outlet terlalu keras?");
    check("client: bar bawah menghitung pertanyaan yang ditandai", (await c.page.getByText(/^2 pertanyaan ditandai/).count()) === 1);
    await c.page.screenshot({ path: path("client-perbaikan"), fullPage: false });
    await c.page.getByRole("button", { name: "Kirim permintaan perbaikan" }).click();
    await waitText(c.page.locator("span.chip"), /Sedang diperbaiki/);
    check("client: status Sedang diperbaiki", (await c.page.getByText("Sedang diperbaiki").count()) >= 1);

    // 7. Admin: sorotan perbaikan, salin, kirim versi 2.
    await a.page.goto(`${BASE}/admin/projects/${temp.id}?tab=jadwal`, { waitUntil: "networkidle" });
    check("admin: status Perlu perbaikan", (await card.getByTestId("questionnaire-status").innerText()).includes("Perlu perbaikan"));
    const req = a.page.getByLabel("Permintaan perbaikan client");
    check("admin: 2 pertanyaan disorot beserta catatan", (await req.locator("li").count()) === 2 && (await req.getByText("Pakai salam khas Kopi Senja").count()) === 1);
    check("admin: usulan pertanyaan tambahan tampil", (await req.getByText("Apakah musik di outlet terlalu keras?").count()) === 1);
    const notif = (await admin.from("notifications").select("email_status").eq("kind", "admin.questionnaire_changes").contains("detail", { project: temp.id })).data ?? [];
    check("admin: notifikasi perbaikan masuk antrean email", notif.length > 0 && notif.every((n) => n.email_status !== "none"));
    await card.screenshot({ path: path("admin-perbaikan") });
    await req.getByRole("button", { name: "Salin untuk proyek ini" }).click();
    await a.page.waitForURL(/\/admin\/questionnaires\//, { timeout: 30000 });
    copyId = a.page.url().split("/").pop();
    await a.page.getByLabel("Salinan khusus proyek").waitFor({ timeout: 30000 }).catch(() => {});
    check("admin: editor salinan khusus proyek dengan catatan client", (await a.page.getByLabel("Salinan khusus proyek").getByText("PRJ-E2E13").count()) >= 1 && (await a.page.getByText("Catatan client:").count()) >= 1);
    await a.page.screenshot({ path: path("editor-salinan"), fullPage: false });
    await a.page.goto(`${BASE}/admin/projects/${temp.id}?tab=jadwal`, { waitUntil: "networkidle" });
    await card.getByRole("button", { name: "Kirim ulang versi 2" }).click();
    await waitText(card.getByTestId("questionnaire-status"), /versi 2/);
    check("admin: versi 2 terkirim", (await card.getByTestId("questionnaire-status").innerText()).includes("versi 2"));

    // 8. Client: versi 2 menampilkan perbaikan sebelumnya dan sisa 1 kali, lalu disetujui.
    await c.page.goto(`${BASE}/app/questionnaire/${temp.id}`, { waitUntil: "networkidle" });
    check("client: versi 2 dengan sisa 1 kali perbaikan", (await c.page.getByTestId("revisions-left").innerText()).includes("Sisa 1 kali"));
    check("client: perbaikan sebelumnya bisa dibuka", (await c.page.getByText("Perbaikan yang Anda minta di versi 1").count()) === 1);
    await c.page.getByRole("button", { name: "Setujui kuesioner" }).click();
    await c.page.getByRole("button", { name: "Ya, setujui" }).click();
    await waitText(c.page.locator("[role=status]"), /Anda menyetujui kuesioner ini/);
    check("client: kuesioner disetujui", (await c.page.getByText(/Anda menyetujui kuesioner ini/).count()) === 1);
    await c.page.screenshot({ path: path("client-disetujui"), fullPage: false });

    await a.page.goto(`${BASE}/admin/projects/${temp.id}?tab=jadwal`, { waitUntil: "networkidle" });
    check("admin: status Disetujui client dan form tawaran terbuka", (await card.getByTestId("questionnaire-status").innerText()).includes("Disetujui client") && (await a.page.getByText("Tugas bisa ditawarkan ke shopper setelah").count()) === 0);
  }

  for (const [who, x] of [["client", c], ["shopper", s], ["admin", a]]) check(`${who}: tanpa error JavaScript`, x.errors.length === 0, x.errors.join(" | "));
} finally {
  if (temp) {
    await retry(() => admin.from("notifications").delete().contains("detail", { project: temp.id }));
    // Salinan dihapus dulu, selagi masih tertaut ke proyek uji (tautannya kosong setelah proyek dihapus).
    if (copyId) await retry(() => admin.from("questionnaires").delete().eq("id", copyId).eq("project_id", temp.id));
    await retry(() => admin.from("projects").delete().eq("id", temp.id));
    console.log("· proyek uji PRJ-E2E13 dan salinan kuesionernya dihapus");
  }
  await browser.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed ? 1 : 0);
