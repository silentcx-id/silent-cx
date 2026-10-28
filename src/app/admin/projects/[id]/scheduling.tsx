"use client";

import { useState } from "react";
import { assignQuestionnaire, cancelTask, checkLocation, createTask, offerTask, recordFollowup, updateTask, visitPhotoLink, withdrawOffer } from "../field-actions";
import { CheckinMap } from "@/components/checkin-map";
import { StatusText, useAction } from "@/components/use-action";
import { followupMessage, TASK_STATUS_LABEL, TASK_STATUS_TONE, waLink, windowLabel, type TaskStatus } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";
const sub = "grid gap-1 text-xs text-muted";

export type Candidate = { shopper_id: string; full_name: string; phone: string | null; reaches_city: boolean; active_tasks: number; same_outlet: boolean; eligible: boolean };

export type AdminTask = {
  id: string;
  code: string;
  status: TaskStatus;
  window_start: string;
  window_end: string;
  hours_start: string | null;
  hours_end: string | null;
  fee: number;
  reimburse_cap: number;
  scenario: string;
  mandatory_purchase: string;
  checkin_at: string | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkin_accuracy: number | null;
  location_check: "match" | "mismatch" | null;
  location_note: string | null;
  purchase_amount: number | null;
  purchase_note: string;
  excess_amount: number;
  score: number | null;
  submitted_at: string | null;
  cancel_note: string | null;
  shopper: { full_name: string; phone: string | null } | null;
  offer: { respond_by: string; urgent: boolean; followups: number; last_followup_at: string | null } | null;
  photos: { id: string; kind: "checkin" | "receipt" | "evidence" }[];
  candidates: Candidate[];
};

export type OutletTasks = { id: string; position: number; name: string; city: string; address: string; maps_url: string; is_competitor: boolean; tasks: AdminTask[] };

type Defaults = { fee: number; reimburse: number; hours: number; today: string; inAWeek: string };

export function QuestionnairePicker({
  projectId,
  current,
  options,
  locked,
}: {
  projectId: string;
  current: { id: string | null; name: string; assigned_at: string } | null;
  options: { id: string; name: string; ready: boolean }[];
  locked: boolean;
}) {
  const { pending, status, act } = useAction();
  const [choice, setChoice] = useState(current?.id ?? options.find((o) => o.ready)?.id ?? "");
  return (
    <section className={`card grid gap-3 p-5 ${current ? "" : "border-warn/60"}`}>
      <div className="grid gap-1">
        <h2 className="text-xl font-extrabold">Kuesioner proyek</h2>
        {current ? (
          <p className="text-sm">
            <span className="font-semibold">{current.name}</span> <span className="text-muted">· ditetapkan {dateTime(current.assigned_at, "id")}</span>
          </p>
        ) : (
          <p className="text-sm text-muted">Tetapkan kuesioner dulu sebelum membuat tugas. Kuesioner disalin dan dikunci di proyek ini.</p>
        )}
      </div>
      {locked ? (
        <p className="text-sm text-muted">Sudah ada kunjungan yang dimulai, jadi kuesioner tidak bisa diganti lagi.</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => assignQuestionnaire({ projectId, questionnaireId: choice }), "Kuesioner ditetapkan.");
          }}
        >
          <label className={`${label} min-w-64 flex-1`} htmlFor="pick-q">
            {current ? "Ganti dengan" : "Pilih kuesioner"}
            <select id="pick-q" className={input} value={choice} onChange={(e) => setChoice(e.target.value)} required>
              <option value="">Pilih…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.ready}>
                  {o.name}
                  {o.ready ? "" : " (belum siap)"}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={pending || !choice}>
            {current ? "Ganti" : "Tetapkan"}
          </button>
          <StatusText status={status} />
        </form>
      )}
    </section>
  );
}

type Brief = { windowStart: string; windowEnd: string; hoursStart: string; hoursEnd: string; fee: string; reimburse: string; scenario: string; purchase: string };

