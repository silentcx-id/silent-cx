"use client";

import { useState, useTransition } from "react";
import { decideApplication } from "./actions";
import { toast } from "@/components/toaster";
import { dict, type Lang } from "@/lib/i18n";

// Keputusan atas lamaran yang sedang ditinjau. Menolak meminta alasan, yang dilihat pelamar.
export function ApplicationDecision({ applicationId, lang }: { applicationId: string; lang: Lang }) {
  const t = dict(lang).admin;
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(approve: boolean, reason?: string) {
    setError(null);
    start(async () => {
      const res = await decideApplication({ applicationId, approve, note: reason });
      if (res.ok) {
        setAsking(false);
        toast("ok", t.applicationDecided(approve));
      } else {
        setError(res.error);
        toast("error", res.error);
      }
    });
  }

  if (asking) {
    return (
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(false, note);
        }}
      >
        <label htmlFor={`reject-${applicationId}`} className="text-xs text-muted">
          {t.reasonLabel}
        </label>
        <textarea
          id={`reject-${applicationId}`}
          className="min-h-16 rounded-lg border border-line bg-raise p-2 text-sm"
          maxLength={500}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-sm btn-primary" disabled={pending || !note.trim()}>
            {t.reject}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setAsking(false)}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className="btn btn-sm btn-primary" onClick={() => run(true)}>
          {t.approve}
        </button>
        <button type="button" disabled={pending} className="btn btn-sm" onClick={() => setAsking(true)}>
          {t.reject}
        </button>
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
