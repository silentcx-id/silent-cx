// Di mana setiap fitur di daftar harga paket diwujudkan. Dicek tes (tests/putaran9.test.ts): setiap fitur paket
// bawaan harus ada di sini, dan fitur "report" harus benar-benar muncul di laporan contoh paket itu.
// Kalau admin menambah teks fitur baru di Katalog, tambahkan juga di sini supaya janji di daftar harga tetap terpenuhi.

export type FeatureCoverage =
  // Bagian laporan: `text` harus muncul di HTML laporan web (PDF memuat bagian yang sama).
  | { kind: "report"; text: string }
  // Lingkup layanan atau proses: jumlah outlet/kunjungan, konsultasi, biaya pembelian, PDF.
  | { kind: "service"; where: string };

const report = (text: string): FeatureCoverage => ({ kind: "report", text });
const service = (where: string): FeatureCoverage => ({ kind: "service", where });

export const FEATURE_COVERAGE: Record<string, FeatureCoverage> = {
  "1 outlet": service("Jumlah outlet pesanan"),
  "3–5 outlet": service("Jumlah outlet pesanan (harga per jumlah outlet)"),
  "1 kunjungan rahasia": service("Kunjungan per outlet di paket"),
  "1 kunjungan per outlet": service("Kunjungan per outlet di paket"),
  "Sekitar 30 indikator audit": service("Jumlah pertanyaan kuesioner yang ditetapkan admin"),
  "Sekitar 50–70 indikator audit": service("Jumlah pertanyaan kuesioner yang ditetapkan admin"),
  "Sapaan dan sikap pelayanan": report("Sapaan dan sikap pelayanan"),
  "Pengetahuan produk": report("Pengetahuan produk"),
  "Ketepatan pesanan": report("Ketepatan pesanan"),
  "Kecepatan pelayanan": report("Kecepatan pelayanan"),
  "Kebersihan dan suasana": report("Kebersihan dan suasana"),
  "Upselling dan closing": report("Upselling dan closing"),
  "Skor CX keseluruhan": report("Skor CX keseluruhan"),
  "3–5 temuan utama": report("Temuan utama"),
  "Rekomendasi cepat": report("Rekomendasi"),
  "Laporan audit PDF": service("Tombol Unduh PDF di halaman laporan"),
  "Debrief hasil 15 menit": service("Sesi konsultasi gratis setelah laporan terbit"),
  "Biaya pembelian hingga Rp150.000 per kunjungan": service("Batas reimburse pembelian shopper"),
  "Semua area penilaian Essential": report("Skor per area penilaian"),
  "Pemeriksaan kepatuhan SOP": report("Kepatuhan SOP"),
  "Evaluasi customer journey": report("Customer journey"),
  "Bukti dan dokumentasi": report("Bukti kunjungan"),
  // Label tingkat keparahan di setiap temuan (Kritis, Sedang, Ringan).
  "Klasifikasi tingkat keparahan": report("Sedang"),
  "Analisis gap": report("Analisis gap"),
  "5–10 temuan prioritas": report("Temuan utama"),
  "Rekomendasi yang bisa dijalankan": report("Rekomendasi"),
  "Ringkasan manajemen": report("Ringkasan manajemen"),
  "Laporan audit lengkap": report("Skor 0–100"),
  "Konsultasi 30 menit": service("Sesi konsultasi gratis setelah laporan terbit"),
  "Konsultasi 60 menit": service("Sesi konsultasi gratis setelah laporan terbit; review manajemen dilakukan di sesi ini"),
  "Semua fitur Insight": report("Kepatuhan SOP"),
  "Audit multi-outlet": report("Peringkat outlet"),
  "Perbandingan antar cabang": report("Peringkat outlet"),
  "Peringkat outlet": report("Peringkat outlet"),
  // Kolom SOP di peta skor outlet.
  "Perbandingan kepatuhan SOP": report(">SOP<"),
  "Benchmark CX": service("Halaman Benchmark outlet: peta skor outlet × area, juga di Peringkat outlet laporan"),
  "Identifikasi red flag": report("Red flag"),
  "Pola antar outlet": report("Pola antar outlet"),
  "Rekomendasi untuk manajemen": report("Rekomendasi untuk manajemen"),
  "Ringkasan eksekutif": report("Ringkasan eksekutif"),
};
