// Timeline tahapan: garis dengan titik per tahap. Tahap yang sudah lewat dicentang, tahap saat ini kuning,
// sisanya redup. `current` dihitung dari 0; nilai sama dengan jumlah tahap berarti semua selesai.
// Di HP tampil vertikal, di layar lebar horizontal.
export function Stepper({ steps, current, label, hereLabel }: { steps: { title: string; hint?: string }[]; current: number; label: string; hereLabel: string }) {
  return (
    <ol aria-label={label} className="grid gap-0 sm:flex sm:items-start">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        const last = i === steps.length - 1;
        return (
          <li
            key={s.title}
            aria-current={state === "current" ? "step" : undefined}
            className="relative grid grid-cols-[auto_1fr] gap-3 pb-5 last:pb-0 sm:flex-1 sm:grid-cols-1 sm:justify-items-center sm:gap-2 sm:pb-0 sm:text-center"
          >
            {/* Garis penghubung ke tahap berikutnya: vertikal di HP, horizontal di layar lebar. */}
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 sm:left-[calc(50%+16px)] sm:top-[15px] sm:h-0.5 sm:w-[calc(100%-32px)] ${i < current ? "bg-accent" : "bg-line"}`}
              />
            )}
            <span
              className={`relative z-10 grid size-8 place-items-center rounded-full font-display text-sm font-extrabold tabular-nums ${
                state === "done" ? "bg-accent text-accent-ink" : state === "current" ? "bg-accent text-accent-ink ring-4 ring-accent/30" : "border border-line bg-surface text-muted"
              }`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className={`grid gap-0.5 pt-1 sm:px-1 sm:pt-0 ${state === "upcoming" ? "opacity-60" : ""}`}>
              <span className={`text-sm leading-tight ${state === "current" ? "font-extrabold" : "font-semibold"}`}>{s.title}</span>
              {state === "current" ? <span className="text-xs font-semibold text-mark">{hereLabel}</span> : s.hint ? <span className="text-xs text-muted">{s.hint}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
