# Daftar uji coba silentCX

Centang setiap baris setelah dicoba. Kalau ada yang tidak sesuai, catat langkahnya dan apa yang terlihat.

## Fase 0: Fondasi

Persiapan: ikuti [SETUP.md](SETUP.md) langkah 1 sampai 6, lalu buka `http://localhost:3000`.

### A. Halaman publik

- [ ] Landing page tampil dengan pita kuning-hitam di atas, judul besar, dan dua tombol daftar.
- [ ] Tombol **ID | EN** mengganti bahasa seluruh halaman.
- [ ] Tombol **Gelap | Terang** mengganti tema, dan pilihan tetap tersimpan setelah halaman dimuat ulang.
- [ ] Di HP, semua halaman bisa dibaca tanpa geser ke samping.

### B. Pendaftaran

- [ ] **Daftar sebagai pemilik bisnis** dengan email baru → langsung masuk ke dashboard client dengan tahap **Calon client**.
- [ ] Mendaftar dengan email yang sudah terdaftar → muncul pesan "Email ini sudah terdaftar".
- [ ] Password tanpa angka atau kurang dari 8 karakter → ditolak dengan pesan yang jelas.
- [ ] Nomor WhatsApp berisi huruf → ditolak.
- [ ] **Jadi mystery shopper** dengan email baru → masuk ke layar "Lamaran Anda sedang ditinjau".

### C. Login dan penjagaan role

- [ ] Masuk sebagai `client@silentcx.demo` → ke `/app`.
- [ ] Sebagai client, buka `/admin` atau `/shopper` → dikembalikan ke `/app`.
- [ ] Masuk sebagai `pelamar@silentcx.demo` → layar seleksi. Menu **Tugas**, **Riwayat & QC**, dan **Pembayaran** diberi tanda terkunci; membukanya menampilkan "Menu ini terbuka setelah lamaran disetujui".
- [ ] Masuk sebagai `shopper@silentcx.demo` → dashboard shopper aktif, milestone di **Terima tugas**.
- [ ] Masuk sebagai `admin@silentcx.demo` → **Antrian kerja**, kartu "Shopper menunggu seleksi" menunjukkan jumlah pelamar.
- [ ] Tanpa login, buka `http://localhost:3000/admin` → diarahkan ke halaman Masuk. Setelah login sebagai admin, langsung kembali ke halaman yang tadi diminta.
- [ ] Menu yang belum dibangun menampilkan "Hadir di Fase N".

### D. Seleksi dan penangguhan akun (admin)

- [ ] Di **Akun** → tab **Shopper menunggu seleksi**, klik **Setujui** pada pelamar. Masuk sebagai pelamar itu → dashboard aktif dan menu Tugas terbuka.
- [ ] Klik **Tolak** pada pelamar lain → alasan wajib diisi. Pelamar melihat alasan itu di berandanya.
- [ ] Klik **Tangguhkan** pada client → alasan wajib diisi. Client yang sedang login dikeluarkan saat membuka halaman berikutnya, dan tidak bisa masuk lagi ("Akun Anda sedang ditangguhkan").
- [ ] **Aktifkan kembali** client tersebut → client bisa masuk lagi.
- [ ] Akun admin tidak punya tombol aksi di daftar Akun.

### E. Keamanan (sudah diuji otomatis)

Bagian ini sudah dijamin oleh tes otomatis (`npm test`); tidak perlu dicoba manual:

- User tidak bisa mengubah role atau status akunnya sendiri, termasuk lewat browser console.
- Pendaftaran dengan metadata `admin` tetap menjadi client.
- Client hanya bisa membaca profilnya sendiri; pengunjung tanpa login tidak bisa membaca profil apa pun.
- Hanya admin aktif yang bisa mengubah status akun, dan setiap perubahan tercatat di log aktivitas.
- Admin tidak bisa mengubah akunnya sendiri atau admin lain.

## Fase 1: Katalog, checkout, dan verifikasi

Persiapan:

1. Jalankan `npm run db:migrate`. Perintah ini memasang tabel katalog dan pesanan, serta membuat bucket `payment-proofs` dan `site-assets`.
2. Masuk sebagai admin, buka **Katalog**:
   - tab **Kota dilayani**: tambahkan kota, misalnya Jakarta;
   - tab **Pembayaran**: isi rekening dan unggah gambar QRIS.

