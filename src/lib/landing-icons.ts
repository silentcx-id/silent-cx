// Ikon garis untuk kartu landing page, dipilih admin per butir di menu Konten.
// Digambar sendiri (bukan dari pustaka ikon), satu gaya dengan ikon menu.
export const LANDING_ICONS = {
  eye: { label: "Mata (pengamatan)", d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  search: { label: "Kaca pembesar", d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5" },
  shield: { label: "Perisai (rahasia, aman)", d: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zM9 12l2 2 4-4" },
  lock: { label: "Gembok", d: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3M12 15v2" },
  camera: { label: "Kamera (bukti foto)", d: "M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  pin: { label: "Lokasi GPS", d: "M12 21s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  check: { label: "Centang dalam lingkaran", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6" },
  clipboard: { label: "Papan klip (SOP)", d: "M8 4h8v3H8zM6 5H5v16h14V5h-1M9 12h6M9 16h4" },
  chart: { label: "Grafik batang", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  trend: { label: "Grafik naik", d: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  target: { label: "Target", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01" },
  store: { label: "Toko / outlet", d: "M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6" },
  branches: { label: "Cabang banyak", d: "M3 21V10l5-3 5 3v11M13 21V6l4-3 4 3v15M6 14h4M16 10h2M16 14h2" },
  users: { label: "Tim / orang", d: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7" },
  smile: { label: "Senyum (sikap)", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" },
  frown: { label: "Pelanggan kecewa", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 16a4 4 0 0 1 7 0M9 9.5h.01M15 9.5h.01" },
  message: { label: "Pesan / chat", d: "M4 5h16v11H9l-5 4z" },
  book: { label: "Buku (pengetahuan)", d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6" },
  clock: { label: "Jam (kecepatan)", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
  sparkle: { label: "Kilau (kebersihan)", d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" },
  tag: { label: "Label harga (upselling)", d: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01" },
  wallet: { label: "Dompet (bayaran)", d: "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 14h2" },
  calendar: { label: "Kalender (waktu fleksibel)", d: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4" },
  lightbulb: { label: "Lampu (rekomendasi)", d: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" },
  file: { label: "Dokumen / laporan", d: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" },
  star: { label: "Bintang", d: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
} as const;

export type LandingIcon = keyof typeof LANDING_ICONS;

export function isLandingIcon(value: unknown): value is LandingIcon {
  return typeof value === "string" && value in LANDING_ICONS;
}
