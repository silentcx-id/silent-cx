import Link from "next/link";
import { addMonths, monthGrid, todayWib } from "@/lib/calendar";
import type { Lang } from "@/lib/i18n";

export type CalendarEvent = { key: string; label: string; tone: "open" | "booked" | "alert" | "done" };

const TONE: Record<CalendarEvent["tone"], string> = {
  open: "bg-good/15 text-good",
  booked: "bg-accent/20 text-fg",
  alert: "bg-bad/15 text-bad",
  done: "bg-line/60 text-muted",
};

const WEEKDAYS: Record<Lang, string[]> = {
  id: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

// Kalender bulanan berbasis tautan (?bulan=…&tgl=…). Di layar kecil tampil sebagai daftar tanggal yang berisi acara.
// `query` = parameter lain yang ikut dipertahankan, misalnya "tab=kalender&".
export function MonthCalendar({
  base,
  query = "",
  month,
  selected,
  events,
  lang,
  emptyText,
}: {
  base: string;
  query?: string;
  month: string;
  selected: string | null;
  events: Record<string, CalendarEvent[]>;
  lang: Lang;
  emptyText: string;
}) {
  const days = monthGrid(month);
  const today = todayWib();
  const locale = lang === "en" ? "en-GB" : "id-ID";
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const dayLabel = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const href = (m: string, d?: string) => `${base}?${query}bulan=${m}${d ? `&tgl=${d}` : ""}`;
  const listed = days.filter((d) => d.startsWith(month) && events[d]?.length);

  return (
    <section className="card grid gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <Link href={href(addMonths(month, -1))} className="btn px-3" aria-label={lang === "en" ? "Previous month" : "Bulan sebelumnya"} scroll={false}>
          ←
        </Link>
        <h2 className="text-lg font-extrabold capitalize">{title}</h2>
        <Link href={href(addMonths(month, 1))} className="btn px-3" aria-label={lang === "en" ? "Next month" : "Bulan berikutnya"} scroll={false}>
          →
        </Link>
      </div>

      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-semibold text-muted">
          {WEEKDAYS[lang].map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <ul className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const list = events[d] ?? [];
            const inMonth = d.startsWith(month);
            const active = d === selected;
            return (
              <li key={d} className="min-w-0">
                <Link
                  href={href(month, d)}
                  scroll={false}
                  aria-current={active ? "date" : undefined}
                  aria-label={`${dayLabel(d)}${list.length ? `, ${list.length}` : ""}`}
                  className={`grid h-full min-h-24 content-start gap-1 rounded-lg border p-1.5 text-left transition hover:border-muted ${
                    active ? "border-accent ring-1 ring-accent" : "border-line"
                  } ${inMonth ? "" : "opacity-45"}`}
                >
                  <span className={`w-fit rounded px-1 text-xs font-semibold tabular-nums ${d === today ? "bg-accent text-accent-ink" : ""}`}>{Number(d.slice(8))}</span>
                  {list.slice(0, 3).map((e) => (
                    <span key={e.key} className={`break-words rounded px-1 py-0.5 text-[11px] leading-tight ${TONE[e.tone]}`}>
                      {e.label}
                    </span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[11px] text-muted">+{list.length - 3}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="grid gap-2 sm:hidden">
        {listed.length === 0 && <li className="text-sm text-muted">{emptyText}</li>}
        {listed.map((d) => (
          <li key={d}>
            <Link
              href={href(month, d)}
              scroll={false}
              aria-current={d === selected ? "date" : undefined}
              className={`grid gap-1.5 rounded-lg border p-3 ${d === selected ? "border-accent ring-1 ring-accent" : "border-line"}`}
            >
              <span className="text-sm font-semibold">{dayLabel(d)}</span>
              <span className="flex flex-wrap gap-1">
                {events[d].map((e) => (
                  <span key={e.key} className={`rounded px-1.5 py-0.5 text-xs ${TONE[e.tone]}`}>
                    {e.label}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
