# Daftar uji coba silentCX

Centang setiap baris setelah dicoba. Kalau ada yang tidak sesuai, catat langkahnya dan apa yang terlihat.

## Data contoh

Supaya setiap tahap bisa langsung dicoba tanpa membuat rantainya dari nol, jalankan `npm run demo:data`. Perintah ini membuat 5 client (invoice belum dibayar, bukti bayar menunggu verifikasi, audit berjalan, draf laporan siap terbit, laporan terbit dengan tagihan tambahan), 3 shopper aktif, 2 pelamar, serta payout dalam batas waktu, lewat 48 jam, menunggu rekening, dan sudah dibayar. Semua akun beremail `data-…@silentcx.demo` dengan satu password yang tampil di terminal. Rekening, QRIS, dan kontak admin diisi contoh hanya kalau masih kosong. Hapus semuanya dengan `npm run demo:data -- --hapus`.

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

## Fase 2: Lamaran dan seleksi shopper

Persiapan:

1. Jalankan `npm run db:migrate`. Perintah ini memasang tabel lamaran, notifikasi, dan rekening shopper.
2. Pastikan ada minimal satu kota di **Katalog → Kota dilayani**. Pelamar hanya bisa memilih kota dari daftar ini.
3. Jalankan `npm run demo:akun`. Akun yang sudah ada tidak diubah; `shopper@silentcx.demo` diberi lamaran contoh yang sudah disetujui.

### A. Mengisi lamaran (pelamar)

- [ ] Masuk sebagai `pelamar@silentcx.demo` → beranda "Lengkapi lamaran Anda", dengan catatan bahwa KTP dan selfie tidak diminta.
- [ ] Buka **Profil & lamaran**. Isi tanggal lahir, gender, domisili, kendaraan, kota yang bisa dijangkau, pekerjaan, pengalaman, dan industri yang diminati.
- [ ] Klik **Simpan draft**, muat ulang halaman → isian masih ada.
- [ ] Tanggal lahir kurang dari 18 tahun → lamaran ditolak saat dikirim dengan pesan yang jelas.
- [ ] Klik **Lanjut ke kuis** → 5 soal etika dan pakta kerahasiaan tampil. Tombol **Kirim lamaran** baru aktif setelah semua soal dijawab dan pakta dicentang.
- [ ] Jawab salah satu soal dengan keliru → muncul "4 dari 5 jawaban benar", lamaran belum terkirim.
- [ ] Jawab semua dengan benar → lamaran terkirim, halaman menampilkan isi lamaran dan "Sedang ditinjau". Beranda menampilkan "Lamaran Anda sedang ditinjau".
- [ ] Menu **Tugas**, **Riwayat & QC**, dan **Pembayaran** tetap terkunci.

### B. Antrian seleksi (admin)

- [ ] Kartu **Shopper menunggu seleksi** di beranda admin hanya menghitung lamaran yang sudah dikirim, bukan draft.
- [ ] **Akun → Lamaran masuk** menampilkan isi lamaran lengkap: kota dijangkau, usia, gender, pekerjaan, kendaraan, pengalaman, industri, waktu kirim, dan jumlah percobaan kuis.
- [ ] Pilih kota di filter **Kota** → hanya lamaran yang menjangkau kota itu yang tampil.
- [ ] Pelamar yang belum mengirim lamaran tampil di bagian **Belum mengirim lamaran**, tanpa tombol keputusan.
- [ ] Klik **Tolak** → alasan wajib diisi. Pelamar melihat alasannya, tanggal boleh melamar lagi (30 hari), dan notifikasi di beranda.
- [ ] Pelamar yang ditolak membuka **Profil & lamaran** sebelum 30 hari → hanya melihat alasan dan tanggal, tanpa formulir.
- [ ] Klik **Setujui** pada lamaran lain → pelamar menjadi aktif, menu Tugas terbuka, dan beranda menampilkan notifikasi "Lamaran Anda disetujui".
- [ ] Tab **Mystery shopper** dengan filter kota → hanya shopper aktif yang menjangkau kota itu (pool per kota). Kolom **Jangkauan** menunjukkan kotanya.
- [ ] Shopper aktif masih bisa **Tangguhkan** (alasan wajib) dan **Aktifkan kembali**. Pelamar tidak punya tombol di tab ini; keputusannya lewat Lamaran masuk.

### C. Setelah disetujui (shopper)

- [ ] Beranda meminta **Isi rekening**. Di **Profil & lamaran**, isi nama bank, nomor rekening, dan nama pemilik → "Rekening tersimpan".
- [ ] Nomor rekening berisi huruf → ditolak.
- [ ] **Tandai sudah dibaca** pada notifikasi → label "Baru" hilang.
- [ ] Masuk sebagai `shopper@silentcx.demo` → Profil & lamaran menampilkan lamaran contoh yang disetujui.

Bagian ini juga sudah diuji otomatis dengan 28 tes database: kota harus dari daftar, kelengkapan dan usia, kuis dan pakta, keputusan admin, log aktivitas, notifikasi, aturan 30 hari, rekening, dan siapa melihat apa. Uji ujung-ke-ujung di browser ada di `tests/e2e/fase2-flow.mjs`; uji ini menulis data sementara lalu menghapusnya.

## Fase 3: Kuesioner, penjadwalan, dan kunjungan

Persiapan:

1. Jalankan `npm run db:migrate`. Perintah ini memasang tabel kuesioner dan tugas, template awal "Kafe & restoran — dasar", serta bucket privat `audit-evidence`.
2. Siapkan satu proyek **aktif** yang data outletnya sudah ditandai lengkap (alur Fase 1), dan satu shopper aktif yang menjangkau kota outlet itu (alur Fase 2, atau `shopper@silentcx.demo`).
3. Untuk check-in, buka aplikasi dari HP di Chrome atau Safari (bukan dari dalam Instagram), lewat alamat https. Di laptop, lokasi juga bisa dicoba di `localhost`.

### A. Kuesioner (admin)

- [ ] **Kuesioner** menampilkan template "Kafe & restoran — dasar" dengan label **Siap dipakai**.
- [ ] Buka template, lalu ubah bobot satu bagian → chip total bobot berubah, dan muncul peringatan "Total bobot …, harus 100". Kembalikan bobotnya.
- [ ] Tandai pertanyaan ketiga sebagai **Wajib foto** dengan batas 5 foto → muncul peringatan jatah foto (maksimal 3). Lepas lagi tandanya.
- [ ] Tambah bagian dan pertanyaan, geser urutannya dengan ↑ ↓, lalu hapus.
- [ ] **Salin** membuat salinan nonaktif yang bisa diubah untuk client tertentu.
- [ ] **Pengaturan lapangan**: fee Rp150.000, maksimal 3 tugas aktif, dan batas respons 24 jam tersimpan.

### B. Penjadwalan (admin, di halaman proyek)