function BriefForm({ initial, submitLabel, onSubmit, onCancel, pending }: { initial: Brief; submitLabel: string; onSubmit: (b: Brief) => void; onCancel: () => void; pending: boolean }) {
  const [b, setB] = useState(initial);
  const set = (k: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setB({ ...b, [k]: e.target.value });
  return (
    <form
      className="@container grid gap-3 rounded-xl border border-dashed border-accent p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(b);
      }}
    >
      {/* Dikelompokkan (tanggal, jam, biaya) dengan label sama pendek supaya kotak isian sejajar; berjajar tiga hanya kalau wadahnya cukup lebar. */}
      <div className="grid gap-3 @4xl:grid-cols-3">
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">Tanggal kunjungan</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className={sub}>
              Dari
              <input type="date" className={input} value={b.windowStart} onChange={set("windowStart")} required />
            </label>
            <label className={sub}>
              Sampai
              <input type="date" className={input} value={b.windowEnd} onChange={set("windowEnd")} required />
            </label>
          </div>
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">
            Jam kunjungan <span className="font-normal text-muted">(opsional)</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <label className={sub}>
              Dari
              <input type="time" className={input} value={b.hoursStart} onChange={set("hoursStart")} />
            </label>
            <label className={sub}>
              Sampai
              <input type="time" className={input} value={b.hoursEnd} onChange={set("hoursEnd")} />
            </label>
          </div>
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">Biaya per kunjungan (Rp)</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className={sub}>
              Fee shopper
              <input className={input} inputMode="numeric" value={b.fee} onChange={set("fee")} required />
            </label>
            <label className={sub}>
              Batas reimburse
              <input className={input} inputMode="numeric" value={b.reimburse} onChange={set("reimburse")} required />
            </label>
          </div>
        </fieldset>
      </div>
      <div className="grid gap-3 @2xl:grid-cols-2">
        <label className={`${label} content-start`}>
          Skenario kunjungan
          <textarea className={input} rows={2} maxLength={2000} value={b.scenario} onChange={set("scenario")} placeholder="Contoh: datang sendiri, tanyakan menu andalan, bayar dengan QRIS." />
        </label>
        <label className={`${label} content-start`}>
          Pembelian wajib
          <input className={input} maxLength={500} value={b.purchase} onChange={set("purchase")} placeholder="Contoh: 1 minuman andalan dan 1 makanan ringan" />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" disabled={pending}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Batal
        </button>
      </div>
    </form>
  );
}

function OfferForm({ task, defaultHours }: { task: AdminTask; defaultHours: number }) {
  const { pending, status, act } = useAction();
  const first = task.candidates.find((c) => c.eligible);
  const [shopper, setShopper] = useState(first?.shopper_id ?? "");
  const [hours, setHours] = useState(String(defaultHours));
  const [urgent, setUrgent] = useState(false);
  if (task.candidates.length === 0) return <p className="text-sm text-warn">Belum ada shopper aktif. Setujui pelamar di menu Akun dulu.</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => offerTask({ taskId: task.id, shopperId: shopper, hours, urgent }), "Tugas ditawarkan.");
      }}
    >
      <label className={label}>
        Tawarkan ke
        <select className={input} value={shopper} onChange={(e) => setShopper(e.target.value)} required>
          <option value="">Pilih shopper…</option>
          {task.candidates.map((c) => (
            <option key={c.shopper_id} value={c.shopper_id} disabled={!c.eligible}>
              {c.full_name || "—"} · {c.reaches_city ? "menjangkau kota ini" : "di luar jangkauan"} · {c.active_tasks} tugas aktif
              {c.same_outlet ? " · sudah pernah ke outlet ini" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Batas jawab (jam)
        <input className={input} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={urgent}
          onChange={(e) => {
            setUrgent(e.target.checked);
            if (e.target.checked && Number(hours) > 2) setHours("2");
          }}
        />
        Segera
      </label>
      <button className="btn btn-primary" disabled={pending || !shopper}>
        Tawarkan
      </button>
      <div className="sm:col-span-4">
        <StatusText status={status} />
      </div>
    </form>
  );
}

function FollowupButton({ task, city }: { task: AdminTask; city: string }) {
  const { pending, status, act } = useAction();
  return (
    <span className="grid gap-1">
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={pending}
        onClick={() => {
          // Jendela dibuka langsung saat diklik supaya tidak diblokir browser, lalu diarahkan setelah nomor didapat.
          const win = window.open("", "_blank");
          act(
            () => recordFollowup({ taskId: task.id }),
            undefined,
            (phone) => {
              if (!phone || !task.offer) return win?.close();
              const link = `${window.location.origin}/shopper/assignments/${task.id}`;
              const url = waLink(phone, followupMessage(task.code, city, dateTime(task.offer.respond_by, "id"), link));
              if (win) win.location.href = url;
              else window.location.href = url;
            },
          );
        }}
      >
        Follow up via WhatsApp
      </button>
      <StatusText status={status} />
    </span>
  );
}

function CancelTask({ taskId }: { taskId: string }) {
  const { pending, status, act } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open)
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Batalkan tugas
      </button>
    );
  return (
    <form
      className="grid w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => cancelTask({ taskId, note }), undefined, () => setOpen(false));
      }}
    >
      <label className="text-xs text-muted" htmlFor={`cancel-${taskId}`}>
        Alasan pembatalan (dilihat shopper yang memegang tugas)
      </label>
      <textarea id={`cancel-${taskId}`} className={input} rows={2} maxLength={500} required value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" disabled={pending || !note.trim()}>
          Batalkan tugas
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Kembali
        </button>
      </div>
      <StatusText status={status} />
    </form>
  );
}

