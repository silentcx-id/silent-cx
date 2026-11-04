"use client";

import { useState } from "react";
import { logFollowup, updateFollowup } from "@/app/followup-actions";
import { StatusText, useAction } from "./use-action";
import { toast } from "./toaster";
import { CHANNEL_LABEL, CHANNELS, OUTCOME_LABEL, OUTCOMES, waUrl, type Channel, type MessageTemplate, type Outcome, type Phone } from "@/lib/followups";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";


function todayWib() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

// Hasil follow-up: dipakai setelah WhatsApp dibuka, dan untuk mengubah catatan di riwayat.
function OutcomeForm({ id, initial, onDone, submitLabel = "Simpan hasil" }: { id: string; initial?: { outcome: Outcome; note: string; next: string }; onDone: () => void; submitLabel?: string }) {
  const { pending, status, act } = useAction();
  const [outcome, setOutcome] = useState<Outcome>(initial?.outcome ?? "sent");
  const [note, setNote] = useState(initial?.note ?? "");
  const [next, setNext] = useState(initial?.next ?? "");
  const [min] = useState(todayWib);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateFollowup({ id, outcome, note, next }), "Hasil follow-up disimpan.", onDone);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className={label}>
          Hasil
          <select className={input} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Follow-up berikutnya
          <input type="date" className={input} min={min} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
      </div>
      <label className={label}>
        Catatan <span className="font-normal text-muted">(opsional)</span>
        <textarea className={input} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: minta dihubungi lagi setelah gajian, tertarik paket Insight." />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" disabled={pending}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Nanti saja
        </button>
      </div>
      <StatusText status={status} />
    </form>
  );
}

// Tombol follow-up WhatsApp: pilih template, sesuaikan pesan, buka WhatsApp, lalu catat hasilnya.
// WhatsApp dibuka langsung dari klik (sebelum menunggu server) supaya tidak diblokir browser sebagai pop-up.
export function FollowupComposer({
  clientId,
  projectId = null,
  phones,
  templates,
  purpose = "followup",
  buttonLabel = "Follow-up WA",
  primary = false,
  extra,
}: {
  clientId: string;
  projectId?: string | null;
  phones: Phone[];
  templates: MessageTemplate[];
  purpose?: "followup" | "project_confirm";
  buttonLabel?: string;
  primary?: boolean;
  extra?: (set: (text: string) => void) => React.ReactNode;
}) {
  const { pending, status, act } = useAction();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  const [message, setMessage] = useState(templates[0]?.text ?? "");
  const [phone, setPhone] = useState(phones[0]?.number ?? "");
  const [logged, setLogged] = useState<string | null>(null);
  const url = waUrl(phone, message);

  function close() {
    setOpen(false);
    setLogged(null);
  }

  if (!open)
    return (
      <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : ""}`} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );

  return (
    <div className="grid w-full gap-3 rounded-xl border border-dashed border-accent p-4">
      {logged ? (
        <>
          <p className="text-sm">
            <span className="font-semibold text-good">✓ WhatsApp dibuka dan tercatat.</span> Lengkapi hasilnya setelah client membalas, atau nanti dari riwayat follow-up.
          </p>
          <OutcomeForm id={logged} onDone={close} />
        </>
      ) : (
        <>
          {templates.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Template pesan">
              {templates.map((tp) => (
                <button
                  key={tp.id}
                  type="button"
                  aria-pressed={template === tp.id}
                  className={`chip ${template === tp.id ? "border-accent bg-accent/10 font-semibold" : ""}`}
                  onClick={() => {
                    setTemplate(tp.id);
                    setMessage(tp.text);
                  }}
                >
                  {tp.label}
                </button>
              ))}
            </div>
          )}
          {extra?.(setMessage)}
          {phones.length > 1 && (
            <label className={label}>
              Kirim ke
              <select className={input} value={phone} onChange={(e) => setPhone(e.target.value)}>
                {phones.map((p) => (
                  <option key={p.label + p.number} value={p.number}>
                    {p.label} · {p.number}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={label}>
            Pesan WhatsApp
            <textarea className={`${input} font-normal`} rows={Math.min(14, Math.max(5, message.split("\n").length + 1))} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {!url && <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">Nomor HP client belum ada. Salin pesannya dan kirim lewat kanal lain.</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={pending || !url || !message.trim()}
              onClick={() => {
                if (!url) return;
                window.open(url, "_blank", "noopener");
                act(() => logFollowup({ clientId, projectId, channel: "wa", purpose, outcome: "sent", message }), undefined, (id) => setLogged((id as string) ?? null));
              }}
            >
              Buka WhatsApp
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(message).then(
                  () => toast("ok", "Pesan disalin."),
                  () => toast("error", "Tidak bisa menyalin. Pilih teksnya lalu salin manual."),
                );
              }}
            >
              Salin pesan
            </button>
            <button type="button" className="btn btn-sm" onClick={close}>
              Batal
            </button>
          </div>
          {phone && <p className="text-xs text-muted">Dikirim ke {phone}. Setiap WhatsApp yang dibuka tercatat di riwayat follow-up client ini.</p>}
          <StatusText status={status} />
        </>
      )}
    </div>
  );
}

// Catatan manual: telepon, email, atau WhatsApp yang dikirim di luar tombol.
export function FollowupNoteForm({ clientId, projects }: { clientId: string; projects: { id: string; code: string }[] }) {
  const { pending, status, act } = useAction();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("call");
  const [outcome, setOutcome] = useState<Outcome>("replied");
  const [project, setProject] = useState("");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const [min] = useState(todayWib);
  if (!open)
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        + Catat manual
      </button>
    );
  return (
    <form
      className="grid w-full gap-3 rounded-xl border border-dashed border-accent p-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => logFollowup({ clientId, projectId: project || null, channel, outcome, note, next }), "Follow-up dicatat.", () => {
          setOpen(false);
          setNote("");
          setNext("");
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          Kanal
          <select className={input} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Hasil
          <select className={input} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Proyek <span className="font-normal text-muted">(opsional)</span>
          <select className={input} value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Tidak terkait proyek</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Follow-up berikutnya
          <input type="date" className={input} min={min} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
      </div>
      <label className={label}>
        Catatan
        <textarea className={input} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} required placeholder="Ringkasan pembicaraan" />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" disabled={pending}>
          Simpan catatan
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
      <StatusText status={status} />
    </form>
  );
}

// Mengubah hasil catatan di riwayat (pencatatnya sendiri atau admin).
export function FollowupEdit({ id, outcome, note, next }: { id: string; outcome: Outcome; note: string; next: string | null }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="text-xs font-semibold text-muted underline hover:text-fg" onClick={() => setOpen(true)}>
        Ubah hasil
      </button>
    );
  return (
    <div className="w-full rounded-xl border border-dashed border-accent p-3">
      <OutcomeForm id={id} initial={{ outcome, note, next: next ?? "" }} onDone={() => setOpen(false)} submitLabel="Simpan perubahan" />
    </div>
  );
}
