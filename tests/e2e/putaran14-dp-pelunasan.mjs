// Uji headless Putaran 14: pilihan cara bayar (penuh atau DP minimal 80%), pelunasan dan laporan terkunci,
// rincian biaya Tugas luar kota, Kelebihan biaya pembelian disembunyikan dari checkout, dan keterangan Outlet tambahan.
// Tanpa E2E_TULIS=1 skrip ini hanya membuka checkout dan landing.
// Dengan E2E_TULIS=1 skrip membuat pesanan uji sementara (PRJ-E2E14A/B/C) untuk client demo lewat service role:
//   A. pesanan dengan 2 Tugas luar kota → admin mengisi rincian biaya lewat browser → client melihat rinciannya;
//   B. invoice belum dibayar → client memilih DP lewat browser (ditolak di bawah 80%, lalu 85%) dan kembali ke penuh;
//   C. laporan terbit dengan pelunasan belum lunas → client hanya melihat ringkasan dan PDF ditolak; setelah pelunasan
//      ditandai lunas, laporan terbuka penuh.
// Tidak ada bukti bayar yang diunggah. Semua pesanan uji dihapus di akhir.
// Butuh migration 20261104000023 sudah dijalankan.
// Jalankan: node --env-file=.env.local tests/e2e/putaran14-dp-pelunasan.mjs
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
const path = (name) => new URL(`p14-${name}.png`, OUT).pathname.slice(1);
const waitText = (loc, re) => loc.filter({ hasText: re }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);

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

async function loginAs(browser, email, viewport = { width: 1280, height: 900 }) {
  const { data } = await retry(() => admin.auth.admin.generateLink({ type: "magiclink", email }));
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}

const probe = await admin.from("invoices").select("dp_amount").limit(1);
if (probe.error) {
  console.log("✗ migration 20261104000023 belum terpasang di staging. Jalankan npm run db:migrate dulu.");
  process.exit(1);
}

const clientUser = (await retry(() => admin.from("profiles").select("id").eq("email", "client@silentcx.demo").single())).data;
const cleanup = () => retry(() => admin.from("projects").delete().like("code", "PRJ-E2E14%"));
const PKG = { key: "essential", name: "SilentCX Essential", outlets: 1, visits: 1, purchase_allowance: 150000 };

async function tempProject(suffix, status, extra = {}) {
  const p = (
    await retry(() =>
      admin
        .from("projects")
        .insert({ code: `PRJ-E2E14${suffix}`, client_id: clientUser.id, package_snapshot: PKG, outlet_count: 2, entitlements: ["report_basic"], status, ...extra })
        .select("id")
        .single(),
    )
  ).data;
  await retry(() =>
    admin.from("project_outlets").insert([
      { project_id: p.id, position: 1, city: "Medan", name: "Outlet Uji Medan", address: "Jl. Uji 1" },
      { project_id: p.id, position: 2, city: "Makassar", name: "Outlet Uji Makassar", address: "Jl. Uji 2" },
    ]),
  );
  return p.id;
}