function PhotoButton({ id, text }: { id: string; text: string }) {
  const { pending, status, act } = useAction();
  return (
    <span className="grid gap-1">
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => {
          const win = window.open("", "_blank");
          act(
            () => visitPhotoLink({ photoId: id }),
            undefined,
            (url) => {
              if (url && win) win.location.href = url;
              else win?.close();
            },
          );
        }}
      >
        {text} ↗
      </button>
      <StatusText status={status} />
    </span>
  );
}

// Titik check-in di peta (OpenStreetMap) untuk dicocokkan dengan alamat dan link Maps dari client.
function LocationReview({ task, outlet }: { task: AdminTask; outlet: OutletTasks }) {
  const { pending, status, act } = useAction();
  const [note, setNote] = useState(task.location_note ?? "");
  const lat = task.checkin_lat ?? 0;
  const lng = task.checkin_lng ?? 0;
  const checkinPhoto = task.photos.find((p) => p.kind === "checkin");
  return (
    <div className="grid gap-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Check-in {dateTime(task.checkin_at, "id")}</span>
        <span
          className={`chip ${task.location_check === "match" ? "border-good/50 text-good" : task.location_check === "mismatch" ? "border-bad/50 text-bad" : "border-warn/50 text-warn"}`}
        >
          {task.location_check === "match" ? "Lokasi sesuai" : task.location_check === "mismatch" ? "Lokasi tidak sesuai" : "Lokasi belum dicek"}
        </span>
      </div>
      <CheckinMap lat={lat} lng={lng} title={`Titik check-in ${task.code}`} />
      <p className="text-sm">
        <span className="text-muted">Alamat dari client:</span> {outlet.address || "—"}
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">
          Titik check-in di Google Maps ↗
        </a>
        {outlet.maps_url && (
          <a className="btn btn-sm" href={outlet.maps_url} target="_blank" rel="noreferrer">
            Lokasi outlet dari client ↗
          </a>
        )}
        {checkinPhoto && <PhotoButton id={checkinPhoto.id} text="Foto check-in" />}
      </div>
      <p className="text-xs text-muted">
        Akurasi GPS ±{Math.round(task.checkin_accuracy ?? 0)} m · {lat.toFixed(6)}, {lng.toFixed(6)}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-48 flex-1 gap-1 text-xs text-muted">
          Catatan (opsional)
          <input className={input} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => checkLocation({ taskId: task.id, match: true, note }), "Ditandai sesuai.")}>
          Sesuai
        </button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => checkLocation({ taskId: task.id, match: false, note }), "Ditandai tidak sesuai.")}>
          Tidak sesuai
        </button>
      </div>
      <StatusText status={status} />
    </div>
  );
}