### A. Katalog (admin)

- [ ] Tab **Paket** menampilkan Essential, Insight, dan Performance dengan harga dari sistem lama.
- [ ] Ubah harga Essential, lalu simpan. Harga baru tampil di landing page dan di halaman **Pilih paket** client.
- [ ] Isi promo Insight 20% dengan tanggal mulai kemarin dan selesai besok. Di landing dan checkout, harga normal tampil dicoret dan muncul label −20%.
- [ ] Isi promo tanpa tanggal → muncul pesan bahwa tanggal wajib diisi.
- [ ] Buat paket baru → paket tersimpan dalam keadaan nonaktif dan belum tampil ke client sampai diaktifkan.
- [ ] Tab **Add-on**: ubah harga atau nonaktifkan add-on. Perubahannya langsung terlihat di checkout.

### B. Pesan paket (client)

- [ ] Di landing page, klik **Pilih paket** pada Insight tanpa login → halaman daftar. Setelah daftar, client langsung masuk ke **Pilih paket** dengan Insight terpilih.
- [ ] Pilih Performance → ada pilihan 3, 4, dan 5 outlet dengan harga masing-masing.
- [ ] Centang **Outlet tambahan** → kolom kota bertambah dan total ikut naik.
- [ ] Isi kota yang tidak ada di daftar → muncul peringatan kota belum rutin dilayani dan catatan "akan dikonfirmasi admin dulu".
- [ ] Klik **Buat pesanan** → masuk ke **Tagihan**. Ringkasannya menunjukkan baris paket, add-on, total "sudah termasuk PPN", dan batas bayar 2x24 jam.
- [ ] Coba pesan lagi saat pesanan pertama belum selesai → muncul pesan "masih punya pesanan yang belum selesai".

### C. Bayar dan verifikasi

- [ ] Di **Tagihan** tampil nominal tagihan (bisa disalin), QRIS, dan rekening.
- [ ] Unggah foto bukti → status berubah menjadi **Sedang diverifikasi**, dan beranda client menampilkan "Pembayaran sedang diverifikasi".
- [ ] Admin: kartu **Pembayaran menunggu verifikasi** di beranda bertambah. Di **Proyek & verifikasi**, buka pesanan, lalu klik **Lihat file bukti** → file terbuka di tab baru.
- [ ] Klik **Tolak bukti** (alasan wajib) → client melihat alasan itu di Tagihan dan bisa mengunggah ulang.
- [ ] Unggah ulang, lalu admin klik **Pembayaran sesuai, aktifkan proyek** → dashboard client berubah menjadi **Client aktif** dengan ringkasan paket.

### D. Pesanan yang perlu review

- [ ] Pesan dengan add-on **Kuesioner khusus** atau kota di luar daftar → status **Menunggu konfirmasi**; invoice belum bisa dibayar.
- [ ] Admin membuka pesanan di tab **Perlu review**, mengisi harga Kuesioner khusus, lalu klik **Setujui pesanan** → client bisa membayar dengan total baru.
- [ ] Admin klik **Batalkan pesanan** dengan alasan → client melihat alasan itu dan bisa memesan lagi.

### E. Setelah aktif

- [ ] Menu **Benchmark outlet** hanya terbuka untuk paket Performance, dan **Benchmark kompetitor** hanya kalau add-on itu dibeli. Selain itu kedua menu tampil terkunci.
- [ ] **Outlet & data**: isi perusahaan, PIC, serta nama dan alamat setiap outlet. Kota outlet tidak bisa diubah. Klik **Simpan dan tandai lengkap** → beranda menjadi "Audit sedang disiapkan".
- [ ] Tandai lengkap dengan alamat kosong → ditolak dengan pesan yang jelas.

### F. Kedaluwarsa

- [ ] Invoice yang tidak dibayar dalam 2x24 jam menjadi **Kedaluwarsa**, dan client bisa memesan ulang.

Bagian ini sudah diuji otomatis dengan 29 tes database: harga per outlet, promo, add-on, kota, review, verifikasi, kedaluwarsa, dan akses antar client.
