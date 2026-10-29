// Isi halaman publik (landing page dan panel samping halaman masuk/daftar) yang diatur admin di menu Konten.
// Disimpan sebagai satu dokumen JSON: draf yang sedang diedit dan versi terbit yang dilihat pengunjung.
// Teks selalu punya versi Indonesia; versi Inggris boleh kosong dan jatuh ke Indonesia.
import type { Lang } from "./i18n";
import { isLandingIcon, type LandingIcon } from "./landing-icons";
import { DEFAULT_PRIVACY, DEFAULT_TERMS } from "./legal-defaults";

export type Text = { id: string; en: string };
// meta = keterangan tambahan (jabatan pada testimoni); icon = ikon kartu; image = gambar galeri.
export type Item = { title: Text; body: Text; meta: Text; icon: LandingIcon | ""; image: string };

export const SECTION_KEYS = ["hero", "problems", "steps", "audited", "why", "sample", "packages", "testimonials", "faq", "shopper", "contact", "cta"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type Section = {
  visible: boolean;
  eyebrow: Text;
  title: Text;
  lede: Text;
  cta: Text;
  cta2: Text;
  image: string;
  items: Item[];
};

export type SiteInfo = {
  whatsapp: string;
  email: string;
  instagram: string;
  // Kontak di footer: alamat kantor, telepon, situs web, dan media sosial lain (lihat site-links.ts).
  address: string;
  phone: string;
  website: string;
  tiktok: string;
  facebook: string;
  linkedin: string;
  youtube: string;
  x: string;
  seoTitle: Text;
  seoDescription: Text;
  authHeadline: Text;
};

// Halaman hukum (/privasi dan /syarat). updated = tanggal "Terakhir diperbarui" (YYYY-MM-DD), sekaligus versi
// yang dicatat saat pengguna menyetujuinya ketika mendaftar.
export type LegalDoc = { title: Text; updated: string; body: Text };
export const LEGAL_KEYS = ["privacy", "terms"] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];
export const LEGAL_PATH: Record<LegalKey, string> = { privacy: "/privasi", terms: "/syarat" };

export type SiteContent = { order: SectionKey[]; sections: Record<SectionKey, Section>; site: SiteInfo; legal: Record<LegalKey, LegalDoc> };

// Isian apa saja yang dipakai tiap bagian, untuk editor dan tampilan.
// `items` berisi label daftar (misalnya "Pertanyaan") kalau bagian itu punya daftar yang bisa ditambah atau dihapus.
export type SectionMeta = {
  label: string;
  hint: string;
  eyebrow?: boolean;
  lede?: boolean;
  cta?: string;
  cta2?: string;
  image?: boolean;
  items?: { label: string; title: string; body: string; meta?: string; icon?: boolean; image?: boolean };
};

