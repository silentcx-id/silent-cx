import type { Metadata } from "next";
import Link from "next/link";
import { NotificationList } from "./notification-list";
import { MilestoneTrack } from "@/components/milestone-track";
import { date } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { applicationStage, getBankAccount, getLatestApplication, getNotifications, reapplyDate } from "@/lib/shopper";

export const metadata: Metadata = { title: "Beranda" };

const title = "text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight";

export default async function ShopperHome() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper"), getLang()]);
  const t = dict(lang);
  const s = t.shopper;
  const [app, notifications] = await Promise.all([getLatestApplication(viewer.id), getNotifications(viewer.id)]);
  const notes = notifications.length > 0 && <NotificationList items={notifications} lang={lang} />;

  if (viewer.status === "active") {
    const bank = await getBankAccount(viewer.id);
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
          <MilestoneTrack role="shopper" current={3} lang={lang} />
        </section>
        <section className="card grid gap-2 p-6">
          <p className="font-semibold">{s.noTasks}</p>
          <span className="chip w-fit">{t.common.comingIn(3)}</span>
        </section>
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
