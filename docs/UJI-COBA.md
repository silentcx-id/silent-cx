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
