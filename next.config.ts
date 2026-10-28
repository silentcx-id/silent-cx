import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build dan uji lokal bisa diarahkan ke folder lain supaya tidak bentrok dengan server dev yang sedang berjalan.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // react-pdf berjalan di Node apa adanya (tidak dibundel), dan font serta logo PDF ikut terbawa saat deploy.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: { "/**": ["./assets/pdf/**"] },
};

export default nextConfig;
