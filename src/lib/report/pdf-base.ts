import { Font } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import path from "node:path";

// Bagian bersama semua PDF SilentCX (laporan dan invoice): font, logo, dan warna.
// Font dan logo disimpan di assets/pdf (lisensi SIL OFL) supaya tidak bergantung internet.

const ASSETS = path.join(process.cwd(), "assets", "pdf");
Font.register({
  family: "Familjen",
  fonts: [
    { src: path.join(ASSETS, "familjen-grotesk-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(ASSETS, "familjen-grotesk-latin-600-normal.woff"), fontWeight: 600 },
  ],
});
Font.register({
  family: "Bricolage",
  fonts: [
    { src: path.join(ASSETS, "bricolage-grotesque-latin-500-normal.woff"), fontWeight: 500 },
    { src: path.join(ASSETS, "bricolage-grotesque-latin-800-normal.woff"), fontWeight: 800 },
  ],
});
// Gambar lokal dibaca sebagai data URI: path Windows (C:\…) dikira alamat web oleh react-pdf.
export const LOGO = `data:image/png;base64,${readFileSync(path.join(ASSETS, "logo-hitam.png")).toString("base64")}`;

// Kata panjang tidak dipotong dengan tanda hubung.
Font.registerHyphenationCallback((word) => [word]);

export const C = { gold: "#E5A93C", goldSoft: "#FBF1DD", ink: "#06080C", text: "#1F232B", muted: "#6B7280", line: "#E5E7EB", track: "#F1F2F4", bad: "#C2410C", warn: "#B45309", good: "#15803D" };
