"use client";

import { useState } from "react";
import { approveVisit, recordRevisionFollowup, rejectVisit, requestRevision } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { answerLabel, PURCHASE_ITEM, waLink, type Answers, type QuestionnaireSnapshot, type TaskStatus } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";

type Photo = { id: string; kind: "checkin" | "receipt" | "evidence"; question_id: string | null; url: string };
type Task = {
  id: string;
  code: string;
  status: TaskStatus;
  answers: Answers;
  revisionRound: number;
  revisionQuestions: string[];
  revisionNote: string | null;
  revisionDue: string | null;
  purchase: number | null;
  purchaseNote: string;
  reimburseCap: number;
  excess: number;
  city: string;
};

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";

function Thumb({ photo, label }: { photo: Photo; label: string }) {
  if (!photo.url) return null;
  return (
    <a href={photo.url} target="_blank" rel="noreferrer" className="grid w-32 gap-1 text-xs text-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- tautan sementara dari penyimpanan privat */}
      <img src={photo.url} alt={label} className="aspect-square w-32 rounded-lg border border-line object-cover" />
      {label} ↗
    </a>
  );
}

// Layar QC: jawaban berdampingan dengan foto. Admin menandai bagian yang perlu revisi, atau menyetujui/menolak.
export function QcPanel({ task, snapshot, photos }: { task: Task; snapshot: QuestionnaireSnapshot; photos: Photo[] }) {
  const { pending, status, setStatus, act } = useAction();
  const [items, setItems] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [excess, setExcess] = useState(false);
  const [fee, setFee] = useState<"reimburse_only" | "none">("none");
  const [reopen, setReopen] = useState(true);
  const [mode, setMode] = useState<"approve" | "revision" | "reject" | null>(null);
  const open = task.status === "submitted";
  const canRevise = open && task.revisionRound < 2;
  const toggle = (id: string) => setItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const receipts = photos.filter((p) => p.kind === "receipt");

  const flag = (id: string) =>
    canRevise && (
      <label className={`flex items-center gap-2 text-xs font-semibold ${items.includes(id) ? "text-warn" : "text-muted"}`}>
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={items.includes(id)} onChange={() => toggle(id)} />
        Minta revisi
      </label>
    );

  return (
    <div className="grid gap-4">
      {task.status === "revision" && (
        <section className="card grid gap-3 border-warn/60 p-5">
          <p className="font-semibold">
            Menunggu revisi shopper sampai {dateTime(task.revisionDue, "id")} (putaran {task.revisionRound}/2).
          </p>
          {task.revisionNote && <p className="text-sm text-muted">Catatan: {task.revisionNote}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={pending}
              onClick={() => {
                const win = window.open("", "_blank");
                act(
                  () => recordRevisionFollowup({ taskId: task.id }),
                  undefined,
                  (phone) => {
                    if (!phone) return win?.close();
                    const link = `${window.location.origin}/shopper/assignments/${task.id}`;
                    const text = `Halo, ada revisi untuk kunjungan SilentCX ${task.code} di ${task.city}. Mohon diperbaiki sebelum ${dateTime(task.revisionDue, "id")}: ${link}`;
                    if (win) win.location.href = waLink(phone, text);
                  },
                );
              }}
            >
              Follow up revisi via WhatsApp
            </button>
          </div>
          <StatusText status={status} />
        </section>
      )}

      {snapshot.sections.map((s) => (
        <section key={s.id} className="card grid gap-3 p-5">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
            {s.title} <span className="text-sm font-normal text-muted">bobot {s.weight}</span>
          </h2>
          {s.questions.map((q, i) => {
            const a = task.answers[q.id];
            const photo = photos.find((p) => p.kind === "evidence" && p.question_id === q.id);
            const value = answerLabel(q, a);
            const tone = a?.na ? "text-muted" : a?.value === "no" || (typeof a?.value === "number" && a.value <= 2) ? "text-bad" : "";
            return (
              <div key={q.id} className={`grid gap-2 border-t border-line pt-3 first-of-type:border-0 first-of-type:pt-0 ${items.includes(q.id) ? "rounded-lg bg-warn/10 p-2" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="max-w-[60ch] text-sm">
                    <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
                    {q.prompt}
                    {q.photo_required && <span className="chip ml-2">Wajib foto</span>}
                    {task.revisionQuestions.includes(q.id) && <span className="chip ml-2 border-warn/50 text-warn">Direvisi</span>}
                  </p>
                  {flag(q.id)}
                </div>
                <p className={`font-semibold ${tone}`}>{value}</p>
                {a?.note && <p className="text-sm text-muted">Catatan shopper: {a.note}</p>}
                {photo && <Thumb photo={photo} label="Foto bukti" />}
              </div>
            );
          })}
        </section>
      ))}

      <section className={`card grid gap-3 p-5 ${items.includes(PURCHASE_ITEM) ? "border-warn/60" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">Pembelian dan struk</h2>
          {flag(PURCHASE_ITEM)}
        </div>
        <p>
          {rupiah(task.purchase)} <span className="text-sm text-muted">· batas reimburse {rupiah(task.reimburseCap)}</span>
        </p>
        {task.purchaseNote && <p className="text-sm text-muted">{task.purchaseNote}</p>}
        {task.excess > 0 && <p className="text-sm text-warn">Melebihi batas {rupiah(task.excess)}. Putuskan saat menyetujui.</p>}
        <div className="flex flex-wrap gap-3">
          {receipts.map((p, i) => (
            <Thumb key={p.id} photo={p} label={`Struk ${i + 1}`} />
          ))}
          {receipts.length === 0 && <span className="text-sm text-muted">Tidak ada struk.</span>}
        </div>
      </section>

      {(open || task.status === "revision") && (
        <section className="card grid gap-4 border-accent p-5">
          <h2 className="text-lg font-extrabold">Keputusan QC</h2>
          <div className="flex flex-wrap gap-2">
            {open && (
              <button type="button" className={`btn ${mode === "approve" ? "btn-primary" : ""}`} onClick={() => setMode("approve")}>
                Setujui
              </button>
            )}
            {open && (
              <button type="button" className={`btn ${mode === "revision" ? "btn-primary" : ""}`} disabled={!canRevise} onClick={() => setMode("revision")}>
                Minta revisi {items.length > 0 && `(${items.length})`}
              </button>
            )}
            <button type="button" className={`btn ${mode === "reject" ? "btn-primary" : ""}`} onClick={() => setMode("reject")}>
              Tolak
            </button>
          </div>
          {open && !canRevise && <p className="text-sm text-muted">Sudah 2 kali revisi. Setujui atau tolak kunjungan ini.</p>}

          {mode && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setStatus(null);
                if (mode === "approve") act(() => approveVisit({ taskId: task.id, excess, note }), "Kunjungan disetujui.");
                if (mode === "revision") act(() => requestRevision({ taskId: task.id, items, note }), "Revisi diminta. Shopper punya 24 jam.");
                if (mode === "reject") act(() => rejectVisit({ taskId: task.id, fee, note, reopen }), reopen ? "Kunjungan ditolak. Tugas pengganti sudah dibuat di halaman proyek." : "Kunjungan ditolak.");
              }}
            >
              {mode === "approve" && (
                <>
                  <p className="text-sm text-muted">Lokasi check-in dianggap sesuai, dan fee shopper siap dibayar.</p>
                  {task.excess > 0 && (
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={excess} onChange={(e) => setExcess(e.target.checked)} />
                      <span>
                        Setujui kelebihan pembelian {rupiah(task.excess)}: diganti ke shopper dan ditagihkan ke client saat laporan terbit. Centang hanya kalau pembelian wajib memang lebih
                        mahal atau sudah diizinkan sebelumnya.
                      </span>
                    </label>
                  )}
                </>
              )}
              {mode === "revision" && (
                <p className="text-sm text-muted">
                  {items.length ? `${items.length} bagian ditandai.` : "Centang \"Minta revisi\" pada pertanyaan atau bagian pembelian."} Shopper hanya bisa mengubah bagian yang ditandai, dalam 24 jam.
                </p>
              )}
              {mode === "reject" && (
                <>
                  <fieldset className="grid gap-2 text-sm">
                    <legend className="mb-1 font-semibold">Pembayaran shopper</legend>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="fee" className="size-4 accent-[var(--accent)]" checked={fee === "none"} onChange={() => setFee("none")} />
                      Tidak dibayar (misalnya kecurangan)
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="fee" className="size-4 accent-[var(--accent)]" checked={fee === "reimburse_only"} onChange={() => setFee("reimburse_only")} />
                      Hanya reimburse pembelian (misalnya outlet tutup)
                    </label>
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
                    Buat tugas pengganti untuk shopper lain
                  </label>
                </>
              )}
              <label className="grid gap-1 text-sm font-semibold">
                {mode === "approve" ? "Catatan (opsional)" : mode === "revision" ? "Catatan untuk shopper (wajib)" : "Alasan penolakan (wajib, dilihat shopper)"}
                <textarea className={input} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} required={mode !== "approve"} />
              </label>
              <button className="btn btn-primary w-fit" disabled={pending || (mode === "revision" && items.length === 0)}>
                {mode === "approve" ? "Setujui kunjungan" : mode === "revision" ? "Kirim permintaan revisi" : "Tolak kunjungan"}
              </button>
            </form>
          )}
          <StatusText status={status} />
        </section>
      )}
    </div>
  );
}
