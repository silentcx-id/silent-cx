import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT, DEFAULT_ORDER, normalizeContent, SAMPLE_MARK, SAMPLE_SITE } from "../src/lib/site-content";

// Dokumen konten lama (sebelum ada testimoni, ajakan penutup, ikon, dan galeri) tetap terbaca utuh.
const oldDoc = {
  order: ["hero", "problems", "steps", "audited", "packages", "sample", "why", "faq", "shopper", "contact"],
  sections: {
    problems: { visible: true, title: { id: "Masalah", en: "" }, items: [{ title: { id: "A", en: "" }, body: { id: "a", en: "" } }, { title: { id: "B", en: "" }, body: { id: "b", en: "" } }] },
    faq: { visible: false, title: { id: "FAQ", en: "" }, items: [] },
  },
  site: { whatsapp: "081234567890" },
};

describe("konten landing page", () => {
  it("bagian baru disisipkan di posisi bawaannya tanpa mengubah urutan yang diatur admin", () => {
    const c = normalizeContent(oldDoc);
    expect(c.order).toEqual(["hero", "problems", "steps", "audited", "packages", "testimonials", "sample", "why", "faq", "shopper", "contact", "cta"]);
    expect(new Set(c.order).size).toBe(DEFAULT_ORDER.length);
  });

  it("butir lama mendapat ikon bawaan dan isian baru yang kosong", () => {
    const c = normalizeContent(oldDoc);
    expect(c.sections.problems.items.map((x) => x.icon)).toEqual(DEFAULT_CONTENT.sections.problems.items.slice(0, 2).map((x) => x.icon));
    expect(c.sections.problems.items[0]).toMatchObject({ meta: { id: "", en: "" }, image: "" });
    expect(c.sections.faq.visible).toBe(false);
  });

  it("ikon yang tidak dikenal diganti ikon bawaan, sedangkan pilihan tanpa ikon tetap kosong", () => {
    const c = normalizeContent({
      sections: { why: { items: [{ title: { id: "X", en: "" }, icon: "tidak-ada" }, { title: { id: "Y", en: "" }, icon: "" }] } },
    });
    expect(c.sections.why.items[0].icon).toBe(DEFAULT_CONTENT.sections.why.items[0].icon);
    expect(c.sections.why.items[1].icon).toBe("");
  });

  it("isi bawaan menampilkan semua bagian, dengan testimoni contoh bertanda dan galeri 6 gambar", () => {
    expect(DEFAULT_CONTENT.order).toEqual(DEFAULT_ORDER);
    expect(Object.values(DEFAULT_CONTENT.sections).every((s) => s.visible)).toBe(true);
    expect(DEFAULT_CONTENT.sections.testimonials.items.every((x) => x.title.id.includes(SAMPLE_MARK))).toBe(true);
    expect(DEFAULT_CONTENT.sections.sample.items.map((x) => x.image)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `/landing/contoh-laporan-${n}.svg`));
    expect(DEFAULT_CONTENT.sections.hero.image).toBe("/landing/hero.svg");
  });
});

describe("kontak dan media sosial di footer", () => {
  it("nama akun diubah menjadi tautan, alamat lengkap dipakai apa adanya", async () => {
    const { socialHref, websiteHref, websiteLabel } = await import("../src/lib/site-links");
    expect(socialHref("instagram", "@silentcx.id")).toBe("https://instagram.com/silentcx.id");
    expect(socialHref("tiktok", "silentcx")).toBe("https://www.tiktok.com/@silentcx");
    expect(socialHref("x", "@silentcx")).toBe("https://x.com/silentcx");
    expect(socialHref("facebook", "https://facebook.com/silentcx")).toBe("https://facebook.com/silentcx");
    expect(socialHref("youtube", "  ")).toBe("");
    expect(websiteHref("silentcx.id")).toBe("https://silentcx.id");
    expect(websiteLabel("https://silentcx.id/")).toBe("silentcx.id");
  });

  it("isian yang sudah tersimpan dipertahankan, yang belum ada memakai kontak contoh", () => {
    const c = normalizeContent({ site: { whatsapp: "081234567890", instagram: "@silentcx" } });
    expect(c.site).toMatchObject({ ...SAMPLE_SITE, whatsapp: "081234567890", instagram: "@silentcx" });
    expect(normalizeContent({ site: { phone: "", address: "" } }).site).toMatchObject({ phone: "", address: "" });
  });
});
