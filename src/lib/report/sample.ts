import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReportData } from "./types";

// Data rekaan untuk contoh laporan. Nama usaha sengaja jelas fiktif (PT ABC, Cafe 123, Cafe XYZ)
// supaya tidak tertukar dengan brand sungguhan.
// Dipakai tombol "Lihat contoh laporan" calon client dan npm run contoh:laporan.
// Foto contoh memakai simbol SilentCX sebagai pengganti.
const placeholder = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "assets", "pdf", "simbol-emas.png")).toString("base64")}`;

const sections = (shift: number) => [
  { title: "Sapaan dan sikap pelayanan", weight: 15, score: 88 + shift },
  { title: "Pengetahuan produk", weight: 15, score: 72 + shift },
  { title: "Ketepatan pesanan", weight: 15, score: 94 + shift },
  { title: "Kecepatan pelayanan", weight: 20, score: 58 + shift },
  { title: "Kebersihan dan suasana", weight: 20, score: 81 + shift },
  { title: "Upselling dan closing", weight: 15, score: 46 + shift },
].map((s) => ({ ...s, score: Math.max(0, Math.min(100, s.score)) }));

export const essentialSample: ReportData = {
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
  outlets: [{ name: "Cafe 123 Cabang A", city: "Jakarta", score: 73.4, visits: 1, sections: sections(0) }],
  findings: [
    { title: "Waktu tunggu 19 menit di jam ramai", detail: "Pesanan diterima 19 menit setelah membayar. Satu barista menangani kasir dan bar sekaligus.", severity: "major", outlet: null },
    { title: "Tidak ada tawaran menu tambahan", detail: "Staf tidak menawarkan ukuran lebih besar atau pendamping saat pemesanan.", severity: "major", outlet: null },
    { title: "Sapaan cepat dan ramah", detail: "Shopper disapa dalam 5 detik dengan senyum dan kontak mata.", severity: "minor", outlet: null },
  ],
  recommendations: [
    { text: "Pisahkan peran kasir dan barista pada pukul 11.00–13.00.", priority: "now" },
    { text: "Siapkan satu kalimat tawaran (ukuran besar atau pastry) di setiap transaksi.", priority: "now" },
    { text: "Pasang target waktu saji 10 menit dan pantau mingguan.", priority: "soon" },
  ],
  photos: [],
  competitors: [],
};

const outlets = [
  { name: "Cafe 123 Cabang A", city: "Jakarta", score: 81.2, visits: 1, sections: sections(6) },
  { name: "Cafe 123 Cabang B", city: "Bandung", score: 74.8, visits: 1, sections: sections(1) },
  { name: "Cafe 123 Cabang C", city: "Surabaya", score: 62.5, visits: 1, sections: sections(-11) },
];

export const performanceSample: ReportData = {
  ...essentialSample,
  code: "PRJ-0013",
  packageName: "SilentCX Performance",
  entitlements: ["report_basic", "report_detailed", "sop", "evidence", "consultation", "multi_outlet", "benchmarking", "competitor"],
  outletCount: 3,
  visitCount: 4,
  score: 72.8,
  summary:
    "Dari tiga outlet, Cabang A memimpin dengan skor 81,2, sedangkan Cabang C tertinggal di 62,5 terutama karena kecepatan pelayanan dan kebersihan area duduk. Pola yang sama muncul di semua outlet: upselling hampir tidak dilakukan. Dibanding Cafe XYZ, Cafe 123 unggul di ketepatan pesanan tetapi kalah di kecepatan. Prioritas manajemen: standar waktu saji lintas outlet dan pelatihan upselling singkat.",
  outlets,
  findings: [
    { title: "Upselling tidak dilakukan di 3 dari 3 outlet", detail: "Tidak ada tawaran ukuran besar atau menu pendamping di semua kunjungan.", severity: "critical", outlet: null },
    { title: "Meja kotor saat shopper duduk", detail: "Dua meja dekat jendela masih berisi gelas bekas 10 menit setelah pelanggan sebelumnya pergi.", severity: "major", outlet: "Cafe 123 Cabang C" },
    { title: "Waktu tunggu 21 menit", detail: "Antrian kasir menumpuk; tidak ada staf tambahan saat ramai.", severity: "major", outlet: "Cafe 123 Cabang C" },
    { title: "Pengetahuan menu andalan baik", detail: "Staf menjelaskan biji kopi dan rekomendasi sesuai selera.", severity: "minor", outlet: "Cafe 123 Cabang A" },
  ],
  recommendations: [
    { text: "Terapkan naskah upselling satu kalimat di semua outlet dan ukur lewat rasio transaksi tambahan.", priority: "now" },
    { text: "Jadwalkan staf pembersih meja tiap 15 menit pada jam ramai di Cabang C.", priority: "now" },
    { text: "Samakan standar waktu saji 10 menit di semua outlet, dipantau dengan audit ulang.", priority: "soon" },
    { text: "Jadikan Cabang A outlet percontohan untuk pelatihan pelayanan.", priority: "later" },
  ],
  photos: [
    { src: placeholder, caption: "Cafe 123 Cabang C · meja dekat jendela (contoh foto)" },
    { src: placeholder, caption: "Cafe 123 Cabang A · pesanan sesuai (contoh foto)" },
  ],
  competitors: [{ name: "Cafe XYZ", city: "Jakarta", score: 70.1, sections: sections(-3).map((s) => ({ title: s.title, score: s.title === "Kecepatan pelayanan" ? 79 : s.score })) }],
};
