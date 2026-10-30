import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReportData } from "./types";

// Data rekaan untuk contoh laporan. Nama usaha sengaja jelas fiktif (PT ABC, Cafe 123, Cafe XYZ)
// supaya tidak tertukar dengan brand sungguhan.
// Dipakai tombol "Lihat contoh laporan" calon client, landing page, dan npm run contoh:laporan.
// Foto contoh memakai simbol SilentCX sebagai pengganti.
const placeholder = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "assets", "pdf", "simbol-emas.png")).toString("base64")}`;

const sections = (shift: number) =>
  [
    {
      title: "Sapaan dan sikap pelayanan",
      weight: 15,
      target: 85,
      score: 88 + shift,
    },
    { title: "Pengetahuan produk", weight: 15, target: 80, score: 72 + shift },
    { title: "Ketepatan pesanan", weight: 15, target: 90, score: 94 + shift },
    { title: "Kecepatan pelayanan", weight: 20, target: 85, score: 58 + shift },
    {
      title: "Kebersihan dan suasana",
      weight: 20,
      target: 85,
      score: 81 + shift,
    },
    {
      title: "Upselling dan closing",
      weight: 15,
      target: 75,
      score: 46 + shift,
    },
  ].map((s) => ({ ...s, score: Math.max(0, Math.min(100, s.score)) }));

const journey = (shift: number) =>
  [
    { title: "Kedatangan dan sapaan", score: 88 + shift, questions: 3 },
    { title: "Pemesanan", score: 61 + shift, questions: 4 },
    { title: "Menunggu pesanan", score: 55 + shift, questions: 3 },
    { title: "Penyajian dan konsumsi", score: 94 + shift, questions: 2 },
    { title: "Pembayaran", score: 83 + shift, questions: 3 },
    { title: "Kepergian", score: 75 + shift, questions: 1 },
  ].map((j) => ({ ...j, score: Math.max(0, Math.min(100, j.score)) }));

const baseFields = {
  sop: null,
  journey: [],
  redFlags: [],
  previous: null,
} satisfies Pick<ReportData, "sop" | "journey" | "redFlags" | "previous">;

export const essentialSample: ReportData = {
  ...baseFields,
  code: "PRJ-0012",
  company: "PT ABC",
  packageName: "SilentCX Essential",
  entitlements: ["report_basic"],
  publishedAt: "4 Nov 2026",
  visitPeriod: "28 Okt – 1 Nov 2026",
  outletCount: 1,
  visitCount: 1,
  score: 73.4,
  summary:
    "Kunjungan rahasia ke Cafe 123 Cabang A menunjukkan pelayanan yang ramah dan pesanan yang tepat. Dua hal menahan skor: waktu tunggu di jam ramai yang melewati 15 menit, dan staf yang belum menawarkan menu tambahan. Keduanya bisa diperbaiki cepat lewat pembagian tugas kasir dan naskah singkat upselling.",
  sections: sections(0),
  outlets: [
    {
      name: "Cafe 123 Cabang A",
      city: "Jakarta",
      score: 73.4,
      visits: 1,
      sections: sections(0),
    },
  ],
  findings: [
    {
      title: "Waktu tunggu 19 menit di jam ramai",
      detail: "Pesanan diterima 19 menit setelah membayar. Satu barista menangani kasir dan bar sekaligus.",
      severity: "major",
      outlet: null,
    },
    {
      title: "Tidak ada tawaran menu tambahan",
      detail: "Staf tidak menawarkan ukuran lebih besar atau pendamping saat pemesanan.",
      severity: "major",
      outlet: null,
    },
    {
      title: "Sapaan cepat dan ramah",
      detail: "Shopper disapa dalam 5 detik dengan senyum dan kontak mata.",
      severity: "minor",
      outlet: null,
    },
  ],
  recommendations: [
    {
      text: "Pisahkan peran kasir dan barista pada pukul 11.00–13.00.",
      priority: "now",
    },
    {
      text: "Siapkan satu kalimat tawaran (ukuran besar atau pastry) di setiap transaksi.",
      priority: "now",
    },
    {
      text: "Pasang target waktu saji 10 menit dan pantau mingguan.",
      priority: "soon",
    },
  ],
  photos: [],
  competitors: [],
};

export const insightSample: ReportData = {
  ...essentialSample,
  code: "PRJ-0014",
  packageName: "SilentCX Insight",
  entitlements: ["report_basic", "report_detailed", "sop", "evidence", "consultation"],
  summary:
    "Cafe 123 Cabang A unggul di sapaan dan ketepatan pesanan, tetapi kepatuhan SOP baru 67%: staf tidak mengulang pesanan dan tidak menawarkan menu tambahan. Di customer journey, tahap Menunggu pesanan paling lemah karena waktu saji 19 menit. Gap terbesar ada di Upselling dan closing (29 poin di bawah target) dan Kecepatan pelayanan (27 poin). Prioritas: pembagian peran kasir–barista di jam ramai dan naskah upselling satu kalimat.",
  sop: {
    score: 66.7,
    yes: 4,
    no: 2,
    items: [
      {
        prompt: "Staf mengulang pesanan sebelum diproses.",
        section: "Ketepatan pesanan",
        yes: 0,
        no: 1,
        outlets: ["Cafe 123 Cabang A"],
      },
      {
        prompt: "Staf menawarkan menu tambahan atau ukuran lebih besar.",
        section: "Upselling dan closing",
        yes: 0,
        no: 1,
        outlets: ["Cafe 123 Cabang A"],
      },
      {
        prompt: "Staf menyapa dalam 10 detik setelah Anda masuk.",
        section: "Sapaan dan sikap pelayanan",
        yes: 1,
        no: 0,
        outlets: [],
      },
      {
        prompt: "Nominal di struk sesuai harga menu.",
        section: "Ketepatan pesanan",
        yes: 1,
        no: 0,
        outlets: [],
      },
    ],
  },
  journey: journey(0),
  findings: [
    {
      title: "Waktu tunggu 19 menit di jam ramai",
      detail: "Pesanan diterima 19 menit setelah membayar. Satu barista menangani kasir dan bar sekaligus.",
      severity: "major",
      outlet: null,
    },
    {
      title: "SOP konfirmasi pesanan tidak dijalankan",
      detail: "Kasir langsung memproses pesanan tanpa mengulanginya. Risiko salah pesanan naik di jam ramai.",
      severity: "major",
      outlet: null,
    },
    {
      title: "Tidak ada tawaran menu tambahan",
      detail: "Staf tidak menawarkan ukuran lebih besar atau pendamping saat pemesanan.",
      severity: "major",
      outlet: null,
    },
    {
      title: "Sapaan cepat dan ramah",
      detail: "Shopper disapa dalam 5 detik dengan senyum dan kontak mata.",
      severity: "minor",
      outlet: null,
    },
  ],
  recommendations: [
    {
      text: "Pisahkan peran kasir dan barista pada pukul 11.00–13.00.",
      priority: "now",
    },
    {
      text: "Wajibkan pengulangan pesanan dan masukkan ke checklist briefing harian.",
      priority: "now",
    },
    {
      text: "Siapkan satu kalimat tawaran (ukuran besar atau pastry) di setiap transaksi.",
      priority: "soon",
    },
    {
      text: "Ukur ulang kepatuhan SOP lewat audit ulang 30 hari setelah perbaikan.",
      priority: "later",
    },
  ],
  photos: [
    {
      src: placeholder,
      caption: "Cafe 123 Cabang A · pesanan sesuai (contoh foto)",
    },
  ],
};

const outlets = [
  {
    name: "Cafe 123 Cabang A",
    city: "Jakarta",
    score: 81.2,
    visits: 1,
    sections: sections(6),
    sop: 83.3,
    redFlags: 0,
  },
  {
    name: "Cafe 123 Cabang B",
    city: "Bandung",
    score: 74.8,
    visits: 1,
    sections: sections(1),
    sop: 66.7,
    redFlags: 1,
  },
  {
    name: "Cafe 123 Cabang C",
    city: "Surabaya",
    score: 62.5,
    visits: 2,
    sections: sections(-11),
    sop: 50,
    redFlags: 3,
  },
];

export const performanceSample: ReportData = {
  ...insightSample,
  code: "PRJ-0013",
  packageName: "SilentCX Performance",
  entitlements: ["report_basic", "report_detailed", "sop", "evidence", "consultation", "multi_outlet", "benchmarking", "competitor"],
  outletCount: 3,
  visitCount: 4,
  score: 72.8,
  summary:
    "Dari tiga outlet, Cabang A memimpin dengan skor 81,2, sedangkan Cabang C tertinggal di 62,5 dengan 3 red flag, terutama meja kotor dan waktu tunggu. Kepatuhan SOP rata-rata 64%, dan SOP penawaran menu tambahan dilanggar di ketiga outlet: ini masalah sistem, bukan satu cabang. Dibanding Cafe XYZ, Cafe 123 unggul di ketepatan pesanan tetapi kalah di kecepatan. Prioritas manajemen: standar waktu saji lintas outlet, pelatihan upselling, dan pengawasan kebersihan Cabang C.",
  outlets,
  sop: {
    score: 63.9,
    yes: 23,
    no: 13,
    items: [
      {
        prompt: "Staf menawarkan menu tambahan atau ukuran lebih besar.",
        section: "Upselling dan closing",
        yes: 0,
        no: 4,
        outlets: ["Cafe 123 Cabang A", "Cafe 123 Cabang B", "Cafe 123 Cabang C"],
      },
      {
        prompt: "Staf mengulang pesanan sebelum diproses.",
        section: "Ketepatan pesanan",
        yes: 2,
        no: 2,
        outlets: ["Cafe 123 Cabang B", "Cafe 123 Cabang C"],
      },
      {
        prompt: "Staf mengucapkan terima kasih dan mengajak kembali.",
        section: "Upselling dan closing",
        yes: 3,
        no: 1,
        outlets: ["Cafe 123 Cabang C"],
      },
      {
        prompt: "Staf menyapa dalam 10 detik setelah Anda masuk.",
        section: "Sapaan dan sikap pelayanan",
        yes: 4,
        no: 0,
        outlets: [],
      },
    ],
  },
  journey: journey(-2),
  redFlags: [
    {
      prompt: "Pesanan yang diterima sesuai dengan yang dipesan.",
      section: "Ketepatan pesanan",
      outlet: "Cafe 123 Cabang B",
      count: 1,
    },
    {
      prompt: "Meja dan kursi bersih saat Anda duduk.",
      section: "Kebersihan dan suasana",
      outlet: "Cafe 123 Cabang C",
      count: 2,
    },
    {
      prompt: "Nominal di struk sesuai harga menu.",
      section: "Ketepatan pesanan",
      outlet: "Cafe 123 Cabang C",
      count: 1,
    },
  ],
  findings: [
    {
      title: "Upselling tidak dilakukan di 3 dari 3 outlet",
      detail: "Tidak ada tawaran ukuran besar atau menu pendamping di semua kunjungan.",
      severity: "critical",
      outlet: null,
    },
    {
      title: "Meja kotor saat shopper duduk",
      detail: "Dua meja dekat jendela masih berisi gelas bekas 10 menit setelah pelanggan sebelumnya pergi.",
      severity: "major",
      outlet: "Cafe 123 Cabang C",
    },
    {
      title: "Waktu tunggu 21 menit",
      detail: "Antrian kasir menumpuk; tidak ada staf tambahan saat ramai.",
      severity: "major",
      outlet: "Cafe 123 Cabang C",
    },
    {
      title: "Pengetahuan menu andalan baik",
      detail: "Staf menjelaskan biji kopi dan rekomendasi sesuai selera.",
      severity: "minor",
      outlet: "Cafe 123 Cabang A",
    },
  ],
  recommendations: [
    {
      text: "Terapkan naskah upselling satu kalimat di semua outlet dan ukur lewat rasio transaksi tambahan.",
      priority: "now",
    },
    {
      text: "Jadwalkan staf pembersih meja tiap 15 menit pada jam ramai di Cabang C.",
      priority: "now",
    },
    {
      text: "Samakan standar waktu saji 10 menit di semua outlet, dipantau dengan audit ulang.",
      priority: "soon",
    },
    {
      text: "Jadikan Cabang A outlet percontohan untuk pelatihan pelayanan.",
      priority: "later",
    },
  ],
  photos: [
    {
      src: placeholder,
      caption: "Cafe 123 Cabang C · meja dekat jendela (contoh foto)",
    },
    {
      src: placeholder,
      caption: "Cafe 123 Cabang A · pesanan sesuai (contoh foto)",
    },
  ],
  competitors: [
    {
      name: "Cafe XYZ",
      city: "Jakarta",
      score: 70.1,
      sections: sections(-3).map((s) => ({
        title: s.title,
        score: s.title === "Kecepatan pelayanan" ? 79 : s.score,
      })),
    },
  ],
};

export const SAMPLES = {
  essential: essentialSample,
  insight: insightSample,
  performance: performanceSample,
} as const;
export type SampleKey = keyof typeof SAMPLES;

export function sampleFor(key: string | null | undefined): ReportData {
  return SAMPLES[(key ?? "") as SampleKey] ?? performanceSample;
}
