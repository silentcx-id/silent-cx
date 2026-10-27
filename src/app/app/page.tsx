import type { Metadata } from "next";
import Link from "next/link";
import { MilestoneTrack } from "@/components/milestone-track";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Beranda" };

// Tahap dashboard client: calon client → menunggu verifikasi → client aktif.
// Tabel proyek dan invoice dibangun di Fase 1; sampai saat itu setiap client masih calon client.
type ClientStage = "prospect" | "verifying" | "active";
const STAGES: ClientStage[] = ["prospect", "verifying", "active"];

export default async function ClientHome() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app"), getLang()]);
  const t = dict(lang);
  const stage: ClientStage = "prospect";

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
        <h1 className="text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.02] tracking-tight">{t.client.prospectTitle(viewer.fullName)}</h1>
        <p className="max-w-[62ch] text-lg text-muted">{t.client.prospectLede}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/app/paket" className="btn btn-primary">
            {t.client.choosePackage} →
          </Link>
          <Link href="/app/reports" className="btn">
            {t.client.sampleReport}
          </Link>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="eyebrow">Milestone</h2>
        <MilestoneTrack role="client" current={2} lang={lang} />
      </section>

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
    </>
  );
}
