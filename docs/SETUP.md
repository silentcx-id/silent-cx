# Panduan setup silentCX

Panduan ini menyambungkan aplikasi ke Supabase supaya login dan database aktif, lalu menyiapkan project Vercel. Waktunya sekitar 20 menit. Kunci rahasia hanya kamu yang memasukkan; jangan dikirim lewat chat.

## 1. Buat project Supabase baru

1. Buka [supabase.com](https://supabase.com), masuk, lalu klik **New project**.
2. Isi nama `silentcx`, buat password database (simpan baik-baik), dan pilih region **Southeast Asia (Singapore)**.
3. Tunggu sampai project siap.

## 2. Isi kunci di laptop

1. Di folder `C:\silentcx-app`, salin `.env.example` menjadi `.env.local`.
2. Dari **Project Settings > API**, isi:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (rahasia)
3. Klik **Connect** → tab **Connection String** → **Session pooler**, salin URI-nya ke `SUPABASE_DB_URL`. Ganti `[YOUR-PASSWORD]` dengan password database dari langkah 1.
4. Periksa semua kunci sudah terisi (isinya tidak ditampilkan):

   ```bash
   npm run env:cek
   ```

## 3. Pasang database

```bash
npm run db:migrate
```

Skrip ini memasang semua migrasi di `supabase/migrations` yang belum terpasang, lalu membuat bucket penyimpanan `payment-proofs` (privat, untuk bukti bayar) dan `site-assets` (publik, untuk gambar QRIS). Aman dijalankan berulang setiap ada pembaruan. Jangan jalankan lewat hotspot HP kalau koneksinya sering putus.

## 4. Atur login

1. Buka **Authentication > Sign In / Providers > Email**:
   - Pastikan **Email** aktif.
   - **Confirm email**: matikan dulu selama uji coba, supaya akun baru langsung bisa masuk. Nyalakan setelah SMTP email dipasang.
   - **Minimum password length**: `8`.
   - **Password requirements**: pilih huruf dan angka (*Letters and digits*).
2. Buka **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:3000` untuk sekarang. Setelah deploy, ganti dengan domain kamu.
   - **Redirect URLs**: tambahkan `http://localhost:3000/**` dan `http://localhost:3100/**`. Setelah deploy, tambahkan juga `https://domainkamu.com/**`.

## 5. Buat akun demo

```bash
npm run demo:akun
```

Skrip membuat 4 akun dan menampilkan password-nya **hanya di terminal kamu**. Simpan password itu, karena tidak ditampilkan lagi.

| Akun | Role | Status |
| --- | --- | --- |
| `admin@silentcx.demo` | Admin | Aktif |
| `client@silentcx.demo` | Pemilik bisnis | Aktif (calon client) |
| `shopper@silentcx.demo` | Shopper | Aktif |
| `pelamar@silentcx.demo` | Shopper | Menunggu seleksi |

Akun yang sudah ada dilewati, jadi skrip aman dijalankan ulang. Akun admin hanya bisa dibuat lewat skrip atau server; pendaftaran dari website selalu menjadi client atau shopper.

Lupa password akun demo? Jalankan perintah di bawah. Keempat akun demo mendapat password acak baru yang tampil di terminal kamu. Akun lain dan semua data tidak berubah.

```bash
npm run demo:akun -- --reset
```

## 6. Isi katalog dan pembayaran

Masuk sebagai admin, buka **Katalog**:

1. Tab **Kota dilayani**: tambahkan kota tempat shopper tersedia. Pesanan untuk kota di luar daftar otomatis masuk antrian review.
2. Tab **Pembayaran**: isi rekening bank dan unggah gambar QRIS statis. Tanpa ini client belum bisa membayar.
3. Tab **Paket** dan **Add-on**: sesuaikan harga atau promo kalau perlu. Semua harga sudah termasuk PPN.

## 7. Jalankan aplikasi

```bash
npm run dev
```

Buka `http://localhost:3000`.

## 8. Project Vercel (boleh nanti)

1. Buka [vercel.com](https://vercel.com) → **Add New > Project**, lalu impor repository GitHub silentCX setelah kode di-push.
2. Di **Settings > Environment Variables**, isi kunci yang sama dengan `.env.local`, kecuali `SUPABASE_DB_URL` (hanya dipakai di laptop untuk migrasi).
3. Setelah deploy, tambahkan domain Vercel ke **Redirect URLs** di Supabase (langkah 4).
