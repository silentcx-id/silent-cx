// Uji headless CMS halaman publik: admin mengubah judul hero dan menyembunyikan FAQ, menyimpan draf →
// pengunjung belum melihatnya, pratinjau sudah → admin menerbitkan → pengunjung melihat versi baru.
// MENULIS DATA ke Supabase: isi konten yang tampil di landing page berubah sebentar selama uji, lalu
// dikembalikan persis seperti sebelumnya (atau dihapus kalau sebelumnya belum pernah ada).
// Jalankan hanya dengan izin pemilik project: node --env-file=.env.local tests/e2e/putaran4-cms.mjs
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
const shot = (page, name) => page.screenshot({ path: new URL(`putaran4-${name}.png`, OUT).pathname.slice(1), fullPage: true });

async function loginAs(browser, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle" });
  return { ctx, page };
}

// Simpan keadaan sebelum uji supaya bisa dikembalikan apa adanya.
const { data: before, error: readError } = await admin.from("site_content").select("*").eq("id", "site").maybeSingle();
if (readError) throw new Error(`baca konten: ${readError.message} (sudah menjalankan npm run db:migrate?)`);

const title = `Judul uji CMS ${Date.now()}`;
const browser = await chromium.launch();
try {
  const a = await loginAs(browser, "admin@silentcx.demo");
  await a.page.goto(`${BASE}/admin/content`, { waitUntil: "networkidle" });
  check("menu Konten terbuka", (await a.page.textContent("main"))?.includes("Konten halaman publik") ?? false);

  const hero = a.page.locator("details", { hasText: "Bagian paling atas" });
  await hero.locator("summary").click();
  // Legenda persis "Judul"; "Teks kecil di atas judul" juga mengandung kata judul.
  const titleField = hero.locator("fieldset").filter({ has: a.page.locator("legend", { hasText: /^Judul\s*\*?$/ }) });
  await titleField.locator("input").first().fill(title);
  const faq = a.page.locator("details", { hasText: "Pertanyaan yang sering diajukan calon client" });
  await faq.getByRole("button", { name: "Tampil" }).click();
  await a.page.getByRole("button", { name: "Simpan draf" }).click();
  await a.page.getByText("Draf tersimpan.").first().waitFor();
  check("draf tersimpan, belum terbit", await a.page.getByText("Draf tersimpan, belum diterbitkan.").waitFor().then(() => true, () => false));
  await shot(a.page, "editor");

  const visitor = await browser.newContext();
  const v = await visitor.newPage();
  await v.goto(BASE, { waitUntil: "networkidle" });
  check("pengunjung belum melihat draf", !((await v.textContent("main")) ?? "").includes(title));

  await a.page.goto(`${BASE}/pratinjau`, { waitUntil: "networkidle" });
  const preview = (await a.page.textContent("body")) ?? "";
  check("pratinjau menampilkan draf dan penandanya", preview.includes(title) && preview.includes("Pratinjau draf"));
  check("bagian yang disembunyikan tidak tampil di pratinjau", (await a.page.locator("#faq").count()) === 0);
  await shot(a.page, "pratinjau");

  await a.page.goto(`${BASE}/admin/content`, { waitUntil: "networkidle" });
  a.page.once("dialog", (d) => d.accept());
  await a.page.getByRole("button", { name: "Terbitkan" }).click();
  await a.page.getByText("Konten diterbitkan.").first().waitFor();
  check("admin menerbitkan", true);

  await v.goto(BASE, { waitUntil: "networkidle" });
  check("pengunjung melihat judul baru di hero", ((await v.locator("h1").textContent()) ?? "").includes(title));
  check("FAQ tersembunyi di landing page", (await v.locator("#faq").count()) === 0);
  await shot(v, "landing");
  await visitor.close();
  await a.ctx.close();
} finally {
  await browser.close();
  // Dicoba ulang karena koneksi ke Supabase kadang putus; konten publik tidak boleh tertinggal versi uji.
  let restore;
  for (let i = 1; i <= 5; i++) {
    restore = before ? await admin.from("site_content").upsert(before) : await admin.from("site_content").delete().eq("id", "site");
    if (!restore.error) break;
    await new Promise((r) => setTimeout(r, 3000 * i));
  }
  console.log(restore.error ? `! Konten gagal dikembalikan: ${restore.error.message}. Kembalikan manual sebelum lanjut.` : "Konten dikembalikan seperti sebelum uji.");
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exitCode = failed ? 1 : 0;
