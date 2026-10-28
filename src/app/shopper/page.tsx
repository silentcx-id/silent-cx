import type { Metadata } from "next";
import Link from "next/link";
import { MilestoneTrack } from "@/components/milestone-track";
import { NotificationList } from "@/components/notification-list";
import { windowLabel, type ShopperTaskRow } from "@/lib/field";
import { date, dateTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { applicationStage, getBankAccount, getLatestApplication, getNotifications, reapplyDate } from "@/lib/shopper";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Beranda" };

const title = "text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight";

export default async function ShopperHome() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper"), getLang()]);
  const t = dict(lang);
  const s = t.shopper;
  const [app, notifications] = await Promise.all([getLatestApplication(viewer.id), getNotifications(viewer.id)]);
  const notes = notifications.length > 0 && <NotificationList items={notifications} lang={lang} />;

  if (viewer.status === "active") {
    const supabase = await createClient();
    const [bank, { data: taskData }] = await Promise.all([getBankAccount(viewer.id), supabase.rpc("shopper_tasks")]);
    const tasks = (taskData ?? []) as ShopperTaskRow[];
    const offers = tasks.filter((x) => x.status === "offered");
    const running = tasks.filter((x) => x.status === "revision" || x.status === "accepted" || x.status === "in_progress");
    // Milestone shopper: 3 terima tugas, 4 kunjungan, 5 submit & QC.
    const milestone = running.length ? 4 : tasks.some((x) => x.status === "submitted") && !offers.length ? 5 : 3;
    return (
      <>
        <section className="rise grid max-w-3xl gap-3">
          <span className="chip w-fit border-good/50 text-good">{t.status.active}</span>
          <h1 className={title}>{s.activeTitle(viewer.fullName)}</h1>
          <p className="max-w-[62ch] text-lg text-muted">{s.activeLede}</p>
        </section>
        {!bank && (
          <section className="card flex flex-wrap items-center justify-between gap-4 border-accent p-6">
            <p className="max-w-[56ch]">{s.bankMissing}</p>
            <Link href="/shopper/profile" className="btn btn-primary">
              {s.fillBank} →
            </Link>
          </section>
        )}
        {notes}
        <section className="grid gap-3">
          <h2 className="eyebrow">Milestone</h2>
          <MilestoneTrack role="shopper" current={milestone} lang={lang} />
        </section>
        {offers.length + running.length === 0 ? (
          <section className="card grid gap-2 p-6">
            <p className="font-semibold">{s.noTasks}</p>
          </section>
        ) : (
          <section className="grid gap-3">
            <h2 className="eyebrow">{t.tasks.title}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {[...offers, ...running].map((x) => (
                <li key={x.id}>
                  <Link href={`/shopper/assignments/${x.id}`} className={`card grid h-full gap-1 p-5 transition hover:border-muted ${x.status === "offered" ? "border-accent" : ""}`}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="chip">{t.tasks.status[x.status]}</span>
                      {x.urgent && <span className="chip border-accent text-mark">{t.tasks.urgent}</span>}
                    </span>
                    <span className="font-extrabold">{x.outlet_name || x.city}</span>
                    <span className="text-sm text-muted">
                      {x.city} · {windowLabel(x, lang)}
                    </span>
                    {x.status === "offered" && x.respond_by && <span className="text-sm font-semibold text-mark">{t.tasks.respondBy(dateTime(x.respond_by, lang))}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  // Pelamar: belum mengisi atau masih draft, sedang ditinjau, atau ditolak (dan kapan boleh melamar lagi).
  const stage = applicationStage(app);
  const rejected = stage === "rejected";
  const reviewing = stage === "submitted";
  const label = rejected ? t.status.rejected : reviewing ? t.status.pending : t.application.status.none;
  return (
    <>
      <section className="rise grid max-w-3xl gap-3">
        <span className={`chip w-fit ${rejected ? "border-bad/50 text-bad" : "border-warn/50 text-warn"}`}>{label}</span>
        <h1 className={title}>{rejected ? s.rejectedTitle : reviewing ? s.pendingTitle : s.draftTitle}</h1>
        {rejected ? (
          <div className="card grid gap-1 p-4">
            <span className="text-sm text-muted">{s.rejectedReason}</span>
            <p>{app?.decision_note ?? viewer.statusNote}</p>
            <p className="mt-2 text-sm font-semibold">{t.application.reapplyOn(date(reapplyDate(app?.decided_at ?? null), lang))}</p>
          </div>
        ) : (
          <p className="max-w-[62ch] text-lg text-muted">{reviewing ? s.pendingLede : s.draftLede}</p>
        )}
      </section>
      {!rejected && !reviewing && (
        <section className="card flex flex-wrap items-center justify-between gap-4 border-accent p-6">
          <p className="max-w-[56ch] text-sm text-muted">{t.application.privacy}</p>
          <Link href="/shopper/profile" className="btn btn-primary">
            {s.openApplication} →
          </Link>
        </section>
      )}
      {notes}
      <section className="grid gap-3">
        <h2 className="eyebrow">Milestone</h2>
        <MilestoneTrack role="shopper" current={reviewing || rejected ? 2 : 1} lang={lang} />
      </section>
    </>
  );
}
