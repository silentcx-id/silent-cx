"use client";

import { errorDigest } from "@/lib/error-digest";
import "./globals.css";

// Cadangan terakhir kalau layout utama sendiri gagal; harus punya <html> dan <body> sendiri.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);
  return (
    <html lang="id" data-theme="dark">
      <body className="min-h-dvh antialiased">
        <main className="grid min-h-dvh place-content-center gap-4 px-4 text-center">
          <h1 className="text-2xl font-extrabold">Maaf, SilentCX sedang bermasalah.</h1>
          <p className="max-w-md text-muted">Coba muat ulang beberapa saat lagi. Kalau terus terjadi, hubungi tim SilentCX.</p>
          {digest && <p className="font-mono text-xs text-muted">Kode: {digest}</p>}
          <button type="button" className="btn btn-primary mx-auto" onClick={() => retry()}>
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
