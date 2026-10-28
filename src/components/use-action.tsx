"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "./toaster";

type Result<T> = { ok: true; data?: T } | { ok: false; error: string };
export type Status = { tone: "ok" | "error"; text: string } | null;

// Menjalankan aksi server dari tombol/form, menampilkan pesan berhasil atau error sebagai pop-up,
// lalu menyegarkan data halaman.
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setRawStatus] = useState<Status>(null);

  function setStatus(next: Status) {
    setRawStatus(next);
    if (next) toast(next.tone, next.text);
  }

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

// Pesan berhasil cukup tampil sebagai pop-up; error juga tetap ditulis di dekat form supaya tidak hilang.
export function StatusText({ status }: { status: Status }) {
  if (status?.tone !== "error") return null;
  return (
    <p role="alert" className="text-sm text-bad">
      {status.text}
    </p>
  );
}
