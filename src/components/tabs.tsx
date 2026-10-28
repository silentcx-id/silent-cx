import Link from "next/link";

export type TabItem = { id: string; label: string; count?: number; alert?: boolean };

// Tab halaman berbasis tautan (?tab=…), jadi tetap jalan tanpa JavaScript dan bisa dibagikan sebagai link.
// `count` tampil sebagai angka kecil; `alert` mewarnainya merah untuk antrian yang terlambat.
export function Tabs({ base, items, current, label, extra = "" }: { base: string; items: TabItem[]; current: string; label: string; extra?: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {items.map((t) => {
          const active = t.id === current;
          return (
            <li key={t.id} className="flex-none">
              <Link
                href={`${base}?tab=${t.id}${extra}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
                  active ? "border-accent font-semibold text-fg" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {t.label}
                {t.count ? (
                  <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${t.alert ? "bg-bad text-white" : "bg-accent text-accent-ink"}`}>{t.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Memilih tab dari ?tab=, atau `fallback` kalau tidak dikenal.
export function pickTab<T extends string>(value: unknown, ids: readonly T[], fallback: T): T {
  return ids.includes(value as T) ? (value as T) : fallback;
}
