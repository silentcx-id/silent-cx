"use client";

import { useEffect, useRef } from "react";

// Captcha Cloudflare Turnstile untuk form masuk, daftar, lupa password, kirim ulang, dan ganti password.
// Hanya tampil kalau NEXT_PUBLIC_TURNSTILE_SITE_KEY diisi; Supabase yang memeriksa tokennya
// (Authentication > Attack Protection), jadi tanpa kunci form berjalan seperti biasa.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<void> | null = null;
function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Captcha gagal dimuat."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

// Di dalam <form>, Turnstile menambahkan isian tersembunyi "cf-turnstile-response" sendiri.
// onToken dipanggil setiap token baru (atau "" saat kedaluwarsa); resetKey yang berubah meminta token baru,
// karena satu token hanya berlaku untuk satu kali kirim.
export function Turnstile({ onToken, resetKey }: { onToken?: (token: string) => void; resetKey?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: "id",
          theme: "dark",
          callback: (t: string) => cb.current?.(t),
          "expired-callback": () => cb.current?.(""),
          "error-callback": () => cb.current?.(""),
        });
      })
      .catch(() => cb.current?.(""));
    return () => {
      alive = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (widget.current && resetKey !== undefined) {
      window.turnstile?.reset(widget.current);
      cb.current?.("");
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
