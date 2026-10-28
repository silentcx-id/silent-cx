// Isi halaman publik (landing page dan panel samping halaman masuk/daftar) yang diatur admin di menu Konten.
// Disimpan sebagai satu dokumen JSON: draf yang sedang diedit dan versi terbit yang dilihat pengunjung.
// Teks selalu punya versi Indonesia; versi Inggris boleh kosong dan jatuh ke Indonesia.
import type { Lang } from "./i18n";

export type Text = { id: string; en: string };
export type Item = { title: Text; body: Text };

export const SECTION_KEYS = ["hero", "problems", "steps", "audited", "packages", "sample", "why", "faq", "shopper", "contact"] as const;
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
  seoTitle: Text;
  seoDescription: Text;
  authHeadline: Text;
};

export type SiteContent = { order: SectionKey[]; sections: Record<SectionKey, Section>; site: SiteInfo };

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
  items?: { label: string; title: string; body: string };
};

export const SECTION_META: Record<SectionKey, SectionMeta> = {
  hero: { label: "Hero", hint: "Bagian paling atas: judul utama dan dua tombol daftar.", eyebrow: true, lede: true, cta: "Tombol pemilik bisnis", cta2: "Tombol mystery shopper", image: true },
  problems: { label: "Masalah yang diselesaikan", hint: "Masalah yang dialami pemilik bisnis sebelum memakai SilentCX.", lede: true, items: { label: "Masalah", title: "Masalah", body: "Penjelasan" } },
  steps: { label: "Cara kerja", hint: "Langkah dari memesan sampai menerima laporan.", lede: true, items: { label: "Langkah", title: "Judul langkah", body: "Penjelasan" } },
  audited: { label: "Apa saja yang diaudit", hint: "Area yang dinilai shopper di setiap kunjungan.", lede: true, items: { label: "Area", title: "Area", body: "Penjelasan" } },
  packages: { label: "Paket dan harga", hint: "Daftar paket dan harganya diambil otomatis dari Katalog. Di sini hanya judul dan pengantarnya.", lede: true },
  sample: { label: "Contoh laporan", hint: "Ajakan melihat contoh laporan PDF dengan data fiktif.", lede: true, cta: "Tombol unduh contoh", image: true },
  why: { label: "Mengapa SilentCX", hint: "Alasan memilih SilentCX.", lede: true, items: { label: "Alasan", title: "Alasan", body: "Penjelasan" } },
  faq: { label: "FAQ", hint: "Pertanyaan yang sering diajukan calon client.", items: { label: "Pertanyaan", title: "Pertanyaan", body: "Jawaban" } },
  shopper: { label: "Ajakan jadi mystery shopper", hint: "Ajakan untuk calon shopper.", lede: true, cta: "Tombol daftar shopper", image: true, items: { label: "Poin", title: "Poin", body: "Penjelasan" } },
  contact: { label: "Kontak", hint: "Tombol WhatsApp, email, dan Instagram diambil dari Info situs.", lede: true, cta: "Tombol WhatsApp" },
};

const tx = (id: string, en = ""): Text => ({ id, en });
const item = (title: Text, body: Text): Item => ({ title, body });
const blank = tx("");

function section(s: Partial<Section>): Section {
  return { visible: true, eyebrow: blank, title: blank, lede: blank, cta: blank, cta2: blank, image: "", items: [], ...s };
}

