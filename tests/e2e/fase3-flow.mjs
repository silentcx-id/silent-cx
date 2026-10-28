// Uji headless alur Fase 3 dari awal sampai akhir dengan client, proyek, dan shopper sementara:
// admin menetapkan kuesioner → membuat tugas → menawarkan (Segera) → follow up WhatsApp →
// shopper menerima → check-in (lokasi + foto) → mengisi kuesioner, foto wajib, dan struk → submit →
// admin mencocokkan lokasi → client melihat progres tanpa identitas shopper.
// MENULIS DATA ke Supabase, lalu menghapus akun, proyek, dan foto uji di akhir.
// Butuh template "Kafe & restoran — dasar" dari migrasi Fase 3. Jalankan hanya dengan izin pemilik project:
//   node --env-file=.env.local tests/e2e/fase3-flow.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

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

async function loginAs(browser, email, options = {}) {
  const { data, error } = await retry(async () => {
    const res = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (res.error && /fetch/i.test(res.error.message)) throw res.error;
    return res;
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}

const shot = (page, name) => page.screenshot({ path: new URL(`fase3-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";
const photo = new URL("fase3-foto.png", OUT).pathname.slice(1);
writeFileSync(photo, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));

const stamp = Date.now();
const city = "Kota Uji Fase Tiga";
const outletName = `Outlet Rahasia ${stamp}`;
const shopperName = `Shopper Uji ${stamp}`;
const mk = async (email, meta) => {
  const { data, error } = await retry(() => admin.auth.admin.createUser({ email, password: `Uji${stamp}x9`, email_confirm: true, user_metadata: meta }));
  if (error) throw new Error(`Gagal membuat ${email}: ${error.message}`);
  return data.user.id;
};
const clientEmail = `uji-fase3-client-${stamp}@silentcx.test`;
const shopperEmail = `uji-fase3-shopper-${stamp}@silentcx.test`;
const clientId = await mk(clientEmail, { full_name: "Client Uji Tiga", phone: "081200007777" });
const shopperId = await mk(shopperEmail, { account_type: "shopper", full_name: shopperName, phone: "081200006666" });

let projectId;
const browser = await chromium.launch();
try {
  // Data awal: shopper aktif yang menjangkau kota uji, dan proyek aktif dengan data outlet lengkap.
  await admin.from("profiles").update({ status: "active" }).eq("id", shopperId);
  await admin.from("shopper_applications").insert({ shopper_id: shopperId, status: "approved", reachable_cities: [city], decided_at: new Date().toISOString() });
  const { data: proj, error: projErr } = await admin
    .from("projects")
    .insert({
      code: `PRJ-UJI-${stamp}`,
      client_id: clientId,
      package_snapshot: { key: "essential", name: "SilentCX Essential", outlets: 1, visits: 1, purchase_allowance: 150000 },
      outlet_count: 1,
      status: "active",
      activated_at: new Date().toISOString(),
      details_completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (projErr) throw new Error(`Gagal membuat proyek uji: ${projErr.message}`);
  projectId = proj.id;
  await admin.from("project_outlets").insert({ project_id: projectId, position: 1, city, name: outletName, address: "Jl. Uji Coba No. 3" });

  // 1. Admin: kuesioner, tugas, tawaran.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/projects/${projectId}`, { waitUntil: "networkidle" });
  check("bagian Penjadwalan kunjungan tampil", (await text(a.page)).includes("Penjadwalan kunjungan"));
  await a.page.selectOption("#pick-q", { label: "Kafe & restoran — dasar" });
  await a.page.getByRole("button", { name: "Tetapkan" }).click();
  await a.page.getByText("Kuesioner ditetapkan.").waitFor({ timeout: 30000 });
  check("admin menetapkan kuesioner", true);
  await a.page.getByRole("button", { name: "+ Tugas kunjungan" }).click();
  await a.page.getByRole("button", { name: "Buat tugas" }).click();
  await a.page.getByText("Tugas dibuat.").waitFor({ timeout: 30000 });
  check("admin membuat tugas dengan fee bawaan", await a.page.getByText(/^Fee Rp150.000/).first().waitFor({ timeout: 30000 }).then(() => true, () => false));
  await a.page.getByLabel("Tawarkan ke").selectOption(shopperId);
  await a.page.getByLabel("Segera").check();
  await a.page.getByRole("button", { name: "Tawarkan" }).click();
  await a.page.getByText("Tugas ditawarkan.").waitFor({ timeout: 30000 });
  check("tugas ditawarkan dengan tanda Segera", (await text(a.page)).includes("Segera"));
  await shot(a.page, "admin-offered");

  // 2. Follow up WhatsApp: pesan tanpa nama outlet atau client.
  const [popup] = await Promise.all([a.page.waitForEvent("popup"), a.page.getByRole("button", { name: "Follow up via WhatsApp" }).click()]);
  await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 30000 }).catch(() => {});
  const waUrl = decodeURIComponent(popup.url());
  check("follow up membuka WhatsApp ke nomor shopper", /wa\.me\/6281200006666|phone=6281200006666/.test(waUrl), waUrl.slice(0, 80));
  check("pesan follow up tidak memuat nama outlet", !waUrl.includes(outletName));
  await popup.close();

  // 3. Shopper: terima, check-in, isi, submit.
  const s = await loginAs(browser, shopperEmail, { geolocation: { latitude: -6.2001, longitude: 106.8166, accuracy: 20 }, permissions: ["geolocation"], viewport: { width: 390, height: 844 } });
  check("beranda shopper menampilkan tawaran", (await text(s.page)).includes(outletName));
  const taskId = (await admin.from("audit_tasks").select("id").eq("project_id", projectId).single()).data.id;
  await s.page.goto(`${BASE}/shopper/assignments/${taskId}`, { waitUntil: "networkidle" });
  check("brief menampilkan aturan kelebihan pembelian", (await text(s.page)).includes("selisihnya ditanggung sendiri"));
  await shot(s.page, "offer");
  await s.page.getByRole("button", { name: "Terima tugas" }).click();
  await s.page.getByText("Check-in di outlet").waitFor({ timeout: 30000 });
  check("shopper menerima tugas", true);
  await s.page.getByRole("button", { name: /Ambil lokasi saya/ }).click();
  await s.page.getByText(/Lokasi terbaca/).waitFor({ timeout: 30000 });
  await s.page.setInputFiles("#checkin-photo", photo);
  await s.page.getByRole("button", { name: /Check-in$/ }).click();
  await s.page.getByText(/pertanyaan terjawab/).waitFor({ timeout: 45000 });
  check("check-in dengan lokasi dan foto berhasil", true);

  for (const b of await s.page.getByRole("button", { name: "Ya", exact: true }).all()) await b.click();
  for (const b of await s.page.getByRole("button", { name: "5", exact: true }).all()) await b.click();
  for (const area of await s.page.getByLabel("Jawaban").all()) await area.fill("Pelayanan cepat dan ramah.");
  for (let i = 0; i < 5; i++) {
    const add = s.page.getByRole("button", { name: /Ambil foto/ });
    if ((await add.count()) === 0) break;
    await add.first().locator("xpath=preceding-sibling::input[1]").setInputFiles(photo);
    await s.page.waitForFunction((n) => document.querySelectorAll("button").length && [...document.querySelectorAll("button")].filter((x) => x.textContent?.includes("Ambil foto")).length < n, await add.count(), { timeout: 45000 });
  }
  check("foto untuk pertanyaan wajib foto terunggah", (await s.page.getByRole("button", { name: /Ambil foto/ }).count()) === 0);
  await s.page.fill("#purchase", "60000");
  await s.page.getByRole("button", { name: /Foto struk/ }).locator("xpath=preceding-sibling::input[1]").setInputFiles(photo);
  await s.page.getByRole("img", { name: "Struk 1" }).waitFor({ timeout: 45000 });
  await s.page.getByText(/Tersimpan otomatis/).waitFor({ timeout: 30000 });
  check("struk terunggah dan isian tersimpan otomatis", true);
  await shot(s.page, "audit-form");
  s.page.once("dialog", (d) => d.accept());
  await s.page.getByRole("button", { name: "Kirim hasil kunjungan" }).click();
  await s.page.getByText(/menunggu QC/).first().waitFor({ timeout: 45000 });
  check("hasil kunjungan terkirim dan terkunci", true);

  // 4. Admin mencocokkan lokasi.
  await a.page.goto(`${BASE}/admin/projects/${projectId}`, { waitUntil: "networkidle" });
  const adminText = await text(a.page);
  check("admin melihat skor dan peta check-in", adminText.includes("skor sementara") && (await a.page.locator("iframe[title^='Titik check-in']").count()) === 1);
  await a.page.getByRole("button", { name: "Sesuai", exact: true }).click();
  await a.page.getByText("Ditandai sesuai.").waitFor({ timeout: 30000 });
  check("admin menandai lokasi sesuai", true);
  await shot(a.page, "admin-submitted");

  // 5. Client melihat progres tanpa identitas shopper.
  const c = await loginAs(browser, clientEmail);
  await c.page.goto(`${BASE}/app/audits`, { waitUntil: "networkidle" });
  const clientText = await text(c.page);
  check("client melihat kunjungan menunggu QC", clientText.includes("menunggu QC"));
  check("client tidak melihat nama shopper", !clientText.includes(shopperName));
  await shot(c.page, "client-audits");

  const { data: logs } = await admin.from("activity_log").select("action").eq("target_id", taskId);
  const actions = new Set((logs ?? []).map((l) => l.action));
  check(
    "setiap langkah tercatat di log aktivitas",
    ["task.created", "task.offered", "task.followed_up", "task.accepted", "task.checked_in", "task.submitted", "task.location_checked"].every((x) => actions.has(x)),
    [...actions].join(", "),
  );
  await Promise.all([a.ctx.close(), s.ctx.close(), c.ctx.close()]);
} finally {
  await browser.close();
  // Bersihkan: foto kunjungan, lalu akun client (proyek, tugas, dan foto ikut terhapus) dan shopper.
  const { data: folders } = await admin.storage.from("audit-evidence").list(shopperId);
  for (const f of folders ?? []) {
    const { data: files } = await admin.storage.from("audit-evidence").list(`${shopperId}/${f.name}`);
    if (files?.length) await admin.storage.from("audit-evidence").remove(files.map((x) => `${shopperId}/${f.name}/${x.name}`));
  }
  for (const [id, email] of [
    [clientId, clientEmail],
    [shopperId, shopperEmail],
  ]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(error ? `! Akun uji ${email} gagal dihapus: ${error.message}` : `Akun uji ${email} dan datanya dihapus.`);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
