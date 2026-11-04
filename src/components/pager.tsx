import Link from "next/link";

// Navigasi halaman sederhana untuk daftar yang dihitung di database.
export function Pager({ page, perPage, total, shown, noun, href, label }: { page: number; perPage: number; total: number; shown: number; noun: string; href: (page: number) => string; label: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage + 1;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted tabular-nums">
        {from}–{from + shown - 1} dari {total} {noun}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className="btn btn-sm" rel="prev">
              ← Sebelumnya
            </Link>
          ) : (
            <span className="btn btn-sm pointer-events-none opacity-40" aria-disabled="true">
              ← Sebelumnya
            </span>
          )}
          <span className="tabular-nums text-muted">
            Halaman {page} dari {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="btn btn-sm" rel="next">
              Berikutnya →
            </Link>
          ) : (
            <span className="btn btn-sm pointer-events-none opacity-40" aria-disabled="true">
              Berikutnya →
            </span>
          )}
        </span>
      )}
    </nav>
  );
}
