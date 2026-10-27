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

Bagian ini sudah dijamin oleh 29 tes otomatis (`npm test`); tidak perlu dicoba manual:

- User tidak bisa mengubah role atau status akunnya sendiri, termasuk lewat browser console.
- Pendaftaran dengan metadata `admin` tetap menjadi client.
- Client hanya bisa membaca profilnya sendiri; pengunjung tanpa login tidak bisa membaca profil apa pun.
- Hanya admin aktif yang bisa mengubah status akun, dan setiap perubahan tercatat di log aktivitas.
- Admin tidak bisa mengubah akunnya sendiri atau admin lain.
