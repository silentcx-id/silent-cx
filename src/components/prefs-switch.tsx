"use client";

import { useTransition } from "react";
import { setLanguage } from "@/app/prefs-actions";
import { dict, ENGLISH_ENABLED, type Lang } from "@/lib/i18n";

// Tombol ID | EN. Tidak tampil selama terjemahan Inggris belum lengkap (ENGLISH_ENABLED).
export function PrefsSwitch({ lang }: { lang: Lang }) {
  const [pending, start] = useTransition();
  if (!ENGLISH_ENABLED) return null;
  const t = dict(lang).common;
  const seg = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold rounded-full transition ${active ? "bg-accent text-accent-ink" : "text-muted hover:text-fg"}`;

  return (
    <div className="flex rounded-full border border-line p-0.5" role="group" aria-label={t.language} aria-busy={pending}>
      {(["id", "en"] as const).map((l) => (
        <button key={l} type="button" className={seg(lang === l)} aria-pressed={lang === l} onClick={() => start(() => setLanguage(l))}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
