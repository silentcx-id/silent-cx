// Kerangka abu-abu selama halaman dashboard dimuat, supaya klik menu langsung terasa ada responsnya.
export function PageSkeleton({ label = "Memuat…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid animate-pulse gap-6">
      <span className="sr-only">{label}</span>
      <div className="grid gap-3">
        <div className="h-9 w-2/3 max-w-md rounded-lg bg-raise" />
        <div className="h-4 w-full max-w-xl rounded bg-raise" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-line bg-surface" />
    </div>
  );
}
