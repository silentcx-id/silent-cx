import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build dan uji lokal bisa diarahkan ke folder lain supaya tidak bentrok dengan server dev yang sedang berjalan.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