- [ ] Proyek aktif menampilkan bagian **Penjadwalan kunjungan**. Tetapkan kuesioner → muncul nama dan waktu penetapannya.
- [ ] **+ Tugas kunjungan** → fee dan batas reimburse terisi otomatis. Isi jendela tanggal (dan jam, kalau perlu), skenario, dan pembelian wajib, lalu **Buat tugas**.
- [ ] **Tawarkan ke** mengurutkan shopper yang menjangkau kota outlet di atas. Shopper yang penuh atau sudah pernah ke outlet itu tidak bisa dipilih.
- [ ] Centang **Segera** → batas jawab otomatis menjadi 2 jam. Tawarkan.
- [ ] **Follow up via WhatsApp** membuka chat ke nomor shopper. Pesannya hanya berisi kode tugas, kota, batas jawab, dan tautan, tanpa nama outlet atau client.
- [ ] **Tarik tawaran** mengembalikan tugas ke "Belum ada shopper", dan shopper mendapat notifikasi.
- [ ] Tawaran yang lewat batas jawab otomatis kembali ke "Belum ada shopper".

### C. Kunjungan (shopper, dari HP)

- [ ] Beranda dan notifikasi menampilkan tawaran, dengan tanda **Segera** kalau ada. **Buka tugas** menampilkan brief: outlet, jendela, fee, batas reimburse, skenario, pembelian wajib, dan aturan kelebihan pembelian.
- [ ] Sebelum menerima, kuesioner belum terlihat. **Terima tugas** → muncul langkah check-in.
- [ ] Check-in di luar jendela tanggal atau jam → ditolak dengan tanggal dan jam yang benar.
- [ ] **Ambil lokasi saya** → browser meminta izin lokasi. Kalau izin ditolak, muncul petunjuk.
- [ ] Ambil 1 foto di dalam outlet, lalu **Check-in** → kuesioner terbuka.
- [ ] Jawab beberapa pertanyaan, tutup halaman, lalu buka lagi → jawaban masih ada ("Tersimpan otomatis").
- [ ] **Tidak teramati** bisa dipilih untuk pertanyaan apa pun.
- [ ] Pertanyaan **Wajib foto** meminta foto. Jumlah foto terpakai tampil di atas; setelah batas tercapai, tombol foto nonaktif.
- [ ] Isi total pembelian di atas batas reimburse → muncul peringatan bahwa selisihnya diperiksa saat QC.
- [ ] **Kirim hasil kunjungan** dengan pertanyaan yang belum dijawab → ditolak dengan jumlahnya. Kalau ada pembelian, tanpa struk juga ditolak.
- [ ] Setelah terkirim, isian terkunci dan status menjadi **Menunggu QC**.

### D. Setelah kunjungan

- [ ] Admin melihat peta titik check-in, akurasi GPS, foto check-in, alamat, dan link Maps dari client, lalu menandai **Sesuai** atau **Tidak sesuai**.
- [ ] Admin melihat skor sementara, nominal pembelian, selisih di atas batas, serta tombol foto struk dan bukti.
- [ ] Kartu **Submission menunggu QC** di beranda admin bertambah.
- [ ] Client membuka **Audit berjalan** → progres per outlet tanpa tanggal kunjungan atau nama shopper. Kunjungan yang sedang berlangsung tetap tampil "Dijadwalkan".

Bagian ini juga sudah diuji otomatis dengan 28 tes database: bobot dan jatah foto kuesioner, salinan terkunci, tawaran dan kedaluwarsa, batas tugas aktif, check-in, validasi jawaban, batas foto, skor, kerahasiaan client dan shopper, serta log aktivitas. Uji ujung-ke-ujung di browser ada di `tests/e2e/fase3-flow.mjs`; uji ini menulis data sementara lalu menghapusnya.

## Fase 4: QC, laporan, dan benchmark kompetitor

Persiapan:

1. Jalankan `npm run db:migrate`. Perintah ini memasang dua migrasi baru: status QC, serta tabel laporan, revisi, kompetitor, dan tagihan tambahan.
2. Siapkan satu proyek aktif dengan kunjungan yang sudah dikirim shopper (alur Fase 3). Untuk mencoba benchmark kompetitor, pesan paket Insight atau Performance dengan add-on **Benchmark kompetitor**.

### A. Kompetitor (client)

- [ ] Di **Outlet & data**, muncul bagian **Kompetitor untuk benchmark** sesuai jumlah add-on, dengan keterangan bahwa foto kunjungan ke kompetitor tidak ditampilkan di laporan.
- [ ] Isi nama, kota, dan alamat kompetitor, lalu pilih outlet pasangan (opsional) → "Kompetitor tersimpan".
- [ ] **Simpan dan tandai lengkap** sebelum kompetitor diisi → ditolak dengan pesan "Isi 1 kompetitor…".
- [ ] Admin melihat kompetitor bertanda **Kompetitor** di halaman proyek dan bisa menjadwalkannya. Shopper melihatnya seperti outlet biasa.

### B. QC (admin)

- [ ] **Quality control** menampilkan antrian kunjungan yang menunggu QC, urut dari yang paling lama, beserta tanda revisi dan kelebihan pembelian.
- [ ] Buka satu kunjungan → jawaban per pertanyaan tampil di samping foto bukti, struk, peta titik check-in, dan alamat dari client.
- [ ] Centang **Minta revisi** pada satu pertanyaan, isi catatan, lalu kirim → status menjadi **Revisi**, dan shopper mendapat notifikasi dengan batas 24 jam.
- [ ] **Follow up revisi via WhatsApp** membuka chat ke shopper.
- [ ] Setelah 2 putaran revisi, tombol **Minta revisi** nonaktif.
- [ ] Revisi yang tidak dikirim dalam 24 jam kembali ke antrian dengan tanda "Revisi tidak dikirim".
- [ ] **Setujui** → kunjungan "Lolos QC". Kalau ada kelebihan pembelian, centang persetujuannya.
- [ ] **Tolak** → pilih "Tidak dibayar" atau "Hanya reimburse", isi alasan, dan biarkan "Buat tugas pengganti" tercentang → tugas baru muncul di halaman proyek.

### C. Revisi dan riwayat (shopper)

- [ ] Notifikasi revisi membuka tugas. Hanya pertanyaan yang ditandai yang tampil, dengan catatan admin dan batas waktu.
- [ ] Ubah jawaban, lalu **Kirim revisi** → status kembali "Menunggu QC".
- [ ] **Riwayat & QC** menampilkan kunjungan yang lolos atau ditolak, keputusan fee, dan catatan admin. Skor tidak ditampilkan ke shopper.

### D. Laporan (admin)

- [ ] **Laporan** menampilkan proyek beserta jumlah outlet yang sudah punya kunjungan lolos QC.
- [ ] Buka satu proyek → ringkasan dan temuan terisi otomatis dari skor. Tambah atau ubah temuan dan rekomendasi, lalu pilih foto bukti (foto kompetitor dan foto check-in tidak muncul).
- [ ] **Simpan draf**, lalu **Pratinjau PDF** → PDF bertanda "DRAF, BELUM TERBIT".
- [ ] Selama ada outlet tanpa kunjungan lolos QC atau kunjungan yang masih menunggu QC, tombol **Terbitkan ke client** nonaktif dan alasannya tampil.
- [ ] **Terbitkan ke client** → proyek menjadi Selesai. Kalau ada kelebihan pembelian yang disetujui, tagihan tambahan dibuat.

### E. Client

