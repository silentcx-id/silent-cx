import type { Metadata } from "next";
import Link from "next/link";
import { BriefForm, ExtraVisitsForm } from "./addon-forms";
import { CompetitorForm } from "./competitor-form";
import { DetailsForm } from "./details-form";
import { getBusinessTypes } from "@/lib/catalog";
import { dateTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { clientState, getClientProjects } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { getActiveCities } from "@/lib/shopper";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Outlet & data" };

export default async function OutletsPage() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app/outlets"), getLang()]);
  const t = dict(lang).orders;
  const { live, open } = clientState(await getClientProjects(viewer.id));
  const supabase = await createClient();
  const [{ data: company }, types, cities, { data: progress }] = await Promise.all([
    supabase.from("companies").select("*").eq("client_id", viewer.id).maybeSingle(),
    getBusinessTypes(),
    getActiveCities(),
    supabase.rpc("client_audit_progress"),
  ]);
  // Outlet yang sudah punya kunjungan terjadwal atau selesai tidak bisa diubah pembagian kunjungan tambahannya.
  const busy = new Set(
    ((progress ?? []) as { outlet_id: string; scheduled: number; awaiting_qc: number; approved: number }[]).filter((r) => r.scheduled + r.awaiting_qc + r.approved > 0).map((r) => r.outlet_id),
  );
  const extraAllowance = (live?.addons_snapshot ?? []).filter((a) => a.item_key === "additional_visit").reduce((n, a) => n + a.quantity, 0);
  // Jumlah kompetitor dari add-on benchmark kompetitor yang dibeli.
  const allowance = (live?.addons_snapshot ?? []).filter((a) => a.item_key === "competitor_benchmark").reduce((n, a) => n + a.quantity, 0);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.detailsTitle}</h1>
        <p className="text-muted">{t.detailsLede}</p>
      </section>

      {live?.status === "active" ? (
        <>
          {live.details_completed_at && (
            <p className="rounded-xl border border-good/50 bg-good/10 p-4 text-sm">
              {t.completed} ({dateTime(live.details_completed_at, lang)})
            </p>
          )}
          {allowance > 0 && (
            <CompetitorForm
              projectId={live.id}
              allowance={allowance}
              competitors={live.project_outlets.filter((o) => o.is_competitor)}
              outlets={live.project_outlets.filter((o) => !o.is_competitor)}
              cities={cities}
              lang={lang}
            />
          )}
          {extraAllowance > 0 && (
            <ExtraVisitsForm
              projectId={live.id}
              allowance={extraAllowance}
              baseVisits={live.package_snapshot.visits ?? 1}
              outlets={live.project_outlets
                .filter((o) => !o.is_competitor)
                .map((o) => ({ id: o.id, position: o.position, name: o.name, city: o.city, extra_visits: o.extra_visits ?? 0, locked: busy.has(o.id) }))}
            />
          )}
          {live.entitlements.includes("custom_scope") && <BriefForm projectId={live.id} initial={live.custom_brief ?? ""} locked={Boolean(live.details_completed_at)} />}
          <DetailsForm
            projectId={live.id}
            lang={lang}
            completed={Boolean(live.details_completed_at)}
            types={types}
            cities={cities}
            objectives={live.objectives}
            outlets={live.project_outlets.filter((o) => !o.is_competitor)}
            company={{
              name: company?.name ?? "",
              industry: company?.industry ?? "",
              address: company?.address ?? "",
              city: company?.city ?? "",
              instagram: company?.instagram ?? "",
              pic_name: company?.pic_name ?? viewer.fullName,
              pic_position: company?.pic_position ?? "",
              pic_phone: company?.pic_phone ?? "",
            }}
          />
        </>
      ) : (
        <section className="card grid gap-4 p-6">
          <p className="text-muted">{t.detailsLocked}</p>
          <Link href={open ? "/app/billing" : "/app/paket"} className="btn btn-primary w-fit">
            {open ? t.openBilling : dict(lang).client.choosePackage} →
          </Link>
        </section>
      )}
    </>
  );
}
