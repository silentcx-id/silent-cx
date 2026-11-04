"use client";

import { useState } from "react";
import { saveInstructionTemplates } from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { INSTRUCTION_MAX, PLACEHOLDERS, PURCHASE_MAX, TEMPLATE_LIMIT, type InstructionTemplate } from "@/lib/instructions";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm font-normal";
const label = "grid gap-1 text-sm font-semibold";

// Template instruksi shopper per kuesioner. Admin memilih salah satu saat membuat tugas per outlet,
// lalu boleh menyesuaikannya untuk outlet itu. Draf bisa disusun otomatis dari isi kuesioner.
export function InstructionTemplates({ questionnaireId, initial, draft }: { questionnaireId: string; initial: InstructionTemplate[]; draft: InstructionTemplate }) {
  const { pending, status, act } = useAction();
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<InstructionTemplate>({ name: "", scenario: "", purchase: "" });

  function save(next: InstructionTemplate[], done?: () => void) {
    act(() => saveInstructionTemplates({ id: questionnaireId, templates: next }), "Template instruksi disimpan.", () => {
      setList(next);
      done?.();
    });
  }

  function open(i: number | "new", from?: InstructionTemplate) {
    setEditing(i === "new" ? -1 : i);
    setForm(from ?? (i === "new" ? { name: "", scenario: "", purchase: "" } : list[i]));
  }

  return (
    <section className="card grid gap-4 p-5" aria-labelledby="instruksi-shopper">
      <div className="grid gap-1">
        <h2 id="instruksi-shopper" className="text-lg font-extrabold">
          Template instruksi shopper
        </h2>
        <p className="text-sm text-muted">
          Dipilih admin saat membuat tugas kunjungan per outlet, lalu bisa disesuaikan untuk outlet itu. Penanda{" "}
          {PLACEHOLDERS.map((p, i) => (
            <span key={p.key}>
              <code className="rounded bg-raise px-1">{p.key}</code> ({p.label}){i < PLACEHOLDERS.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          diganti otomatis.
        </p>
      </div>

      {list.length > 0 ? (
        <ol className="grid gap-2">
          {list.map((tpl, i) => (
            <li key={tpl.name} className="grid gap-2 rounded-xl border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {i + 1}. {tpl.name}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="btn btn-sm" onClick={() => open(i)} disabled={pending}>
                    Ubah
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Hapus template "${tpl.name}"? Tugas yang sudah dibuat tidak berubah.`)) save(list.filter((_, j) => j !== i));
                    }}
                  >
                    Hapus
                  </button>
                </span>
              </div>
              <p className="line-clamp-3 whitespace-pre-line text-muted">{tpl.scenario}</p>
              {tpl.purchase && <p className="text-xs">Pembelian wajib: {tpl.purchase}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
          Belum ada template. Saat membuat tugas, admin tetap bisa memakai draf yang disusun otomatis dari isi kuesioner ini.
        </p>
      )}

      {editing !== null ? (
        <form
          className="grid gap-3 rounded-xl border border-dashed border-accent p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const next = editing === -1 ? [...list, form] : list.map((x, j) => (j === editing ? form : x));
            save(next, () => setEditing(null));
          }}
        >
          <label className={label}>
            Nama template
            <input className={input} value={form.name} maxLength={60} required onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Dine-in, Take away, Pesan antar" />
          </label>
          {/* Tombol di luar label, supaya label tetap terhubung ke kotak teks. */}
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="instruksi-isi" className="text-sm font-semibold">
                Instruksi kunjungan
              </label>
              <button type="button" className="text-xs font-semibold text-mark underline" onClick={() => setForm({ ...form, scenario: draft.scenario })}>
                Isi dari kuesioner
              </button>
            </div>
            <textarea id="instruksi-isi" className={input} rows={10} maxLength={INSTRUCTION_MAX} required value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })} />
            <span className="text-xs text-muted">
              {form.scenario.length}/{INSTRUCTION_MAX} karakter
            </span>
          </div>
          <label className={label}>
            Pembelian wajib <span className="font-normal text-muted">(opsional)</span>
            <input className={input} value={form.purchase} maxLength={PURCHASE_MAX} onChange={(e) => setForm({ ...form, purchase: e.target.value })} placeholder="Contoh: 1 minuman andalan dan 1 makanan ringan" />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" disabled={pending}>
              {editing === -1 ? "Tambah template" : "Simpan template"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
              Batal
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={list.length >= TEMPLATE_LIMIT} onClick={() => open("new")}>
            + Template baru
          </button>
          <button type="button" className="btn btn-sm" disabled={list.length >= TEMPLATE_LIMIT} onClick={() => open("new", { name: "Standar", scenario: draft.scenario, purchase: "" })}>
            Buat dari isi kuesioner
          </button>
          {list.length >= TEMPLATE_LIMIT && <span className="self-center text-xs text-muted">Maksimal {TEMPLATE_LIMIT} template.</span>}
        </div>
      )}
      <StatusText status={status} />
    </section>
  );
}
