"use client";

import Link from "next/link";
import { useEffect } from "react";
import { errorDigest } from "@/lib/error-digest";

// Halaman saat terjadi error tak terduga (misalnya database sedang tidak terjangkau).
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-content-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold">Maaf, halaman ini gagal dimuat.</h1>
      <p className="max-w-md text-muted">Biasanya karena koneksi ke server sedang terganggu. Coba lagi beberapa saat lagi. Kalau terus terjadi, hubungi tim SilentCX.</p>
      {digest && <p className="font-mono text-xs text-muted">Kode: {digest}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Coba lagi
        </button>
        <Link href="/" className="btn">
          Ke beranda
        </Link>
      </div>
    </main>
  );
}