function TaskCard({ task, outlet, defaults }: { task: AdminTask; outlet: OutletTasks; defaults: Defaults }) {
  const { pending, status, act } = useAction();
  const [editing, setEditing] = useState(false);
  const receipts = task.photos.filter((p) => p.kind === "receipt");
  const evidence = task.photos.filter((p) => p.kind === "evidence");
  return (
    <li className={`grid gap-3 rounded-xl border p-4 ${task.offer?.urgent ? "border-accent" : "border-line"} ${task.status === "cancelled" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold">{task.code}</span>
          <span className={`chip ${TASK_STATUS_TONE[task.status]}`}>{TASK_STATUS_LABEL[task.status]}</span>
          {task.offer?.urgent && <span className="chip border-accent text-mark">Segera</span>}
        </span>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Jadwal", windowLabel(task)],
          ["Fee shopper", rupiah(task.fee)],
          ["Batas reimburse", rupiah(task.reimburse_cap)],
          ["Pembelian wajib", task.mandatory_purchase || "—"],
        ].map(([k, v]) => (
          <div key={k} className="grid gap-0.5">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {task.scenario && <p className="whitespace-pre-line text-sm">{task.scenario}</p>}
      {task.cancel_note && <p className="text-sm text-muted">Dibatalkan: {task.cancel_note}</p>}

      {task.shopper && task.status !== "cancelled" && (
        <p className="text-sm">
          <span className="text-muted">Shopper:</span> <span className="font-semibold">{task.shopper.full_name}</span>
          {task.shopper.phone && <span className="font-mono text-muted"> · {task.shopper.phone}</span>}
          {task.offer && (
            <span className="text-muted">
              {" "}
              · jawab sebelum {dateTime(task.offer.respond_by, "id")}
              {task.offer.followups > 0 && ` · di-follow up ${task.offer.followups}x`}
            </span>
          )}
        </p>
      )}

      {task.status === "open" &&
        (editing ? (
          <BriefForm
            initial={{
              windowStart: task.window_start,
              windowEnd: task.window_end,
              hoursStart: task.hours_start?.slice(0, 5) ?? "",
              hoursEnd: task.hours_end?.slice(0, 5) ?? "",
              fee: String(task.fee),
              reimburse: String(task.reimburse_cap),
              scenario: task.scenario,
              purchase: task.mandatory_purchase,
            }}
            submitLabel="Simpan brief"
            pending={pending}
            onCancel={() => setEditing(false)}
            onSubmit={(b) => act(() => updateTask({ taskId: task.id, ...b }), "Brief diperbarui.", () => setEditing(false))}
          />
        ) : (
          <OfferForm task={task} defaultHours={defaults.hours} />
        ))}

      {(task.status === "in_progress" || task.status === "submitted") && task.checkin_at && <LocationReview task={task} outlet={outlet} />}

      {task.status === "submitted" && (
        <div className="grid gap-2 rounded-xl border border-accent bg-accent/5 p-3 text-sm">
          <p>
            Disubmit {dateTime(task.submitted_at, "id")} · skor sementara <span className="font-display text-lg font-extrabold">{task.score ?? "—"}</span>
          </p>
          <p>
            Pembelian {rupiah(task.purchase_amount)}
            {task.excess_amount > 0 && <span className="text-warn"> · melebihi batas {rupiah(task.excess_amount)} (diputuskan saat QC)</span>}
            {task.purchase_note && ` · ${task.purchase_note}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {receipts.map((p, i) => (
              <PhotoButton key={p.id} id={p.id} text={`Struk ${i + 1}`} />
            ))}
            {evidence.map((p, i) => (
              <PhotoButton key={p.id} id={p.id} text={`Bukti ${i + 1}`} />
            ))}
          </div>
          <p className="text-xs text-muted">Pemeriksaan jawaban dan keputusan QC ada di menu Quality control.</p>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-2">
        {task.status === "open" && !editing && (
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            Ubah brief
          </button>
        )}
        {task.status === "offered" && (
          <>
            <FollowupButton task={task} city={outlet.city} />
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => withdrawOffer({ taskId: task.id }), "Tawaran ditarik.")}>
              Tarik tawaran
            </button>
          </>
        )}
        {!["submitted", "cancelled"].includes(task.status) && <CancelTask taskId={task.id} />}
      </div>
      <StatusText status={status} />
    </li>
  );
}

export function OutletSchedule({ outlet, defaults, canCreate, visitsPlanned }: { outlet: OutletTasks; defaults: Defaults; canCreate: boolean; visitsPlanned: number }) {
  const { pending, status, act } = useAction();
  const [adding, setAdding] = useState(false);
  const live = outlet.tasks.filter((t) => t.status !== "cancelled").length;
  return (
    <article className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
          {outlet.position}. {outlet.name || "Nama belum diisi"} <span className="chip font-normal">{outlet.city}</span>
          {outlet.is_competitor && <span className="chip border-accent font-normal text-mark">Kompetitor</span>}
        </h3>
        <span className={`text-sm ${live < visitsPlanned ? "text-warn" : "text-muted"}`}>
          {live}/{visitsPlanned} kunjungan dijadwalkan
        </span>
      </div>
      {outlet.tasks.length > 0 && (
        <ul className="grid gap-3">
          {outlet.tasks.map((t) => (
            <TaskCard key={t.id} task={t} outlet={outlet} defaults={defaults} />
          ))}
        </ul>
      )}
      {canCreate &&
        (adding ? (
          <BriefForm
            initial={{ windowStart: defaults.today, windowEnd: defaults.inAWeek, hoursStart: "", hoursEnd: "", fee: String(defaults.fee), reimburse: String(defaults.reimburse), scenario: "", purchase: "" }}
            submitLabel="Buat tugas"
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(b) => act(() => createTask({ outletId: outlet.id, ...b }), "Tugas dibuat.", () => setAdding(false))}
          />
        ) : (
          <button type="button" className="btn btn-sm w-fit" onClick={() => setAdding(true)}>
            + Tugas kunjungan
          </button>
        ))}
      <StatusText status={status} />
    </article>
  );
}
