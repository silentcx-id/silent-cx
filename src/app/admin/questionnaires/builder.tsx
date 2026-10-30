"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addQuestion,
  addReferenceStages,
  addSection,
  addStage,
  createQuestionnaire,
  deleteQuestion,
  deleteQuestionnaire,
  deleteSection,
  deleteStage,
  duplicateQuestionnaire,
  move,
  moveStage,
  saveFieldSettings,
  saveQuestion,
  saveQuestionnaire,
  saveSection,
  saveStage,
} from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { QUESTION_KINDS, type QuestionKind } from "@/lib/field";
import { rupiah } from "@/lib/format";
import type { BusinessType } from "@/lib/catalog-types";
import { journeyReference, type JourneyStage } from "@/lib/journey";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";

// Jenis usaha dari Katalog. Jenis yang sudah dinonaktifkan tetap tampil kalau sedang dipakai kuesioner ini.
function IndustrySelect({ id, value, onChange, types }: { id: string; value: string; onChange: (v: string) => void; types: BusinessType[] }) {
  return (
    <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      {types
        .filter((o) => o.active || o.key === value)
        .map((o) => (
          <option key={o.key} value={o.key}>
            {o.label_id}
          </option>
        ))}
    </select>
  );
}

export function NewQuestionnaireForm({ types }: { types: BusinessType[] }) {
  const router = useRouter();
  const { pending, status, act } = useAction();
  const [name, setName] = useState("");
  const [type, setType] = useState("fnb");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => createQuestionnaire({ name, business_type: type }), undefined, (id) => id && router.push(`/admin/questionnaires/${id}`));
      }}
    >
      <label className={label} htmlFor="new-name">
        Nama
        <input id="new-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Retail fashion — lengkap" required />
      </label>
      <label className={label} htmlFor="new-type">
        Jenis bisnis
        <IndustrySelect id="new-type" value={type} onChange={setType} types={types} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          Buat
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}

type Settings = { default_fee: number; max_active_tasks: number; default_response_hours: number };

export function FieldSettingsForm({ initial }: { initial: Settings }) {
  const { pending, status, act } = useAction();
  const [f, setF] = useState({ default_fee: String(initial.default_fee), max_active_tasks: String(initial.max_active_tasks), default_response_hours: String(initial.default_response_hours) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveFieldSettings(f), "Pengaturan tersimpan.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label} htmlFor="fs-fee">
          Fee per kunjungan (Rp)
          <input id="fs-fee" className={input} inputMode="numeric" value={f.default_fee} onChange={set("default_fee")} required />
          <small className="font-normal text-muted">{rupiah(Number(f.default_fee) || 0)}</small>
        </label>
        <label className={label} htmlFor="fs-max">
          Maks. tugas aktif per shopper
          <input id="fs-max" className={input} inputMode="numeric" value={f.max_active_tasks} onChange={set("max_active_tasks")} required />
        </label>
        <label className={label} htmlFor="fs-hours">
          Batas respons (jam)
          <input id="fs-hours" className={input} inputMode="numeric" value={f.default_response_hours} onChange={set("default_response_hours")} required />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          Simpan
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}

type Header = { id: string; name: string; business_type: string; description: string; photo_limit: number; active: boolean };

export function QuestionnaireHeader({ questionnaire, usedBy, types }: { questionnaire: Header; usedBy: number; types: BusinessType[] }) {
  const router = useRouter();
  const { pending, status, act } = useAction();
  const [f, setF] = useState({ ...questionnaire, photo_limit: String(questionnaire.photo_limit) });
  return (
    <section className="card grid gap-4 p-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_140px]">
        <label className={label} htmlFor="q-name">
          Nama kuesioner
          <input id="q-name" className={`${input} text-base font-bold`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className={label} htmlFor="q-type">
          Jenis bisnis
          <IndustrySelect id="q-type" value={f.business_type} onChange={(v) => setF({ ...f, business_type: v })} types={types} />
        </label>
        <label className={label} htmlFor="q-photos">
          Batas foto
          <input id="q-photos" className={input} inputMode="numeric" value={f.photo_limit} onChange={(e) => setF({ ...f, photo_limit: e.target.value })} />
        </label>
      </div>
      <label className={label} htmlFor="q-desc">
        Keterangan (untuk admin)
        <textarea id="q-desc" className={input} rows={2} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Aktif (bisa ditetapkan ke proyek)
        </label>
        <span className="flex-1" />
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(() => saveQuestionnaire(f), "Tersimpan.")}>
          Simpan
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => act(() => duplicateQuestionnaire({ id: f.id }), undefined, (id) => id && router.push(`/admin/questionnaires/${id}`))}>
          Salin
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            if (confirm(usedBy ? `Dipakai ${usedBy} proyek. Salinan di proyek tetap aman. Hapus template ini?` : "Hapus kuesioner ini?"))
              act(() => deleteQuestionnaire({ id: f.id }), undefined, () => router.push("/admin/questionnaires"));
          }}
        >
          Hapus
        </button>
      </div>
      <StatusText status={status} />
    </section>
  );
}

