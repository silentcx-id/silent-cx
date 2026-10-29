import type { NextConfig } from "next";

// Header keamanan untuk semua halaman: tidak boleh ditampilkan di dalam situs lain (clickjacking), browser tidak
// menebak jenis file, alamat lengkap tidak bocor ke situs lain, dan izin perangkat dibatasi. Lokasi tetap boleh
// untuk check-in shopper; kamera tidak perlu izin karena foto diambil lewat pilihan file.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Build dan uji lokal bisa diarahkan ke folder lain supaya tidak bentrok dengan server dev yang sedang berjalan.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // react-pdf berjalan di Node apa adanya (tidak dibundel), dan font serta logo PDF ikut terbawa saat deploy.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: { "/**": ["./assets/pdf/**"] },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
