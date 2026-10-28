import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QcPanel } from "./qc-panel";
import { CheckinMap } from "@/components/checkin-map";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, windowLabel, type Answers, type QuestionnaireSnapshot, type TaskStatus, type VisitPhoto } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quality control" };

type Task = {
  id: string;
  code: string;
  status: TaskStatus;
  project_id: string;
  outlet_id: string;
  shopper_id: string | null;
  window_start: string;
  window_end: string;
  hours_start: string | null;
  hours_end: string | null;
  fee: number;
  reimburse_cap: number;
  checkin_at: string | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkin_accuracy: number | null;
  answers: Answers;
  purchase_amount: number | null;
  purchase_note: string;
  excess_amount: number;
  score: number | null;
  submitted_at: string | null;
  revision_round: number;
  revision_questions: string[];
  revision_note: string | null;
  revision_due: string | null;
  revision_expired: boolean;
  qc_note: string | null;
  fee_decision: string | null;
};

export default async function QcDetail({ params }: PageProps<"/admin/qc/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/qc/${id}`);
  const supabase = await createClient();
  await supabase.rpc("expire_offers");
  const { data } = await supabase.from("audit_tasks").select("*").eq("id", id).maybeSingle();
  const task = data as Task | null;
  if (!task) notFound();

  const [{ data: outlet }, { data: project }, { data: pq }, { data: photoRows }, { data: shopper }] = await Promise.all([
    supabase.from("project_outlets").select("name, city, address, maps_url, is_competitor").eq("id", task.outlet_id).single(),
    supabase.from("projects").select("code").eq("id", task.project_id).single(),
    supabase.from("project_questionnaires").select("snapshot").eq("project_id", task.project_id).single(),
    supabase.from("visit_photos").select("id, kind, question_id, path").eq("task_id", id).order("created_at"),
    task.shopper_id ? supabase.from("profiles").select("full_name, phone").eq("id", task.shopper_id).single() : Promise.resolve({ data: null }),
  ]);
  const photos = (photoRows ?? []) as VisitPhoto[];
  const urls: Record<string, string> = {};
  if (photos.length) {
    const { data: signed } = await createAdminClient().storage.from("audit-evidence").createSignedUrls(photos.map((p) => p.path), 600);
    for (const [i, s] of (signed ?? []).entries()) if (s.signedUrl) urls[photos[i].id] = s.signedUrl;
  }
  const checkinPhoto = photos.find((p) => p.kind === "checkin");
  const snap = pq?.snapshot as QuestionnaireSnapshot;

  return (
    <>
      <Link href="/admin/qc" className="text-sm text-muted hover:text-fg">
        ← Antrian QC
      </Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[clamp(24px,4vw,34px)] font-extrabold">{task.code}</h1>
            <span className={`chip ${TASK_STATUS_TONE[task.status]}`}>{TASK_STATUS_LABEL[task.status]}</span>
            {outlet?.is_competitor && <span className="chip">Kompetitor</span>}
          </span>
          <p className="text-muted">
            {outlet?.name} · {outlet?.city} · <Link href={`/admin/projects/${task.project_id}`} className="underline underline-offset-4">{project?.code}</Link>
          </p>
          <p className="text-sm text-muted">
            Shopper {shopper?.full_name ?? "—"} · jendela {windowLabel(task)} · dikirim {dateTime(task.submitted_at, "id")}
            {task.revision_round > 0 && ` · revisi ${task.revision_round}/2`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted">Skor sementara</p>
          <p className="font-display text-5xl font-extrabold tabular-nums">{task.score ?? "—"}</p>
        </div>
      </section>

      {task.revision_expired && task.status === "submitted" && (
        <p className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">Shopper tidak mengirim revisi dalam 24 jam. Setujui atau tolak kunjungan ini.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <QcPanel
          task={{
            id: task.id,
            code: task.code,
            status: task.status,
            answers: task.answers,
            revisionRound: task.revision_round,
            revisionQuestions: task.revision_questions,
            revisionNote: task.revision_note,
            revisionDue: task.revision_due,
            purchase: task.purchase_amount,
            purchaseNote: task.purchase_note,
            reimburseCap: task.reimburse_cap,
            excess: task.excess_amount,
            city: outlet?.city ?? "",
          }}
          snapshot={snap}
          photos={photos.filter((p) => p.kind !== "checkin").map((p) => ({ id: p.id, kind: p.kind, question_id: p.question_id, url: urls[p.id] ?? "" }))}
        />

        <aside className="grid gap-3 xl:sticky xl:top-4">
          <section className="card grid gap-3 p-4">
            <h2 className="font-extrabold">Lokasi check-in</h2>
            {task.checkin_lat !== null && task.checkin_lng !== null ? (
              <>
                <CheckinMap lat={task.checkin_lat} lng={task.checkin_lng} title={`Titik check-in ${task.code}`} />
                <p className="text-xs text-muted">
                  {dateTime(task.checkin_at, "id")} · akurasi ±{Math.round(task.checkin_accuracy ?? 0)} m
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">Tidak ada titik check-in.</p>
            )}
            <p className="text-sm">
              <span className="text-muted">Alamat dari client:</span> {outlet?.address || "—"}
            </p>
            <div className="flex flex-wrap gap-2">
              {task.checkin_lat !== null && (
                <a className="btn btn-sm" href={`https://www.google.com/maps?q=${task.checkin_lat},${task.checkin_lng}`} target="_blank" rel="noreferrer">
                  Titik check-in ↗
                </a>
              )}
              {outlet?.maps_url && (
                <a className="btn btn-sm" href={outlet.maps_url} target="_blank" rel="noreferrer">
                  Lokasi dari client ↗
                </a>
              )}
            </div>
            {checkinPhoto && urls[checkinPhoto.id] && (
              // eslint-disable-next-line @next/next/no-img-element -- tautan sementara dari penyimpanan privat
              <img src={urls[checkinPhoto.id]} alt="Foto check-in di dalam outlet" className="max-h-64 w-full rounded-lg border border-line object-cover" />
            )}
            <p className="text-xs text-muted">Menyetujui kunjungan berarti lokasi dianggap sesuai. Kalau tidak sesuai, tolak kunjungan.</p>
          </section>
          <section className="card grid gap-1 p-4 text-sm">
            <p>
              Fee {rupiah(task.fee)} · batas reimburse {rupiah(task.reimburse_cap)}
            </p>
            {shopper?.phone && <p className="font-mono text-muted">{shopper.phone}</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
