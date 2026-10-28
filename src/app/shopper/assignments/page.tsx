import type { Metadata } from "next";
import Link from "next/link";
import { dateTime, rupiah } from "@/lib/format";
import { windowLabel, type ShopperTaskRow } from "@/lib/field";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tugas" };

export default async function AssignmentsPage() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper/assignments"), getLang()]);
  const t = dict(lang);
  if (viewer.status !== "active") {
    return (
      <section className="card grid max-w-xl gap-3 p-6">
        <h1 className="text-2xl font-extrabold">{t.shopper.lockedTitle}</h1>
        <p className="text-muted">{t.shopper.lockedBody}</p>
      </section>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("shopper_tasks");
  const tasks = (data ?? []) as ShopperTaskRow[];
  const groups = [
    { title: t.tasks.offers, items: tasks.filter((x) => x.status === "offered") },
    { title: t.tasks.running, items: tasks.filter((x) => x.status === "revision" || x.status === "accepted" || x.status === "in_progress") },
    { title: t.tasks.sent, items: tasks.filter((x) => x.status === "submitted") },
  ].filter((g) => g.items.length);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.tasks.title}</h1>
        <p className="text-muted">{t.tasks.lede}</p>
      </section>
      {groups.length === 0 && <p className="card p-6 text-muted">{t.tasks.empty}</p>}
      {groups.map((g) => (
        <section key={g.title} className="grid gap-3">
          <h2 className="eyebrow">{g.title}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {g.items.map((x) => (
              <li key={x.id}>
                <Link href={`/shopper/assignments/${x.id}`} className={`card grid h-full gap-2 p-5 transition hover:border-muted ${x.urgent ? "border-accent" : ""}`}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold">{x.code}</span>
                    <span className="chip">{t.tasks.status[x.status]}</span>
                    {x.urgent && <span className="chip border-accent text-mark">{t.tasks.urgent}</span>}
                  </span>
                  <span className="text-lg font-extrabold">{x.outlet_name || x.city}</span>
                  <span className="text-sm text-muted">
                    {x.city} · {windowLabel(x, lang)}
                  </span>
                  <span className="text-sm">
                    {t.tasks.fee} {rupiah(x.fee)}
                  </span>
                  {x.status === "offered" && x.respond_by && <span className="text-sm font-semibold text-mark">{t.tasks.respondBy(dateTime(x.respond_by, lang))}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
