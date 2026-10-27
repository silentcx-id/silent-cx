import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Setiap file tes menyalakan Postgres (PGlite) sendiri; butuh waktu lebih dari bawaan.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
