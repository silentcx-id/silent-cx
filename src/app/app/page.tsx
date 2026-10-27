import type { Metadata } from "next";
import Link from "next/link";
import { MilestoneTrack } from "@/components/milestone-track";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { clientState, getClientProjects, type ClientStage, type Project } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Beranda" };

const STAGES: ClientStage[] = ["prospect", "verifying", "active"];

// Beranda client berubah mengikuti tahap: calon client → menunggu verifikasi → client aktif.
export default async function ClientHome() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app"), getLang()]);
  const t = dict(lang);
  const o = t.orders;
  const state = clientState(await getClientProjects(viewer.id));
  const { stage, milestone, open, live, lastClosed } = state;

  let hero: { title: string; lede: string; cta?: { href: string; label: string } };
  if (open) {
    const inv = open.invoices[0];
    hero =
      open.status === "awaiting_review"
        ? { title: o.stageReviewTitle, lede: o.stageReviewLede, cta: { href: "/app/billing", label: o.openBilling } }
        : open.status === "verifying"
          ? { title: o.stageVerifyTitle, lede: o.stageVerifyLede, cta: { href: "/app/billing", label: o.openBilling } }
          : { title: o.stagePayTitle, lede: o.stagePayLede(dateTime(inv?.due_at, lang)), cta: { href: "/app/billing", label: o.openBilling } };
  } else if (live) {
    hero = live.details_completed_at
      ? { title: o.stageReadyTitle, lede: o.stageReadyLede }
      : { title: o.stageDetailsTitle, lede: o.stageDetailsLede, cta: { href: "/app/outlets", label: o.completeDetails } };
  } else {
    hero = { title: t.client.prospectTitle(viewer.fullName), lede: t.client.prospectLede, cta: { href: "/app/paket", label: t.client.choosePackage } };
  }

  return (
    <>
      <ol className="flex flex-wrap gap-2" aria-label="Tahap dashboard">
        {STAGES.map((s) => (
          <li key={s} aria-current={s === stage ? "step" : undefined} className={`chip ${s === stage ? "border-accent bg-accent text-accent-ink" : "text-muted"}`}>
            {t.client.stages[s]}
          </li>
        ))}
      </ol>

      <section className="rise grid max-w-3xl gap-4">
        <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{hero.title}</h1>
        <p className="max-w-[62ch] text-lg text-muted">{hero.lede}</p>
        {lastClosed && <p className="rounded-xl border border-line p-4 text-sm">{lastClosed.status === "expired" ? o.closedExpired : `${o.closedCancelled} ${lastClosed.status_note ?? ""}`}</p>}
        {hero.cta && (
          <div className="flex flex-wrap gap-3">
            <Link href={hero.cta.href} className="btn btn-primary">
              {hero.cta.label} →
            </Link>
            {stage === "prospect" && (
              <Link href="/app/reports" className="btn">
                {t.client.sampleReport}
              </Link>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="eyebrow">Milestone</h2>
        <MilestoneTrack role="client" current={milestone} lang={lang} />
      </section>

      {(live ?? open) && <PackageSummary project={(live ?? open)!} lang={lang} />}

      {stage === "prospect" && (
        <section className="grid gap-4">
          <h2 className="text-xl font-extrabold">{t.client.howTitle}</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {t.landing.steps.map((s, i) => (
              <li key={s.title} className="card grid content-start gap-2 p-5">
                <span className="font-mono text-xs text-mark">0{i + 1}</span>
                <h3 className="font-extrabold">{s.title}</h3>
                <p className="text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function PackageSummary({ project, lang }: { project: Project; lang: "id" | "en" }) {
  const o = dict(lang).orders;
  const inv = project.invoices[0];
  return (
    <section className="card grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-start">
      <div className="grid gap-2">
        <span className="eyebrow">{o.yourPackage}</span>
        <h2 className="text-2xl font-extrabold">{project.package_snapshot.name}</h2>
        <p className="text-muted">
          {o.outlets(project.outlet_count)} · {o.visits(project.package_snapshot.visits)} · <span className="font-mono">{project.code}</span>
        </p>
        {project.addons_snapshot.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {project.addons_snapshot.map((a) => (
              <li key={a.item_key} className="chip">
                {a.label}
                {a.quantity > 1 ? ` × ${a.quantity}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      {inv && (
        <div className="grid gap-1 md:text-right">
          <span className="text-sm text-muted">{o.invoiceStatus[inv.status]}</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(inv.total)}</span>
        </div>
      )}
    </section>
  );
}
