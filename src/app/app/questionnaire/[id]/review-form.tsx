"use client";

import { useEffect, useState } from "react";
import { reviewQuestionnaire } from "../../actions";
import { StatusText, useAction } from "@/components/use-action";
import type { ClientReview, ReviewFlag } from "@/lib/questionnaire-review";

// Draf perbaikan yang belum dikirim disimpan di browser ini saja, supaya tidak hilang kalau halaman tertutup.
const draftKey = (r: ClientReview) => `kuesioner-perbaikan:${r.project}:${r.version}`;
type Draft = { notes: Record<string, string>; additions: string };

function loadDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft));
    else window.localStorage.removeItem(key);
  } catch {
    // Penyimpanan browser tidak tersedia; draf hanya bertahan selama halaman terbuka.
  }
}

export function ReviewForm({ review, sentFlags }: { review: ClientReview; sentFlags: ReviewFlag[] }) {
  const { pending, status, act } = useAction();
  const open = review.status === "pending";
  const [mode, setMode] = useState<"view" | "confirm" | "revise">("view");
  // Catatan per pertanyaan yang ditandai "Perlu diubah".
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [additions, setAdditions] = useState("");
  const key = draftKey(review);

  useEffect(() => {
    if (open && mode === "revise") saveDraft(key, { notes, additions });
  }, [open, mode, notes, additions, key]);

  const sent = Object.fromEntries(sentFlags.map((f) => [f.question, f.note]));
  const flagged = Object.keys(notes);
  const missing = flagged.filter((q) => notes[q].trim().length < 3);
  const canSend = (flagged.length > 0 || additions.trim().length > 0) && missing.length === 0;
  // Nomor pertanyaan berlanjut antar-area.
  const starts = review.sections.map((_, i) => review.sections.slice(0, i).reduce((sum, x) => sum + x.questions.length, 0));

  function toggle(id: string) {
    setNotes((cur) => {
      if (id in cur) {
        const rest = { ...cur };
        delete rest[id];
        return rest;
      }
      return { ...cur, [id]: "" };
    });
  }

  // Mode perbaikan dibuka dengan draf yang belum terkirim, kalau ada.
  function startRevise() {
    const d = loadDraft(key);
    if (d) {
      setNotes(d.notes ?? {});
      setAdditions(d.additions ?? "");
    }
    setMode("revise");
  }

  function cancelRevise() {
    setNotes({});
    setAdditions("");
    saveDraft(key, null);
    setMode("view");
  }

  return (
    <>
      {open && mode !== "revise" && (
        <section className="card grid max-w-3xl gap-4 p-5" aria-label="Tanggapan Anda">
          {mode === "confirm" ? (
            <>
              <p className="font-semibold">Setujui kuesioner ini? Setelah disetujui, kunjungan ke outlet Anda mulai dijadwalkan.</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-primary min-h-12 px-6"
                  disabled={pending}
                  onClick={() => act(() => reviewQuestionnaire({ projectId: review.project, approve: true, flags: [], additions: "" }), "Terima kasih. Kuesioner disetujui.")}
                >
                  {pending ? "Menyimpan…" : "Ya, setujui"}
                </button>
                <button type="button" className="btn min-h-12 px-6" disabled={pending} onClick={() => setMode("view")}>
                  Kembali
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Sudah sesuai? Setujui kuesionernya. Kalau ada yang perlu diubah, tandai pertanyaannya dan tulis catatan untuk tim SilentCX.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" className="btn btn-primary min-h-12 text-base" onClick={() => setMode("confirm")}>
                  Setujui kuesioner
                </button>
                <button type="button" className="btn min-h-12 text-base" onClick={startRevise} disabled={review.revisions_left === 0}>
                  Ajukan perbaikan
                </button>
              </div>
            </>
          )}
          <StatusText status={status} />
        </section>
      )}

      {open && mode === "revise" && (
        <p className="max-w-3xl rounded-xl border border-accent bg-accent/10 p-4 text-sm">
          Klik <strong>Perlu diubah</strong> di pertanyaan yang ingin diganti, lalu tulis apa yang perlu diubah. Pertanyaan baru bisa diusulkan di kotak paling bawah.
        </p>
      )}

      <div className="grid max-w-3xl gap-5">
        {review.sections.map((s, si) => (
          <section key={s.title} className="card grid gap-3 p-5">
            <h2 className="text-lg font-extrabold">{s.title}</h2>
            <ol className="grid gap-2">
              {s.questions.map((q, qi) => {
                const n = starts[si] + qi + 1;
                const marked = q.id in notes;
                const sentNote = sent[q.id];
                return (
                  <li
                    key={q.id}
                    className={`grid gap-2 rounded-xl border p-3 ${marked ? "border-accent bg-accent/5" : sentNote ? "border-warn/50 bg-warn/5" : "border-line"}`}
                    data-testid="review-question"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 min-w-6 font-mono text-xs text-muted">{n}.</span>
                      <div className="grid flex-1 gap-1">
                        <p className="font-semibold">{q.prompt}</p>
                        {q.help && <p className="text-sm text-muted">{q.help}</p>}
                        {q.photo && <span className="chip w-fit text-xs">Perlu foto</span>}
                        {sentNote && <p className="text-sm">Catatan Anda: {sentNote}</p>}
                      </div>
                      {open && mode === "revise" && (
                        <button type="button" className={`btn btn-sm shrink-0 ${marked ? "btn-primary" : ""}`} aria-pressed={marked} onClick={() => toggle(q.id)}>
                          {marked ? "Ditandai ✓" : "Perlu diubah"}
                        </button>
                      )}
                    </div>
                    {marked && (
                      <div className="field">
                        <label htmlFor={`note-${q.id}`}>Apa yang perlu diubah?</label>
                        <textarea
                          id={`note-${q.id}`}
                          rows={2}
                          maxLength={500}
                          value={notes[q.id]}
                          placeholder="Contoh: ganti menjadi “Staf menyapa dengan salam khas kami”."
                          onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })}
                          autoFocus
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {open && mode === "revise" && (
          <section className="card grid gap-3 p-5">
            <div className="field">
              <label htmlFor="additions">Ada pertanyaan yang ingin ditambahkan?</label>
              <textarea
                id="additions"
                rows={3}
                maxLength={2000}
                value={additions}
                placeholder="Contoh: apakah musik di outlet terdengar terlalu keras?"
                onChange={(e) => setAdditions(e.target.value)}
              />
              <small>Opsional. Tulis satu pertanyaan per baris.</small>
            </div>
          </section>
        )}
      </div>

      {open && mode === "revise" && (
        <div className="sticky bottom-20 z-40 max-w-3xl sm:bottom-5" role="region" aria-label="Kirim permintaan perbaikan">
          <div className="card grid gap-2 border-accent p-3 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)] sm:flex sm:items-center sm:justify-between">
            <p className="text-sm font-semibold" aria-live="polite">
              {flagged.length} pertanyaan ditandai{additions.trim() ? " · ada pertanyaan tambahan" : ""}
              {missing.length > 0 && <span className="block text-xs font-normal text-warn">Tulis catatan untuk setiap pertanyaan yang ditandai.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" disabled={pending} onClick={cancelRevise}>
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !canSend}
                onClick={() =>
                  act(
                    () => reviewQuestionnaire({ projectId: review.project, approve: false, flags: flagged.map((q) => ({ question: q, note: notes[q] })), additions }),
                    "Permintaan perbaikan terkirim.",
                    () => {
                      saveDraft(key, null);
                      setNotes({});
                      setAdditions("");
                      setMode("view");
                    },
                  )
                }
              >
                {pending ? "Mengirim…" : "Kirim permintaan perbaikan"}
              </button>
            </div>
          </div>
          <StatusText status={status} />
        </div>
      )}
    </>
  );
}