export const SECTION_META: Record<SectionKey, SectionMeta> = {
  hero: { label: "Hero", hint: "Bagian paling atas: judul utama dan dua tombol daftar.", eyebrow: true, lede: true, cta: "Tombol pemilik bisnis", cta2: "Tombol mystery shopper", image: true },
  problems: { label: "Masalah yang diselesaikan", hint: "Masalah yang dialami pemilik bisnis sebelum memakai SilentCX.", lede: true, items: { label: "Masalah", title: "Masalah", body: "Penjelasan", icon: true } },
  steps: { label: "Cara kerja", hint: "Langkah dari memesan sampai menerima laporan.", lede: true, items: { label: "Langkah", title: "Judul langkah", body: "Penjelasan" } },
  audited: { label: "Apa saja yang diaudit", hint: "Area yang dinilai shopper di setiap kunjungan.", lede: true, items: { label: "Area", title: "Area", body: "Penjelasan", icon: true } },
  packages: { label: "Paket dan harga", hint: "Daftar paket dan harganya diambil otomatis dari Katalog. Di sini hanya judul dan pengantarnya.", lede: true },
  why: { label: "Mengapa SilentCX", hint: "Alasan memilih SilentCX. Tampil di pita gelap.", lede: true, items: { label: "Alasan", title: "Alasan", body: "Penjelasan", icon: true } },
  sample: {
    label: "Contoh laporan",
    hint: "Galeri gambar contoh laporan yang bergeser otomatis, ditambah tombol unduh PDF dengan data fiktif.",
    lede: true,
    cta: "Tombol unduh contoh",
    items: { label: "Gambar", title: "Judul gambar", body: "Keterangan", image: true },
  },
  testimonials: {
    label: "Testimoni",
    hint: "Kartu testimoni client di pita gelap. Lebih dari 3 testimoni bergeser otomatis satu per satu.",
    lede: true,
    items: { label: "Testimoni", title: "Nama", body: "Kutipan", meta: "Jabatan dan nama usaha" },
  },
  faq: { label: "FAQ", hint: "Pertanyaan yang sering diajukan calon client.", items: { label: "Pertanyaan", title: "Pertanyaan", body: "Jawaban" } },
  shopper: { label: "Ajakan jadi mystery shopper", hint: "Ajakan untuk calon shopper.", lede: true, cta: "Tombol daftar shopper", image: true, items: { label: "Poin", title: "Poin", body: "Penjelasan", icon: true } },
  contact: { label: "Kontak", hint: "Tombol WhatsApp, email, dan Instagram diambil dari Info situs. Footer menampilkan semua kontak dan media sosial dari Info situs.", lede: true, cta: "Tombol WhatsApp" },
  cta: { label: "Ajakan penutup", hint: "Pita ajakan sebelum footer, dengan satu tombol ke halaman daftar pemilik bisnis.", lede: true, cta: "Tombol" },
};

// Urutan bawaan di halaman.
export const DEFAULT_ORDER: SectionKey[] = ["hero", "problems", "steps", "audited", "why", "sample", "packages", "testimonials", "faq", "shopper", "contact", "cta"];

const tx = (id: string, en = ""): Text => ({ id, en });
const blank = tx("");
const item = (title: Text, body: Text, icon: LandingIcon | "" = "", extra: Partial<Item> = {}): Item => ({ title, body, meta: blank, icon, image: "", ...extra });

// Testimoni bawaan berisi contoh fiktif yang namanya ditandai ini; editor memperingatkan admin selama masih dipakai.
export const SAMPLE_MARK = "(contoh)";

function section(s: Partial<Section>): Section {
  return { visible: true, eyebrow: blank, title: blank, lede: blank, cta: blank, cta2: blank, image: "", items: [], ...s };
}

// Kontak dan media sosial contoh. Nomor telepon sengaja tidak bisa dihubungi (0800…/000).
export const SAMPLE_SITE = {
  whatsapp: "080000000000",
  email: "halo@silentcx.com",
  instagram: "@silentcx.id",
  address: "Jl. Contoh No. 123, Jakarta Selatan 12345 (alamat contoh)",
  phone: "(021) 000 0000",
  website: "silentcx.com",
  tiktok: "@silentcx.id",
  facebook: "https://facebook.com/silentcx.id",
  linkedin: "https://www.linkedin.com/company/silentcx",
  youtube: "https://www.youtube.com/@silentcx",
  x: "@silentcx_id",
} satisfies Partial<SiteInfo>;

