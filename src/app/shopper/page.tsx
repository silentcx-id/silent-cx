import type { Metadata } from "next";
import Link from "next/link";
import { MilestoneTrack } from "@/components/milestone-track";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Beranda" };

export default async function ShopperHome() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper"), getLang()]);
  const t = dict(lang);
  const s = t.shopper;

  if (viewer.status === "active") {
    return (
      <>
        <section className="rise grid max-w-3xl gap-3">
          <span className="chip w-fit border-good/50 text-good">{t.status.active}</span>
          <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{s.activeTitle(viewer.fullName)}</h1>
          <p className="max-w-[62ch] text-lg text-muted">{s.activeLede}</p>
        </section>
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

  const rejected = viewer.status === "rejected";
  return (
    <>
      <section className="rise grid max-w-3xl gap-3">
        <span className={`chip w-fit ${rejected ? "border-bad/50 text-bad" : "border-warn/50 text-warn"}`}>{t.status[viewer.status]}</span>
        <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{rejected ? s.rejectedTitle : s.pendingTitle}</h1>
        {rejected ? (
          <div className="card grid gap-1 p-4">
            <span className="text-sm text-muted">{s.rejectedReason}</span>
            <p>{viewer.statusNote}</p>
          </div>
        ) : (
          <p className="max-w-[62ch] text-lg text-muted">{s.pendingLede}</p>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="eyebrow">Milestone</h2>
        <MilestoneTrack role="shopper" current={2} lang={lang} />
      </section>
      {!rejected && (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="max-w-[56ch]">{s.pendingNext}</p>
          <Link href="/shopper/profile" className="btn btn-primary">
            {t.common.nextStep} →
          </Link>
        </section>
      )}
    </>
  );
}
