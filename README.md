# silentCX

Platform audit pengalaman pelanggan lewat mystery shopping, dengan tiga role: pemilik bisnis (client), mystery shopper, dan admin silentCX.

- Spesifikasi dan rencana fase: [silentCX — Spesifikasi & Rencana Rebuild](https://claude.ai/artifact/NbbYKuSNRHBYfxVZfoZegL)
- Setup Supabase dan Vercel: [docs/SETUP.md](docs/SETUP.md)
- Daftar uji coba per fase: [docs/UJI-COBA.md](docs/UJI-COBA.md)

## Stack

Next.js 16 (App Router, `src/proxy.ts`), React 19, Supabase (Auth, Postgres dengan RLS, Storage), Tailwind CSS 4, deploy ke Vercel.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan aplikasi di `http://localhost:3000` |
| `npm run check` | Type-check, lint, dan semua tes database |
| `npm run env:cek` | Memeriksa kunci di `.env.local` tanpa menampilkan isinya |
| `npm run db:migrate` | Memasang migrasi database yang belum terpasang |
| `npm run demo:akun` | Membuat akun demo; password hanya tampil di terminal |

## Struktur

- `supabase/migrations/` — skema database, RLS, dan fungsi; satu file per fase.
- `src/app/(auth)/` — masuk, daftar client, daftar shopper.
- `src/app/app/`, `src/app/shopper/`, `src/app/admin/` — dashboard tiap role.
- `src/lib/roles.ts` — menu dan milestone tiap role.
- `src/lib/i18n.ts` — teks Bahasa Indonesia dan Inggris.
- `tests/` — tes database dengan Postgres sungguhan (PGlite) dan pengecekan headless di `tests/e2e/`.