type Question = { id: string; prompt: string; help: string; kind: string; photo_required: boolean; is_sop: boolean; red_flag: boolean; journey_stage_id: string | null };
type Section = { id: string; title: string; weight: number; target: number; questions: Question[] };
type QuestionDraft = Omit<Question, "id">;

const emptyQuestion: QuestionDraft = { prompt: "", help: "", kind: "yes_no", photo_required: false, is_sop: false, red_flag: false, journey_stage_id: null };
const sameQuestion = (a: QuestionDraft, b: QuestionDraft) =>
  a.prompt === b.prompt && a.help === b.help && a.kind === b.kind && a.photo_required === b.photo_required && a.is_sop === b.is_sop && a.red_flag === b.red_flag && a.journey_stage_id === b.journey_stage_id;
const toPayload = (q: QuestionDraft) => ({ ...q, journey_stage_id: q.journey_stage_id ?? "" });

function MoveButtons({ kind, id, first, last }: { kind: "section" | "question"; id: string; first: boolean; last: boolean }) {
  const { pending, act } = useAction();
  return (
    <span className="flex gap-1">
      <button type="button" className="btn btn-sm" aria-label="Naikkan" disabled={pending || first} onClick={() => act(() => move({ kind, id, dir: "up" }))}>
        ↑
      </button>
      <button type="button" className="btn btn-sm" aria-label="Turunkan" disabled={pending || last} onClick={() => act(() => move({ kind, id, dir: "down" }))}>
        ↓
      </button>
    </span>
  );
}

function QuestionFields({ id, value, onChange, stages }: { id: string; value: QuestionDraft; onChange: (v: QuestionDraft) => void; stages: JourneyStage[] }) {
  const setKind = (kind: QuestionKind) => onChange({ ...value, kind, is_sop: value.is_sop && kind === "yes_no", red_flag: value.red_flag && kind !== "text" });
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
      <label className="grid gap-1 text-xs font-semibold text-muted" htmlFor={`${id}-prompt`}>
        Pertanyaan
        <textarea id={`${id}-prompt`} className={`${input} text-fg`} rows={2} maxLength={500} value={value.prompt} onChange={(e) => onChange({ ...value, prompt: e.target.value })} />
      </label>
      <div className="grid content-start gap-2">
        <label className="grid gap-1 text-xs font-semibold text-muted" htmlFor={`${id}-kind`}>
          Jenis jawaban
          <select id={`${id}-kind`} className={`${input} text-fg`} value={value.kind} onChange={(e) => setKind(e.target.value as QuestionKind)}>
            {QUESTION_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={value.photo_required} onChange={(e) => onChange({ ...value, photo_required: e.target.checked })} />
          Wajib foto
        </label>
        <label className={`flex items-center gap-2 text-sm ${value.kind === "yes_no" ? "" : "text-muted"}`}>
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            disabled={value.kind !== "yes_no"}
            checked={value.is_sop}
            onChange={(e) => onChange({ ...value, is_sop: e.target.checked })}
          />
          SOP {value.kind !== "yes_no" && <small>(hanya Ya / Tidak)</small>}
        </label>
        <label className={`flex items-center gap-2 text-sm ${value.kind === "text" ? "text-muted" : ""}`}>
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            disabled={value.kind === "text"}
            checked={value.red_flag}
            onChange={(e) => onChange({ ...value, red_flag: e.target.checked })}
          />
          Red flag
        </label>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-muted sm:col-span-2" htmlFor={`${id}-stage`}>
        Tahap customer journey
        <select
          id={`${id}-stage`}
          className={`${input} text-fg`}
          disabled={value.kind === "text"}
          value={value.journey_stage_id ?? ""}
          onChange={(e) => onChange({ ...value, journey_stage_id: e.target.value || null })}
        >
          <option value="">{value.kind === "text" ? "Isian teks tidak masuk tahap" : "Tanpa tahap"}</option>
          {stages.map((st) => (
            <option key={st.id} value={st.id}>
              {st.position}. {st.title}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted sm:col-span-2" htmlFor={`${id}-help`}>
        Petunjuk untuk shopper (opsional)
        <input id={`${id}-help`} className={`${input} text-fg`} maxLength={500} value={value.help} onChange={(e) => onChange({ ...value, help: e.target.value })} />
      </label>
    </div>
  );
}

function QuestionRow({ q, n, first, last, stages }: { q: Question; n: number; first: boolean; last: boolean; stages: JourneyStage[] }) {
  const { pending, status, act } = useAction();
  const saved: QuestionDraft = { prompt: q.prompt, help: q.help, kind: q.kind, photo_required: q.photo_required, is_sop: q.is_sop, red_flag: q.red_flag, journey_stage_id: q.journey_stage_id };
  const [v, setV] = useState<QuestionDraft>(saved);
  const dirty = !sameQuestion(v, saved);
  return (
    <li className="grid gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1">
          <span className="font-mono text-xs text-muted">P{n}</span>
          {q.is_sop && <span className="chip border-accent text-mark">SOP</span>}
          {q.red_flag && <span className="chip border-bad/50 text-bad">Red flag</span>}
          {q.journey_stage_id && <span className="chip">{stages.find((st) => st.id === q.journey_stage_id)?.title ?? "Tahap jenis usaha lain"}</span>}
        </span>
        <span className="flex flex-wrap gap-1">
          <MoveButtons kind="question" id={q.id} first={first} last={last} />
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => confirm("Hapus pertanyaan ini?") && act(() => deleteQuestion({ id: q.id }))}>
            Hapus
          </button>
        </span>
      </div>
      <QuestionFields id={q.id} value={v} onChange={setV} stages={stages} />
      {(dirty || status) && (
        <div className="flex flex-wrap items-center gap-3">
          {dirty && (
            <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => saveQuestion({ id: q.id, ...toPayload(v) }), "Tersimpan.")}>
              Simpan pertanyaan
            </button>
          )}
          <StatusText status={status} />
        </div>
      )}
    </li>
  );
}

