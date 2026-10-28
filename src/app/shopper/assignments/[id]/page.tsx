import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditForm, CheckIn, OfferResponse } from "./visit";
import { dateTime, rupiah } from "@/lib/format";
import { windowLabel, type ShopperTaskDetail } from "@/lib/field";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tugas" };

export default async function AssignmentPage({ params }: PageProps<"/shopper/assignments/[id]">) {
  const { id } = await params;
  const [viewer, lang] = await Promise.all([requireRole("shopper", `/shopper/assignments/${id}`), getLang()]);
  if (viewer.status !== "active") notFound();
  const t = dict(lang).tasks;
  const supabase = await createClient();
  const { data } = await supabase.rpc("shopper_task", { p_task: id });
  const task = data as ShopperTaskDetail | null;
  if (!task) notFound();

  // Tautan sementara untuk foto milik shopper sendiri (kepemilikan sudah dicek shopper_task).
  const photoUrls: Record<string, string> = {};
  if (task.photos.length && (task.status === "in_progress" || task.status === "revision")) {
    const { data: signed } = await createAdminClient().storage.from("audit-evidence").createSignedUrls(task.photos.map((p) => p.path), 600);
    for (const [i, s] of (signed ?? []).entries()) if (s.signedUrl) photoUrls[task.photos[i].id] = s.signedUrl;
  }

  const brief: [string, React.ReactNode][] = [
    [t.outlet, <span key="o">{task.outlet.name} · {task.outlet.address}, {task.outlet.city}{task.outlet.maps_url && <> · <a href={task.outlet.maps_url} target="_blank" rel="noreferrer" className="text-mark underline underline-offset-4">Maps ↗</a></>}</span>],
    [t.window, windowLabel(task, lang)],
    [t.fee, rupiah(task.fee)],
    [t.reimburse, rupiah(task.reimburse_cap)],
  ];
  if (task.mandatory_purchase) brief.push([t.purchase, task.mandatory_purchase]);
  if (task.scenario) brief.push([t.scenario, <span key="s" className="whitespace-pre-line">{task.scenario}</span>]);

  return (
    <>
      <Link href="/shopper/assignments" className="text-sm text-muted hover:text-fg">
        ← {t.title}
      </Link>
      <section className="grid gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="chip">{t.status[task.status]}</span>
          {task.urgent && <span className="chip border-accent text-mark">{t.urgent}</span>}
        </span>
        <h1 className="text-[clamp(26px,4vw,38px)] font-extrabold leading-tight">{task.outlet.name || task.outlet.city}</h1>
        <p className="font-mono text-sm text-muted">{task.code}</p>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="eyebrow">{t.brief}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {brief.map(([k, v]) => (
            <div key={k} className={`grid gap-0.5 ${k === t.scenario || k === t.outlet ? "sm:col-span-2" : ""}`}>
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="rounded-lg border border-line p-3 text-xs text-muted">{t.excessRule}</p>
        <p className="text-xs text-muted">{t.secrecy}</p>
      </section>

      {task.status === "offered" && <OfferResponse taskId={task.id} respondBy={task.respond_by} lang={lang} />}
      {task.status === "accepted" && <CheckIn taskId={task.id} lang={lang} />}
      {(task.status === "in_progress" || task.status === "revision") && task.questionnaire && <AuditForm task={task} photoUrls={photoUrls} lang={lang} />}
      {(task.status === "approved" || task.status === "rejected") && task.qc && (
        <section className={`card grid gap-2 p-5 ${task.status === "approved" ? "border-good/50" : "border-bad/50"}`}>
          <p className={`text-lg font-extrabold ${task.status === "approved" ? "text-good" : "text-bad"}`}>{task.status === "approved" ? t.approvedTitle : t.rejectedTitle}</p>
          <p>{task.status === "approved" ? t.approvedBody : task.qc.fee ? t.feeDecision[task.qc.fee] : null}</p>
          {task.qc.note && (
            <p className="text-sm">
              <span className="text-muted">{t.qcNote}</span> {task.qc.note}
            </p>
          )}
        </section>
      )}
      {task.status === "submitted" && (
        <section className="card grid gap-2 border-accent p-5">
          <p className="font-semibold">{t.submitted(dateTime(task.submitted_at, lang))}</p>
          <p className="text-sm text-muted">
            {t.checkedIn(dateTime(task.checkin_at, lang))} · {t.lockedNote}
          </p>
        </section>
      )}
    </>
  );
}
