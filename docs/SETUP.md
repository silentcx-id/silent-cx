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

## 8. Deploy produksi (silentcx.com)

Ada dua project Supabase:

| | Kunci di laptop | Dipakai untuk |
| --- | --- | --- |
| **Staging** (project lama) | `.env.local` | Uji coba, akun demo, semua uji e2e |
| **Produksi** (`silentcx-production`, Singapore) | `.env.prod` | Pelanggan asli di silentcx.com |

`.env.prod` sengaja tidak bernama `.env.production.local`, karena Next.js otomatis membaca file itu saat `npm run build`/`start`, dan server uji di laptop akan tersambung ke database produksi. Jangan pernah menjalankan `demo:akun`, `demo:data`, atau uji e2e ke produksi.

### 8a. Kunci project produksi

1. Salin `.env.example` menjadi `.env.prod`, lalu isi dari project **silentcx-production** dengan cara yang sama seperti langkah 2. Isi `NEXT_PUBLIC_APP_URL=https://silentcx.com`.
2. Periksa (isinya tidak ditampilkan):

   ```bash
   npm run env:cek:prod
   ```

3. Pasang database produksi. Baris pertama menampilkan nama host database, jadi pastikan itu project produksi:

   ```bash
   npm run db:migrate:prod
   ```

   Migrasi juga membuat bucket penyimpanan dan jadwal otomatis (pg_cron): invoice dan tawaran yang lewat batas diproses setiap 5 menit, dan pengingat tagihan jatuh tempo setiap 15 menit. Periksa di **Integrations > Cron**: ada `silentcx-expire` dan `silentcx-invoice-reminders`.

4. Di **Project Settings > JWT Keys**, pastikan kunci yang dipakai (*Current key*) bertipe **ECC (P-256)**. Project baru sudah memakainya. Dengan kunci ini, pemeriksaan login di setiap halaman berjalan di server tanpa memanggil Supabase.

### 8b. Login dan email di project produksi

1. **Authentication > Sign In / Providers > Email**: nyalakan **Confirm email**; **Minimum password length** `8`; **Password requirements** *Letters and digits*.
2. **Authentication > URL Configuration**:
   - **Site URL**: `https://silentcx.com`
   - **Redirect URLs**: `https://silentcx.com/**` dan `https://www.silentcx.com/**`
3. **Authentication > Emails > Templates**: ganti tautan di dua template berikut, supaya tautannya juga bisa dibuka di perangkat lain:
   - **Confirm signup**: `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Konfirmasi email</a>`
   - **Reset Password**: `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Buat password baru</a>`
4. **SMTP lewat Resend**:
   1. Di resend.com: **Domains > Add Domain** `silentcx.com`, region **Tokyo (ap-northeast-1)**. Pasang record DNS yang ditampilkan Resend (MX dan TXT di subdomain `send`, TXT `resend._domainkey`), ditambah TXT `_dmarc` berisi `v=DMARC1; p=none;`. Tunggu statusnya **Verified**.
   2. **API Keys > Create API Key**, permission **Sending access**, domain `silentcx.com`. Kuncinya hanya tampil sekali; langsung tempel di Supabase pada langkah berikut.
   3. Di Supabase **Authentication > Emails > SMTP Settings**, nyalakan **Enable custom SMTP**: sender `noreply@silentcx.com`, nama `SilentCX`, host `smtp.resend.com`, port `465`, username `resend`, password = API key Resend.
