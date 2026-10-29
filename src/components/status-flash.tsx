"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "./toaster";

// Pesan sekali tampil setelah diarahkan dari halaman lain (?status=...), lalu parameternya dihapus dari alamat.
export function StatusFlash({ messages }: { messages: Record<string, string> }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const status = params.get("status");
  const text = status ? messages[status] : undefined;
  useEffect(() => {
    if (!text) return;
    // Ditunda satu giliran supaya penampung toast sudah siap.
    const id = setTimeout(() => toast("ok", text), 0);
    const rest = new URLSearchParams(params);
    rest.delete("status");
    router.replace(rest.size ? `${path}?${rest}` : path, { scroll: false });
    return () => clearTimeout(id);
  }, [text, params, path, router]);
  return null;
}
