"use client";

import { useTransition } from "react";
import { setLanguage, setTheme } from "@/app/prefs-actions";
import { dict, type Lang } from "@/lib/i18n";
import type { Theme } from "@/lib/prefs";

// Tombol ID | EN dan Gelap | Terang.
export function PrefsSwitch({ lang, theme }: { lang: Lang; theme: Theme }) {
  const [pending, start] = useTransition();
  const t = dict(lang).common;
  const seg = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold rounded-full transition ${active ? "bg-accent text-accent-ink" : "text-muted hover:text-fg"}`;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div className="flex rounded-full border border-line p-0.5" role="group" aria-label={t.language}>
        {(["id", "en"] as const).map((l) => (
          <button key={l} type="button" className={seg(lang === l)} aria-pressed={lang === l} onClick={() => start(() => setLanguage(l))}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex rounded-full border border-line p-0.5" role="group" aria-label={t.theme}>
        {(["dark", "light"] as const).map((th) => (
          <button
            key={th}
            type="button"
            className={seg(theme === th)}
            aria-pressed={theme === th}
            onClick={() => {
              // Langsung diterapkan dan disimpan di browser, supaya tetap benar walau halaman dimuat ulang
              // sebelum server selesai menyimpannya.
              document.documentElement.dataset.theme = th;
              document.cookie = `theme=${th}; path=/; max-age=31536000; samesite=lax`;
              start(() => setTheme(th));
            }}
          >
            {th === "dark" ? t.dark : t.light}
          </button>
        ))}
      </div>
    </div>
  );
}
