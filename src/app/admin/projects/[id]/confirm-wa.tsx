"use client";

import { useState } from "react";
import { FollowupComposer } from "@/components/followup-panel";
import { projectConfirmMessage, type ConfirmContext, type Phone } from "@/lib/followups";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm font-normal";

type Base = Omit<ConfirmContext, "withSchedule" | "note">;

// Pesan admin dan pilihan jadwal: setiap perubahan menyusun ulang pesan WA (pesan yang sudah diubah manual ikut tertimpa).
function Controls({ base, hasSchedule, set }: { base: Base; hasSchedule: boolean; set: (text: string) => void }) {
  const [note, setNote] = useState("");
  const [withSchedule, setWithSchedule] = useState(false);
  const rebuild = (n: string, w: boolean) => set(projectConfirmMessage({ ...base, note: n, withSchedule: w }));
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-semibold">
        Pesan dari admin <span className="font-normal text-muted">(opsional, disisipkan sebelum penutup)</span>
        <textarea
          className={input}
          rows={2}
          maxLength={1000}
          value={note}
          placeholder="Contoh: Mohon cek kembali alamat outlet 2, titik di Maps belum sesuai."
          onChange={(e) => {
            setNote(e.target.value);
            rebuild(e.target.value, withSchedule);
          }}
        />
      </label>
      {hasSchedule && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withSchedule}
            onChange={(e) => {
              setWithSchedule(e.target.checked);
              rebuild(note, e.target.checked);
            }}
          />
          Sertakan jadwal kunjungan per outlet
          <span className="text-xs text-muted">(hanya rentang tanggal, tanpa data shopper)</span>
        </label>
      )}
    </div>
  );
}

export function ConfirmWa({ clientId, projectId, phones, base, hasSchedule }: { clientId: string; projectId: string; phones: Phone[]; base: Base; hasSchedule: boolean }) {
  return (
    <FollowupComposer
      clientId={clientId}
      projectId={projectId}
      phones={phones}
      purpose="project_confirm"
      buttonLabel="Konfirmasi WA"
      primary
      templates={[{ id: "confirm", label: "Konfirmasi proyek", text: projectConfirmMessage({ ...base, note: "", withSchedule: false }) }]}
      extra={(set) => <Controls base={base} hasSchedule={hasSchedule} set={set} />}
    />
  );
}
