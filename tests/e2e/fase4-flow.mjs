// Uji headless alur Fase 4 dari awal sampai akhir dengan client, proyek, dan dua shopper sementara:
// client mengisi kompetitor → admin menjadwalkan → shopper mengirim kunjungan (lewat API dengan sesi shopper) →
// admin QC: minta revisi → shopper merevisi → admin menyetujui (dengan selisih pembelian) →
// admin menyusun dan menerbitkan laporan → client membaca laporan, mengunduh PDF, dan melihat tagihan tambahan.
// MENULIS DATA ke Supabase, lalu menghapus akun, proyek, dan foto uji di akhir.
// Jalankan hanya dengan izin pemilik project: node --env-file=.env.local tests/e2e/fase4-flow.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = new URL("../../e2e-output/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");

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
  // Koneksi ke Supabase kadang 1–4 detik per permintaan; halaman admin memanggil beberapa sekaligus.
  ctx.setDefaultNavigationTimeout(90000);
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: new URL(`fase4-${name}.png`, OUT).pathname.slice(1), fullPage: true });
const text = async (page) => (await page.textContent("main")) ?? "";

const stamp = Date.now();
const city = "Kota Uji Fase Empat";
const pw = `Uji${stamp}x9`;
const mk = async (email, meta) => must(await retry(() => admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: meta })), `buat ${email}`).user.id;
const emails = { client: `uji-fase4-client-${stamp}@silentcx.test`, a: `uji-fase4-a-${stamp}@silentcx.test`, b: `uji-fase4-b-${stamp}@silentcx.test` };
const clientId = await mk(emails.client, { full_name: "Client Uji Empat", phone: "081200005555" });
const shopperA = await mk(emails.a, { account_type: "shopper", full_name: `Shopper A ${stamp}`, phone: "081200004444" });
const shopperB = await mk(emails.b, { account_type: "shopper", full_name: `Shopper B ${stamp}`, phone: "081200003333" });

// Sesi shopper lewat API (bukan browser) untuk mengisi kunjungan dengan cepat; aturan tetap dijaga database.
async function shopperApi(email) {
  const c = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  must(await c.auth.signInWithPassword({ email, password: pw }), `login ${email}`);
  return c;
}
const put = async (path) => must(await admin.storage.from("audit-evidence").upload(path, PNG, { contentType: "image/png", upsert: true }), `unggah ${path}`);

async function runVisit(api, userId, taskId, purchase) {
  must(await api.rpc("shopper_respond_offer", { p_task: taskId, p_accept: true }), "terima tugas");
  await put(`${userId}/${taskId}/checkin.png`);
  must(await api.rpc("shopper_check_in", { p_task: taskId, p_lat: -6.2, p_lng: 106.8, p_accuracy: 20, p_photo: `${userId}/${taskId}/checkin.png` }), "check-in");
  const detail = must(await api.rpc("shopper_task", { p_task: taskId }), "detail tugas");
  const qs = detail.questionnaire.sections.flatMap((s) => s.questions);
  const answers = Object.fromEntries(qs.map((q) => [q.id, { value: q.kind === "yes_no" ? "yes" : q.kind === "scale" ? 4 : "Pelayanan ramah dan cepat.", na: false }]));
  must(await api.rpc("shopper_save_visit", { p_task: taskId, p_answers: answers, p_purchase: purchase, p_purchase_note: "" }), "simpan jawaban");
  for (const q of qs.filter((x) => x.photo_required)) {
    const path = `${userId}/${taskId}/bukti-${q.id}.png`;
    await put(path);
    must(await api.rpc("shopper_add_photo", { p_task: taskId, p_kind: "evidence", p_question: q.id, p_path: path }), "foto bukti");
  }
  await put(`${userId}/${taskId}/struk.png`);
  must(await api.rpc("shopper_add_photo", { p_task: taskId, p_kind: "receipt", p_question: null, p_path: `${userId}/${taskId}/struk.png` }), "struk");
  must(await api.rpc("shopper_submit_visit", { p_task: taskId }), "submit");
  return { answers, qs };
}

