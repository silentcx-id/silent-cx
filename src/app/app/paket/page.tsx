import type { Metadata } from "next";
import Link from "next/link";
import { Checkout } from "./checkout";
import { getCatalog } from "@/lib/catalog";
import { dict } from "@/lib/i18n";
import { clientState, getClientProjects } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Pilih paket" };

export default async function PackagesPage({ searchParams }: PageProps<"/app/paket">) {
  const [viewer, lang, params] = await Promise.all([requireRole("client", "/app/paket"), getLang(), searchParams]);
  const t = dict(lang).orders;
  const [{ packages, addons, cities }, projects] = await Promise.all([getCatalog(), getClientProjects(viewer.id)]);
  const { open } = clientState(projects);
  const usable = packages.filter((p) => p.active && p.prices.length > 0);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.checkoutTitle}</h1>
        <p className="text-muted">{t.checkoutLede}</p>
      </section>
      {open ? (
        <section className="card grid gap-4 p-6">
          <p>{t.openOrderExists}</p>
          <Link href="/app/billing" className="btn btn-primary w-fit">
            {t.openBilling} →
          </Link>
        </section>
      ) : usable.length === 0 ? (
        <p className="card p-6 text-muted">{t.noPackages}</p>
      ) : (
        <Checkout
          packages={usable}
          addons={addons.filter((a) => a.active && !a.after_report)}
          cities={cities.filter((c) => c.active)}
          initialKey={typeof params.paket === "string" ? params.paket : undefined}
          lang={lang}
        />
      )}
    </>
  );
}