export function SectionCard({ section, first, last, stages }: { section: Section; first: boolean; last: boolean; stages: JourneyStage[] }) {
  const { pending, status, act } = useAction();
  const [title, setTitle] = useState(section.title);
  const [weight, setWeight] = useState(String(section.weight));
  const [target, setTarget] = useState(String(section.target));
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const dirty = title !== section.title || weight !== String(section.weight) || target !== String(section.target);
  return (
    <article className="card grid gap-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_100px_auto] sm:items-end">
        <label className={label} htmlFor={`s-${section.id}`}>
          Bagian
          <input id={`s-${section.id}`} className={`${input} font-bold`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={label} htmlFor={`w-${section.id}`}>
          Bobot
          <input id={`w-${section.id}`} className={input} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className={label} htmlFor={`t-${section.id}`}>
          Target skor
          <input id={`t-${section.id}`} className={input} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <span className="flex flex-wrap gap-1">
          <MoveButtons kind="section" id={section.id} first={first} last={last} />
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            onClick={() => confirm(`Hapus bagian "${section.title}" beserta ${section.questions.length} pertanyaannya?`) && act(() => deleteSection({ id: section.id }))}
          >
            Hapus
          </button>
        </span>
      </div>
      {(dirty || status) && (
        <div className="flex flex-wrap items-center gap-3">
          {dirty && (
            <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => saveSection({ id: section.id, title, weight, target }), "Tersimpan.")}>
              Simpan bagian
            </button>
          )}
          <StatusText status={status} />
        </div>
      )}
      <p className="text-xs text-muted">
        {section.weight === 0
          ? "Bobot 0: bagian ini tidak dinilai."
          : `Bobot dibagi rata ke ${section.questions.filter((q) => q.kind !== "text").length} pertanyaan yang dinilai. Target ${section.target} dipakai di analisis gap laporan.`}
      </p>
      <ol className="grid gap-2">
        {section.questions.map((q, i) => (
          <QuestionRow key={q.id} q={q} n={i + 1} first={i === 0} last={i === section.questions.length - 1} stages={stages} />
        ))}
      </ol>
      {draft ? (
        <form
          className="grid gap-2 rounded-xl border border-dashed border-accent p-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => addQuestion({ sectionId: section.id, ...toPayload(draft) }), undefined, () => setDraft(null));
          }}
        >
          <QuestionFields id={`new-${section.id}`} value={draft} onChange={setDraft} stages={stages} />
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" disabled={pending}>
              Tambah
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>
              Batal
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-sm w-fit" onClick={() => setDraft(emptyQuestion)}>
          + Pertanyaan
        </button>
      )}
    </article>
  );
}

