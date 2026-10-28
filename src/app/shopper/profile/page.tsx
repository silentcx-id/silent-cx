import type { Metadata } from "next";
import { ApplicationForm, type ApplicationInput } from "./application-form";
import { BankForm } from "./bank-form";
import { ApplicationSummary } from "@/components/application-summary";
import { getBusinessTypes } from "@/lib/catalog";
import { date, dateTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { applicationStage, getActiveCities, getBankAccount, getLatestApplication, reapplyDate, type ShopperApplication } from "@/lib/shopper";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profil & lamaran" };

const TONE = {
  none: "border-warn/50 text-warn",
  draft: "border-warn/50 text-warn",
  submitted: "border-warn/50 text-warn",
  approved: "border-good/50 text-good",
  rejected: "border-bad/50 text-bad",
  reapply: "border-warn/50 text-warn",
} as const;

export default async function ShopperProfilePage() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper/profile"), getLang()]);
  const t = dict(lang).application;
  const supabase = await createClient();
  const [app, { data: profile }] = await Promise.all([
    getLatestApplication(viewer.id),
    supabase.from("profiles").select("full_name, phone").eq("id", viewer.id).single(),
  ]);
  // Akun shopper buatan admin langsung aktif tanpa lamaran.
  const stage = viewer.status === "active" && (!app || app.status !== "approved") ? "approved" : applicationStage(app);
  const statusLabel = stage === "reapply" ? t.status.none : t.status[stage];

  const initial = (a: ShopperApplication | null): ApplicationInput => ({
    fullName: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    domicile: a?.domicile ?? "",
    reachable_cities: a?.reachable_cities ?? [],
    birth_date: a?.birth_date ?? "",
    gender: a?.gender ?? "",
    occupation: a?.occupation ?? "",
    vehicle: a?.vehicle ?? "",
    experience: a?.experience ?? "",
    experience_note: a?.experience_note ?? "",
    industries: a?.industries ?? [],
  });

  const editing = stage === "none" || stage === "draft" || stage === "reapply";
  const [cities, bank, types] = await Promise.all([
    editing ? getActiveCities() : Promise.resolve([]),
    stage === "approved" ? getBankAccount(viewer.id) : Promise.resolve(null),
    getBusinessTypes(),
  ]);

  return (
    <>
      <section className="rise grid max-w-3xl gap-3">
        <span className={`chip w-fit ${TONE[stage]}`}>{statusLabel}</span>
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.title}</h1>
        <p className="text-muted">{editing ? t.lede : stage === "approved" ? t.approvedLede : null}</p>
      </section>

      {editing && (
        <>
          {stage === "reapply" && app?.decision_note && (
            <div className="card grid gap-1 p-4">
              <span className="text-sm text-muted">{dict(lang).shopper.rejectedReason}</span>
              <p>{app.decision_note}</p>
              <p className="mt-2 text-sm">{t.reapplyReady}</p>
            </div>
          )}
          <p className="text-sm text-muted">{t.privacy}</p>
          <ApplicationForm initial={initial(app)} cities={cities} types={types} lang={lang} />
        </>
      )}

      {stage === "submitted" && app && (
        <section className="card grid gap-4 p-5">
          <p>{t.reviewLede(dateTime(app.submitted_at, lang))}</p>
          <h2 className="eyebrow">{t.summaryTitle}</h2>
          <ApplicationSummary app={app} lang={lang} />
        </section>
      )}

      {stage === "rejected" && app && (
        <section className="card grid gap-3 p-5">
          <span className="text-sm text-muted">{dict(lang).shopper.rejectedReason}</span>
          <p>{app.decision_note}</p>
          <p className="font-semibold">{t.reapplyOn(date(reapplyDate(app.decided_at), lang))}</p>
        </section>
      )}

      {stage === "approved" && (
        <>
          <section className="card grid gap-4 p-5">
            <div className="grid gap-1">
              <h2 className="text-xl font-extrabold">{t.bankTitle}</h2>
              <p className="text-sm text-muted">{t.bankLede}</p>
            </div>
            <BankForm initial={bank} lang={lang} />
          </section>
          <section className="card grid gap-4 p-5">
            <h2 className="eyebrow">{t.summaryTitle}</h2>
            {app?.status === "approved" ? <ApplicationSummary app={app} lang={lang} /> : <p className="text-sm text-muted">{t.provisioned}</p>}
          </section>
        </>
      )}
    </>
  );
}