5. **Authentication > Rate Limits**: naikkan **Rate limit for sending emails** menjadi `100` per jam (batas harian Resend paket gratis juga 100).
6. **Captcha (Cloudflare Turnstile)**, untuk menahan bot di form daftar, masuk, dan lupa password:
   1. Di [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile > Add widget**: nama `SilentCX`, hostname `silentcx.com` dan `www.silentcx.com`, mode **Managed**. Salin **Site Key** dan **Secret Key**.
   2. Di Supabase **Authentication > Attack Protection**: nyalakan **Enable Captcha protection**, provider **Turnstile by Cloudflare**, tempel **Secret Key**.
   3. Site Key diisi di Vercel sebagai `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (langkah 8d). Isi keduanya bersamaan: kalau captcha di Supabase menyala tetapi Site Key belum ada di Vercel, tidak ada yang bisa masuk atau daftar.

### 8b-2. Email notifikasi (tawaran tugas, tagihan, laporan, dan lain-lain)

Email notifikasi dikirim aplikasi lewat Resend, memakai API key yang sama dengan SMTP. Jadwal database memanggil `https://silentcx.com/api/email/dispatch` setiap menit dengan kunci rahasia.

1. Buat kunci rahasia acak di laptop (simpan, jangan dikirim lewat chat):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Di Supabase produksi **SQL Editor**, jalankan (ganti `KUNCI_RAHASIA` dengan hasil langkah 1):

   ```sql
   insert into app_private.settings (key, value) values
     ('email_dispatch_url', 'https://silentcx.com/api/email/dispatch'),
     ('email_dispatch_secret', 'KUNCI_RAHASIA')
   on conflict (key) do update set value = excluded.value;
   ```

3. Kunci yang sama diisi di Vercel sebagai `EMAIL_DISPATCH_SECRET`, bersama `RESEND_API_KEY` (langkah 8d).
4. Periksa di **Integrations > Cron** ada jadwal `silentcx-email` (setiap menit). Status setiap email tercatat di kolom `email_status` tabel `notifications`: `sent` terkirim, `failed` gagal 3 kali (alasannya di `email_error`).

### 8c. Akun admin asli

```bash
npm run admin:buat:prod -- emailanda@silentcx.com "Nama Lengkap" 081234567890
```

Password sementara tampil sekali di terminal. Setelah situs online, masuk lalu ganti password di **Akun saya**. Lalu siapkan isi awal:

1. **Katalog**: kota dilayani, rekening dan QRIS pembayaran, harga paket dan add-on, jenis usaha.
2. **Kuesioner**: template kuesioner per paket.
3. **Keuangan > Kontak admin**: nama dan nomor WhatsApp untuk shopper.
4. **Konten**: lengkapi isian bertanda [kurung siku] di **Halaman hukum**, ganti kontak dan testimoni contoh, lalu **Terbitkan**. Peringatan kuning hilang kalau semuanya sudah asli.

### 8d. Vercel

1. [vercel.com](https://vercel.com) → **Add New > Project**, impor repository `silentcx-id/silent-cx`. Framework terdeteksi otomatis (Next.js).
2. **Settings > Environment Variables**, isi untuk environment **Production**:

   | Nama | Isi |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | dari `.env.prod` |
   | `NEXT_PUBLIC_APP_URL` | `https://silentcx.com` |
   | `RESEND_API_KEY` | API key Resend (langkah 8b) |
   | `EMAIL_DISPATCH_SECRET` | kunci rahasia langkah 8b-2 |
   | `EMAIL_FROM` | `SilentCX <noreply@silentcx.com>` |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site Key Turnstile (langkah 8b nomor 6) |

   Jangan isi `SUPABASE_DB_URL`; itu hanya untuk migrasi dari laptop.
   Untuk environment **Preview**, isi dengan kunci staging (`.env.local`), supaya deploy percobaan dari branch lain tidak menyentuh data pelanggan.
3. **Settings > Functions > Function Region**: pilih **Singapore (sin1)**, sama dengan database produksi.
4. **Settings > Domains**: tambahkan `silentcx.com` dan `www.silentcx.com` (arahkan www ke silentcx.com). Pasang record DNS persis seperti yang ditampilkan Vercel.
5. **Deployments > Redeploy** setelah environment variables terisi.

### 8e. Uji setelah online

1. Daftar sebagai pemilik bisnis dengan email asli: email konfirmasi masuk dari `noreply@silentcx.com` (bukan folder Spam), tautan membuka dashboard.
2. **Lupa password** di halaman masuk: email masuk, tautan membuka **Buat password baru**, lalu langsung masuk.
3. Setelah pesanan dikonfirmasi admin, client menerima email "Tagihan Anda siap dibayar" dalam 1–2 menit.
4. Buka `/privasi` dan `/syarat`, dan pastikan tidak ada lagi isian [kurung siku].
5. Lakukan satu pesanan sampai tahap bukti bayar, lalu verifikasi sebagai admin.
