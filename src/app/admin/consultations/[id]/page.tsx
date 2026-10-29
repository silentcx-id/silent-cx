import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm, CompleteForm, LinkForm, RescheduleForm } from "../consultation-forms";
import { getAdminConsultations, SOURCE_LABEL } from "../data";
import { requestTime, wibDay, wibTime } from "@/lib/calendar";
import { dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Sesi konsultasi" };

export default async function ConsultationDetail({ params }: PageProps<"/admin/consultations/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/consultations/${id}`);
  const [c] = await getAdminConsultations({ id });
  if (!c) notFound();
  const started = !!c.starts_at && new Date(c.starts_at).getTime() <= requestTime();
  const back = c.starts_at ? `/admin/consultations?tab=kalender&tgl=${wibDay(c.starts_at)}` : "/admin/consultations?tab=jatah";

  return (
    <>
      <Link href={back} className="w-fit text-sm text-muted hover:text-fg">
        ← Kalender konsultasi
      </Link>
      <section className="grid gap-2">
        <span className="font-mono text-sm text-muted">{c.code}</span>
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold leading-tight">{c.clientName}</h1>
        <p className="text-muted">
          {c.starts_at ? `${dateTime(c.starts_at, "id")} · ${c.minutes} menit` : `${c.minutes} menit · belum dibooking`}
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:items-start">
        <div className="grid gap-6">
          <section className="card grid gap-4 p-5">
            <h2 className="text-xl font-extrabold">Detail sesi</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Fact label="Proyek" value={`${c.projectCode} · ${c.packageName}`} />
              <Fact label="Sumber jatah" value={SOURCE_LABEL[c.source]} />
              <Fact label="Berlaku sampai" value={dateTime(c.expires_at, "id")} />
              <Fact label="Digeser client" value={c.reschedule_count ? "Sudah (1×)" : "Belum"} />
              <div className="grid gap-0.5 sm:col-span-2">
                <dt className="text-muted">Topik dari client</dt>
                <dd className="whitespace-pre-line">{c.topic || "—"}</dd>
              </div>
              {c.status_note && <Fact label="Catatan perubahan terakhir" value={c.status_note} />}
            </dl>
          </section>

          {(c.status === "done" || c.status === "no_show") && (
            <section className="card grid gap-3 p-5">
              <h2 className="text-xl font-extrabold">{c.status === "done" ? "Ringkasan sesi" : "Client tidak hadir"}</h2>
              {c.summary && <p className="whitespace-pre-line">{c.summary}</p>}
              {c.action_plan && (
                <>
                  <h3 className="font-extrabold">Action plan</h3>
                  <p className="whitespace-pre-line">{c.action_plan}</p>
                </>
              )}
              <p className="text-sm text-muted">Ditutup {dateTime(c.completed_at, "id")}</p>
            </section>
          )}

          {c.status === "scheduled" && started && (
            <section className="card grid gap-3 border-accent p-5">
              <h2 className="text-xl font-extrabold">Tutup sesi</h2>
              <p className="text-sm text-muted">Ringkasan dan action plan langsung bisa dibaca client di menu Konsultasi.</p>
              <CompleteForm id={c.id} />
            </section>
          )}
        </div>

        {c.status === "scheduled" && (
          <aside className="grid gap-4">
            <section className={`card grid gap-3 p-5 ${c.meeting_url ? "" : "border-bad/60"}`}>
              <h2 className="text-lg font-extrabold">Link meeting</h2>
              {c.meeting_url ? (
                <a href={c.meeting_url} target="_blank" rel="noreferrer" className="break-all text-sm text-mark underline">
                  {c.meeting_url}
                </a>
              ) : (
                <p className="text-sm text-bad">Belum ada link. Client melihat keterangan &quot;link dikirim sebelum sesi&quot;.</p>
              )}
              <LinkForm id={c.id} url={c.meeting_url} />
            </section>
            {!started && (
              <section className="card grid gap-3 p-5">
                <h2 className="text-lg font-extrabold">Ubah jadwal</h2>
                <RescheduleForm id={c.id} day={wibDay(c.starts_at!)} time={wibTime(c.starts_at!)} />
              </section>
            )}
            <section className="card grid gap-3 p-5">
              <h2 className="text-lg font-extrabold">Batalkan</h2>
              <CancelForm id={c.id} />
            </section>
          </aside>
        )}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
