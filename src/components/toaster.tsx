"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; tone: "ok" | "error"; text: string };

// Pesan pop-up di pojok layar untuk hasil simpan atau error. toast() bisa dipanggil dari komponen mana saja;
// <Toaster /> dipasang sekali di layout utama.
let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

export function toast(tone: Toast["tone"], text: string) {
  const t = { id: nextId++, tone, text };
  listeners.forEach((fn) => fn(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setItems((list) => [...list.filter((x) => x.text !== t.text), t].slice(-3));
      // Error dibiarkan lebih lama supaya sempat dibaca.
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.tone === "error" ? 8000 : 4000);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 grid justify-items-center gap-2 sm:inset-x-auto sm:right-4 sm:justify-items-end">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface p-4 text-sm shadow-lg ${
            t.tone === "error" ? "border-bad/60" : "border-good/60"
          }`}
        >
          <span aria-hidden="true" className={`font-bold ${t.tone === "error" ? "text-bad" : "text-good"}`}>
            {t.tone === "error" ? "!" : "✓"}
          </span>
          <span className="flex-1">{t.text}</span>
          <button type="button" className="text-muted hover:text-fg" aria-label="Tutup" onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
