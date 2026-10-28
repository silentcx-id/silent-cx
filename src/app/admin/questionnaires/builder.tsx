"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addQuestion,
  addSection,
  createQuestionnaire,
  deleteQuestion,
  deleteQuestionnaire,
  deleteSection,
  duplicateQuestionnaire,
  move,
  saveFieldSettings,
  saveQuestion,
  saveQuestionnaire,
  saveSection,
} from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { QUESTION_KINDS, type QuestionKind } from "@/lib/field";
import { rupiah } from "@/lib/format";
import { INDUSTRIES } from "@/lib/shopper-application";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";

function IndustrySelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      {INDUSTRIES.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label.id}
        </option>
      ))}
    </select>
  );
}

export function NewQuestionnaireForm() {
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
        <IndustrySelect id="new-type" value={type} onChange={setType} />
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

export function QuestionnaireHeader({ questionnaire, usedBy }: { questionnaire: Header; usedBy: number }) {
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
          <IndustrySelect id="q-type" value={f.business_type} onChange={(v) => setF({ ...f, business_type: v })} />
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

type Question = { id: string; prompt: string; help: string; kind: string; photo_required: boolean };
type Section = { id: string; title: string; weight: number; questions: Question[] };

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

function QuestionFields({ id, value, onChange }: { id: string; value: Omit<Question, "id">; onChange: (v: Omit<Question, "id">) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
      <label className="grid gap-1 text-xs font-semibold text-muted" htmlFor={`${id}-prompt`}>
        Pertanyaan
        <textarea id={`${id}-prompt`} className={`${input} text-fg`} rows={2} maxLength={500} value={value.prompt} onChange={(e) => onChange({ ...value, prompt: e.target.value })} />
      </label>
      <div className="grid content-start gap-2">
        <label className="grid gap-1 text-xs font-semibold text-muted" htmlFor={`${id}-kind`}>
          Jenis jawaban
          <select id={`${id}-kind`} className={`${input} text-fg`} value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as QuestionKind })}>
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
      </div>
      <label className="grid gap-1 text-xs font-semibold text-muted sm:col-span-2" htmlFor={`${id}-help`}>
        Petunjuk untuk shopper (opsional)
        <input id={`${id}-help`} className={`${input} text-fg`} maxLength={500} value={value.help} onChange={(e) => onChange({ ...value, help: e.target.value })} />
      </label>
    </div>
  );
}

function QuestionRow({ q, n, first, last }: { q: Question; n: number; first: boolean; last: boolean }) {
  const { pending, status, act } = useAction();
  const [v, setV] = useState({ prompt: q.prompt, help: q.help, kind: q.kind, photo_required: q.photo_required });
  const dirty = v.prompt !== q.prompt || v.help !== q.help || v.kind !== q.kind || v.photo_required !== q.photo_required;
  return (
    <li className="grid gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted">P{n}</span>
        <span className="flex flex-wrap gap-1">
          <MoveButtons kind="question" id={q.id} first={first} last={last} />
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => confirm("Hapus pertanyaan ini?") && act(() => deleteQuestion({ id: q.id }))}>
            Hapus
          </button>
        </span>
      </div>
      <QuestionFields id={q.id} value={v} onChange={setV} />
      {(dirty || status) && (
        <div className="flex flex-wrap items-center gap-3">
          {dirty && (
            <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => saveQuestion({ id: q.id, ...v }), "Tersimpan.")}>
              Simpan pertanyaan
            </button>
          )}
          <StatusText status={status} />
        </div>
      )}
    </li>
  );
}

export function SectionCard({ section, first, last }: { section: Section; first: boolean; last: boolean }) {
  const { pending, status, act } = useAction();
  const [title, setTitle] = useState(section.title);
  const [weight, setWeight] = useState(String(section.weight));
  const [draft, setDraft] = useState<Omit<Question, "id"> | null>(null);
  const dirty = title !== section.title || weight !== String(section.weight);
  return (
    <article className="card grid gap-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
        <label className={label} htmlFor={`s-${section.id}`}>
          Bagian
          <input id={`s-${section.id}`} className={`${input} font-bold`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={label} htmlFor={`w-${section.id}`}>
          Bobot
          <input id={`w-${section.id}`} className={input} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} />
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
            <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(() => saveSection({ id: section.id, title, weight }), "Tersimpan.")}>
              Simpan bagian
            </button>
          )}
          <StatusText status={status} />
        </div>
      )}
      <p className="text-xs text-muted">
        {section.weight === 0 ? "Bobot 0: bagian ini tidak dinilai." : `Bobot dibagi rata ke ${section.questions.filter((q) => q.kind !== "text").length} pertanyaan yang dinilai.`}
      </p>
      <ol className="grid gap-2">
        {section.questions.map((q, i) => (
          <QuestionRow key={q.id} q={q} n={i + 1} first={i === 0} last={i === section.questions.length - 1} />
        ))}
      </ol>
      {draft ? (
        <form
          className="grid gap-2 rounded-xl border border-dashed border-accent p-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => addQuestion({ sectionId: section.id, ...draft }), undefined, () => setDraft(null));
          }}
        >
          <QuestionFields id={`new-${section.id}`} value={draft} onChange={setDraft} />
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
        <button type="button" className="btn btn-sm w-fit" onClick={() => setDraft({ prompt: "", help: "", kind: "yes_no", photo_required: false })}>
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
