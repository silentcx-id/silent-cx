"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusText, useAction } from "@/components/use-action";
import { wibTime } from "@/lib/calendar";
import { bookConsultation, buyConsultation, rescheduleConsultation } from "./actions";

type BookingLabels = { title: string; topicLabel: string; topicPlaceholder: string; submit: string; success: string; empty: string };

// Pilihan jam mulai di tanggal yang dipilih, lalu booking (atau simpan jadwal baru saat menggeser).
export function BookingForm({ mode, id, times, labels }: { mode: "book" | "reschedule"; id: string; times: string[]; labels: BookingLabels }) {
  const router = useRouter();
  const { pending, status, act } = useAction();
  const [picked, setPicked] = useState<string | null>(null);
  const [topic, setTopic] = useState("");

  if (times.length === 0) return <p className="text-sm text-muted">{labels.empty}</p>;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked) return;
        act(
          () => (mode === "book" ? bookConsultation({ id, startsAt: picked, topic }) : rescheduleConsultation({ id, startsAt: picked })),
          labels.success,
          () => router.push("/app/consultation"),
        );
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{labels.title}</legend>
        <div className="flex flex-wrap gap-2">
          {times.map((t) => (
            <label key={t} className={`btn cursor-pointer px-3 tabular-nums ${picked === t ? "btn-primary" : ""}`}>
              <input type="radio" name="time" value={t} className="sr-only" checked={picked === t} onChange={() => setPicked(t)} />
              {wibTime(t).replace(":", ".")}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "book" && (
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">{labels.topicLabel}</span>
          <textarea className="field min-h-24" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={1000} placeholder={labels.topicPlaceholder} />
        </label>
      )}
      <button className="btn btn-primary w-fit" disabled={pending || !picked}>
        {pending ? "…" : labels.submit}
      </button>
      <StatusText status={status} />
    </form>
  );
}

export function BuyForm({ projectId, max, labels }: { projectId: string; max: number; labels: { qty: string; submit: string; success: string } }) {
  const router = useRouter();
  const { pending, status, act } = useAction();
  const [qty, setQty] = useState(1);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => buyConsultation({ projectId, qty }), labels.success, () => router.push("/app/billing"));
      }}
    >
      <label className="grid gap-1 text-sm">
        <span>{labels.qty}</span>
        <select className="field w-24" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "…" : labels.submit}
      </button>
      <div className="w-full">
        <StatusText status={status} />
      </div>
    </form>
  );
}