// Draf awal. Admin mengoreksinya di menu Konten tanpa menyentuh kode.
export const DEFAULT_CONTENT: SiteContent = {
  order: [...SECTION_KEYS],
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
    }),
    problems: section({
      title: tx("Yang sering tidak terlihat dari balik meja manajer", "What managers rarely see from behind the desk"),
      lede: tx("Laporan penjualan tidak menunjukkan bagaimana pelanggan dilayani. Di sinilah pengalaman pelanggan sering bocor.", "Sales reports don't show how customers are treated. That's where customer experience leaks."),
      items: [
        item(tx("Standar layanan hanya ada di atas kertas", "Service standards exist only on paper"), tx("SOP sudah dibuat, tapi tidak ada yang memastikan staf menjalankannya saat tidak diawasi.", "SOPs are written, but nobody checks that staff follow them when unsupervised.")),
        item(tx("Kualitas berbeda di tiap cabang", "Quality differs between branches"), tx("Cabang yang satu ramah dan cepat, cabang lain lambat dan kurang rapi. Sulit tahu mana yang perlu dibenahi.", "One branch is friendly and fast, another slow and untidy. It's hard to know which needs fixing.")),
        item(tx("Pelanggan pergi tanpa mengeluh", "Customers leave without complaining"), tx("Kebanyakan pelanggan yang kecewa tidak menulis ulasan. Mereka hanya tidak kembali.", "Most disappointed customers don't write a review. They just don't come back.")),
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
        item(tx("Sapaan dan sikap pelayanan", "Greeting and attitude"), tx("Apakah pelanggan disapa, dibantu, dan dihargai.", "Whether customers are greeted, helped, and respected.")),
        item(tx("Pengetahuan produk", "Product knowledge"), tx("Kemampuan staf menjelaskan dan merekomendasikan produk.", "Staff's ability to explain and recommend products.")),
        item(tx("Kecepatan dan ketepatan", "Speed and accuracy"), tx("Waktu tunggu dan kesesuaian pesanan.", "Waiting time and order accuracy.")),
        item(tx("Kebersihan dan suasana", "Cleanliness and atmosphere"), tx("Kondisi area pelanggan, toilet, dan tampilan outlet.", "Condition of customer areas, restrooms, and the outlet's look.")),
        item(tx("Upselling dan closing", "Upselling and closing"), tx("Apakah staf menawarkan produk tambahan dan menutup transaksi dengan baik.", "Whether staff offer add-ons and close the sale well.")),
        item(tx("Kepatuhan SOP", "SOP compliance"), tx("Langkah-langkah standar yang Anda tetapkan untuk tim.", "The standard steps you set for your team.")),
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
    }),
    why: section({
      title: tx("Mengapa SilentCX", "Why SilentCX"),
      items: [
        item(tx("Benar-benar rahasia", "Truly confidential"), tx("Identitas shopper dan jadwal kunjungan tidak pernah dibagikan, jadi staf melayani seperti biasa.", "Shopper identities and visit schedules are never shared, so staff serve as usual.")),
        item(tx("Bukti foto dan GPS", "Photo and GPS evidence"), tx("Setiap kunjungan dilengkapi check-in lokasi, foto, dan struk pembelian.", "Every visit includes a location check-in, photos, and a purchase receipt.")),
        item(tx("Diperiksa sebelum dilaporkan", "Checked before reporting"), tx("Tim QC mencocokkan jawaban dengan bukti. Hanya data yang valid yang masuk laporan.", "Our QC team matches answers with evidence. Only valid data makes it into the report.")),
        item(tx("Rekomendasi yang bisa dijalankan", "Actionable recommendations"), tx("Bukan sekadar angka: setiap temuan disertai langkah perbaikan yang jelas.", "Not just numbers: every finding comes with clear next steps.")),
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
        item(tx("Waktu fleksibel", "Flexible time"), tx("Terima tugas yang sesuai jadwal dan kota Anda.", "Accept assignments that fit your schedule and city.")),
        item(tx("Dibayar cepat", "Paid quickly"), tx("Fee dan reimburse ditransfer paling lambat 48 jam setelah kunjungan disetujui.", "Fees and reimbursements are paid within 48 hours after the visit is approved.")),
        item(tx("Panduan jelas", "Clear guidance"), tx("Setiap tugas punya brief, kuesioner, dan daftar foto yang perlu diambil.", "Every assignment comes with a brief, a questionnaire, and a photo checklist.")),
      ],
    }),
    contact: section({
      title: tx("Ada pertanyaan?", "Have a question?"),
      lede: tx("Hubungi tim SilentCX. Kami bantu memilih paket yang sesuai untuk bisnis Anda.", "Contact the SilentCX team. We'll help you choose the right package for your business."),
      cta: tx("Chat lewat WhatsApp", "Chat on WhatsApp"),
    }),
  },
  site: {
    whatsapp: "",
    email: "",
    instagram: "",
    seoTitle: tx("SilentCX · Mystery shopping dan audit pengalaman pelanggan", "SilentCX · Mystery shopping and customer experience audits"),
    seoDescription: tx(
      "Audit pengalaman pelanggan lewat mystery shopping: kunjungan rahasia, bukti foto dan GPS, dan laporan skor CX dengan rekomendasi.",
      "Customer experience audits through mystery shopping: secret visits, photo and GPS evidence, and CX score reports with recommendations.",
    ),
    authHeadline: tx("Lihat bisnis Anda dari mata pelanggan.", "See your business through your customers' eyes."),
  },
};

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
  const order = [...new Set([...savedOrder, ...SECTION_KEYS])];
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
          items: Array.isArray(s.items) ? s.items.map((x) => ({ title: asText(x?.title, blank), body: asText(x?.body, blank) })) : d.items,
        },
      ];
    }),
  ) as Record<SectionKey, Section>;
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
      seoTitle: asText(s.seoTitle, d.seoTitle),
      seoDescription: asText(s.seoDescription, d.seoDescription),
      authHeadline: asText(s.authHeadline, d.authHeadline),
    },
  };
}
