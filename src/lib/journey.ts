// Referensi customer journey per jenis usaha untuk admin. Sama dengan contoh tahap yang diisi migrasi
// 20261030000014_report_features.sql; admin bebas mengubah tahap di database, referensi ini tetap sebagai pegangan.
// Aman dipakai di server maupun browser.

export type JourneyStage = {
  id: string;
  business_type: string;
  position: number;
  title: string;
  hint: string;
};
export type JourneyReference = {
  tip: string;
  stages: { title: string; hint: string }[];
};

const GENERAL_TIP =
  "Urutkan tahap sesuai pengalaman pelanggan dari datang sampai pulang, 4–7 tahap. Setiap pertanyaan yang dinilai sebaiknya masuk ke satu tahap supaya laporan bisa menunjukkan di titik mana pengalaman pelanggan melemah.";

export const JOURNEY_REFERENCE: Record<string, JourneyReference> = {
  fnb: {
    tip: "Untuk kafe dan restoran, waktu tunggu dan ketepatan pesanan biasanya paling menentukan. Pisahkan Menunggu pesanan dari Penyajian supaya keduanya terbaca.",
    stages: [
      {
        title: "Kedatangan dan sapaan",
        hint: "Disambut, diarahkan ke meja atau antrean, waktu sampai disapa.",
      },
      {
        title: "Pemesanan",
        hint: "Penjelasan menu, rekomendasi, upselling, ketepatan pencatatan.",
      },
      {
        title: "Menunggu pesanan",
        hint: "Waktu tunggu, informasi keterlambatan, kebersihan area duduk.",
      },
      {
        title: "Penyajian dan konsumsi",
        hint: "Kesesuaian pesanan, suhu, tampilan, rasa, pengecekan oleh staf.",
      },
      {
        title: "Pembayaran",
        hint: "Kecepatan kasir, ketepatan tagihan, pilihan pembayaran, struk.",
      },
      { title: "Kepergian", hint: "Ucapan terima kasih, ajakan datang lagi." },
    ],
  },
  retail: {
    tip: "Di toko, momen konsultasi dan kasir paling sering jadi pembeda. Tahap Mencoba produk bisa dihapus kalau tidak relevan.",
    stages: [
      {
        title: "Masuk toko dan sapaan",
        hint: "Waktu sampai disapa, kerapian pintu masuk.",
      },
      {
        title: "Menjelajah produk",
        hint: "Kerapian rak, label harga, ketersediaan ukuran atau stok.",
      },
      {
        title: "Konsultasi dan rekomendasi",
        hint: "Pertanyaan kebutuhan, pengetahuan produk, saran alternatif.",
      },
      {
        title: "Mencoba produk",
        hint: "Fitting room, demo, bantuan selama mencoba.",
      },
      {
        title: "Kasir dan pembayaran",
        hint: "Antrean, tawaran tambahan, member, ketepatan transaksi.",
      },
      {
        title: "Purnajual dan salam",
        hint: "Info garansi atau penukaran, ucapan terima kasih.",
      },
    ],
  },
  hospitality: {
    tip: "Untuk hotel, check-in dan respons permintaan selama menginap paling diingat tamu. Reservasi bisa diamati lewat telepon atau situs.",
    stages: [
      {
        title: "Reservasi",
        hint: "Kemudahan pemesanan, konfirmasi, kejelasan harga.",
      },
      {
        title: "Check-in",
        hint: "Waktu tunggu, sapaan, penjelasan fasilitas.",
      },
      {
        title: "Kamar dan fasilitas",
        hint: "Kebersihan, kelengkapan, fungsi perangkat.",
      },
      {
        title: "Layanan selama menginap",
        hint: "Respons permintaan, room service, restoran.",
      },
      {
        title: "Check-out",
        hint: "Kecepatan, ketepatan tagihan, ajakan kembali.",
      },
    ],
  },
  banking: {
    tip: "Untuk bank, kepatuhan SOP (sapaan baku, verifikasi identitas, transparansi biaya) biasanya jadi fokus utama.",
    stages: [
      {
        title: "Kedatangan dan keamanan",
        hint: "Sapaan satpam, arahan ke layanan yang tepat.",
      },
      {
        title: "Antrean",
        hint: "Sistem nomor, waktu tunggu, kenyamanan ruang tunggu.",
      },
      {
        title: "Layanan teller atau CS",
        hint: "Sapaan baku, verifikasi identitas, ketepatan transaksi.",
      },
      {
        title: "Penjelasan produk",
        hint: "Pengetahuan produk, transparansi biaya, tawaran yang sesuai.",
      },
      { title: "Penutupan", hint: "Konfirmasi kebutuhan lain, salam penutup." },
    ],
  },
  automotive: {
    tip: "Untuk dealer, tawaran test drive dan tindak lanjut setelah kunjungan sering terlewat. Catat apakah sales menghubungi kembali.",
    stages: [
      {
        title: "Kedatangan dan sambutan",
        hint: "Waktu sampai disambut, parkir, ruang tunggu.",
      },
      {
        title: "Identifikasi kebutuhan",
        hint: "Pertanyaan kebutuhan, anggaran, penggunaan.",
      },
      {
        title: "Presentasi produk",
        hint: "Penjelasan fitur, perbandingan tipe, brosur.",
      },
      {
        title: "Test drive",
        hint: "Tawaran test drive, pendampingan, keamanan.",
      },
      {
        title: "Penawaran dan negosiasi",
        hint: "Simulasi harga atau kredit, promo, kejelasan biaya.",
      },
      {
        title: "Tindak lanjut",
        hint: "Kontak setelah kunjungan, janji temu berikutnya.",
      },
    ],
  },
  health: {
    tip: "Untuk klinik, pastikan pertanyaan tidak membuat shopper menjalani tindakan medis sungguhan. Fokus pada pendaftaran, penjelasan, dan privasi.",
    stages: [
      {
        title: "Pendaftaran",
        hint: "Kemudahan daftar, kejelasan biaya, waktu tunggu.",
      },
      {
        title: "Ruang tunggu",
        hint: "Kebersihan, informasi antrean, kenyamanan.",
      },
      {
        title: "Pemeriksaan",
        hint: "Sikap tenaga medis, penjelasan diagnosis, privasi.",
      },
      {
        title: "Farmasi dan pembayaran",
        hint: "Penjelasan obat, ketepatan tagihan.",
      },
      {
        title: "Kepulangan dan tindak lanjut",
        hint: "Jadwal kontrol, kontak darurat, salam.",
      },
    ],
  },
  beauty: {
    tip: "Untuk salon dan klinik kecantikan, konsultasi sebelum perawatan dan kebersihan alat paling berpengaruh pada kepercayaan.",
    stages: [
      {
        title: "Reservasi dan kedatangan",
        hint: "Kemudahan booking, ketepatan jadwal, sapaan.",
      },
      {
        title: "Konsultasi kebutuhan",
        hint: "Pertanyaan kondisi, rekomendasi perawatan, harga.",
      },
      {
        title: "Perawatan",
        hint: "Kebersihan alat, kenyamanan, keahlian terapis.",
      },
      {
        title: "Rekomendasi produk",
        hint: "Tawaran produk perawatan rumah yang relevan.",
      },
      {
        title: "Pembayaran dan janji berikutnya",
        hint: "Ketepatan tagihan, tawaran jadwal berikutnya.",
      },
    ],
  },
  telco: {
    tip: "Untuk gerai telekomunikasi, transparansi biaya paket dan uji aktivasi sebelum pelanggan pulang paling sering bermasalah.",
    stages: [
      {
        title: "Kedatangan dan antrean",
        hint: "Sapaan, sistem antrean, waktu tunggu.",
      },
      {
        title: "Identifikasi kebutuhan",
        hint: "Pertanyaan pemakaian, keluhan, kebutuhan paket.",
      },
      {
        title: "Penjelasan produk atau paket",
        hint: "Perbandingan paket, transparansi biaya, promo.",
      },
      {
        title: "Transaksi dan aktivasi",
        hint: "Kecepatan proses, verifikasi data, uji aktivasi.",
      },
      { title: "Penutupan", hint: "Info layanan purnajual, salam penutup." },
    ],
  },
  other: {
    tip: "Untuk jenis usaha lain, mulai dari alur umum ini lalu sesuaikan dengan layanan inti client.",
    stages: [
      { title: "Kedatangan", hint: "Sapaan pertama dan arahan." },
      {
        title: "Layanan inti",
        hint: "Pemahaman kebutuhan dan penyampaian layanan.",
      },
      { title: "Pembayaran", hint: "Ketepatan dan kecepatan transaksi." },
      { title: "Kepergian", hint: "Ucapan terima kasih dan ajakan kembali." },
    ],
  },
};

export function journeyReference(type: string): JourneyReference {
  return (
    JOURNEY_REFERENCE[type] ?? {
      tip: GENERAL_TIP,
      stages: JOURNEY_REFERENCE.other.stages,
    }
  );
}

export const JOURNEY_GENERAL_TIP = GENERAL_TIP;