export function AddSectionForm({ questionnaireId, remaining }: { questionnaireId: string; remaining: number }) {
  const { pending, status, act } = useAction();
  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState(String(remaining));
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => addSection({ questionnaireId, title, weight }), "Bagian ditambahkan.", () => setTitle(""));
      }}
    >
      <label className={label} htmlFor="new-section">
        Judul bagian
        <input id="new-section" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kebersihan toilet" required />
      </label>
      <label className={label} htmlFor="new-weight">
        Bobot
        <input id="new-weight" className={input} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        Tambah
      </button>
      <div className="sm:col-span-3">
        <StatusText status={status} />
      </div>
    </form>
  );
}

function StageRow({ stage, first, last }: { stage: JourneyStage; first: boolean; last: boolean }) {
  const { pending, status, act } = useAction();
  const [title, setTitle] = useState(stage.title);
  const [hint, setHint] = useState(stage.hint);
  const dirty = title !== stage.title || hint !== stage.hint;
  return (
    <li className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[32px_minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center">
      <span className="font-display text-lg font-extrabold text-mark">{stage.position}</span>
      <input aria-label="Nama tahap" className={`${input} font-semibold`} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="Yang diamati di tahap ini" className={input} maxLength={300} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Yang diamati di tahap ini" />
      <span className="flex flex-wrap gap-1">
        {dirty && (
          <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => saveStage({ id: stage.id, title, hint }), "Tersimpan.")}>
            Simpan
          </button>
        )}
        <button type="button" className="btn btn-sm" aria-label="Naikkan tahap" disabled={pending || first} onClick={() => act(() => moveStage({ id: stage.id, dir: "up" }))}>
          ↑
        </button>
        <button type="button" className="btn btn-sm" aria-label="Turunkan tahap" disabled={pending || last} onClick={() => act(() => moveStage({ id: stage.id, dir: "down" }))}>
          ↓
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => confirm(`Hapus tahap "${stage.title}"? Pertanyaan yang memakainya menjadi tanpa tahap.`) && act(() => deleteStage({ id: stage.id }))}
        >
          Hapus
        </button>
      </span>
      {status && (
        <span className="sm:col-span-4">
          <StatusText status={status} />
        </span>
      )}
    </li>
  );
}

// Tahap customer journey untuk jenis usaha kuesioner ini, dengan catatan referensi untuk admin.
export function JourneyPanel({ businessType, typeLabel, stages }: { businessType: string; typeLabel: string; stages: JourneyStage[] }) {
  const { pending, status, act } = useAction();
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const ref = journeyReference(businessType);
  const missing = ref.stages.filter((r) => !stages.some((st) => st.title.trim().toLowerCase() === r.title.toLowerCase())).length;
  return (
    <section className="card grid gap-4 p-5" aria-labelledby="journey-title">
      <div className="grid gap-1">
        <h2 id="journey-title" className="text-lg font-extrabold">
          Tahap customer journey · {typeLabel}
        </h2>
        <p className="text-sm text-muted">Berlaku untuk semua kuesioner {typeLabel}. Salinan kuesioner di proyek yang sudah berjalan tidak ikut berubah.</p>
      </div>
      <details className="rounded-xl border border-accent bg-accent/10 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Catatan referensi customer journey {typeLabel}</summary>
        <div className="mt-3 grid gap-2">
          <p>{ref.tip}</p>
          <p className="font-semibold">Contoh alur:</p>
          <ol className="grid list-decimal gap-1 pl-5">
            {ref.stages.map((r) => (
              <li key={r.title}>
                <span className="font-semibold">{r.title}</span> <span className="text-muted">· {r.hint}</span>
              </li>
            ))}
          </ol>
          {missing > 0 && (
            <button type="button" className="btn btn-sm w-fit" disabled={pending} onClick={() => act(() => addReferenceStages({ businessType }), "Tahap contoh ditambahkan.")}>
              Tambahkan {missing} tahap contoh yang belum ada
            </button>
          )}
        </div>
      </details>
      {stages.length === 0 ? (
        <p className="text-sm text-muted">Belum ada tahap. Tambahkan dari catatan referensi atau isi sendiri di bawah.</p>
      ) : (
        <ol className="grid gap-2">
          {stages.map((st, i) => (
            <StageRow key={st.id} stage={st} first={i === 0} last={i === stages.length - 1} />
          ))}
        </ol>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => addStage({ businessType, title, hint }), "Tahap ditambahkan.", () => {
            setTitle("");
            setHint("");
          });
        }}
      >
        <label className={label} htmlFor="new-stage">
          Tahap baru
          <input id="new-stage" className={input} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Pengambilan pesanan" required />
        </label>
        <label className={label} htmlFor="new-stage-hint">
          Yang diamati
          <input id="new-stage-hint" className={input} maxLength={300} value={hint} onChange={(e) => setHint(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={pending}>
          Tambah tahap
        </button>
      </form>
      <StatusText status={status} />
    </section>
  );
}
