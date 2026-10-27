import type { Metadata } from "next";
import Link from "next/link";
import { DetailsForm } from "./details-form";
import { dateTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { clientState, getClientProjects } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Outlet & data" };

export default async function OutletsPage() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app/outlets"), getLang()]);
  const t = dict(lang).orders;
  const { live, open } = clientState(await getClientProjects(viewer.id));
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("*").eq("client_id", viewer.id).maybeSingle();

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
          <DetailsForm
            projectId={live.id}
            lang={lang}
            completed={Boolean(live.details_completed_at)}
            objectives={live.objectives}
            outlets={live.project_outlets}
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
        <section className="card grid max-w-xl gap-4 p-6">
          <p className="text-muted">{t.detailsLocked}</p>
          <Link href={open ? "/app/billing" : "/app/paket"} className="btn btn-primary w-fit">
            {open ? t.openBilling : dict(lang).client.choosePackage} →
          </Link>
        </section>
      )}
    </>
  );
}
