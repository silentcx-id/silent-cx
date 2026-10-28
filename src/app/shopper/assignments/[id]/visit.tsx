"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addVisitPhoto, checkIn, prepareVisitUpload, removeVisitPhoto, respondOffer, saveVisit, submitVisit } from "../../task-actions";
import { StatusText, useAction } from "@/components/use-action";
import type { Answer, Answers, ShopperTaskDetail, SnapshotQuestion } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { shrinkImage } from "@/lib/shrink-image";
import { createClient } from "@/lib/supabase/client";

// Foto diperkecil di HP, lalu diunggah langsung ke folder tugas lewat tautan sekali pakai.
async function uploadPhoto(taskId: string, kind: "checkin" | "receipt" | "evidence", file: File): Promise<string> {
  const img = await shrinkImage(file, 1600);
  const prep = await prepareVisitUpload({ taskId, kind, type: img.type, size: img.size });
  if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
  const { error } = await createClient().storage.from("audit-evidence").uploadToSignedUrl(prep.data.path, prep.data.token, img, { contentType: img.type });
  if (error) throw new Error(error.message);
  return prep.data.path;
}

const errorText = (e: unknown, lang: Lang) => (e instanceof Error && e.message !== "Failed to fetch" ? e.message : dict(lang).auth.network);

export function OfferResponse({ taskId, respondBy, lang }: { taskId: string; respondBy: string | null; lang: Lang }) {
  const t = dict(lang).tasks;
  const { pending, status, act } = useAction();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <section className="card grid gap-4 border-accent p-5">
      {respondBy && <p className="font-semibold text-mark">{t.respondBy(dateTime(respondBy, lang))}</p>}
      {declining ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => respondOffer({ taskId, accept: false, reason }));
          }}
        >
          <label className="text-sm font-semibold" htmlFor="decline-reason">
            {t.declineReason}
          </label>
          <textarea id="decline-reason" className="rounded-lg border border-line bg-raise p-2 text-sm" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" disabled={pending}>
              {t.confirmDecline}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setDeclining(false)}>
              {dict(lang).admin.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(() => respondOffer({ taskId, accept: true }), t.accepted)}>
            {t.accept}
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => setDeclining(true)}>
            {t.decline}
          </button>
        </div>
      )}
      <StatusText status={status} />
    </section>
  );
}

type Position = { lat: number; lng: number; accuracy: number };

export function CheckIn({ taskId, lang }: { taskId: string; lang: Lang }) {
  const t = dict(lang).tasks;
  const router = useRouter();
  const [pos, setPos] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function locate() {
    setError(null);
    if (!("geolocation" in navigator)) return setError(t.locationFailed);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (e) => {
        setLocating(false);
        setError(e.code === e.PERMISSION_DENIED ? t.locationDenied : t.locationFailed);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  function submit() {
    if (!pos || !file) return;
    setError(null);
    start(async () => {
      try {
        const path = await uploadPhoto(taskId, "checkin", file);
        const res = await checkIn({ taskId, ...pos, path });
        if (!res.ok) throw new Error(res.error);
        router.refresh();
      } catch (e) {
        setError(errorText(e, lang));
      }
    });
  }

  return (
    <section className="card grid gap-4 border-accent p-5">
      <div className="grid gap-1">
        <h2 className="text-xl font-extrabold">{t.checkinTitle}</h2>
        <p className="text-sm text-muted">{t.checkinLede}</p>
        <p className="text-xs text-muted">{t.browserTip}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`btn ${pos ? "" : "btn-primary"}`} disabled={locating || pending} onClick={locate}>
          {locating ? t.locating : `1. ${t.getLocation}`}
        </button>
        {pos && <span className="text-sm text-good">{t.located(Math.round(pos.accuracy))}</span>}
      </div>
      <div className="field">
        <label htmlFor="checkin-photo">2. {t.checkinPhoto}</label>
        <input id="checkin-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <button type="button" className="btn btn-primary w-fit" disabled={!pos || !file || pending} onClick={submit}>
        {pending ? t.checkingIn : `3. ${t.checkIn}`}
      </button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

function answered(q: SnapshotQuestion, a: Answer | undefined) {
  if (!a) return false;
  if (a.na) return true;
  if (a.value === undefined || a.value === null) return false;
  return q.kind !== "text" || String(a.value).trim() !== "";
}

function PhotoSlot({ label, url, onAdd, onRemove, busy, lang }: { label: string; url?: string; onAdd?: (f: File) => void; onRemove?: () => void; busy: boolean; lang: Lang }) {
  const t = dict(lang).tasks;
  const input = useRef<HTMLInputElement>(null);
  if (url)
    return (
      <span className="grid w-28 gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- tautan sementara dari penyimpanan privat */}
        <img src={url} alt={label} className="aspect-square w-28 rounded-lg border border-line object-cover" />
        {onRemove && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={onRemove}>
            {t.replacePhoto}
          </button>
        )}
      </span>
    );
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onAdd) onAdd(f);
          e.target.value = "";
        }}
      />
      <button type="button" className="btn btn-sm" disabled={busy || !onAdd} onClick={() => input.current?.click()}>
        📷 {label}
      </button>
    </>
  );
}