// Draf awal. Admin mengoreksinya di menu Konten tanpa menyentuh kode.
export const DEFAULT_CONTENT: SiteContent = {
  order: [...DEFAULT_ORDER],
  sections: {
    hero: section({
      eyebrow: tx("Mystery shopping untuk bisnis Indonesia", "Mystery shopping for Indonesian businesses"),
      title: tx("Lihat bisnis Anda dari mata pelanggan.", "See your business through your customers' eyes."),
      lede: tx(
        "SilentCX mengirim mystery shopper terlatih ke outlet Anda, memeriksa setiap kunjungan, lalu menyerahkan skor CX dan rekomendasi yang bisa langsung dijalankan.",
        "SilentCX sends trained mystery shoppers to your outlets, checks every visit, then hands you a CX score and recommendations you can act on.",
      ),
      cta: tx("Daftar sebagai pemilik bisnis", "Sign up as a business owner"),
      cta2: tx("Jadi mystery shopper", "Become a mystery shopper"),
      image: "/landing/hero.svg",
    }),
    problems: section({
      title: tx("Yang sering tidak terlihat dari balik meja manajer", "What managers rarely see from behind the desk"),
      lede: tx("Laporan penjualan tidak menunjukkan bagaimana pelanggan dilayani. Di sinilah pengalaman pelanggan sering bocor.", "Sales reports don't show how customers are treated. That's where customer experience leaks."),
      items: [
        item(tx("Standar layanan hanya ada di atas kertas", "Service standards exist only on paper"), tx("SOP sudah dibuat, tapi tidak ada yang memastikan staf menjalankannya saat tidak diawasi.", "SOPs are written, but nobody checks that staff follow them when unsupervised."), "clipboard"),
        item(tx("Kualitas berbeda di tiap cabang", "Quality differs between branches"), tx("Cabang yang satu ramah dan cepat, cabang lain lambat dan kurang rapi. Sulit tahu mana yang perlu dibenahi.", "One branch is friendly and fast, another slow and untidy. It's hard to know which needs fixing."), "branches"),
        item(tx("Pelanggan pergi tanpa mengeluh", "Customers leave without complaining"), tx("Kebanyakan pelanggan yang kecewa tidak menulis ulasan. Mereka hanya tidak kembali.", "Most disappointed customers don't write a review. They just don't come back."), "frown"),
      ],
    }),
    steps: section({
      title: tx("Cara kerjanya", "How it works"),
      lede: tx("Dari memesan sampai menerima laporan, semuanya lewat satu dashboard.", "From ordering to receiving the report, everything happens in one dashboard."),
      items: [
        item(tx("Pilih paket", "Choose a package"), tx("Tentukan jumlah outlet dan add-on. Harga langsung terlihat.", "Pick the number of outlets and add-ons. Prices are shown upfront.")),
        item(tx("Lengkapi data outlet", "Complete outlet details"), tx("Setelah pembayaran diverifikasi, isi alamat outlet dan tujuan audit Anda.", "After payment is verified, fill in outlet addresses and your audit goals.")),
        item(tx("Kunjungan rahasia", "Secret visits"), tx("Shopper kami datang sebagai pelanggan biasa dan mencatat semuanya dengan foto, struk, dan lokasi.", "Our shoppers visit as regular customers and record everything with photos, receipts, and location.")),
        item(tx("Terima laporan", "Receive the report"), tx("Skor CX per outlet, temuan, dan rekomendasi yang sudah lolos pemeriksaan kualitas.", "CX scores per outlet, findings, and recommendations that passed quality checks.")),
      ],
    }),
    audited: section({
      title: tx("Apa saja yang diaudit", "What we audit"),
      lede: tx("Kuesioner disesuaikan dengan jenis usaha Anda. Area yang umum dinilai:", "The questionnaire is tailored to your business type. Commonly assessed areas:"),
      items: [
        item(tx("Sapaan dan sikap pelayanan", "Greeting and attitude"), tx("Apakah pelanggan disapa, dibantu, dan dihargai.", "Whether customers are greeted, helped, and respected."), "smile"),
        item(tx("Pengetahuan produk", "Product knowledge"), tx("Kemampuan staf menjelaskan dan merekomendasikan produk.", "Staff's ability to explain and recommend products."), "book"),
        item(tx("Kecepatan dan ketepatan", "Speed and accuracy"), tx("Waktu tunggu dan kesesuaian pesanan.", "Waiting time and order accuracy."), "clock"),
        item(tx("Kebersihan dan suasana", "Cleanliness and atmosphere"), tx("Kondisi area pelanggan, toilet, dan tampilan outlet.", "Condition of customer areas, restrooms, and the outlet's look."), "sparkle"),
        item(tx("Upselling dan closing", "Upselling and closing"), tx("Apakah staf menawarkan produk tambahan dan menutup transaksi dengan baik.", "Whether staff offer add-ons and close the sale well."), "tag"),
        item(tx("Kepatuhan SOP", "SOP compliance"), tx("Langkah-langkah standar yang Anda tetapkan untuk tim.", "The standard steps you set for your team."), "check"),
      ],
    }),
    packages: section({
      title: tx("Paket audit", "Audit packages"),
      lede: tx("Harga sudah termasuk PPN. Pilih paket, lalu tentukan jumlah outlet dan add-on di langkah berikutnya.", "Prices include VAT. Choose a package, then set outlets and add-ons in the next step."),
    }),
    sample: section({
      title: tx("Lihat contoh laporannya", "See a sample report"),
      lede: tx("Contoh laporan dengan data fiktif: skor per area, perbandingan outlet, temuan, rekomendasi, dan benchmark kompetitor.", "A sample report with fictional data: scores per area, outlet comparison, findings, recommendations, and a competitor benchmark."),
      cta: tx("Unduh contoh laporan (PDF)", "Download sample report (PDF)"),
      items: [
        item(tx("Ringkasan skor CX", "CX score summary"), tx("Skor keseluruhan, perubahan, dan ringkasan untuk manajemen.", "Overall score, change, and a management summary."), "", { image: "/landing/contoh-laporan-1.svg" }),
        item(tx("Skor per area", "Scores by area"), tx("Area mana yang kuat dan mana yang perlu dibenahi.", "Which areas are strong and which need work."), "", { image: "/landing/contoh-laporan-2.svg" }),
        item(tx("Perbandingan outlet", "Outlet comparison"), tx("Peringkat cabang untuk paket multi-outlet.", "Branch ranking for multi-outlet packages."), "", { image: "/landing/contoh-laporan-3.svg" }),
        item(tx("Temuan dan tingkat keparahan", "Findings and severity"), tx("Setiap temuan diberi label kritis, mayor, atau minor.", "Every finding is labelled critical, major, or minor."), "", { image: "/landing/contoh-laporan-4.svg" }),
        item(tx("Bukti kunjungan", "Visit evidence"), tx("Foto, struk, dan check-in lokasi yang lolos QC.", "Photos, receipts, and location check-ins that passed QC."), "", { image: "/landing/contoh-laporan-5.svg" }),
        item(tx("Rekomendasi prioritas", "Priority recommendations"), tx("Langkah perbaikan: sekarang, segera, dan nanti.", "Next steps: now, soon, and later."), "", { image: "/landing/contoh-laporan-6.svg" }),
      ],
    }),
    why: section({
      title: tx("Mengapa SilentCX", "Why SilentCX"),
      lede: tx("Audit yang bisa dipercaya, dari kunjungan sampai rekomendasi.", "Audits you can trust, from the visit to the recommendation."),
      items: [
        item(tx("Benar-benar rahasia", "Truly confidential"), tx("Identitas shopper dan jadwal kunjungan tidak pernah dibagikan, jadi staf melayani seperti biasa.", "Shopper identities and visit schedules are never shared, so staff serve as usual."), "shield"),
        item(tx("Bukti foto dan GPS", "Photo and GPS evidence"), tx("Setiap kunjungan dilengkapi check-in lokasi, foto, dan struk pembelian.", "Every visit includes a location check-in, photos, and a purchase receipt."), "camera"),
        item(tx("Diperiksa sebelum dilaporkan", "Checked before reporting"), tx("Tim QC mencocokkan jawaban dengan bukti. Hanya data yang valid yang masuk laporan.", "Our QC team matches answers with evidence. Only valid data makes it into the report."), "search"),
        item(tx("Rekomendasi yang bisa dijalankan", "Actionable recommendations"), tx("Bukan sekadar angka: setiap temuan disertai langkah perbaikan yang jelas.", "Not just numbers: every finding comes with clear next steps."), "lightbulb"),
      ],
    }),
    testimonials: section({
      title: tx("Kata client kami", "What our clients say"),
      items: [
        item(tx("Rina (contoh)"), tx("Kami baru sadar sapaan kasir di cabang B jauh tertinggal. Dua minggu setelah briefing ulang, skor cabang itu naik.", "We hadn't noticed the cashier greeting at branch B was far behind. Two weeks after a re-briefing, that branch's score went up."), "", { meta: tx("Pemilik, Cafe 123", "Owner, Cafe 123") }),
        item(tx("Budi (contoh)"), tx("Laporannya jelas dan ada fotonya. Tim operasional langsung tahu apa yang harus diperbaiki duluan.", "The report is clear and has photos. Our operations team knew right away what to fix first."), "", { meta: tx("Manajer Operasional, PT ABC", "Operations Manager, PT ABC") }),
        item(tx("Sari (contoh)"), tx("Perbandingan antar outlet membantu kami menentukan cabang mana yang perlu pelatihan tambahan.", "The outlet comparison helped us decide which branch needed extra training."), "", { meta: tx("Area Manager, Cafe XYZ", "Area Manager, Cafe XYZ") }),
        item(tx("Dimas (contoh)"), tx("Rekomendasinya praktis, bukan sekadar angka. Cocok untuk dibahas di rapat mingguan.", "The recommendations are practical, not just numbers. Great for our weekly meeting."), "", { meta: tx("Pemilik, Toko Contoh", "Owner, Toko Contoh") }),
      ],
    }),
    faq: section({
      title: tx("Pertanyaan yang sering diajukan", "Frequently asked questions"),
      items: [
        item(tx("Apakah staf saya akan tahu sedang dinilai?", "Will my staff know they're being assessed?"), tx("Tidak. Shopper datang sebagai pelanggan biasa, dan jadwal kunjungan tidak dibagikan ke siapa pun di outlet.", "No. Shoppers visit as regular customers, and visit schedules are never shared with anyone at the outlet.")),
        item(tx("Berapa lama sampai laporan terbit?", "How long until the report is ready?"), tx("Biasanya 1–2 minggu setelah data outlet lengkap, tergantung jumlah outlet dan kunjungan. Add-on laporan express mempercepatnya.", "Usually 1–2 weeks after outlet details are complete, depending on outlets and visits. The express report add-on speeds this up.")),
        item(tx("Bagaimana kalau outlet saya di luar kota yang dilayani?", "What if my outlet is outside the cities you serve?"), tx("Tetap bisa dipesan. Tim kami mencarikan shopper di kota tersebut dan mengonfirmasi pesanan Anda terlebih dulu.", "You can still order. Our team finds a shopper in that city and confirms your order first.")),
        item(tx("Biaya pembelian saat kunjungan ditanggung siapa?", "Who pays for purchases during the visit?"), tx("Sudah termasuk dalam paket sampai batas tertentu. Kalau pembelian melebihi batas, selisihnya ditagihkan dengan persetujuan Anda.", "It's included in the package up to a limit. If a purchase exceeds the limit, the difference is billed with your approval.")),
        item(tx("Bagaimana cara membayar?", "How do I pay?"), tx("Transfer bank atau QRIS, lalu unggah bukti bayar di dashboard. Tim kami memverifikasinya.", "Bank transfer or QRIS, then upload the payment proof in your dashboard. Our team verifies it.")),
      ],
    }),
    shopper: section({
      title: tx("Jadi mystery shopper SilentCX", "Become a SilentCX mystery shopper"),
      lede: tx("Dapat fee untuk setiap kunjungan, dan biaya pembelian diganti. Daftar tanpa KTP dan selfie.", "Earn a fee for every visit, and get your purchases reimbursed. Sign up without ID cards or selfies."),
      cta: tx("Daftar jadi shopper", "Sign up as a shopper"),
      items: [
        item(tx("Waktu fleksibel", "Flexible time"), tx("Terima tugas yang sesuai jadwal dan kota Anda.", "Accept assignments that fit your schedule and city."), "calendar"),
        item(tx("Dibayar cepat", "Paid quickly"), tx("Fee dan reimburse ditransfer paling lambat 48 jam setelah kunjungan disetujui.", "Fees and reimbursements are paid within 48 hours after the visit is approved."), "wallet"),
        item(tx("Panduan jelas", "Clear guidance"), tx("Setiap tugas punya brief, kuesioner, dan daftar foto yang perlu diambil.", "Every assignment comes with a brief, a questionnaire, and a photo checklist."), "file"),
      ],
    }),
    contact: section({
      title: tx("Ada pertanyaan?", "Have a question?"),
      lede: tx("Hubungi tim SilentCX. Kami bantu memilih paket yang sesuai untuk bisnis Anda.", "Contact the SilentCX team. We'll help you choose the right package for your business."),
      cta: tx("Chat lewat WhatsApp", "Chat on WhatsApp"),
    }),
    cta: section({
      title: tx("Siap melihat bisnis Anda dari mata pelanggan?", "Ready to see your business through your customers' eyes?"),
      lede: tx("Pilih paket, dan shopper kami mulai berkunjung setelah data outlet lengkap.", "Choose a package, and our shoppers start visiting once your outlet details are complete."),
      cta: tx("Mulai audit", "Start an audit"),
    }),
  },
  site: {
    // Kontak contoh supaya footer terlihat lengkap; editor memperingatkan admin selama masih dipakai.
    ...SAMPLE_SITE,
    seoTitle: tx("SilentCX · Mystery shopping dan audit pengalaman pelanggan", "SilentCX · Mystery shopping and customer experience audits"),
    seoDescription: tx(
      "Audit pengalaman pelanggan lewat mystery shopping: kunjungan rahasia, bukti foto dan GPS, dan laporan skor CX dengan rekomendasi.",
      "Customer experience audits through mystery shopping: secret visits, photo and GPS evidence, and CX score reports with recommendations.",
    ),
    authHeadline: tx("Lihat bisnis Anda dari mata pelanggan.", "See your business through your customers' eyes."),
  },
  legal: {
    privacy: { title: tx("Kebijakan Privasi", "Privacy Policy"), updated: "2026-10-29", body: tx(DEFAULT_PRIVACY) },
    terms: { title: tx("Syarat & Ketentuan", "Terms & Conditions"), updated: "2026-10-29", body: tx(DEFAULT_TERMS) },
  },
};