let projectId;
const browser = await chromium.launch();
try {
  for (const id of [shopperA, shopperB]) {
    await admin.from("profiles").update({ status: "active" }).eq("id", id);
    await admin.from("shopper_applications").insert({ shopper_id: id, status: "approved", reachable_cities: [city], decided_at: new Date().toISOString() });
  }
  await admin.from("companies").insert({ client_id: clientId, name: `Kopi Uji ${stamp}`, pic_name: "Rina", pic_phone: "081211112222" });
  projectId = must(
    await admin
      .from("projects")
      .insert({
        code: `PRJ-UJI4-${stamp}`,
        client_id: clientId,
        package_snapshot: { key: "insight", name: "SilentCX Insight", outlets: 1, visits: 1, purchase_allowance: 150000 },
        addons_snapshot: [{ item_key: "competitor_benchmark", label: "Benchmark kompetitor", quantity: 1 }],
        outlet_count: 1,
        entitlements: ["report_basic", "report_detailed", "evidence", "competitor"],
        status: "active",
        activated_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "proyek",
  ).id;
  await admin.from("project_outlets").insert({ project_id: projectId, position: 1, city, name: `Outlet Uji ${stamp}`, address: "Jl. Uji No. 4" });

  // 1. Client mengisi kompetitor dan menandai data lengkap.
  const c = await loginAs(browser, emails.client);
  await c.page.goto(`${BASE}/app/outlets`, { waitUntil: "networkidle" });
  check("form kompetitor menyampaikan bahwa foto kompetitor tidak ditampilkan", (await text(c.page)).includes("Foto kunjungan ke kompetitor tidak ditampilkan"));
  await c.page.fill("#k-name-0", `Kompetitor Uji ${stamp}`);
  await c.page.fill("#k-city-0", city);
  await c.page.fill("#k-addr-0", "Jl. Pesaing No. 9");
  await c.page.getByRole("button", { name: "Simpan kompetitor" }).click();
  await c.page.getByText("Kompetitor tersimpan.").first().waitFor({ timeout: 30000 });
  await c.page.fill("#o-addr-0", "Jl. Uji No. 4");
  await c.page.getByRole("button", { name: "Simpan dan tandai lengkap" }).click();
  await c.page.getByText(/Data lengkap/).first().waitFor({ timeout: 30000 });
  check("client mengisi kompetitor dan menandai data lengkap", true);
  await shot(c.page, "client-competitor");

  // 2. Admin: kuesioner, tugas, tawaran untuk outlet dan kompetitor.
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/projects/${projectId}`, { waitUntil: "networkidle" });
  check("kompetitor ditandai di penjadwalan", (await text(a.page)).includes("Kompetitor"));
  await a.page.selectOption("#pick-q", { label: "Kafe & restoran — dasar" });
  await a.page.getByRole("button", { name: "Tetapkan" }).click();
  await a.page.getByText("Kuesioner ditetapkan.").first().waitFor({ timeout: 30000 });
  for (const [i, shopper] of [shopperA, shopperB].entries()) {
    await a.page.getByRole("button", { name: "+ Tugas kunjungan" }).nth(i).click();
    await a.page.getByRole("button", { name: "Buat tugas" }).click();
    await a.page.getByText("Tugas dibuat.").first().waitFor({ timeout: 30000 });
    await a.page.waitForLoadState("networkidle");
    await a.page.getByLabel("Tawarkan ke").first().selectOption(shopper);
    await a.page.getByRole("button", { name: "Tawarkan" }).first().click();
    await a.page.getByText("Tugas ditawarkan.").first().waitFor({ timeout: 30000 });
    await a.page.goto(`${BASE}/admin/projects/${projectId}`, { waitUntil: "networkidle" });
  }
  const { data: tasks } = await admin.from("audit_tasks").select("id, outlet_id, shopper_id, project_outlets(is_competitor)").eq("project_id", projectId);
  const outletTask = tasks.find((t) => !t.project_outlets.is_competitor);
  const compTask = tasks.find((t) => t.project_outlets.is_competitor);
  check("dua tugas ditawarkan (outlet dan kompetitor)", Boolean(outletTask?.shopper_id && compTask?.shopper_id), `${tasks.length} tugas`);

  // 3. Shopper mengirim kunjungan. Shopper outlet membeli di atas batas (selisih Rp30.000).
  const apiOut = await shopperApi(outletTask.shopper_id === shopperA ? emails.a : emails.b);
  const apiComp = await shopperApi(compTask.shopper_id === shopperA ? emails.a : emails.b);
  const visit = await runVisit(apiOut, outletTask.shopper_id, outletTask.id, 180000);
  await runVisit(apiComp, compTask.shopper_id, compTask.id, 50000);
  check("kedua kunjungan terkirim", true);

  // 4. QC: minta revisi pertanyaan pertama di kunjungan outlet.
  await a.page.goto(`${BASE}/admin/qc`, { waitUntil: "networkidle" });
  check("antrian QC memuat kedua kunjungan", (await a.page.locator("a[href^='/admin/qc/']").count()) >= 2);
  await a.page.goto(`${BASE}/admin/qc/${outletTask.id}`, { waitUntil: "networkidle" });
  check("layar QC menampilkan peta check-in dan jawaban", (await a.page.locator("iframe[title^='Titik check-in']").count()) === 1 && (await text(a.page)).includes("Ya"));
  await shot(a.page, "qc");
  await a.page.getByLabel("Minta revisi").first().check();
  await a.page.getByRole("button", { name: /^Minta revisi/ }).click();
  await a.page.getByLabel(/Catatan untuk shopper/).fill("Sapaan: jelaskan berapa detik sampai disapa.");
  await a.page.getByRole("button", { name: "Kirim permintaan revisi" }).click();
  await a.page.getByText(/Revisi diminta/).first().waitFor({ timeout: 30000 });
  check("admin meminta revisi satu pertanyaan", true);

  const shopperEmail = outletTask.shopper_id === shopperA ? emails.a : emails.b;
  const s = await loginAs(browser, shopperEmail, { width: 390, height: 844 });
  await s.page.goto(`${BASE}/shopper/assignments/${outletTask.id}`, { waitUntil: "networkidle" });
  const sText = await text(s.page);
  check("shopper melihat permintaan revisi dan hanya pertanyaan yang ditandai", sText.includes("Admin meminta revisi") && sText.includes("1 dari 1 pertanyaan"));
  await shot(s.page, "shopper-revision");
  const flagged = visit.qs[0].id;
  must(await apiOut.rpc("shopper_save_visit", { p_task: outletTask.id, p_answers: { ...visit.answers, [flagged]: { value: "yes", na: false, note: "Disapa sekitar 5 detik." } }, p_purchase: 180000, p_purchase_note: "" }), "revisi");
  must(await apiOut.rpc("shopper_submit_visit", { p_task: outletTask.id }), "kirim revisi");
  check("shopper mengirim revisi", true);

  // 5. Admin menyetujui keduanya; selisih pembelian outlet disetujui.
  await a.page.goto(`${BASE}/admin/qc/${outletTask.id}`, { waitUntil: "networkidle" });
  await a.page.getByRole("button", { name: "Setujui", exact: true }).click();
  await a.page.getByLabel(/Setujui kelebihan pembelian/).check();
  await a.page.getByRole("button", { name: "Setujui kunjungan" }).click();
  await a.page.getByText("Kunjungan disetujui.").first().waitFor({ timeout: 30000 });
  await a.page.goto(`${BASE}/admin/qc/${compTask.id}`, { waitUntil: "networkidle" });
  await a.page.getByRole("button", { name: "Setujui", exact: true }).click();
  await a.page.getByRole("button", { name: "Setujui kunjungan" }).click();
  await a.page.getByText("Kunjungan disetujui.").first().waitFor({ timeout: 30000 });
  check("admin menyetujui kedua kunjungan", true);

  // 6. Laporan: draf otomatis, rekomendasi, foto, pratinjau PDF, terbit.
  await a.page.goto(`${BASE}/admin/reports/${projectId}`, { waitUntil: "networkidle" });
  check("draf laporan terisi otomatis dari skor", (await a.page.inputValue("#summary")).includes("Skor CX keseluruhan"));
  await a.page.getByRole("button", { name: "+ Temuan" }).click();
  await a.page.getByLabel("Judul temuan").last().fill("Upselling belum dilakukan");
  await a.page.getByRole("button", { name: "+ Rekomendasi" }).click();
  await a.page.getByLabel("Rekomendasi").last().fill("Tawarkan menu pendamping di setiap transaksi.");
  const photoBoxes = a.page.locator("label:has(img) input[type=checkbox]");
  const captions = (await a.page.locator("label:has(img)").allTextContents()).join(" | ");
  check("foto kompetitor tidak bisa dipilih", captions.length > 0 && !captions.includes("Kompetitor Uji"), `${await photoBoxes.count()} foto`);
  if (await photoBoxes.count()) await photoBoxes.first().check();
  await a.page.getByRole("button", { name: "Simpan draf" }).click();
  await a.page.getByText("Draf tersimpan.").first().waitFor({ timeout: 30000 });
  const preview = await a.page.request.get(`${BASE}/admin/reports/${projectId}/pdf`);
  check("pratinjau PDF admin berupa file PDF", preview.headers()["content-type"] === "application/pdf" && (await preview.body()).length > 10000, `${(await preview.body()).length} byte`);
  await a.page.goto(`${BASE}/admin/reports/${projectId}`, { waitUntil: "networkidle" });
  a.page.once("dialog", (d) => d.accept());
  await a.page.getByRole("button", { name: "Terbitkan ke client" }).click();
  await a.page.getByText(/Laporan terbit/).first().waitFor({ timeout: 45000 });
  check("admin menerbitkan laporan", true);
  await shot(a.page, "report-published");

  // 7. Client membaca laporan, mengunduh PDF, dan melihat tagihan tambahan.
  await c.page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("beranda client: laporan sudah terbit dan notifikasi", (await text(c.page)).includes("Laporan audit sudah terbit"));
  await c.page.goto(`${BASE}/app/reports/${projectId}`, { waitUntil: "networkidle" });
  const rText = await text(c.page);
  check("laporan client memuat benchmark kompetitor tanpa nama shopper", rText.includes("Benchmark kompetitor") && rText.includes(`Kompetitor Uji ${stamp}`) && !rText.includes(`Shopper A ${stamp}`));
  await shot(c.page, "client-report");
  const pdf = await c.page.request.get(`${BASE}/app/reports/${projectId}/pdf`);
  check("client mengunduh PDF laporan", pdf.headers()["content-type"] === "application/pdf" && (await pdf.body()).length > 10000);
  await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
  check("tagihan tambahan Rp30.000 muncul di Tagihan", (await text(c.page)).includes("Tagihan tambahan") && (await text(c.page)).includes("Rp30.000"));
  const { data: extra } = await admin.from("invoices").select("id").eq("project_id", projectId).eq("kind", "excess").single();
  const inv = await c.page.request.get(`${BASE}/app/billing/${extra.id}/pdf`);
  check("client mengunduh PDF invoice", inv.headers()["content-type"] === "application/pdf");
  await shot(c.page, "client-billing");

  const { data: logs } = await admin.from("activity_log").select("action").in("target_id", [outletTask.id, projectId]);
  const acts = new Set((logs ?? []).map((l) => l.action));
  check("QC dan penerbitan tercatat di log", ["task.revision_requested", "task.resubmitted", "task.approved", "report.published"].every((x) => acts.has(x)), [...acts].join(", "));
  await Promise.all([a.ctx.close(), c.ctx.close(), s.ctx.close()]);
} finally {
  await browser.close();
  for (const id of [shopperA, shopperB]) {
    const { data: folders } = await admin.storage.from("audit-evidence").list(id);
    for (const f of folders ?? []) {
      const { data: files } = await admin.storage.from("audit-evidence").list(`${id}/${f.name}`);
      if (files?.length) await admin.storage.from("audit-evidence").remove(files.map((x) => `${id}/${f.name}/${x.name}`));
    }
  }
  for (const [id, email] of [
    [clientId, emails.client],
    [shopperA, emails.a],
    [shopperB, emails.b],
  ]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(error ? `! Akun uji ${email} gagal dihapus: ${error.message}` : `Akun uji ${email} dan datanya dihapus.`);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
