// Uji headless alur Fase 2 dari awal sampai akhir dengan akun pelamar sementara:
// isi lamaran → kuis salah lalu benar + pakta → admin menolak → (30 hari dimajukan) melamar ulang →
// admin menyetujui → notifikasi → isi rekening → muncul di pool shopper per kota.
// MENULIS DATA ke Supabase, lalu menghapus akun uji beserta lamaran, notifikasi, dan rekeningnya di akhir.
// Butuh minimal satu kota dilayani yang aktif. Jalankan hanya dengan izin pemilik project:
//   node --env-file=.env.local tests/e2e/fase2-flow.mjs
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

async function loginAs(browser, email) {
  const { data, error } = await retry(async () => {
    const res = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (res.error && /fetch/i.test(res.error.message)) throw res.error;
    return res;
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}

const shot = (page, name) => page.screenshot({ path: new URL(`fase2-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";
const RIGHT = [1, 0, 2, 1, 0];

async function answerQuiz(page, answers) {
  for (const [i, a] of answers.entries()) await page.locator(`input[name="q${i}"]`).nth(a).check();
  const pact = page.getByLabel("Saya sudah membaca dan menyetujui pakta kerahasiaan ini.");
  if (!(await pact.isChecked())) await pact.check();
  await page.getByRole("button", { name: "Kirim lamaran" }).click();
}

const { data: cities } = await admin.from("service_cities").select("name").eq("active", true).order("name").limit(1);
const city = cities?.[0]?.name;
if (!city) {
  console.log("✗ Belum ada kota dilayani yang aktif. Tambahkan di Katalog → Kota dilayani, lalu jalankan lagi.");
  process.exit(1);
}

const email = `uji-fase2-${Date.now()}@silentcx.test`;
const { data: created, error: createError } = await retry(() =>
  admin.auth.admin.createUser({
    email,
    password: `Uji${Date.now()}x9`,
    email_confirm: true,
    user_metadata: { account_type: "shopper", full_name: "Uji Fase Dua", phone: "081200008888" },
  }),
);
if (createError) throw new Error(`Gagal membuat akun uji: ${createError.message}`);
const shopperId = created.user.id;

const browser = await chromium.launch();
try {
  // 1. Pelamar baru mengisi lamaran.
  const s = await loginAs(browser, email);
  check("pelamar baru melihat Lengkapi lamaran", (await text(s.page)).includes("Lengkapi lamaran Anda"));
  await s.page.goto(`${BASE}/shopper/profile`, { waitUntil: "networkidle" });
  check("formulir tidak meminta KTP atau selfie", !/KTP\b.*wajib|unggah selfie/i.test(await text(s.page)));
  await s.page.fill("#birth_date", "1995-04-12");
  await s.page.selectOption("#gender", "female");
  await s.page.fill("#domicile", "Jakarta Selatan");
  await s.page.selectOption("#vehicle", "motorcycle");
  await s.page.getByLabel(city, { exact: true }).check();
  await s.page.fill("#occupation", "Karyawan swasta");
  await s.page.selectOption("#experience", "under_1y");
  await s.page.getByLabel("Kafe & restoran").check();
  await s.page.getByRole("button", { name: "Simpan draft" }).click();
  await s.page.getByText("Draft tersimpan.").waitFor({ timeout: 30000 });
  check("draft tersimpan", true);
  await shot(s.page, "form");
  await s.page.getByRole("button", { name: /Lanjut ke kuis/ }).click();
  await s.page.getByText("Kuis etika dan kerahasiaan").waitFor({ timeout: 30000 });

  // 2. Kuis: salah dulu, lalu benar.
  await answerQuiz(s.page, [0, 0, 0, 0, 0]);
  await s.page.getByText(/dari 5 jawaban benar/).waitFor({ timeout: 30000 });
  check("kuis yang belum benar semua ditolak dengan jumlah benar", true);
  await shot(s.page, "quiz-failed");
  await answerQuiz(s.page, RIGHT);
  await s.page.getByText(/Keputusan tim SilentCX akan muncul/).waitFor({ timeout: 30000 });
  check("lamaran terkirim dan sedang ditinjau", true);
  await s.page.goto(`${BASE}/shopper`, { waitUntil: "networkidle" });
  check("beranda pelamar: sedang ditinjau", (await text(s.page)).includes("sedang ditinjau"));

  // 3. Admin menolak dengan alasan.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/accounts?tab=pending&kota=${encodeURIComponent(city)}`, { waitUntil: "networkidle" });
  const card = a.page.locator("li", { hasText: email });
  check("lamaran muncul di antrian dengan filter kota", (await card.count()) > 0);
  await shot(a.page, "admin-queue");
  await card.getByRole("button", { name: "Tolak" }).click();
  await card.locator("textarea").fill("Uji penolakan otomatis.");
  await card.getByRole("button", { name: "Tolak" }).click();
  await a.page.locator("li", { hasText: email }).waitFor({ state: "detached", timeout: 30000 });
  check("admin menolak lamaran dengan alasan", true);

  await s.page.goto(`${BASE}/shopper`, { waitUntil: "networkidle" });
  const rejectedText = await text(s.page);
  check("pelamar melihat alasan dan tanggal boleh melamar lagi", rejectedText.includes("Uji penolakan otomatis.") && rejectedText.includes("melamar lagi mulai"));
  check("notifikasi penolakan tampil", rejectedText.includes("Notifikasi") && rejectedText.includes("belum disetujui"));
  await shot(s.page, "rejected");

  // 4. Majukan 30 hari, lalu melamar ulang dengan isian yang tersalin.
  await admin.from("shopper_applications").update({ decided_at: new Date(Date.now() - 31 * 86400000).toISOString() }).eq("shopper_id", shopperId);
  await s.page.goto(`${BASE}/shopper/profile`, { waitUntil: "networkidle" });
  check("setelah 30 hari bisa melamar lagi, isian tersalin", (await text(s.page)).includes("sudah bisa melamar lagi") && (await s.page.inputValue("#domicile")) === "Jakarta Selatan");
  await s.page.getByRole("button", { name: /Lanjut ke kuis/ }).click();
  await s.page.getByText("Kuis etika dan kerahasiaan").waitFor({ timeout: 30000 });
  await answerQuiz(s.page, RIGHT);
  await s.page.getByText(/Keputusan tim SilentCX akan muncul/).waitFor({ timeout: 30000 });
  check("lamaran ulang terkirim", true);

  // 5. Admin menyetujui.
  await a.page.goto(`${BASE}/admin/accounts?tab=pending`, { waitUntil: "networkidle" });
  await a.page.locator("li", { hasText: email }).getByRole("button", { name: "Setujui" }).click();
  await a.page.locator("li", { hasText: email }).waitFor({ state: "detached", timeout: 30000 });
  check("admin menyetujui lamaran", true);

  await s.page.goto(`${BASE}/shopper`, { waitUntil: "networkidle" });
  const activeText = await text(s.page);
  check("shopper aktif dengan notifikasi disetujui", activeText.includes("Akun Anda aktif") && activeText.includes("Lamaran Anda disetujui"));
  check("beranda meminta rekening", activeText.includes("Isi rekening"));
  await s.page.getByRole("button", { name: "Tandai sudah dibaca" }).click();
  await s.page.getByRole("button", { name: "Tandai sudah dibaca" }).waitFor({ state: "detached", timeout: 30000 });
  check("notifikasi ditandai dibaca", true);
  await s.page.goto(`${BASE}/shopper/assignments`, { waitUntil: "networkidle" });
  check("menu Tugas terbuka setelah disetujui", !(await text(s.page)).includes("terbuka setelah lamaran disetujui"));

  // 6. Rekening.
  await s.page.goto(`${BASE}/shopper/profile`, { waitUntil: "networkidle" });
  await s.page.fill("#bank", "BCA");
  await s.page.fill("#number", "1234567890");
  await s.page.fill("#holder", "Uji Fase Dua");
  await s.page.getByRole("button", { name: "Simpan rekening" }).click();
  await s.page.getByText("Rekening tersimpan.").waitFor({ timeout: 30000 });
  check("rekening tersimpan", true);
  await shot(s.page, "profile-active");

  // 7. Pool shopper per kota.
  await a.page.goto(`${BASE}/admin/accounts?tab=shopper&kota=${encodeURIComponent(city)}`, { waitUntil: "networkidle" });
  check("shopper muncul di pool kota", (await text(a.page)).includes(email));
  await shot(a.page, "admin-pool");
  const { data: logs } = await admin.from("activity_log").select("action").in("action", ["application.submitted", "application.rejected", "application.reapplied", "application.approved", "shopper.bank_updated"]).or(`target_id.eq.${shopperId},detail->>shopper.eq.${shopperId}`);
  check("setiap keputusan tercatat di log aktivitas", new Set((logs ?? []).map((l) => l.action)).size === 5, (logs ?? []).map((l) => l.action).join(", "));

  await s.ctx.close();
  await a.ctx.close();
} finally {
  await browser.close();
  // Bersihkan akun uji; lamaran, notifikasi, dan rekening ikut terhapus.
  const { error } = await admin.auth.admin.deleteUser(shopperId);
  console.log(error ? `! Akun uji ${email} gagal dihapus: ${error.message}` : "Akun uji dan datanya dihapus.");
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
