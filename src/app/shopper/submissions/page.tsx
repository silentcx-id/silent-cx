import type { Metadata } from "next";
import Link from "next/link";
import { type ShopperTaskRow } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Riwayat & QC" };

const TONE: Record<string, string> = {
  submitted: "border-accent text-mark",
  revision: "border-warn/50 text-warn",
  approved: "border-good/50 text-good",
  rejected: "border-bad/50 text-bad",
};

// Kunjungan yang sudah dikirim beserta hasil QC. Skor tidak ditampilkan ke shopper.
export default async function SubmissionsPage() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper/submissions"), getLang()]);
  const t = dict(lang);
  if (viewer.status !== "active") {
    return (
      <section className="card grid gap-3 p-6">
        <h1 className="text-2xl font-extrabold">{t.shopper.lockedTitle}</h1>
        <p className="text-muted">{t.shopper.lockedBody}</p>
      </section>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("shopper_tasks");
  const rows = ((data ?? []) as ShopperTaskRow[]).filter((x) => ["submitted", "revision", "approved", "rejected"].includes(x.status));

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.tasks.historyTitle}</h1>
        <p className="text-muted">{t.tasks.historyLede}</p>
      </section>
      {rows.length === 0 ? (
        <p className="card p-6 text-muted">{t.tasks.historyEmpty}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((x) => (
            <li key={x.id}>
              <Link href={`/shopper/assignments/${x.id}`} className={`card grid gap-1 p-4 transition hover:border-muted ${x.status === "revision" ? "border-warn/60" : ""}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">{x.code}</span>
                  <span className={`chip ${TONE[x.status]}`}>{t.tasks.status[x.status]}</span>
                </span>
                <span className="font-extrabold">{x.outlet_name || x.city}</span>
                <span className="text-sm text-muted">
                  {x.city} · {t.tasks.fee} {rupiah(x.fee)}
                  {x.submitted_at && ` · ${dateTime(x.submitted_at, lang)}`}
                </span>
                {x.status === "revision" && x.revision_due && <span className="text-sm font-semibold text-warn">{t.tasks.revisionDue(dateTime(x.revision_due, lang))}</span>}
                {(x.status === "approved" || x.status === "rejected") && x.fee_decision && <span className="text-sm">{t.tasks.feeDecision[x.fee_decision]}</span>}
                {x.qc_note && (
                  <span className="text-sm text-muted">
                    {t.tasks.qcNote} {x.qc_note}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
