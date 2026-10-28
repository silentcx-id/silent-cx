import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationDecision } from "../../application-decision";
import { ApplicationSummary } from "@/components/application-summary";
import { dateTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { APPLICATION_COLUMNS, type ShopperApplication } from "@/lib/shopper-application";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lamaran shopper" };

type Person = { full_name: string; email: string; phone: string | null };

// Isi lengkap satu lamaran yang menunggu keputusan, dengan tombol setujui atau tolak.
export default async function ApplicationPage({ params }: PageProps<"/admin/accounts/applications/[id]">) {
  const { id } = await params;
  const [, lang] = await Promise.all([requireRole("admin", `/admin/accounts/applications/${id}`), getLang()]);
  const t = dict(lang);
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopper_applications")
    .select(`${APPLICATION_COLUMNS}, profile:profiles!shopper_applications_shopper_id_fkey(full_name, email, phone)`)
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as (ShopperApplication & { profile: Person | null }) | null;
  const back = "/admin/accounts?tab=pending";

  return (
    <>
      <Link href={back} className="text-sm text-muted hover:text-fg">
        ← {t.admin.backToApplications}
      </Link>
      {!app || app.status !== "submitted" ? (
        <p className="card p-6 text-muted">{t.admin.applicationGone}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <section className="card grid gap-5 p-5">
            <div className="grid gap-0.5">
              <h1 className="text-2xl font-extrabold">{app.profile?.full_name || "—"}</h1>
              <span className="text-sm text-muted">
                {app.profile?.email}
                {app.profile?.phone && <span className="font-mono"> · {app.profile.phone}</span>}
              </span>
              <span className="text-xs text-muted">
                {t.admin.submittedAt(dateTime(app.submitted_at, lang))} · {t.application.attempts(app.quiz_attempts)}
              </span>
            </div>
            <ApplicationSummary app={app} lang={lang} />
          </section>
          <aside className="card grid gap-3 p-5 lg:sticky lg:top-6">
            <h2 className="font-extrabold">{t.admin.decision}</h2>
            <ApplicationDecision applicationId={app.id} lang={lang} doneHref={back} />
          </aside>
        </div>
      )}
    </>
  );
}
