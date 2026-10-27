"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result<T> = { ok: true; data?: T } | { ok: false; error: string };
export type Status = { tone: "ok" | "error"; text: string } | null;

// Menjalankan aksi server dari tombol/form, menampilkan pesan berhasil atau error,
// lalu menyegarkan data halaman.
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>(null);

  function act<T>(fn: () => Promise<Result<T>>, success?: string, after?: (data: T | undefined) => void) {
    setStatus(null);
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          if (success) setStatus({ tone: "ok", text: success });
          after?.(res.data);
          router.refresh();
        } else setStatus({ tone: "error", text: res.error });
      } catch {
        setStatus({ tone: "error", text: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi." });
      }
    });
  }

  return { pending, status, setStatus, act };
}

export function StatusText({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role={status.tone === "error" ? "alert" : "status"} className={`text-sm ${status.tone === "error" ? "text-bad" : "text-good"}`}>
      {status.text}
    </p>
  );
}
