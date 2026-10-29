import type { Metadata } from "next";
import Link from "next/link";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Antrian kerja" };

export default async function AdminHome() {
  const [, lang] = await Promise.all([requireRole("admin", "/admin"), getLang()]);
  const t = dict(lang);
  // Invoice dan tawaran yang lewat batas ditandai kedaluwarsa oleh jadwal database (pg_cron, setiap 5 menit).
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [pendingShoppers, reviews, payments, unassigned, submitted, payoutQueue, noLink] = await Promise.all([
    // Hanya lamaran yang sudah dikirim (lulus kuis dan pakta); draft belum perlu keputusan.
    count(supabase.from("shopper_applications").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "awaiting_review")),
    // Termasuk tagihan tambahan kelebihan pembelian.
    count(supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "verifying")),
    count(supabase.from("audit_tasks").select("id", { count: "exact", head: true }).eq("status", "open")),
    count(supabase.from("audit_tasks").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    supabase.rpc("admin_payout_queue").then((r) => (r.data ?? []) as { payout_status: string }[]),
    count(supabase.from("consultations").select("id", { count: "exact", head: true }).eq("status", "scheduled").eq("meeting_url", "")),
  ]);
  // Payout yang lewat 48 jam ditandai merah di kartunya.
  const payoutsLate = payoutQueue.filter((p) => p.payout_status === "overdue").length;

  const queues = [
    { label: t.admin.queues.shoppers, count: pendingShoppers, href: "/admin/accounts?tab=pending" },
    { label: t.admin.queues.reviews, count: reviews, href: "/admin/projects?tab=review" },
    { label: t.admin.queues.payments, count: payments, href: "/admin/projects?tab=verify" },
    { label: t.admin.queues.unassigned, count: unassigned, href: "/admin/projects" },
    { label: t.admin.queues.qc, count: submitted, href: "/admin/qc" },
    { label: t.admin.queues.payouts, count: payoutQueue.length, href: "/admin/payouts", late: payoutsLate },
    { label: t.admin.queues.consultations, count: noLink, href: "/admin/consultations?tab=jadwal" },
  ];

  return (
    <>
      <section className="rise grid max-w-3xl gap-3">
        <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{t.admin.title}</h1>
        <p className="text-lg text-muted">{t.admin.lede}</p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {queues.map((q) => (
          <li key={q.label}>
            <Link
              href={q.href}
              className={`card grid h-full content-between gap-4 p-5 transition hover:border-muted ${q.late ? "border-bad/60" : q.count ? "border-accent" : ""}`}
            >
              <span className="text-sm text-muted">{q.label}</span>
              <span className="grid gap-1">
                <span className={`font-display text-5xl font-extrabold tabular-nums ${q.count ? "text-mark" : ""}`}>{q.count}</span>
                {q.late ? <span className="text-sm font-semibold text-bad">{t.admin.queues.payoutsLate(q.late)}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