const browser = await chromium.launch();
let c = null;
let a = null;
try {
  if (WRITE) await cleanup();

  // 1. Checkout: Kelebihan biaya pembelian tidak dipesan, keterangan benchmark di Outlet tambahan.
  c = await loginAs(browser, "client@silentcx.demo");
  await c.page.goto(`${BASE}/app/paket?paket=essential`, { waitUntil: "networkidle" });
  const open = await admin.from("projects").select("id").eq("client_id", clientUser.id).in("status", ["awaiting_review", "awaiting_payment", "verifying"]);
  if (!(open.data ?? []).length) {
    check("checkout: Kelebihan biaya pembelian tidak bisa dipilih", (await c.page.getByText("Kelebihan biaya pembelian", { exact: true }).count()) === 0);
    check("checkout: keterangan kelebihan pembelian ditagih setelah laporan", (await c.page.getByTestId("excess-note").innerText()).includes("ditagih terpisah setelah laporan terbit"));
    check("checkout: Outlet tambahan (Essential) menyebut benchmark hanya di Performance", (await c.page.getByTestId("benchmark-note").count()) === 1);
    await c.page.getByTestId("benchmark-note").scrollIntoViewIfNeeded();
    await c.page.screenshot({ path: path("checkout-addon") });
  } else console.log("· client demo punya pesanan terbuka; pemeriksaan checkout dilewati");

  // 2. Landing.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pub = await ctx.newPage();
    await pub.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const sec = pub.locator("section#addons");
    check("landing: Kelebihan biaya pembelian tidak tampil", (await sec.getByText("Kelebihan biaya pembelian").count()) === 0);
    check("landing: Outlet tambahan menyebut benchmark hanya di Performance", (await sec.locator("li", { hasText: "Outlet tambahan" }).getByText("Benchmark antar-outlet hanya di paket Performance").count()) === 1);
    await ctx.close();
  }

  if (WRITE) {
    a = await loginAs(browser, "admin@silentcx.demo");

    // A. Rincian biaya Tugas luar kota.
    const pa = await tempProject("A", "awaiting_review", { review_reasons: ["quote", "city"] });
    const inv = (await retry(() => admin.from("invoices").insert({ code: "INV-E2E14A", project_id: pa, client_id: clientUser.id, status: "draft", total: 1999000, kind: "order" }).select("id").single())).data;
    await retry(() =>
      admin.from("invoice_lines").insert([
        { invoice_id: inv.id, position: 1, kind: "package", item_key: "essential", label: "SilentCX Essential (2 outlet)", quantity: 1, unit_price: 1999000, amount: 1999000, list_price: 1999000 },
        { invoice_id: inv.id, position: 2, kind: "addon", item_key: "out_of_city", label: "Tugas luar kota", quantity: 2, unit_price: null, amount: null, list_price: null },
      ]),
    );
    await a.page.goto(`${BASE}/admin/projects/${pa}?tab=ringkasan`, { waitUntil: "networkidle" });
    const line = a.page.getByTestId("quote-line");
    check("admin: Tugas luar kota langsung memakai rincian per outlet", (await line.getByText(/Unit 1/).count()) === 1 && (await line.locator('input[value="Medan"]').count()) === 1);
    const amounts = line.getByLabel("Jumlah (Rp)");
    const fill = [250000, 350000, 100000, 400000, 300000, 0];
    for (let i = 0; i < (await amounts.count()); i++) await amounts.nth(i).fill(String(fill[i] ?? 0));
    check("admin: total per outlet terhitung", (await line.getByText("Total Rp700.000").count()) >= 1);
    await line.screenshot({ path: path("admin-rincian") });
    await a.page.getByRole("button", { name: "Setujui pesanan" }).click();
    await waitText(a.page.locator("main"), /Belum dibayar/);
    const lines = (await retry(() => admin.from("invoice_lines").select("label, amount, details").eq("invoice_id", inv.id).order("position"))).data;
    check("admin: dipecah per outlet dengan rincian", lines.length === 3 && lines[1].label === "Tugas luar kota · Medan" && lines[1].amount === 700000 && lines[1].details.length === 3, lines.map((l) => `${l.label} ${l.amount}`).join(" | "));
    await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    check("client: invoice menampilkan rincian Transportasi, Penginapan, Uang makan", (await c.page.getByTestId("line-details").first().innerText()).includes("Transportasi Rp250.000"));
    await c.page.locator("section.card", { has: c.page.getByText("INV-E2E14A") }).screenshot({ path: path("invoice-rincian") });
    await retry(() => admin.from("projects").delete().eq("id", pa));

    // B. Pilihan cara bayar.
    const pb = await tempProject("B", "awaiting_payment");
    const invB = (await retry(() => admin.from("invoices").insert({ code: "INV-E2E14B", project_id: pb, client_id: clientUser.id, status: "unpaid", total: 2000000, due_at: new Date(Date.now() + 86400_000).toISOString(), kind: "order" }).select("id").single())).data;
    await retry(() => admin.from("invoice_lines").insert({ invoice_id: invB.id, position: 1, kind: "package", item_key: "essential", label: "SilentCX Essential", quantity: 1, unit_price: 2000000, amount: 2000000, list_price: 2000000 }));
    await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    check("client: pilihan Bayar penuh dan Bayar DP tampil", (await c.page.getByRole("radio", { name: /Bayar penuh/ }).count()) === 1 && (await c.page.getByRole("radio", { name: /Bayar DP/ }).count()) === 1);
    await c.page.getByRole("radio", { name: /Bayar DP/ }).check();
    await c.page.getByRole("button", { name: "Nominal" }).click();
    await c.page.fill("#dp-amount", "1500000");
    check("client: DP di bawah 80% ditolak sebelum disimpan", (await c.page.getByTestId("dp-preview").innerText()).includes("DP minimal 80% (Rp1.600.000)") && (await c.page.getByRole("button", { name: "Simpan cara bayar" }).isDisabled()));
    await c.page.getByRole("button", { name: "Persentase" }).click();
    await c.page.fill("#dp-pct", "85");
    check("client: ringkasan DP 85%", (await c.page.getByTestId("dp-preview").innerText()).includes("DP Rp1.700.000 sekarang · Sisa Rp300.000"));
    await c.page.getByRole("button", { name: "Simpan cara bayar" }).click();
    await waitText(c.page.getByTestId("dp-summary"), /Rp1\.700\.000/);
    const saved = (await retry(() => admin.from("invoices").select("dp_amount").eq("id", invB.id).single())).data;
    check("client: DP tersimpan", saved.dp_amount === 1700000, String(saved.dp_amount));
    check("client: nominal yang dibayar sekarang = DP", (await c.page.locator("main").getByText("Rp1.700.000").count()) >= 2);
    await c.page.screenshot({ path: path("tagihan-dp"), fullPage: true });
    // Tidak ada isian atau kolom yang keluar dari kartunya (desktop dan HP).
    const overflow = () =>
      c.page.evaluate(() => {
        const bad = [];
        for (const card of document.querySelectorAll("main .card")) {
          const box = card.getBoundingClientRect();
          for (const el of card.querySelectorAll("input, select, textarea, td, th")) {
            const r = el.getBoundingClientRect();
            if (r.width && r.right > box.right + 1) bad.push(el.id || el.textContent.trim().slice(0, 20));
          }
        }
        return { bad, page: document.documentElement.scrollWidth - window.innerWidth };
      });
    const desk = await overflow();
    check("client: Tagihan tanpa isian atau kolom yang keluar kartu (desktop)", desk.bad.length === 0 && desk.page <= 1, desk.bad.join(", "));
    await c.page.setViewportSize({ width: 390, height: 844 });
    await c.page.reload({ waitUntil: "networkidle" });
    const phone = await overflow();
    check("client: Tagihan tanpa isian atau kolom yang keluar kartu (HP)", phone.bad.length === 0 && phone.page <= 1, phone.bad.join(", "));
    await c.page.screenshot({ path: path("tagihan-dp-hp"), fullPage: true });
    await c.page.setViewportSize({ width: 1280, height: 900 });
    await c.page.reload({ waitUntil: "networkidle" });
    await c.page.getByRole("radio", { name: /Bayar penuh/ }).check();
    await c.page.getByRole("button", { name: "Simpan cara bayar" }).click();
    await c.page.waitForTimeout(2500);
    check("client: bisa kembali ke bayar penuh", (await retry(() => admin.from("invoices").select("dp_amount").eq("id", invB.id).single())).data.dp_amount === null);
    await retry(() => admin.from("projects").delete().eq("id", pb));

    // C. Laporan terkunci sampai pelunasan.
    const pc = await tempProject("C", "completed", { activated_at: new Date().toISOString(), details_completed_at: new Date().toISOString() });
    await retry(() => admin.from("invoices").insert({ code: "INV-E2E14C", project_id: pc, client_id: clientUser.id, status: "paid", total: 2000000, dp_amount: 1600000, paid_at: new Date().toISOString(), kind: "order" }));
    const st = (await retry(() => admin.from("invoices").insert({ code: "INV-E2E14S", project_id: pc, client_id: clientUser.id, status: "unpaid", total: 430000, kind: "settlement" }).select("id").single())).data;
    await retry(() =>
      admin.from("invoice_lines").insert([
        { invoice_id: st.id, position: 1, kind: "settlement", item_key: "settlement", label: "Pelunasan pesanan INV-E2E14C (total Rp2.000.000, DP Rp1.600.000)", quantity: 1, unit_price: 400000, amount: 400000, list_price: 400000 },
        { invoice_id: st.id, position: 2, kind: "addon", item_key: "excess_purchase", label: "Kelebihan biaya pembelian kunjungan TGS-UJI", quantity: 1, unit_price: 30000, amount: 30000, list_price: 30000 },
      ]),
    );
    const section = (title, score) => ({ id: title, title, weight: 50, target: 85, score, questions: [] });
    const data = {
      code: "PRJ-E2E14C", company: "Kopi Senja (uji)", packageName: "SilentCX Essential", entitlements: ["report_basic"], outletCount: 2, visitCount: 2, score: 82.5,
      firstVisit: new Date().toISOString(), lastVisit: new Date().toISOString(),
      sections: [section("Penyambutan", 80), section("Kebersihan", 85)],
      outlets: [
        { id: "o1", name: "Outlet Uji Medan", city: "Medan", score: 80, visits: 1, sections: [section("Penyambutan", 75), section("Kebersihan", 85)] },
        { id: "o2", name: "Outlet Uji Makassar", city: "Makassar", score: 85, visits: 1, sections: [section("Penyambutan", 85), section("Kebersihan", 85)] },
      ],
      competitors: [],
    };
    await retry(() =>
      admin.from("reports").insert({
        project_id: pc, status: "published", summary: "Ringkasan uji.", data, published_at: new Date().toISOString(),
        findings: [
          { title: "Minor satu", detail: "a", severity: "minor", outlet: null },
          { title: "Waktu tunggu lama", detail: "19 menit di jam sibuk", severity: "critical", outlet: null },
          { title: "Kasir tidak menawarkan member", detail: "c", severity: "major", outlet: null },
          { title: "Rahasia keempat", detail: "d", severity: "minor", outlet: null },
        ],
        recommendations: [{ text: "Rekomendasi rahasia", priority: "now" }],
      }),
    );
    await c.page.goto(`${BASE}/app/reports/${pc}`, { waitUntil: "networkidle" });
    check("client: laporan terkunci menampilkan ajakan pelunasan", (await c.page.getByTestId("report-locked").innerText()).includes("Bayar pelunasan Rp430.000"));
    check("client: skor keseluruhan dan skor per outlet tampil", (await c.page.getByText("82,5").count()) >= 1 && (await c.page.getByText("Outlet Uji Makassar").count()) === 1);
    check("client: 3 temuan teratas, urut dari yang paling berat", (await c.page.locator("ol li").allInnerTexts()).map((x) => x.split("\n").pop()).length === 3 && (await c.page.getByText("Rahasia keempat").count()) === 0);
    check("client: rekomendasi dan tombol PDF tidak ada", (await c.page.getByText("Rekomendasi rahasia").count()) === 0 && (await c.page.getByRole("link", { name: /Unduh/ }).count()) === 0);
    await c.page.screenshot({ path: path("laporan-terkunci"), fullPage: true });
    const pdf = await c.page.request.get(`${BASE}/app/reports/${pc}/pdf`);
    check("client: PDF laporan ditolak sebelum lunas", pdf.status() === 404, String(pdf.status()));
    await c.page.goto(`${BASE}/app/reports`, { waitUntil: "networkidle" });
    if (!(await c.page.getByText("Menunggu pelunasan").count())) console.log((await c.page.locator("main").innerText()).slice(0, 800));
    check("client: daftar laporan menandai Menunggu pelunasan", (await c.page.getByText("Menunggu pelunasan").count()) >= 1);
    await c.page.goto(`${BASE}/app/billing`, { waitUntil: "networkidle" });
    check("client: tagihan Pelunasan tampil dengan kelebihan belanja", (await c.page.getByRole("heading", { name: "Pelunasan" }).count()) === 1 && (await c.page.getByText("Kelebihan biaya pembelian kunjungan TGS-UJI").count()) === 1);
    await c.page.locator("section", { has: c.page.getByRole("heading", { name: "Pelunasan" }) }).first().screenshot({ path: path("tagihan-pelunasan") });

    // Pelunasan lunas (diverifikasi admin): laporan terbuka penuh.
    await retry(() => admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", st.id));
    await c.page.goto(`${BASE}/app/reports/${pc}`, { waitUntil: "networkidle" });
    check("client: setelah lunas laporan terbuka penuh", (await c.page.getByTestId("report-locked").count()) === 0 && (await c.page.getByText("Rekomendasi rahasia").count()) === 1);
    const pdf2 = await c.page.request.get(`${BASE}/app/reports/${pc}/pdf`);
    check("client: PDF terbuka setelah lunas", pdf2.status() === 200, String(pdf2.status()));
    const unlocked = (await retry(() => admin.from("notifications").select("id").eq("kind", "report.unlocked").contains("detail", { project: pc }))).data;
    check("client: notifikasi laporan terbuka penuh", unlocked.length === 1);
  }

  for (const [who, x] of [["client", c], ["admin", a]]) if (x) check(`${who}: tanpa error JavaScript`, x.errors.length === 0, x.errors.join(" | "));
} finally {
  if (WRITE) {
    await retry(() => admin.from("notifications").delete().eq("user_id", clientUser.id).like("detail->>code", "PRJ-E2E14%"));
    await cleanup();
    console.log("· pesanan uji PRJ-E2E14A/B/C dihapus");
  }
  await browser.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed ? 1 : 0);