- [ ] Beranda menampilkan "Laporan audit sudah terbit" dan notifikasinya.
- [ ] **Laporan** menampilkan skor, area penilaian, outlet, temuan, rekomendasi, foto pilihan, dan benchmark kompetitor sesuai paket. **Unduh PDF** mengunduh file PDF.
- [ ] Calon client tanpa laporan bisa membuka **Unduh contoh laporan (PDF)**.
- [ ] **Tagihan** menampilkan **Tagihan tambahan** kelebihan pembelian, bisa dibayar dengan cara yang sama, dan diverifikasi admin tanpa mengubah status proyek.
- [ ] Setiap invoice punya tombol **Unduh PDF**.

Bagian ini juga sudah diuji otomatis dengan 17 tes database: jumlah kompetitor, QC dan revisi, kedaluwarsa revisi, penolakan dan tugas pengganti, angka laporan, foto yang boleh masuk laporan, syarat terbit, laporan beku, tagihan tambahan, dan hak baca. Uji ujung-ke-ujung di browser ada di `tests/e2e/fase4-flow.mjs`; uji ini menulis data sementara lalu menghapusnya.

## Fase 5: Payout shopper

Persiapan:

1. Jalankan `npm run db:migrate`. Perintah ini memasang migrasi payout dan membuat bucket `payout-proofs` untuk bukti transfer.
2. Siapkan beberapa kunjungan yang sudah diputuskan QC (alur Fase 4): satu disetujui, satu disetujui dengan kelebihan pembelian, dan satu ditolak dengan "Hanya reimburse". Agar bisa mencoba "Menunggu rekening", sertakan satu shopper yang belum mengisi rekening.

### A. Kontak admin (admin)

- [ ] Di **Keuangan**, bagian **Kontak untuk shopper**: isi nama kontak person dan nomor WhatsApp, lalu simpan.

### B. Antrian payout (admin)

- [ ] **Keuangan** menampilkan tiga ringkasan: jumlah yang lewat 48 jam, jumlah tugas belum dibayar, dan total yang siap ditransfer.
- [ ] Antrian dikelompokkan per shopper dan diurutkan dari yang paling mendesak. Setiap tugas menampilkan fee, reimburse, batas waktu, dan sisa jamnya.
- [ ] Nominal tugas yang disetujui adalah fee ditambah pembelian sampai batas reimburse. Kalau kelebihan pembelian disetujui, yang dihitung seluruh pembelian. Kunjungan yang ditolak dengan "Hanya reimburse" hanya membawa reimburse, dan yang ditolak "Tidak dibayar" tidak muncul.
- [ ] Shopper tanpa rekening bertanda **Menunggu rekening**, dan tombol **Ingatkan via WhatsApp** tersedia. Setelah shopper mengisi rekening, batasnya menjadi 48 jam sejak rekening diisi.
- [ ] Tugas yang lewat 48 jam ditandai merah di Keuangan dan di kartu **Payout belum dibayar** di Antrian kerja.
- [ ] Pilih satu atau beberapa tugas dari satu shopper → total transfer menyesuaikan. Unggah bukti transfer, lalu **Tandai sudah ditransfer** → tugasnya hilang dari antrian dan muncul di **Sudah dibayar** dengan kode PAY-xxxx.
- [ ] Di **Sudah dibayar**, **Lihat bukti** membuka bukti transfer. **Ganti bukti** meminta file baru dan alasan, lalu memberi tanda "Bukti diganti".

### C. Pembayaran (shopper)

- [ ] Shopper mendapat notifikasi **Pembayaran PAY-xxxx sebesar … sudah ditransfer**, dan tautannya membuka **Pembayaran**.
- [ ] **Pembayaran** menampilkan yang menunggu ditransfer beserta batas waktunya, serta yang sudah ditransfer: total, rekening tujuan, rincian per tugas, dan tombol **Lihat bukti transfer**.
- [ ] Tombol **Hubungi (nama kontak)** membuka WhatsApp ke kontak admin dengan pesan berisi kode dan nominal pembayaran, tanpa nomor rekening.
- [ ] Shopper tanpa rekening melihat peringatan **Rekening belum diisi** dan mendapat notifikasi untuk mengisinya.
- [ ] Shopper lain tidak bisa melihat pembayaran dan bukti milik shopper ini.

Bagian ini juga sudah diuji otomatis dengan 14 tes database: nominal per tugas, menunggu rekening dan notifikasinya, batas 48 jam dan tanda lewat batas, transfer kolektif, pembayaran ganda, salinan rekening, log tanpa nomor rekening, penggantian bukti, dan hak baca. Uji ujung-ke-ujung di browser ada di `tests/e2e/fase5-flow.mjs`; uji ini menulis data sementara lalu menghapusnya.

## Perbaikan tampilan, putaran 1

1. **Sidebar.** Buka dashboard role mana saja. Label F1, F3, dan F4 di menu samping sudah tidak ada.
2. **Pop-up notifikasi.** Simpan apa saja, misalnya kontak admin di Keuangan. Pesan berhasil muncul sebagai pop-up di pojok kanan bawah lalu hilang sendiri setelah 4 detik. Coba juga login dengan password salah: pop-up error muncul, dan pesannya tetap tertulis di form.
3. **Baris proyek bisa diklik penuh.** Di Proyek & verifikasi, klik di mana saja pada baris proyek (nama client, paket, total) untuk membuka detailnya, tidak harus di kode proyek.
4. **PDF invoice.** Unduh PDF invoice. Tulisan "INVOICE" dan nomor invoice tidak lagi bertumpuk.
5. **Skala 1–5.** Di form kunjungan shopper, tiap angka punya keterangan: 1 Sangat buruk, 2 Buruk, 3 Cukup, 4 Baik, 5 Sangat baik. Di halaman QC admin, jawaban skala tampil seperti "4 dari 5 (Baik)".
6. **Jadwal kunjungan.** Di detail proyek, tiap tugas menampilkan Jadwal, Fee shopper, Batas reimburse, dan Pembelian wajib dalam kolom. Form brief (Ubah brief atau + Tugas kunjungan) dikelompokkan menjadi Tanggal, Jam (opsional), dan Biaya, dengan kotak isian yang sejajar.

## Perbaikan tampilan, putaran 2

1. **Lebar penuh.** Buka halaman mana saja di layar laptop. Isi halaman memenuhi lebar layar, dan sisi kanan tidak lagi kosong.
2. **Detail proyek dengan tab.** Buka satu proyek di Proyek & verifikasi. Halamannya terbagi menjadi tab **Ringkasan**, **Outlet**, **Jadwal kunjungan**, dan **Pembayaran**.
   - Proyek aktif langsung terbuka di tab Jadwal kunjungan.
   - Proyek yang perlu direview atau diverifikasi terbuka di Ringkasan, dan tabnya diberi angka 1.
   - Invoice dan riwayat bukti bayar ada di tab Pembayaran, tidak terpotong lagi.
   - Pilihan **Tawarkan ke** di jadwal kunjungan terbaca penuh.
3. **Keuangan dengan tab.** Keuangan terbagi menjadi **Antrian payout**, **Sudah dibayar**, dan **Kontak untuk shopper**.
   - Antrian hanya menampilkan satu baris per shopper: rekening, jumlah tugas, batas bayar, dan total.
   - Klik baris untuk membuka halaman shopper itu. Di sana ada rincian tugas dan form **Tandai sudah ditransfer**.
   - Setelah ditransfer, shopper itu hilang dari antrian dan muncul di Sudah dibayar.
