import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { consultationState, getConsultation } from "@/lib/consultation";
import { dateTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Ringkasan konsultasi" };

export default async function ConsultationSummary({ params }: PageProps<"/app/consultation/[id]">) {
  const { id } = await params;
  const [viewer, lang] = await Promise.all([requireRole("client", `/app/consultation/${id}`), getLang()]);
  const t = dict(lang).consultation;
  const c = await getConsultation(id);
  if (!c || c.client_id !== viewer.id) notFound();
  const state = consultationState(c);

  return (
    <>
      <Link href="/app/consultation" className="w-fit text-sm text-muted hover:text-fg">
        ← {t.back}
      </Link>
      <section className="grid gap-2">
        <span className="font-mono text-sm text-muted">{c.code}</span>
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold leading-tight">{c.starts_at ? dateTime(c.starts_at, lang) : t.state[state]}</h1>
        <p className="text-muted">
          {t.minutes(c.minutes)} · {t.state[state]}
        </p>
      </section>
      {c.topic && (
        <section className="card grid gap-2 p-5">
          <h2 className="text-lg font-extrabold">{t.topic}</h2>
          <p className="whitespace-pre-line">{c.topic}</p>
        </section>
      )}
      {state === "done" && (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className="card grid gap-2 p-5">
            <h2 className="text-lg font-extrabold">{t.summary}</h2>
            <p className="whitespace-pre-line">{c.summary}</p>
          </section>
          {c.action_plan && (
            <section className="card grid gap-2 border-accent p-5">
              <h2 className="text-lg font-extrabold">{t.actionPlan}</h2>
              <p className="whitespace-pre-line">{c.action_plan}</p>
            </section>
          )}
        </div>
      )}
      {state === "no_show" && <p className="card p-5 text-muted">{t.noShowBody}</p>}
      {state === "scheduled" && (
        <Link href="/app/consultation" className="btn btn-primary w-fit">
          {t.back} →
        </Link>
      )}
    </>
  );
}
