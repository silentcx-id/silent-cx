// Draf awal Kebijakan Privasi dan Syarat & Ketentuan, disusun dari data yang benar-benar dikumpulkan aplikasi.
// Ini bukan nasihat hukum: admin melengkapi isian bertanda [kurung siku] dan meminta peninjauan sebelum situs dibuka.
// Format teks: baris "## " = subjudul, baris "- " = butir daftar, baris kosong = paragraf baru.

export const DEFAULT_PRIVACY = `Kebijakan ini menjelaskan data apa yang dikumpulkan SilentCX, untuk apa data itu dipakai, dan hak Anda atas data tersebut. SilentCX dikelola oleh [Nama badan usaha], beralamat di [Alamat lengkap].

## Data yang kami kumpulkan
Untuk semua pengguna:
- Nama, email, dan nomor WhatsApp saat membuat akun.
- Catatan aktivitas di aplikasi (misalnya waktu masuk, pesanan, dan perubahan status) untuk keamanan dan penyelesaian masalah.

Untuk pemilik bisnis (client):
- Data perusahaan, nama dan alamat outlet, kontak PIC, dan data kompetitor yang Anda isi.
- Bukti transfer pembayaran.

Untuk mystery shopper:
- Kota domisili, kota yang bisa dijangkau, tanggal lahir, jenis kelamin, pekerjaan, kendaraan, dan pengalaman, untuk mencocokkan Anda dengan tugas.
- Rekening bank untuk pembayaran fee.
- Saat kunjungan: titik lokasi GPS dan waktu check-in, foto di dalam outlet, foto struk, dan jawaban kuesioner.

Kami tidak meminta KTP atau foto selfie.

## Untuk apa data dipakai
- Menjalankan layanan: membuat akun, memproses pesanan dan pembayaran, menjadwalkan kunjungan, memeriksa kualitas kunjungan, dan menyusun laporan.
- Membayar fee dan penggantian biaya shopper.
- Mengirim pemberitahuan yang berkaitan dengan akun dan tugas Anda.
- Menjaga keamanan dan mencegah penyalahgunaan.

Kami tidak menjual data pribadi Anda dan tidak memakainya untuk iklan pihak lain.

## Siapa yang bisa melihat data
- Tim SilentCX yang menangani akun, pesanan, kunjungan, dan pembayaran Anda.
- Client hanya melihat hasil audit outlet miliknya. Identitas shopper tidak pernah ditampilkan kepada client.
- Shopper hanya melihat informasi outlet yang perlu untuk menjalankan tugasnya.
- Penyedia layanan yang membantu kami menjalankan aplikasi: penyimpanan data dan database (Supabase), hosting (Vercel), dan pengiriman email (Resend). Mereka hanya memproses data sesuai keperluan layanan tersebut.
- Pihak berwenang, kalau diwajibkan oleh hukum.

## Berapa lama data disimpan
- Data akun disimpan selama akun aktif.
- Data pembayaran dan payout disimpan [lama penyimpanan, misalnya 10 tahun] untuk keperluan pembukuan dan pajak.
- Foto dan bukti kunjungan disimpan [lama penyimpanan] setelah laporan terbit.
- Setelah masa simpan berakhir, data dihapus atau dibuat tidak bisa dikaitkan lagi dengan Anda.

## Hak Anda
Sesuai Undang-Undang Pelindungan Data Pribadi, Anda berhak:
- Meminta salinan data pribadi Anda.
- Memperbaiki data yang salah. Nama dan nomor WhatsApp bisa diubah sendiri di menu Akun saya.
- Meminta penghapusan akun dan data, kecuali data yang wajib kami simpan menurut hukum.
- Menarik persetujuan. Akibatnya, layanan yang membutuhkan data tersebut tidak bisa dilanjutkan.

Kirim permintaan ke [email kontak privasi]. Kami menanggapinya paling lambat [jumlah] hari kerja.

## Keamanan
Data disimpan dengan akses terbatas per pengguna, dan bukti pembayaran serta foto kunjungan disimpan di penyimpanan privat yang hanya bisa dibuka dengan tautan sementara. Kalau terjadi kebocoran data yang berdampak pada Anda, kami akan memberi tahu Anda dan pihak berwenang sesuai ketentuan hukum.

## Perubahan kebijakan
Kalau kebijakan ini berubah, tanggal "Terakhir diperbarui" di atas ikut berubah, dan perubahan penting kami beritahukan lewat aplikasi atau email.

## Kontak
[Nama badan usaha]
[Alamat lengkap]
Email: [email kontak privasi]`;

export const DEFAULT_TERMS = `Syarat & Ketentuan ini berlaku untuk semua pengguna SilentCX, yang dikelola oleh [Nama badan usaha]. Dengan membuat akun, Anda menyetujui syarat ini dan Kebijakan Privasi.

## Akun
- Data yang Anda isi saat mendaftar harus benar.
- Anda bertanggung jawab menjaga kerahasiaan password. Kalau Anda curiga akun dipakai orang lain, segera ganti password di menu Akun saya dan hubungi kami.
- Kami dapat menangguhkan akun yang melanggar syarat ini.

## Untuk pemilik bisnis (client)
- Paket, add-on, dan harga mengikuti yang tampil saat pesanan dibuat. Semua harga sudah termasuk PPN.
- Tagihan dibayar paling lambat 2×24 jam setelah dikonfirmasi. Pesanan yang tidak dibayar sampai batas waktu dibatalkan otomatis.
- Kunjungan dijadwalkan setelah pembayaran diverifikasi dan data outlet lengkap.
- Laporan berisi penilaian berdasarkan kunjungan yang dilakukan pada waktu tertentu, dan dipakai sebagai bahan perbaikan internal.
- Pembatalan dan pengembalian dana: [ketentuan pembatalan dan refund].

## Untuk mystery shopper
- Shopper bukan karyawan SilentCX. Setiap tugas adalah pekerjaan lepas yang boleh diterima atau ditolak.
- Shopper wajib merahasiakan identitas tugas, nama client, dan isi kuesioner, sesuai pakta kerahasiaan yang disetujui saat melamar.
- Kunjungan harus dilakukan sendiri, di outlet dan rentang waktu yang ditentukan, dengan bukti lokasi dan foto yang asli.
- Kunjungan yang tidak memenuhi syarat dapat diminta revisi atau ditolak, dan tidak dibayar.
- Fee dan penggantian biaya yang disetujui dibayar paling lambat 48 jam setelah tugas disetujui, ke rekening yang terdaftar.
- Pemotongan pajak atas fee: [ketentuan pajak, kalau ada].

## Larangan
- Memalsukan bukti kunjungan, lokasi, foto, atau struk.
- Memberi tahu outlet bahwa Anda sedang melakukan audit.
- Memakai akun orang lain atau membagikan akun Anda.
- Menyalin, menyebarkan, atau menjual laporan dan data milik pengguna lain.

## Batas tanggung jawab
Kami berusaha menjaga layanan tetap berjalan dan data tetap aman, tetapi tidak bertanggung jawab atas kerugian tidak langsung akibat gangguan di luar kendali kami. Tanggung jawab kami atas satu pesanan paling besar senilai pesanan tersebut.

## Hukum yang berlaku
Syarat ini tunduk pada hukum Republik Indonesia. Perselisihan diselesaikan secara musyawarah lebih dulu, dan bila tidak tercapai, melalui [pengadilan atau lembaga penyelesaian sengketa].

## Kontak
[Nama badan usaha]
[Alamat lengkap]
Email: [email kontak]`;
