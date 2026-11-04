import { FollowupEdit } from "./followup-panel";
import { dayLabel } from "@/lib/field";
import { CHANNEL_LABEL, OUTCOME_LABEL } from "@/lib/followups";
import type { FollowupEntry } from "@/lib/cs-data";
import { dateTime } from "@/lib/format";

const OUTCOME_TONE: Record<string, string> = {
  sent: "",
  replied: "border-accent text-mark",
  interested: "border-good/50 text-good",
  not_interested: "border-bad/50 text-bad",
  no_answer: "border-warn/50 text-warn",
  other: "",
};

// Riwayat follow-up satu client, terbaru di atas. Pesan WA yang dikirim bisa dibuka.
export function FollowupTimeline({ items, viewerId, isAdmin }: { items: FollowupEntry[]; viewerId: string; isAdmin: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted">Belum ada follow-up. Catatan pertama muncul di sini setelah WhatsApp dibuka atau catatan manual disimpan.</p>;
  return (
    <ol className="grid gap-3">
      {items.map((f) => (
        <li key={f.id} className="grid gap-2 rounded-xl border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${OUTCOME_TONE[f.outcome] ?? ""}`}>{OUTCOME_LABEL[f.outcome]}</span>
            {f.purpose === "project_confirm" && <span className="chip border-accent text-mark">Konfirmasi proyek</span>}
            <span className="text-muted">
              {CHANNEL_LABEL[f.channel]} · {dateTime(f.created_at, "id")} · {f.staff ?? "Staf"}
              {f.staff_role === "admin" ? " (admin)" : ""}
              {f.project_code ? ` · ${f.project_code}` : ""}
            </span>
          </div>
          {f.note && <p className="whitespace-pre-line">{f.note}</p>}
          {f.next_at && <p className="text-xs font-semibold text-warn">Follow-up berikutnya: {dayLabel(f.next_at)}</p>}
          {f.message && (
            <details className="text-muted">
              <summary className="cursor-pointer text-xs font-semibold">Pesan yang dikirim</summary>
              <p className="mt-1 whitespace-pre-line rounded-lg bg-raise p-2 text-xs">{f.message}</p>
            </details>
          )}
          {(f.staff_id === viewerId || isAdmin) && <FollowupEdit id={f.id} outcome={f.outcome} note={f.note} next={f.next_at} />}
        </li>
      ))}
    </ol>
  );
}
