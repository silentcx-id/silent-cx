import type { Metadata } from "next";
import Link from "next/link";
import { BookingForm, BuyForm } from "./consultation-forms";
import { MonthCalendar, type CalendarEvent } from "@/components/month-calendar";
import { gridRange, isDay, isMonth, requestTime, todayWib, wibDay } from "@/lib/calendar";
import { displayPrice } from "@/lib/catalog";
import { canReschedule, consultationState, getClientConsultations, getOpenTimes, type Consultation } from "@/lib/consultation";
import { date, dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getClientProjects } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Konsultasi" };

type Addon = { price: number; max_qty: number; promo_pct: number | null; promo_starts_at: string | null; promo_ends_at: string | null };

export default async function ConsultationPage({ searchParams }: PageProps<"/app/consultation">) {
  const [viewer, lang, params] = await Promise.all([requireRole("client", "/app/consultation"), getLang(), searchParams]);
  const t = dict(lang).consultation;
  const supabase = await createClient();
  const [items, projects, addonRes] = await Promise.all([
    getClientConsultations(viewer.id),
    getClientProjects(viewer.id),
    supabase.from("addons").select("price, max_qty, promo_pct, promo_starts_at, promo_ends_at").eq("key", "additional_consultation").eq("active", true).maybeSingle(),
  ]);
  const addon = addonRes.data as Addon | null;
  const now = requestTime();
  const minutes = (n: number) => t.minutes(n);

  const scheduled = items.filter((c) => c.status === "scheduled").sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  const credits = items.filter((c) => consultationState(c, now) === "available").sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  const history = items.filter((c) => ["done", "no_show", "expired"].includes(consultationState(c, now))).reverse();
  const completed = projects.find((p) => p.status === "completed") ?? null;
  const pendingInvoice = projects.some((p) => p.invoices.some((i) => i.kind === "consultation" && (i.status === "unpaid" || i.status === "verifying")));

  // Mode geser jadwal (?ubah=…) atau booking jatah (?sesi=…, bawaan: jatah yang paling cepat berakhir).
  const moving = scheduled.find((c) => c.id === params.ubah && canReschedule(c, now)) ?? null;
  const credit = moving ?? credits.find((c) => c.id === params.sesi) ?? credits[0] ?? null;
  const today = todayWib();
  const month = isMonth(params.bulan) ? params.bulan : isDay(params.tgl) ? params.tgl.slice(0, 7) : today.slice(0, 7);
  const query = moving ? `ubah=${moving.id}&` : credit && credits.length > 1 ? `sesi=${credit.id}&` : "";

  let calendar: React.ReactNode = null;
  if (credit) {
    const range = gridRange(month);
    const limit = new Date(credit.expires_at).getTime() - credit.minutes * 60_000;
    const times = (await getOpenTimes(credit.minutes, range.from, range.to)).filter((s) => new Date(s).getTime() <= limit);
    const byDay: Record<string, string[]> = {};
    for (const s of times) (byDay[wibDay(s)] ??= []).push(s);
    const events: Record<string, CalendarEvent[]> = Object.fromEntries(
      Object.entries(byDay).map(([d, list]) => [d, [{ key: d, label: t.openSlots(list.length), tone: "open" as const }]]),
    );
    const selected = isDay(params.tgl) ? params.tgl : (Object.keys(byDay).sort()[0] ?? null);
    const dayTimes = selected ? (byDay[selected] ?? []) : [];

    calendar = (
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">{moving ? t.rescheduleTitle(moving.code) : t.bookTitle}</h2>
          {moving && (
            <Link href="/app/consultation" className="btn">
              {t.cancelReschedule}
            </Link>
          )}
        </div>
        {!moving && credits.length > 1 && (
          <nav aria-label={t.pickCredit} className="flex flex-wrap gap-2">
            {credits.map((c) => (
              <Link key={c.id} href={`/app/consultation?sesi=${c.id}`} className={`btn text-sm ${c.id === credit.id ? "btn-primary" : ""}`}>
                {minutes(c.minutes)} · {date(c.expires_at, lang)}
              </Link>
            ))}
          </nav>
        )}
        <p className="text-sm text-muted">
          {t.pickDay} {t.mustBefore(dateTime(credit.expires_at, lang))}
        </p>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] xl:items-start">
          <MonthCalendar base="/app/consultation" query={query} month={month} selected={selected} events={events} lang={lang} emptyText={t.noTimes} />
          <aside className="card grid gap-3 p-5">
            {selected ? (
              <>
                <h3 className="text-lg font-extrabold">{date(`${selected}T12:00:00+07:00`, lang)}</h3>
                <BookingForm
                  key={`${credit.id}-${selected}`}
                  mode={moving ? "reschedule" : "book"}
                  id={credit.id}
                  times={dayTimes}
                  labels={{
                    title: t.timesOn(date(`${selected}T12:00:00+07:00`, lang)),
                    topicLabel: t.topicLabel,
                    topicPlaceholder: t.topicPlaceholder,
                    submit: moving ? t.saveReschedule : t.book,
                    success: moving ? t.rescheduled : t.booked,
                    empty: t.noTimesDay,
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-muted">{t.noTimes}</p>
            )}
          </aside>
        </div>
      </section>
    );
  }

  const locked = items.length === 0 && !completed;

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>

      {locked && (
        <section className="card grid gap-2 p-6">
          <p className="font-semibold">{t.lockedTitle}</p>
          <p className="text-muted">{t.lockedBody}</p>
        </section>
      )}

      {scheduled.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-extrabold">{t.upcoming}</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {scheduled.map((c) => (
              <li key={c.id}>
                <Upcoming c={c} lang={lang} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {credits.length > 0 && !moving && (
        <section className="card grid gap-2 p-5">
          <h2 className="text-lg font-extrabold">{t.credits}</h2>
          <ul className="grid gap-1 text-sm">
            {credits.map((c) => (
              <li key={c.id}>{t.creditLine(minutes(c.minutes), dateTime(c.expires_at, lang))}</li>
            ))}
          </ul>
        </section>
      )}

      {calendar}

      {addon && (
        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">{t.buyTitle}</h2>
          <p className="text-sm text-muted">{t.buyLede(rupiah(displayPrice(addon.price, addon)))}</p>
          {pendingInvoice ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">{t.buyPending}</p>
              <Link href="/app/billing" className="btn">
                {t.openBilling} →
              </Link>
            </div>
          ) : completed ? (
            <BuyForm projectId={completed.id} max={addon.max_qty} labels={{ qty: t.buyQty, submit: t.buy, success: t.buyDone }} />
          ) : (
            <p className="text-sm">{t.buyAfterReport}</p>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-extrabold">{t.history}</h2>
          <ul className="grid gap-2">
            {history.map((c) => {
              const state = consultationState(c, now);
              const row = (
                <>
                  <span className="font-mono text-muted">{c.code}</span>
                  <span>{c.starts_at ? dateTime(c.starts_at, lang) : t.creditLine(minutes(c.minutes), dateTime(c.expires_at, lang))}</span>
                  <span className={`chip ${state === "done" ? "text-good" : "text-muted"}`}>{t.state[state]}</span>
                </>
              );
              return (
                <li key={c.id}>
                  {state === "done" ? (
                    <Link href={`/app/consultation/${c.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm transition hover:border-muted">
                      {row}
                      <span className="text-mark">{t.openDetail} →</span>
                    </Link>
                  ) : (
                    <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Upcoming({ c, lang, now }: { c: Consultation; lang: "id" | "en"; now: number }) {
  const t = dict(lang).consultation;
  const movable = canReschedule(c, now);
  return (
    <article className="card grid h-full content-start gap-3 border-accent p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-sm text-muted">{c.code}</span>
        <span className="chip text-mark">{t.minutes(c.minutes)}</span>
      </div>
      <p className="text-xl font-extrabold">{dateTime(c.starts_at, lang)}</p>
      {c.topic && (
        <p className="text-sm">
          <span className="text-muted">{t.topic}:</span> {c.topic}
        </p>
      )}
      {c.status_note && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
          <strong>{t.adminNote}</strong> {c.status_note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {c.meeting_url ? (
          <a href={c.meeting_url} target="_blank" rel="noreferrer" className="btn btn-primary">
            {t.linkOpen} ↗
          </a>
        ) : (
          <p className="w-full text-sm text-muted">{t.linkPending}</p>
        )}
        <a href={`/app/consultation/${c.id}/ics`} className="btn">
          {t.ics}
        </a>
        {movable && (
          <Link href={`/app/consultation?ubah=${c.id}`} className="btn">
            {t.reschedule}
          </Link>
        )}
      </div>
      <p className="text-xs text-muted">{movable ? t.rescheduleRule : c.reschedule_count ? t.rescheduleUsed : t.rescheduleClosed}</p>
    </article>
  );
}