4. **QC dengan tab.** Quality control terbagi menjadi **Menunggu QC** dan **Menunggu revisi shopper**, masing-masing dengan jumlahnya.
5. **Lamaran shopper ringkas.** Di Akun → Lamaran masuk, setiap lamaran tampil sebagai satu baris: nama, domisili, jangkauan, dan tanggal kirim.
   - Klik baris untuk membuka isi lamaran lengkap beserta tombol **Setujui** dan **Tolak**.
   - Setelah diputuskan, admin kembali ke daftar lamaran.
6. **Tab yang seragam.** Tab di Akun, Katalog, dan Proyek & verifikasi memakai gaya garis bawah yang sama, dengan angka untuk antrian yang perlu dikerjakan.
7. **Timeline Audit berjalan (client).** Login sebagai client dengan proyek aktif, lalu buka **Audit berjalan**.
   - Ada garis tahapan Pesanan → Pembayaran → Data outlet → Penjadwalan → Kunjungan → QC → Laporan. Tahap yang sudah lewat dicentang, dan tahap saat ini ditandai kuning.
   - Di bawahnya, tiap outlet menampilkan progres "x dari y kunjungan lolos QC" dan statusnya. Nama shopper dan tanggal kunjungan tidak ditampilkan.
   - Di HP, timeline tampil vertikal.
8. **Beranda admin.** Kotak Milestone di bawah antrian kerja sudah tidak ada. Menu yang belum dibangun, misalnya Konsultasi, bertuliskan "Segera hadir" tanpa nomor fase.

Uji e2e `tests/e2e/fase2-flow.mjs` dan `tests/e2e/fase5-flow.mjs` sudah disesuaikan dengan halaman detail lamaran dan halaman payout per shopper.

## Putaran 3: dropdown jenis usaha dan kota, contoh laporan

Jalankan `npm run db:migrate` dulu. Migrasi `20261029000009_business_types.sql` membuat daftar jenis usaha, lalu mengubah isian jenis usaha perusahaan yang lama (misalnya "F&B") menjadi pilihan dari daftar.

1. **Jenis usaha diatur admin.** Buka Katalog → tab **Jenis usaha**.
   - Ada 9 jenis bawaan: F&B, Retail, Hospitality/Hotel, Perbankan & Keuangan, Otomotif, Kesehatan & Klinik, Kecantikan & Salon, Telekomunikasi, dan Lainnya.
   - Tambahkan jenis baru, misalnya "Pendidikan". Jenis baru muncul sebelum Lainnya.
   - Ganti namanya, lalu tekan **Simpan**.
   - Tekan **Nonaktifkan**. Jenis itu hilang dari pilihan baru di semua form, tetapi data lama yang memakainya tetap menampilkan namanya.
2. **Dropdown jenis usaha dipakai di tiga tempat:**
   - data perusahaan client (Outlet & data);
   - industri yang diminati di lamaran shopper;
   - jenis bisnis kuesioner, saat membuat baru maupun mengedit.
3. **Dropdown kota.** Pilihannya diambil dari Katalog → Kota dilayani, dan dipakai di:
   - kota tiap outlet saat memesan paket;
   - kota kantor di data perusahaan;
   - kota kompetitor;
   - domisili di lamaran shopper.
4. **Kota lain.** Di dropdown kota, pilih **Kota lain**. Akan muncul kotak untuk mengetik nama kota.
   - Untuk outlet dan kompetitor, muncul keterangan: "Shopper akan kami cari di kota tersebut. Mohon kesediaannya menunggu konfirmasi dari tim SilentCX."
   - Pesanan dengan kota lain tetap masuk antrian **Perlu review** di admin, seperti sebelumnya.
5. **Contoh laporan.** Sebagai calon client, buka Laporan → **Unduh contoh laporan (PDF)**. Laporan memakai nama yang jelas fiktif: PT ABC dengan outlet Cafe 123 Cabang A, B, dan C, serta kompetitor Cafe XYZ.

Bagian ini juga diuji otomatis dengan 9 tes database:
- isi bawaan daftar;
- hak baca dan ubah;
- kode yang tidak bisa diganti;
- nama yang tidak boleh kembar;
- rujukan dari lamaran, kuesioner, dan data perusahaan;
- isian lama yang tetap aman.

Uji e2e fase1, fase2, dan fase4 sudah disesuaikan dengan dropdown kota.

## Putaran 4: CMS halaman publik

Jalankan `npm run db:migrate` dulu. Migrasi `20261029000010_site_content.sql` menyiapkan tempat penyimpanan draf dan versi terbit. Sebelum ada yang diterbitkan, landing page memakai draf isi bawaan yang sudah lengkap.

1. **Landing page baru.** Buka halaman utama tanpa login. Ada 10 bagian:
   - Hero;
   - Masalah yang diselesaikan;
   - Cara kerja (4 langkah);
   - Apa saja yang diaudit;
   - Paket audit (otomatis dari Katalog);
   - Contoh laporan;
   - Mengapa SilentCX;
   - FAQ;
   - Ajakan jadi mystery shopper;
   - Kontak.

   Coba juga di HP dan dalam Bahasa Inggris.
2. **Contoh laporan tanpa login.** Tombol **Unduh contoh laporan (PDF)** membuka PDF berdata fiktif (PT ABC / Cafe 123).
3. **Menu Konten.** Login sebagai admin, lalu buka **Konten**.
   - Klik satu bagian untuk membuka isinya. Setiap teks punya kolom Indonesia dan Inggris. Kolom Inggris yang kosong tampil sebagai versi Indonesia.
   - Tombol ↑ ↓ mengubah urutan bagian. Tombol **Tampil / Disembunyikan** menampilkan atau menyembunyikan bagian itu.
   - Butir daftar (langkah, area audit, alasan, FAQ, dan lainnya) bisa ditambah, dihapus, dan diurutkan.
   - Hero, Contoh laporan, dan Ajakan shopper bisa diberi gambar (JPG, PNG, atau WEBP, maksimal 2 MB).
   - Tab **Info situs** berisi nomor WhatsApp, email, dan Instagram bisnis, judul dan deskripsi untuk Google, serta judul di halaman masuk dan daftar. Kontak yang kosong tidak ditampilkan.
4. **Draf, pratinjau, terbit.**
   - Ubah sesuatu, lalu tekan **Simpan draf**. Halaman utama belum berubah.
   - Tekan **Simpan & pratinjau**. Tab baru menampilkan landing page versi draf dengan pita kuning "Pratinjau draf".
   - Tekan **Terbitkan** dan konfirmasi. Halaman utama langsung berubah.
   - **Buang draf** mengembalikan editor ke versi yang sedang tampil.
   - Kalau ada perubahan yang belum disimpan, browser memperingatkan sebelum halaman ditutup.
5. **Halaman masuk dan daftar.** Judul besar di samping form mengikuti isian di Info situs.

Bagian ini juga diuji otomatis dengan 9 tes database:
- draf belum terlihat pengunjung;
- terbit dan terbit ulang;
- buang draf;
- hanya admin yang bisa membaca draf, menyimpan, atau menerbitkan;
- tabel konten tidak bisa diakses langsung.

Uji e2e `tests/e2e/putaran4-cms.mjs` mengubah konten sebentar, lalu mengembalikannya seperti semula.

## Fase 5: Konsultasi

