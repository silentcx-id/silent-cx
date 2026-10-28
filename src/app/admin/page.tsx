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
  await supabase.rpc("expire_overdue");
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [pendingShoppers, reviews, payments] = await Promise.all([
    // Hanya lamaran yang sudah dikirim (lulus kuis dan pakta); draft belum perlu keputusan.
    count(supabase.from("shopper_applications").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "awaiting_review")),
    count(supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "verifying")),
  ]);

  // Antrian lain diisi oleh fase yang membangunnya.
  const queues = [
    { label: t.admin.queues.shoppers, count: pendingShoppers, href: "/admin/accounts?tab=pending", phase: 2 },
    { label: t.admin.queues.reviews, count: reviews, href: "/admin/projects?tab=review", phase: 1 },
    { label: t.admin.queues.payments, count: payments, href: "/admin/projects?tab=verify", phase: 1 },
    { label: t.admin.queues.qc, count: null, href: "/admin/qc", phase: 4 },
    { label: t.admin.queues.payouts, count: null, href: "/admin/payouts", phase: 5 },
  ];

  return (
    <>
      <section className="rise grid max-w-3xl gap-3">
        <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{t.admin.title}</h1>
        <p className="text-lg text-muted">{t.admin.lede}</p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
