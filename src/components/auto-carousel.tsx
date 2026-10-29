"use client";

import { Children, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Pilihan "kurangi animasi" di perangkat pengunjung.
const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const media = window.matchMedia(REDUCE);
  media.addEventListener("change", cb);
  return () => media.removeEventListener("change", cb);
};

// Deretan kartu yang bergeser otomatis satu per satu. Lebar kartu diatur lewat `itemClass`
// (misalnya 3 kartu di layar lebar, 1 di HP). Berhenti saat kursor di atasnya, saat disentuh, atau saat
// fokus keyboard ada di dalamnya; tidak bergeser otomatis kalau pengunjung memilih mengurangi animasi.
// Tanpa JavaScript tetap bisa digeser manual (scroll-snap).
export function AutoCarousel({
  children,
  itemClass,
  label,
  labels,
  interval = 5000,
}: {
  children: React.ReactNode;
  itemClass: string;
  label: string;
  labels: { prev: string; next: string; goTo: string[] };
  interval?: number;
}) {
  const track = useRef<HTMLUListElement>(null);
  const items = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(1);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCE).matches, () => true);
  const last = Math.max(0, items.length - visible);

  // Jumlah kartu yang terlihat dan posisi sekarang dihitung dari ukuran sebenarnya.
  const measure = useCallback(() => {
    const el = track.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    setVisible(Math.max(1, Math.round((el.clientWidth + 1) / step)));
    setIndex(Math.round(el.scrollLeft / step));
  }, []);

  const go = useCallback((i: number) => {
    const el = track.current;
    const target = el?.children[i] as HTMLElement | undefined;
    if (!el || !target) return;
    el.scrollTo({ left: target.offsetLeft - (el.children[0] as HTMLElement).offsetLeft, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useEffect(() => {
    if (paused || reduced || last === 0) return;
    const id = window.setInterval(() => go(index >= last ? 0 : index + 1), interval);
    return () => window.clearInterval(id);
  }, [paused, reduced, last, index, interval, go]);

  const showNav = last > 0;
  return (
    <div
      className="grid gap-4"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => window.setTimeout(() => setPaused(false), 4000)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ul ref={track} onScroll={measure} className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-1 pb-2">
        {items.map((child, i) => (
          <li key={i} className={`shrink-0 snap-start ${itemClass}`} aria-roledescription="slide" aria-label={`${i + 1} / ${items.length}`}>
            {child}
          </li>
        ))}
      </ul>
      {showNav && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: last + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={labels.goTo[i] ?? String(i + 1)}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i)}
                className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-accent" : "w-2.5 bg-line hover:bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn size-11 p-0" aria-label={labels.prev} onClick={() => go(index <= 0 ? last : index - 1)}>
              ←
            </button>
            <button type="button" className="btn size-11 p-0" aria-label={labels.next} onClick={() => go(index >= last ? 0 : index + 1)}>
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