export function AuditForm({ task, photoUrls, lang }: { task: ShopperTaskDetail; photoUrls: Record<string, string>; lang: Lang }) {
  const t = dict(lang).tasks;
  const router = useRouter();
  const snap = task.questionnaire!;
  const [answers, setAnswers] = useState<Answers>(task.answers ?? {});
  const [purchase, setPurchase] = useState(task.purchase_amount === null ? "" : String(task.purchase_amount));
  const [purchaseNote, setPurchaseNote] = useState(task.purchase_note ?? "");
  const [saveState, setSaveState] = useState<{ tone: "ok" | "error" | "busy"; text: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const submit = useAction();
  const first = useRef(true);

  const questions = snap.sections.flatMap((s) => s.questions);
  const done = questions.filter((q) => answered(q, answers[q.id])).length;
  const used = task.photos.length;
  const full = used >= snap.photo_limit;
  const receipts = task.photos.filter((p) => p.kind === "receipt");
  const purchaseNumber = purchase.trim() === "" ? null : Number(purchase.replace(/\D/g, ""));

  const payload = () => ({ taskId: task.id, answers, purchase: purchaseNumber, purchaseNote });

  // Simpan otomatis 1,2 detik setelah isian berhenti berubah.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      setSaveState({ tone: "busy", text: t.saving });
      try {
        const res = await saveVisit(payload());
        setSaveState(res.ok ? { tone: "ok", text: t.autosaved(new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "id-ID", { hour: "2-digit", minute: "2-digit" })) } : { tone: "error", text: res.error });
      } catch {
        setSaveState({ tone: "error", text: t.saveFailed });
      }
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payload dibentuk dari tiga nilai ini
  }, [answers, purchase, purchaseNote]);

  const setAnswer = (id: string, patch: Partial<Answer>) => setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  async function addPhoto(kind: "receipt" | "evidence", questionId: string | null, file: File) {
    setPhotoBusy(true);
    setSaveState(null);
    try {
      const path = await uploadPhoto(task.id, kind, file);
      const res = await addVisitPhoto({ taskId: task.id, kind, questionId, path });
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setSaveState({ tone: "error", text: errorText(e, lang) || t.uploadFailed });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto(photoId: string) {
    setPhotoBusy(true);
    try {
      const res = await removeVisitPhoto({ photoId });
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setSaveState({ tone: "error", text: errorText(e, lang) });
    } finally {
      setPhotoBusy(false);
    }
  }

  const choice = (active: boolean) => `btn btn-sm min-w-12 ${active ? "btn-primary" : ""}`;

  return (
    <>
      <section className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg/95 px-4 py-2 text-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <span className="font-semibold">{t.progress(done, questions.length)}</span>
        <span className="text-muted">{t.photosUsed(used, snap.photo_limit)}</span>
        {saveState && <span className={saveState.tone === "error" ? "text-bad" : saveState.tone === "ok" ? "text-good" : "text-muted"}>{saveState.text}</span>}
      </section>

      <p className="text-sm text-muted">{t.checkedIn(dateTime(task.checkin_at, lang))}</p>

      {snap.sections.map((s) => (
        <section key={s.id} className="card grid gap-4 p-5">
          <h2 className="text-lg font-extrabold">{s.title}</h2>
          {s.questions.map((q, i) => {
            const a = answers[q.id] ?? {};
            const photo = task.photos.find((p) => p.kind === "evidence" && p.question_id === q.id);
            return (
              <div key={q.id} className={`grid gap-2 border-t border-line pt-4 first-of-type:border-0 first-of-type:pt-0 ${answered(q, a) ? "" : ""}`}>
                <p className="font-semibold">
                  <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
                  {q.prompt}
                  {q.photo_required && <span className="chip ml-2 border-accent text-mark">{t.photoRequired}</span>}
                </p>
                {q.help && <p className="text-sm text-muted">{q.help}</p>}
                <div className="flex flex-wrap gap-2">
                  {q.kind === "yes_no" &&
                    (["yes", "no"] as const).map((v) => (
                      <button key={v} type="button" className={choice(!a.na && a.value === v)} onClick={() => setAnswer(q.id, { value: v, na: false })}>
                        {v === "yes" ? t.yes : t.no}
                      </button>
                    ))}
                  {q.kind === "scale" &&
                    [1, 2, 3, 4, 5].map((v) => (
                      <button key={v} type="button" className={choice(!a.na && a.value === v)} onClick={() => setAnswer(q.id, { value: v, na: false })}>
                        {v}
                      </button>
                    ))}
                  <button type="button" className={choice(Boolean(a.na))} onClick={() => setAnswer(q.id, { na: !a.na })}>
                    {t.na}
                  </button>
                </div>
                {q.kind === "text" && !a.na && (
                  <textarea
                    aria-label={t.answerText}
                    className="rounded-lg border border-line bg-raise p-2 text-sm"
                    rows={3}
                    maxLength={2000}
                    value={typeof a.value === "string" ? a.value : ""}
                    onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                  />
                )}
                {q.kind !== "text" && (
                  <input
                    aria-label={t.note}
                    placeholder={t.note}
                    className="min-h-10 rounded-lg border border-line bg-raise px-3 text-sm"
                    maxLength={1000}
                    value={a.note ?? ""}
                    onChange={(e) => setAnswer(q.id, { note: e.target.value })}
                  />
                )}
                {q.photo_required && !a.na && (
                  <div className="flex flex-wrap items-end gap-2">
                    <PhotoSlot
                      label={t.addPhoto}
                      url={photo ? photoUrls[photo.id] : undefined}
                      busy={photoBusy}
                      lang={lang}
                      onAdd={full ? undefined : (f) => addPhoto("evidence", q.id, f)}
                      onRemove={photo ? () => removePhoto(photo.id) : undefined}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-extrabold">{t.purchaseTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="purchase">{t.purchaseAmount}</label>
            <input id="purchase" inputMode="numeric" value={purchase} onChange={(e) => setPurchase(e.target.value.replace(/\D/g, ""))} />
            <small>{purchaseNumber !== null ? rupiah(purchaseNumber) : t.purchaseHint}</small>
          </div>
          <div className="field">
            <label htmlFor="purchase-note">{t.purchaseNote}</label>
            <input id="purchase-note" maxLength={500} value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} />
          </div>
        </div>
        {purchaseNumber !== null && purchaseNumber > task.reimburse_cap && <p className="text-sm text-warn">{t.overCap(rupiah(task.reimburse_cap))}</p>}
        <div className="flex flex-wrap items-end gap-3">
          {receipts.map((p, i) => (
            <PhotoSlot key={p.id} label={t.receipt(i + 1)} url={photoUrls[p.id]} busy={photoBusy} lang={lang} onRemove={() => removePhoto(p.id)} />
          ))}
          <PhotoSlot label={t.addReceipt} busy={photoBusy} lang={lang} onAdd={full ? undefined : (f) => addPhoto("receipt", null, f)} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submit.pending || photoBusy}
          onClick={() => {
            if (!confirm(t.submitConfirm)) return;
            submit.act(async () => {
              const saved = await saveVisit(payload());
              if (!saved.ok) return saved;
              return submitVisit({ taskId: task.id });
            });
          }}
        >
          {t.submit}
        </button>
        <StatusText status={submit.status} />
      </div>
    </>
  );
}
