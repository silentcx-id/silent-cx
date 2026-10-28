"use client";

import { useState, useTransition } from "react";
import { setAccountStatus } from "./actions";
import { toast } from "@/components/toaster";
import { dict, type Lang } from "@/lib/i18n";
import type { AccountStatus, Role } from "@/lib/roles";

type Target = "active" | "suspended";

// Tombol aksi per akun: menangguhkan (wajib alasan, dilihat pemilik akun) dan mengaktifkan kembali.
export function AccountActions({ userId, role, status, lang }: { userId: string; role: Role; status: AccountStatus; lang: Lang }) {
  const t = dict(lang).admin;
  const [asking, setAsking] = useState<Target | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Pelamar shopper (menunggu seleksi atau ditolak) diputuskan lewat lamarannya di tab Lamaran masuk.
  const options: { to: Target; label: string; primary?: boolean }[] =
    role === "shopper" && (status === "pending" || status === "rejected")
      ? []
      : status === "active"
        ? [{ to: "suspended", label: t.suspend }]
        : status === "suspended"
          ? [{ to: "active", label: t.reactivate }]
          : [];

  function run(to: Target, reason?: string) {
    setError(null);
    start(async () => {
      const res = await setAccountStatus({ userId, status: to, note: reason });
      if (res.ok) {
        setAsking(null);
        setNote("");
        toast("ok", t.saved);
      } else {
        setError(res.error);
        toast("error", res.error);
      }
    });
  }

  if (asking) {
    return (
      <form
        className="grid min-w-[220px] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(asking, note);
        }}
      >
        <label htmlFor={`note-${userId}`} className="text-xs text-muted">
          {t.reasonLabel}
        </label>
        <textarea
          id={`note-${userId}`}
          className="min-h-16 rounded-lg border border-line bg-raise p-2 text-sm"
          maxLength={500}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-sm btn-primary" disabled={pending || !note.trim()}>
            {t.confirm}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setAsking(null)}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.to}
            type="button"
            disabled={pending}
            className={`btn btn-sm ${o.primary ? "btn-primary" : ""}`}
            onClick={() => (o.to === "active" ? run(o.to) : setAsking(o.to))}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
