import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "./review-form";
import { dateTime } from "@/lib/format";
import { getClientReview, type ClientReview } from "@/lib/questionnaire-review";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Tinjau kuesioner" };

function StatusNote({ r }: { r: ClientReview }) {
  const box = "rounded-xl border p-4 text-sm";
  if (r.status === "pending" && r.due_at) {
    return (
      <div className={`${box} border-accent bg-accent/10`} role="status">
        <p>
          Mohon tinjau sebelum <strong>{dateTime(r.due_at, "id")} WIB</strong>. Kalau belum ada tanggapan, kuesioner dianggap disetujui dan kunjungan mulai dijadwalkan.
        </p>
        <p className="mt-2 font-semibold" data-testid="revisions-left">
          {r.revisions_left === 2 && "Anda bisa mengajukan perbaikan 2 kali."}
          {r.revisions_left === 1 && "Sisa 1 kali perbaikan. Kalau Anda mengajukan perbaikan lagi, versi berikutnya adalah versi final dan langsung dikerjakan."}
        </p>
      </div>
    );
  }
  if (r.status === "changes_requested") {
    return (
      <div className={`${box} border-line bg-raise`} role="status">
        Permintaan perbaikan Anda sudah terkirim {r.decided_at && dateTime(r.decided_at, "id")}. Tim SilentCX sedang memperbaikinya. Anda akan mendapat notifikasi dan email
        saat versi berikutnya siap ditinjau.
      </div>
    );
  }
  const text =
    r.status === "approved"
      ? `Anda menyetujui kuesioner ini${r.decided_at ? ` pada ${dateTime(r.decided_at, "id")}` : ""}. Kunjungan mulai dijadwalkan.`
      : r.status === "auto_approved"
        ? "Kuesioner ini disetujui otomatis karena batas tinjauan 3×24 jam sudah lewat. Kunjungan mulai dijadwalkan."
        : "Ini versi final setelah 2 kali perbaikan. Kunjungan mulai dijadwalkan.";
  return (
    <div className={`${box} border-good/50 bg-good/10`} role="status">
      {text}
    </div>
  );
}

const STATUS_CHIP: Record<ClientReview["status"], [string, string]> = {
  pending: ["Menunggu tinjauan Anda", "border-accent text-mark"],
  changes_requested: ["Sedang diperbaiki", "border-warn/50 text-warn"],
  approved: ["Disetujui", "border-good/50 text-good"],
  auto_approved: ["Disetujui otomatis", "border-good/50 text-good"],
  final: ["Versi final", "border-good/50 text-good"],
};

// Halaman tinjauan kuesioner untuk client: daftar pertanyaan per area, lalu Setujui atau Ajukan perbaikan.
export default async function QuestionnaireReviewPage({ params }: PageProps<"/app/questionnaire/[id]">) {
  const { id } = await params;
  await requireRole("client", `/app/questionnaire/${id}`);
  const review = await getClientReview(id);
  if (!review) notFound();
  const total = review.sections.reduce((n, s) => n + s.questions.length, 0);
  const [chip, tone] = STATUS_CHIP[review.status];
  // Catatan yang pernah ditandai (perbaikan yang sudah terkirim) tetap tampil di pertanyaannya.
  const sentFlags = review.status === "changes_requested" ? review.flags : [];

  return (
    <>
      <Link href="/app/audits" className="text-sm text-muted hover:text-fg">
        ← Audit berjalan
      </Link>
      <section className="grid max-w-3xl gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="eyebrow font-mono">{review.code}</span>
          <span className={`chip ${tone}`}>{chip}</span>
          <span className="chip">{review.status === "final" ? "Versi 3 (final)" : `Versi ${review.version}`}</span>
        </span>
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Tinjau kuesioner audit</h1>
        <p className="text-muted">
          {total} pertanyaan di {review.sections.length} area. Pertanyaan ini yang akan dinilai mystery shopper saat berkunjung ke outlet Anda. Periksa apakah sudah sesuai
          dengan yang ingin Anda ketahui.
        </p>
        <StatusNote r={review} />
      </section>

      {review.previous && review.status === "pending" && (
        <details className="card max-w-3xl p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Perbaikan yang Anda minta di versi {review.previous.version}</summary>
          <ul className="mt-3 grid gap-2">
            {review.previous.flags.map((f) => (
              <li key={f.question} className="rounded-lg border-l-4 border-accent bg-raise p-3">
                <span className="block font-semibold">{f.prompt}</span>
                <span className="text-muted">Catatan Anda: {f.note}</span>
              </li>
            ))}
            {review.previous.additions && (
              <li className="rounded-lg bg-raise p-3">
                <span className="font-semibold">Pertanyaan tambahan: </span>
                <span className="whitespace-pre-line">{review.previous.additions}</span>
              </li>
            )}
          </ul>
        </details>
      )}

      <ReviewForm review={review} sentFlags={sentFlags} />
    </>
  );
}
