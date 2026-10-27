import { dict, type Lang } from "@/lib/i18n";
import { MILESTONES, type Role } from "@/lib/roles";

// Timeline milestone: yang sudah lewat dicentang, tahap saat ini kuning, sisanya redup.
// `current` dihitung dari 1; tanpa `current` semua milestone tampil netral (alur kerja admin yang berulang).
export function MilestoneTrack({ role, current, lang }: { role: Role; current?: number; lang: Lang }) {
  const t = dict(lang).common;
  const items = MILESTONES[role];
  return (
    <ol className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]" aria-label="Milestone">
      {items.map((m, i) => {
        const n = i + 1;
        const state = current === undefined ? "neutral" : n < current ? "done" : n === current ? "current" : "upcoming";
        return (
          <li
            key={m.title.id}
            aria-current={state === "current" ? "step" : undefined}
            className={`relative grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl border p-3 sm:grid-cols-1 ${
              state === "current" ? "border-accent bg-accent/10" : "border-line"
            } ${state === "upcoming" ? "opacity-60" : ""}`}
          >
            <span
              className={`grid size-8 place-items-center rounded-full font-display text-sm font-extrabold tabular-nums ${
                state === "upcoming" || state === "neutral" ? "border border-line text-muted" : "bg-accent text-accent-ink"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className="grid gap-0.5">
              <span className="font-semibold leading-tight">{m.title[lang]}</span>
              <span className="text-xs text-muted">{state === "current" ? t.youAreHere : state === "done" ? t.done : m.goal[lang]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