Persiapan: jalankan `npm run db:migrate`. Jatah sesi muncul otomatis untuk laporan yang sudah terbit, termasuk laporan lama. Jatah berlaku 30 hari sejak laporan terbit, jadi jatah dari laporan lama mungkin sudah kedaluwarsa. Untuk mencoba dari awal, terbitkan laporan proyek Insight atau Performance yang baru.

Aturan:

| Paket | Jatah | Durasi |
|---|---|---|
| Essential | Tidak ada, bisa beli add-on | — |
| Insight | 1 sesi | 30 menit |
| Performance | 1 sesi | 60 menit |
| Add-on Konsultasi tambahan | per sesi | 60 menit |

1. **Admin membuka jadwal kosong.** Buka menu **Konsultasi** → tab **Kalender**.
   - Klik tanggal di kalender, lalu isi form **Buka jadwal kosong** (jam mulai dan selesai, kelipatan 30 menit, WIB).
   - Rentang kosong tampil hijau di kalender. Rentang yang bertumpuk ditolak.
   - Tombol **Hapus** menghapus rentang. Rentang yang masih berisi sesi tidak bisa dihapus.
2. **Client booking.** Login sebagai client yang laporannya sudah terbit, lalu buka **Konsultasi**.
   - Ada daftar jatah sesi beserta batas berlakunya.
   - Tanggal yang punya jam kosong bertanda hijau. Klik tanggalnya, pilih jam mulai, isi topik (opsional), lalu **Booking sesi**.
   - Jam yang ditawarkan menyesuaikan durasi sesi dan paling cepat 24 jam dari sekarang. Jam yang sudah dibooking client lain tidak muncul.
   - Kalau client punya beberapa jatah dengan durasi berbeda, pilih dulu jatah yang mau dipakai.
3. **Kartu sesi terjadwal.** Kartu menampilkan tanggal, jam, durasi, dan topik.
   - Sebelum admin menempelkan link, tertulis "Link meeting dikirim admin sebelum sesi dimulai".
   - **Tambah ke kalender (.ics)** mengunduh undangan untuk Google Calendar atau Outlook.
   - **Geser jadwal** bisa dipakai satu kali, paling lambat 24 jam sebelum sesi.
