import type { Metadata } from "next";
import Link from "next/link";
import { MilestoneTrack } from "@/components/milestone-track";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Antrian kerja" };

export default async function AdminHome() {
  const [, lang] = await Promise.all([requireRole("admin", "/admin"), getLang()]);
  const t = dict(lang);
  const supabase = await createClient();
  const { count: pendingShoppers } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "shopper")
    .eq("status", "pending");

  // Antrian lain diisi oleh fase yang membangunnya.
  const queues = [
    { label: t.admin.queues.shoppers, count: pendingShoppers ?? 0, href: "/admin/accounts?tab=pending", phase: 0 },
    { label: t.admin.queues.payments, count: null, href: "/admin/projects", phase: 1 },
    { label: t.admin.queues.qc, count: null, href: "/admin/qc", phase: 4 },
    { label: t.admin.queues.payouts, count: null, href: "/admin/payouts", phase: 5 },
  ];

  return (
    <>
      <section className="rise grid max-w-3xl gap-3">
        <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{t.admin.title}</h1>
        <p className="text-lg text-muted">{t.admin.lede}</p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {queues.map((q) => (
          <li key={q.label}>
            <Link
              href={q.href}
              className={`card grid h-full content-between gap-4 p-5 transition hover:border-muted ${q.count ? "border-accent" : ""}`}
            >
              <span className="text-sm text-muted">{q.label}</span>
              {q.count === null ? (
                <span className="chip w-fit">{t.common.comingIn(q.phase)}</span>
              ) : (
                <span className={`font-display text-5xl font-extrabold tabular-nums ${q.count ? "text-mark" : ""}`}>{q.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <section className="grid gap-3">
        <h2 className="eyebrow">Milestone</h2>
        <MilestoneTrack role="admin" lang={lang} />
      </section>
    </>
  );
}
