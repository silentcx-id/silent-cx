"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusText, useAction } from "@/components/use-action";
import { HALF_HOURS } from "@/lib/calendar";
import {
  addConsultationWindow,
  adminRescheduleConsultation,
  cancelConsultation,
  completeConsultation,
  deleteConsultationWindow,
  setConsultationLink,
} from "./actions";

const END_TIMES = [...HALF_HOURS.slice(1), "24:00"];
const dot = (hm: string) => hm.replace(":", ".");

export function AddWindowForm({ day }: { day: string }) {
  const { pending, status, act } = useAction();
  const [date, setDate] = useState(day);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => addConsultationWindow({ day: date, start, end }), "Jadwal kosong ditambahkan.");
      }}
    >
      <h3 className="font-extrabold">Buka jadwal kosong</h3>
      <label className="grid gap-1 text-sm">
        <span>Tanggal</span>
        <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span>Mulai (WIB)</span>
          <select className="field" value={start} onChange={(e) => setStart(e.target.value)}>
            {HALF_HOURS.map((h) => (
              <option key={h} value={h}>
                {dot(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Selesai (WIB)</span>
          <select className="field" value={end} onChange={(e) => setEnd(e.target.value)}>
            {END_TIMES.map((h) => (
              <option key={h} value={h}>
                {dot(h)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">Client memilih jam mulai tiap 30 menit di dalam rentang ini, sesuai durasi sesinya (30 atau 60 menit), paling cepat 24 jam dari sekarang.</p>
      <button className="btn btn-primary w-fit" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah jadwal kosong"}
      </button>
      <StatusText status={status} />
    </form>
  );
}

export function DeleteWindowButton({ id, label }: { id: string; label: string }) {
  const { pending, status, act } = useAction();
  return (
    <div className="grid gap-1">
      <button
        type="button"
        className="btn px-3 py-1 text-xs"
        disabled={pending}
        aria-label={`Hapus jadwal kosong ${label}`}
        onClick={() => {
          if (confirm(`Hapus jadwal kosong ${label}?`)) act(() => deleteConsultationWindow({ id }), "Jadwal kosong dihapus.");
        }}
      >
        Hapus
      </button>
      <StatusText status={status} />
    </div>
  );
}

export function LinkForm({ id, url }: { id: string; url: string }) {
  const { pending, status, act } = useAction();
  const [value, setValue] = useState(url);
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => setConsultationLink({ id, url: value.trim() }), "Link meeting disimpan dan client diberi tahu.");
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Link meeting (Google Meet, Zoom, dsb.)</span>
        <input className="field" type="url" placeholder="https://meet.google.com/…" value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      <button className="btn btn-primary w-fit" disabled={pending}>
        {pending ? "Menyimpan…" : url ? "Ganti link" : "Simpan link"}
      </button>
      <StatusText status={status} />
    </form>
  );
}

export function RescheduleForm({ id, day, time }: { id: string; day: string; time: string }) {
  const { pending, status, act } = useAction();
  const [date, setDate] = useState(day);
  const [hm, setHm] = useState(time);
  const [note, setNote] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => adminRescheduleConsultation({ id, day: date, time: hm, note }), "Jadwal diubah dan client diberi tahu.");
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span>Tanggal baru</span>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Jam mulai (WIB)</span>
          <select className="field" value={hm} onChange={(e) => setHm(e.target.value)}>
            {HALF_HOURS.map((h) => (
              <option key={h} value={h}>
                {dot(h)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span>Alasan (dibaca client)</span>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
      </label>
      <p className="text-xs text-muted">Admin boleh memilih jam di luar jadwal kosong, asal tidak bertumpuk dengan sesi lain. Kesempatan client menggeser jadwal tidak berkurang.</p>
      <button className="btn w-fit" disabled={pending}>
        {pending ? "Menyimpan…" : "Ubah jadwal"}
      </button>
      <StatusText status={status} />
    </form>
  );
}

export function CancelForm({ id }: { id: string }) {
  const { pending, status, act } = useAction();
  const router = useRouter();
  const [note, setNote] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm("Batalkan sesi ini? Jatahnya kembali ke client."))
          act(() => cancelConsultation({ id, note }), "Sesi dibatalkan. Jatah kembali ke client.", () => router.push("/admin/consultations?tab=jadwal"));
      }}
    >
      <label className="grid gap-1 text-sm">
        <span>Alasan pembatalan (dibaca client)</span>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
      </label>
      <p className="text-xs text-muted">Jatah kembali ke client dan berlaku minimal 7 hari lagi supaya bisa dibooking ulang.</p>
      <button className="btn w-fit border-bad/50 text-bad" disabled={pending}>
        {pending ? "Membatalkan…" : "Batalkan sesi"}
      </button>
      <StatusText status={status} />
    </form>
  );
}

export function CompleteForm({ id }: { id: string }) {
  const { pending, status, act } = useAction();
  const [summary, setSummary] = useState("");
  const [plan, setPlan] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => completeConsultation({ id, outcome: "done", summary, actionPlan: plan }), "Sesi ditandai selesai. Ringkasan terkirim ke client.");
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Ringkasan sesi *</span>
        <textarea className="field min-h-28" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={4000} required />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Action plan</span>
        <textarea className="field min-h-28" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={4000} placeholder="Satu langkah per baris" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan…" : "Tandai selesai"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            if (confirm("Tandai client tidak hadir? Jatah sesi ini tetap terpakai."))
              act(() => completeConsultation({ id, outcome: "no_show", summary: "", actionPlan: "" }), "Sesi ditandai client tidak hadir.");
          }}
        >
          Client tidak hadir
        </button>
      </div>
      <StatusText status={status} />
    </form>
  );
}