// Isian yang masih harus dilengkapi admin di halaman hukum, misalnya "[Nama badan usaha]".
export function legalPlaceholders(c: SiteContent): string[] {
  const found = LEGAL_KEYS.flatMap((k) => c.legal[k].body.id.match(/\[[^\]\n]{2,80}\]/g) ?? []);
  return [...new Set(found)];
}

// Versi dokumen yang disetujui saat daftar, misalnya "privasi 2026-10-29, syarat 2026-10-29".
export function legalVersion(c: SiteContent): string {
  return `privasi ${c.legal.privacy.updated}, syarat ${c.legal.terms.updated}`;
}

// Teks sesuai bahasa; versi Inggris yang kosong jatuh ke Indonesia.
export function pick(text: Text, lang: Lang): string {
  return (lang === "en" && text.en.trim()) || text.id;
}

const asText = (v: unknown, fallback: Text): Text => {
  if (!v || typeof v !== "object") return fallback;
  const o = v as Partial<Text>;
  return { id: typeof o.id === "string" ? o.id : fallback.id, en: typeof o.en === "string" ? o.en : fallback.en };
};

// Melengkapi dokumen tersimpan dengan bawaan, supaya bagian atau isian yang ditambahkan belakangan tetap ada.
export function normalizeContent(raw: unknown): SiteContent {
  if (!raw || typeof raw !== "object") return DEFAULT_CONTENT;
  const r = raw as Partial<SiteContent>;
  const savedOrder = Array.isArray(r.order) ? r.order.filter((k): k is SectionKey => (SECTION_KEYS as readonly string[]).includes(k)) : [];
  // Bagian baru yang belum ada di dokumen tersimpan disisipkan sesuai posisi bawaannya.
  const order = [...new Set(savedOrder)];
  DEFAULT_ORDER.forEach((k, i) => {
    if (order.includes(k)) return;
    const before = DEFAULT_ORDER.slice(0, i).reverse().find((x) => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
  });
  const sections = Object.fromEntries(
    SECTION_KEYS.map((k) => {
      const d = DEFAULT_CONTENT.sections[k];
      const s = (r.sections?.[k] ?? {}) as Partial<Section>;
      return [
        k,
        {
          visible: typeof s.visible === "boolean" ? s.visible : d.visible,
          eyebrow: asText(s.eyebrow, d.eyebrow),
          title: asText(s.title, d.title),
          lede: asText(s.lede, d.lede),
          cta: asText(s.cta, d.cta),
          cta2: asText(s.cta2, d.cta2),
          image: typeof s.image === "string" ? s.image : d.image,
          // Butir lama tanpa ikon memakai ikon bawaan di posisi yang sama.
          items: Array.isArray(s.items)
            ? s.items.map((x, i) => ({
                title: asText(x?.title, blank),
                body: asText(x?.body, blank),
                meta: asText(x?.meta, blank),
                icon: isLandingIcon(x?.icon) ? x.icon : x?.icon === "" ? ("" as const) : (d.items[i]?.icon ?? ""),
                image: typeof x?.image === "string" ? x.image : "",
              }))
            : d.items,
        },
      ];
    }),
  ) as Record<SectionKey, Section>;
  const legalRaw = (r.legal ?? {}) as Partial<Record<LegalKey, Partial<LegalDoc>>>;
  const legal = Object.fromEntries(
    LEGAL_KEYS.map((k) => {
      const d = DEFAULT_CONTENT.legal[k];
      const x = legalRaw[k] ?? {};
      return [k, { title: asText(x.title, d.title), updated: typeof x.updated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.updated) ? x.updated : d.updated, body: asText(x.body, d.body) }];
    }),
  ) as Record<LegalKey, LegalDoc>;
  const s = (r.site ?? {}) as Partial<SiteInfo>;
  const d = DEFAULT_CONTENT.site;
  const str = (v: unknown, f: string) => (typeof v === "string" ? v : f);
  return {
    order,
    sections,
    site: {
      whatsapp: str(s.whatsapp, d.whatsapp),
      email: str(s.email, d.email),
      instagram: str(s.instagram, d.instagram),
      address: str(s.address, d.address),
      phone: str(s.phone, d.phone),
      website: str(s.website, d.website),
      tiktok: str(s.tiktok, d.tiktok),
      facebook: str(s.facebook, d.facebook),
      linkedin: str(s.linkedin, d.linkedin),
      youtube: str(s.youtube, d.youtube),
      x: str(s.x, d.x),
      seoTitle: asText(s.seoTitle, d.seoTitle),
      seoDescription: asText(s.seoDescription, d.seoDescription),
      authHeadline: asText(s.authHeadline, d.authHeadline),
    },
    legal,
  };
}