4. **Admin menempelkan link.**
   - Sesi tanpa link tampil merah di kalender, di tab **Sesi terjadwal**, dan di kartu **Konsultasi tanpa link meeting** di beranda admin.
   - Klik sesinya, tempel link (harus diawali https://), lalu simpan. Client mendapat notifikasi dan tombol **Buka link meeting**.
5. **Admin mengubah atau membatalkan sesi.**
   - **Ubah jadwal** (alasan wajib) boleh di luar jadwal kosong, asal tidak bertumpuk. Kesempatan geser milik client tidak berkurang.
   - **Batalkan sesi** (alasan wajib) mengembalikan jatah ke client dan memperpanjang masa berlakunya minimal 7 hari.
6. **Menutup sesi.** Setelah jam sesi lewat, halaman sesi menampilkan form **Tutup sesi**.
   - **Tandai selesai** wajib diisi ringkasan; action plan opsional.
   - **Client tidak hadir** membuat jatah tetap terpakai.
   - Client membaca ringkasan lewat **Riwayat → Lihat ringkasan**.
7. **Beli sesi tambahan.** Kartu **Konsultasi tambahan** di halaman Konsultasi client.
   - Hanya bisa dibeli setelah laporan proyek terbit.
   - Pilih jumlah sesi lalu **Buat tagihan**. Client diarahkan ke **Tagihan**, dengan batas bayar 2x24 jam dan alur bukti bayar seperti biasa.
   - Admin memverifikasi di **Proyek & verifikasi → Verifikasi bukti**.
   - Setelah lunas, jatah 60 menit bertambah dan berlaku 30 hari sejak pembayaran diverifikasi.
8. **Tab lain admin.** **Jatah belum dibooking** menampilkan client yang belum booking, diurutkan dari yang paling cepat berakhir (kuning kalau kurang dari 7 hari). **Riwayat** berisi sesi yang selesai atau tidak hadir.
9. **Di HP.** Kalender berubah menjadi daftar tanggal yang berisi jadwal.

Fitur ini diuji otomatis dengan 23 tes database:
- jatah per paket;
- 30 hari;
- jam kosong sesuai durasi;
- tumpukan jadwal;
- batas 24 jam;
- geser satu kali;
- link https;
- batal;
- tutup sesi;
- beli add-on;
- kedaluwarsa tagihan;
- akses antar-client.

Uji e2e `tests/e2e/fase5-konsultasi.mjs` memakai akun dan jadwal sementara, lalu menghapusnya.

## Putaran 5: Landing page baru

Tidak perlu migrate. Kalau konten pernah diterbitkan dari menu Konten, bagian baru (Testimoni dan Ajakan penutup) otomatis ikut muncul di posisi bawaannya.

1. **Buka landing dalam keadaan belum login.** Warna latar selang-seling hitam dan putih mengikuti urutan bagian yang tampil, mulai dari hero hitam. Kalau admin mengubah urutan atau menyembunyikan bagian, selang-selingnya tetap terjaga. Ajakan penutup yang jatuh di urutan hitam tampil sebagai kotak emas. Urutan bagiannya:
   - Pita kuning-hitam, lalu header gelap: menu bagian, ID/EN, **Masuk**, **Daftar**.
   - Hero gelap dengan bidang emas miring dan ilustrasi outlet. **Daftar sebagai pemilik bisnis** membuka halaman daftar, dan **Jadi mystery shopper** membuka daftar shopper.
   - Bagian terang: Masalah (kartu berikon), Cara kerja, Yang diaudit.
   - Pita gelap: Mengapa SilentCX.
   - Contoh laporan: galeri 6 gambar yang bergeser otomatis dan tombol unduh PDF.
   - Paket: kartu Insight disorot "Paling diminati".
   - Pita gelap: Testimoni. Tampil 3 kartu di laptop, bergeser otomatis satu per satu.
   - FAQ, Ajakan jadi shopper, Kontak (hanya tampil kalau kontak di Info situs sudah diisi), Ajakan penutup, dan footer.
2. **Geser otomatis.**
   - Galeri dan testimoni bergeser setiap sekitar 5 detik, lalu kembali ke awal.
   - Geseran berhenti saat kursor ada di atasnya atau saat disentuh di HP.
   - Tombol ← → dan titik penanda bisa dipakai, dan di HP bisa digeser dengan jari.
3. **HP.**
   - Header berisi logo, **Masuk**, **Daftar**, dan tombol menu (☰). Menu berisi tautan bagian dan ID/EN.
   - Tidak ada geser ke samping.
4. **Tidak ada lagi tombol Gelap/Terang** di semua halaman. Dashboard selalu gelap, dan ID/EN tetap ada.
5. **Sudah login.** Membuka `/`, `/login`, `/register`, atau `/become-shopper` langsung diarahkan ke dashboard role masing-masing. Untuk melihat landing, Keluar dulu atau pakai **Simpan & pratinjau** di menu Konten.
6. **Menu Konten.**
   - Selama testimoni contoh masih dipakai, muncul peringatan kuning.
   - Setiap kartu Masalah, Yang diaudit, Mengapa, dan Ajakan shopper punya pilihan **Ikon** dengan contoh tampilannya.
   - Testimoni punya isian Nama, Jabatan dan nama usaha, serta Kutipan.
   - Gambar galeri Contoh laporan bisa diganti, ditambah, dihapus, dan diurutkan.
   - Gambar hero bisa diganti.

7. **Footer.** Di **Konten → Info situs**, isi Kontak (WhatsApp, telepon kantor, email, situs web, alamat kantor) dan Media sosial (Instagram, TikTok, Facebook, LinkedIn, YouTube, X). Media sosial boleh berupa nama akun (@silentcx) atau alamat lengkap https://. Setelah diterbitkan, footer menampilkan kolom **Hubungi kami** (alamat, telepon, WhatsApp, email, situs web) dan ikon media sosial bulat di bawah logo. Isian yang kosong tidak ditampilkan. Isi bawaannya berupa kontak contoh (alamat bertanda "(alamat contoh)", nomor 0800… dan (021) 000 0000 yang tidak bisa dihubungi), dan editor menampilkan peringatan kuning selama kontak contoh masih dipakai.

Gambar bawaan (ilustrasi hero dan 6 halaman contoh laporan) digambar dari kode `scripts/landing-images.mjs` dengan data fiktif PT ABC / Cafe 123, jadi tidak ada masalah hak cipta. Jalankan `node scripts/landing-images.mjs` untuk membuatnya ulang.

Diuji otomatis: 6 tes pembacaan konten lama dan tautan kontak, `tests/e2e/fase0-public.mjs`, dan `tests/e2e/putaran5-landing.mjs` (37 cek, tidak mengubah data).

## Verifikasi email saat daftar

Pengaturan di dashboard Supabase (dilakukan pemilik proyek):

1. Authentication → Sign In / Providers → Email: aktifkan **Confirm email**.
2. Authentication → URL Configuration: Site URL `http://localhost:3000`, Redirect URLs tambahkan `http://localhost:3000/**`.
3. Authentication → Emails → Confirm signup: ganti tautan menjadi
   `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Konfirmasi email</a>`
   supaya tautan bisa dibuka di perangkat lain (misalnya daftar di laptop, buka email di HP).
4. Server email bawaan Supabase hanya mengirim beberapa email per jam dan hanya ke anggota tim proyek. Untuk uji coba pakai email sendiri, misalnya `nama+client1@gmail.com`. Sebelum diluncurkan, pasang SMTP sendiri.

Yang dicoba:

1. Daftar sebagai pemilik bisnis dari tombol Pilih paket. Muncul pesan "Akun dibuat. Buka email Anda…" dan tombol **Kirim ulang email konfirmasi** yang menghitung mundur 60 detik.
2. Coba masuk sebelum konfirmasi: muncul "Email belum dikonfirmasi" beserta tombol kirim ulang.
3. Tekan kirim ulang: muncul "Email konfirmasi dikirim ulang ke …", lalu tombol menunggu 60 detik lagi. Kalau terlalu sering, muncul pesan untuk menunggu.
4. Klik tautan di email (boleh di HP): langsung masuk ke dashboard, atau ke halaman paket yang tadi dipilih.
5. Klik tautan yang sama sekali lagi: diarahkan ke halaman masuk dengan pesan tautan tidak berlaku.

Tes otomatis: `tests/verifikasi-email.test.ts` (2 tes). Alur lengkapnya perlu email sungguhan, jadi dicoba manual.

## Putaran 6: Lonceng notifikasi & kartu rekening

Perlu `npm run db:migrate` (migration `20261029000012_notification_center.sql`). Sebelum migrate, lonceng tetap tampil, tetapi notifikasi baru belum masuk real time, klik satu notifikasi belum menandainya dibaca, dan pengingat jatuh tempo tagihan belum dibuat.

1. **Lonceng di header (semua role).**
   - Lonceng ada di kanan atas, sebelum ID/EN. Angka merah menunjukkan jumlah yang belum dibaca (di atas 99 tampil "99+").
   - Klik lonceng: panel berisi 10 notifikasi terbaru. Yang belum dibaca bertitik emas.
   - Klik satu notifikasi: halaman terkait terbuka dan notifikasi itu ditandai dibaca.
   - **Tandai semua dibaca** mengosongkan angka merah.
   - **Lihat semua notifikasi →** membuka halaman Notifikasi (`/app/notifications`, `/shopper/notifications`, `/admin/notifications`).
   - Panel tertutup dengan Escape atau klik di luar panel. Di HP panel selebar layar, tepat di bawah lonceng.
   - Beranda client dan shopper tidak lagi menampilkan daftar notifikasi.
2. **Real time.** Buka dua browser: admin di satu, shopper atau client di yang lain. Saat satu pihak melakukan aksi, notifikasi pihak lain muncul tanpa memuat ulang halaman, disertai toast, dan isi halaman yang sedang dibuka ikut diperbarui. Kalau sambungan sempat putus, isi lonceng diambil ulang saat tab dibuka kembali.
3. **Notifikasi baru untuk admin.**
   - Lamaran shopper dikirim.
   - Client mengunggah bukti bayar.
   - Shopper mengirim kunjungan, atau mengirim ulang setelah revisi.
   - Shopper menolak tawaran tugas, atau tawarannya kedaluwarsa.
   - Client memesan atau memindah jadwal konsultasi. Aksi yang dilakukan admin sendiri tidak memicu notifikasi ke admin.
4. **Notifikasi baru untuk client.**
   - Pesanan dikonfirmasi admin dan tagihan siap dibayar.
   - Pesanan dibatalkan admin, beserta alasannya.
   - Pembayaran diverifikasi atau ditolak (dengan catatan dan batas bayar baru).
   - Proyek dimulai (shopper pertama menerima tugas), hanya sekali per proyek.
   - Tagihan jatuh tempo dalam 24 jam, sekali per tagihan.
5. **Kartu rekening shopper** (Profil, setelah lamaran disetujui).
   - Kalau rekening sudah diisi, form tidak tampil. Yang tampil kartu bank dengan nomor disamarkan (•••• 7890) dan nama disamarkan (a.n. Budi S*** W***).
   - **Tampilkan data rekening saya** membuka nomor dan nama lengkap; **Sembunyikan** menutupnya lagi.
   - **Ubah rekening** membuka form berisi data lama; **Batal** kembali ke kartu, dan Simpan kembali ke kartu dengan data baru.
   - Kalau rekening belum diisi, form langsung tampil seperti biasa.

Diuji otomatis: `tests/notifikasi.test.ts` (13 tes), `tests/e2e/putaran6-notifikasi.mjs` (28 cek, tidak mengubah data). Uji real time dan kartu rekening dengan data sungguhan ada di `tests/e2e/fase2-flow.mjs`, yang MENGUBAH data (akun sementara), jadi dijalankan hanya dengan izin.

## Putaran 7: Lupa password, Akun saya, halaman hukum, dan kecepatan

Perlu `npm run db:migrate` (migration `20261030000013_launch_readiness.sql`, yang juga memuat perubahan Putaran 8). Di Supabase: **Authentication > Emails > Templates > Reset Password**, ganti tautannya menjadi
`<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Buat password baru</a>`.

1. **Lupa password.**
   - Di halaman Masuk, klik **Lupa password?**, lalu isi email.
   - Pesan yang muncul sama untuk email terdaftar maupun tidak. Tombol **Kirim ulang tautan** menghitung mundur 60 detik.
   - Klik tautan di email (boleh di HP). Halaman **Buat password baru** menampilkan email akun Anda.
   - Isi password baru dua kali, lalu **Simpan password**. Anda langsung masuk ke dashboard dan muncul pesan "Password baru tersimpan".
   - Tautan yang sama tidak bisa dipakai lagi. Halaman `/reset-password` yang dibuka langsung, tanpa tautan, atau lebih dari 15 menit setelah tautan dibuka, meminta tautan baru.
2. **Akun saya** (menu baru di ketiga role).
   - Email tampil tetapi tidak bisa diubah. Nama dan nomor WhatsApp bisa diubah lalu **Simpan perubahan**.
   - **Ganti password** wajib mengisi password saat ini. Kalau salah, muncul "Password saat ini salah".
   - Setelah diganti, perangkat lain yang sedang masuk keluar otomatis paling lambat 1 jam.
3. **Halaman hukum.**
   - `/privasi` dan `/syarat` tampil, dan ditautkan di footer landing.
   - Isinya diatur di **Konten → Halaman hukum**: judul, tanggal "Terakhir diperbarui", dan isi. Di isi, baris "## " menjadi subjudul dan baris "- " menjadi butir daftar.
   - Selama masih ada isian bertanda [kurung siku], editor menampilkan peringatan kuning beserta daftar isiannya.
   - Setelah diubah, tekan **Terbitkan** supaya tampil ke pengunjung.
4. **Persetujuan saat daftar.**
   - Form daftar pemilik bisnis dan shopper punya centang wajib "Saya menyetujui Syarat & Ketentuan dan Kebijakan Privasi". Kedua tautannya terbuka di tab baru, jadi isian form tidak hilang.
   - Tanpa centang, pendaftaran ditolak dan isian tetap terisi.
   - Versi dokumen (tanggal terakhir diperbarui) dan waktu persetujuan tercatat di profil dan log aktivitas.
5. **Kecepatan.** Dashboard terbuka lebih cepat karena:
   - login diperiksa di server tanpa memanggil Supabase;
   - lonceng dan data paket diambil bersamaan;
   - pengingat jatuh tempo dan kedaluwarsa invoice serta tawaran diproses jadwal database, tidak lagi setiap kali halaman dibuka.

   Di **Integrations > Cron** Supabase ada dua jadwal: `silentcx-expire` (5 menit) dan `silentcx-invoice-reminders` (15 menit).

Persiapan produksi (project Supabase baru, Vercel, Resend untuk silentcx.com) ada di `docs/SETUP.md` langkah 8.

Diuji otomatis: `tests/putaran7.test.ts` (12 tes) dan `tests/e2e/putaran7-akun.mjs` (42 cek). E2e ini tidak mengubah data: tautan reset dibuat tanpa email, password tidak disimpan, dan pendaftaran hanya dicoba sampai ditolak. Menyimpan password baru dan mengubah nama sungguhan diuji manual.

## Putaran 8: Siap deploy

Perubahan database ada di migration yang sama dengan Putaran 7 (`20261030000013_launch_readiness.sql`), jadi cukup satu kali `npm run db:migrate`.

1. **Menu di HP.**
   - Menu terlipat di balik satu tombol yang menampilkan halaman aktif. Ketuk tombol itu dan semua menu tampil tanpa perlu digeser.
   - Setelah pindah halaman, menu tertutup lagi.
   - Tidak ada lagi ruang kosong di bawah menu pada halaman yang isinya pendek.
2. **Saat halaman dimuat**, tampil kerangka abu-abu sehingga klik menu langsung terasa ada responsnya. Kalau server bermasalah, tampil halaman "Maaf, halaman ini gagal dimuat" dengan tombol **Coba lagi**, bukan halaman error bawaan berbahasa Inggris.
3. **Bahasa.** Tombol ID/EN disembunyikan, dan semua tampil dalam Bahasa Indonesia. Nyalakan lagi lewat `ENGLISH_ENABLED` di `src/lib/i18n.ts` setelah semua teks diterjemahkan.
4. **Email notifikasi.**
   - Penerima: client dan shopper, tidak termasuk admin.
   - Kejadian yang dikirim lewat email:
     - tawaran tugas;
     - kunjungan perlu revisi;
     - lamaran disetujui atau ditolak;
     - fee ditransfer;
     - tagihan siap dibayar;
     - pembayaran diverifikasi atau ditolak;
     - tagihan jatuh tempo;
     - laporan terbit.
   - Email masuk 1–2 menit setelah notifikasi muncul di lonceng, dan berisi tombol ke halaman terkait.
   - Hanya berjalan kalau langkah `docs/SETUP.md` 8b-2 sudah dilakukan. Di staging tanpa `RESEND_API_KEY`, tidak ada email yang terkirim.
5. **Captcha.** Form masuk, daftar, lupa password, kirim ulang, dan ganti password menampilkan kotak verifikasi Cloudflare setelah `NEXT_PUBLIC_TURNSTILE_SITE_KEY` diisi. Tanpa kunci itu, form berjalan seperti biasa.
6. **Pesanan.** Selama kota outlet belum dipilih, di bawah tombol **Buat pesanan** muncul "Pilih kota untuk setiap outlet dulu." dengan tautan ke isian kota.
7. **Beranda client.** Tahap akun (Calon client → Menunggu verifikasi → Client aktif) tampil sebagai teks kecil dengan titik emas di tahap aktif. Tampilannya tidak lagi menyerupai tombol.
8. **Katalog → Paket.** Ada pilihan **Konsultasi gratis setelah laporan terbit**: tidak termasuk, atau 1 sesi 30, 45, 60, 90, atau 120 menit.
9. **Keuangan → ganti bukti transfer.** Catatan transfer asli tetap tersimpan. Alasan penggantian tampil terpisah, baik untuk admin maupun shopper.
10. **Keamanan.** Situs tidak bisa ditampilkan di dalam iframe situs lain, dan header keamanan dasar terpasang di semua halaman.

Diuji otomatis: `tests/putaran8.test.ts` (12 tes) dan `tests/e2e/putaran8-siap-deploy.mjs` (28 cek, tidak mengubah data).

## Putaran 9: Semua fitur daftar harga masuk laporan

Jalankan dulu `npm run db:migrate` untuk migration `20261030000014_report_features.sql` (staging, lalu produksi dengan `npm run db:migrate:prod`).

### A. Kuesioner (admin)

1. Buka **Kuesioner**, lalu template **Kafe & restoran — dasar**.
   - Template ini sudah ditandai: 5 pertanyaan SOP, 3 red flag, dan 16 pertanyaan masuk tahap customer journey F&B.
   - Kotak **Ringkasan isi laporan** menampilkan jumlah SOP, red flag, tahap yang dipakai, dan pertanyaan yang dinilai tanpa tahap. Dua baris di bawahnya memberi tahu apakah kuesioner siap untuk paket Insight dan Performance.
2. **Tahap customer journey.**
   - Panel ini berlaku untuk semua kuesioner dengan jenis usaha yang sama.
   - Buka **Catatan referensi customer journey**: ada tips dan contoh alur untuk jenis usaha itu, serta tombol untuk menambahkan tahap contoh yang belum ada.
   - Ubah nama tahap, geser urutan dengan ↑ ↓, tambah, atau hapus tahap.
   - Kedelapan jenis usaha bawaan dan "Lainnya" sudah punya contoh alur.
3. **Bagian.** Ada isian **Target skor** (bawaan 85), yang dipakai di analisis gap laporan.
4. **Pertanyaan.** Ada centang **SOP**, centang **Red flag**, dan pilihan **Tahap customer journey**.
   - SOP hanya bisa untuk Ya / Tidak. Kalau jenis jawaban diganti ke skala, centang SOP otomatis lepas.
   - Red flag tidak bisa untuk isian teks.
   - Label SOP, Red flag, dan nama tahap tampil di atas setiap pertanyaan.
5. **Syarat paket.** Saat menetapkan kuesioner ke proyek:
   - Insight dan Performance menolak kuesioner tanpa pertanyaan SOP dan tanpa pertanyaan di minimal 2 tahap journey.
   - Performance juga menolak kuesioner tanpa red flag.
   - Essential menerima kuesioner apa pun yang sudah siap.
   - Syarat yang sama dicek lagi sebelum laporan terbit.

### B. Laporan (admin dan client)

1. **Insight** menambahkan tiga bagian:
   - **Kepatuhan SOP**: persentase patuh dan daftar SOP yang dilanggar.
   - **Customer journey**: skor per tahap sesuai urutan, beserta titik terlemah.
   - **Analisis gap**: target, aktual, dan selisih per area, diurutkan dari gap terbesar.
   - Garis tipis di batang skor area menandai target.
2. **Performance** menambahkan:
   - **Ringkasan eksekutif** (menggantikan label Ringkasan manajemen).
   - **Peringkat outlet** berupa peta warna, dengan kolom SOP dan jumlah red flag.
   - **Pola antar outlet**: SOP yang dilanggar di lebih dari satu outlet, dan area yang di bawah target di banyak outlet.
   - Daftar **Red flag**. Red flag tidak memotong skor.
   - **Rekomendasi untuk manajemen**.
3. **Editor laporan admin.** Draf otomatis kini memuat kepatuhan SOP, tahap journey terlemah, gap terbesar, SOP yang dilanggar di banyak outlet, dan red flag.
   - Tombol **Susun ulang ringkasan otomatis** mengisi ulang ringkasan dari angka terbaru.
   - Tombol **Tambah temuan otomatis** menambahkan temuan dari red flag, SOP yang dilanggar, dan area di bawah 70.
4. **PDF** memuat bagian yang sama dengan tampilan web.
5. **Contoh laporan.** Tersedia untuk ketiga paket:
   - `/contoh-laporan?paket=essential`
   - `/contoh-laporan?paket=insight`
   - `/contoh-laporan?paket=performance` (bawaan)

   Halaman **Laporan** client yang belum punya laporan menampilkan tiga tombol contoh.
6. Laporan yang terbit sebelum Putaran 9 tetap tampil seperti dulu, tanpa bagian baru.

### C. Dashboard client

1. **Benchmark outlet** (Performance): peta skor outlet × area dari laporan terbaru, outlet tertinggi dan terendah, dan pola antar outlet. Sebelum laporan terbit, halaman ini menampilkan keadaan kosong dengan tautan ke Audit berjalan.
2. **Benchmark kompetitor** (add-on): skor Anda dibanding setiap kompetitor, per area, dari laporan terbaru.
3. Keduanya tidak lagi menampilkan "Segera hadir". Tanpa paket atau add-on yang sesuai, halaman menampilkan fitur terkunci.

### D. Add-on

1. **Kunjungan tambahan.**
   - Saat checkout, client hanya memilih jumlahnya.
   - Setelah pembayaran diverifikasi, di **Outlet & data** muncul kotak **Bagikan N kunjungan tambahan**, dengan tombol − dan + per outlet.
   - Isi dan simpan nama outlet dulu; selama nama belum ada, pembagian tidak bisa dilakukan.
   - Data belum bisa ditandai lengkap sebelum semua kunjungan tambahan dibagikan.
   - Outlet yang sudah dijadwalkan admin terkunci.
   - Audit berjalan, penjadwalan admin, dan syarat laporan terbit memakai jumlah kunjungan per outlet hasil pembagian.
2. **Laporan express.**
   - Laporan biasa terbit 5 hari kerja setelah kunjungan terakhir lolos QC; express 2 hari kerja. Sabtu dan Minggu tidak dihitung.
   - Client melihat perkiraan tanggal terbit di **Audit berjalan**.
   - Daftar **Laporan** admin menampilkan label **Express**, tenggat, dan sisa hari. Tenggat yang lewat berwarna merah, dan yang paling mendesak tampil paling atas.
3. **Audit ulang.**
   - Tidak lagi ada di checkout paket.
   - Setelah laporan terbit, di bawah laporan client muncul kotak **Audit ulang** dengan harga per outlet × jumlah outlet.
   - Pesanan menyalin outlet, tujuan audit, dan kuesioner proyek sebelumnya, dengan 1 kunjungan per outlet. Pesanan ini tidak termasuk konsultasi gratis, kompetitor, maupun express.
   - Karena add-on ini diset "perlu persetujuan", pesanan masuk **Tinjau pesanan** admin dulu.
   - Kunjungan paling cepat 30 hari setelah laporan sebelumnya terbit. Admin melihat tanggal itu di Penjadwalan, dan database menolak jendela kunjungan yang lebih awal.
   - Laporan audit ulang memuat bagian **Perbandingan dengan audit sebelumnya**.
4. **Kuesioner khusus.**
   - Di **Outlet & data** ada kotak **Kebutuhan kuesioner khusus**, minimal 20 karakter, yang wajib diisi sebelum data ditandai lengkap.
   - Admin melihat brief itu di Penjadwalan proyek.
   - Laporannya mencantumkan bahwa kuesioner disusun khusus.

### E. Teks paket

Fitur paket Performance: "Review manajemen" dihapus karena review dilakukan di sesi konsultasi, dan "Analisis tren antar outlet" diganti "Pola antar outlet".

Setiap teks fitur paket bawaan dipetakan di `src/lib/report/coverage.ts`. Tes memastikan setiap fitur bagian laporan benar-benar muncul di contoh laporan paketnya. Kalau admin menambah teks fitur baru di Katalog, tambahkan juga ke file itu.

Diuji otomatis: `tests/putaran9.test.ts` (23 tes) dan `tests/e2e/putaran9-laporan.mjs`. E2e ini tidak mengubah data dan butuh migration Putaran 9 sudah dijalankan.

## Threads di landing dan X, Threads, Facebook di Linktree

Landing page:
- [ ] Admin → Konten → Info situs: kolom **Threads** muncul di Media sosial. Isi `@akun` atau alamat lengkap, lalu Terbitkan.
- [ ] Footer landing menampilkan ikon Threads yang membuka `https://www.threads.com/@akun`. Kalau dikosongkan, ikonnya tidak tampil.

Linktree (`silentcx-linktree`, salin `Code.gs`, `Shared.html`, dan `Admin.html` ke Apps Script, lalu deploy versi baru):
- [ ] Panel admin → Tampilan → Media sosial: pilihan jenis berisi Facebook, Threads, dan X.
- [ ] Bisa menambah sampai 10 media sosial.
- [ ] Halaman github.io menampilkan ketiga ikon baru dan membuka alamat yang diisi.

Diuji otomatis: `tests/putaran5.test.ts` (tautan Threads) dan `npm test` di folder linktree (68 cek).
