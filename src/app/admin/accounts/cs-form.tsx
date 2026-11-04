"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCsAccount } from "./actions";
import { toast } from "@/components/toaster";

// Form akun CS baru. Password sementara hanya ditampilkan sekali setelah akun dibuat.
export function CsAccountForm({ loginUrl }: { loginUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string; name: string } | null>(null);

  if (created) {
    const info = `Halo ${created.name}, akun CS SilentCX Anda sudah dibuat.\n\nMasuk: ${loginUrl}\nEmail: ${created.email}\nPassword sementara: ${created.password}\n\nSetelah masuk, ganti password di menu Akun saya.`;
    return (
      <div className="grid gap-3 rounded-xl border border-good/50 bg-good/5 p-4 text-sm">
        <p className="font-semibold text-good">✓ Akun CS {created.email} dibuat dan langsung aktif.</p>
        <p>
          Password sementara: <code className="rounded bg-raise px-2 py-1 font-mono text-base">{created.password}</code>
        </p>
        <p className="text-muted">Password ini tidak ditampilkan lagi. Salin info login dan kirim ke CS lewat jalur pribadi.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() =>
              navigator.clipboard.writeText(info).then(
                () => toast("ok", "Info login disalin."),
                () => toast("error", "Tidak bisa menyalin. Pilih teksnya lalu salin manual."),
              )
            }
          >
            Salin info login
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setCreated(null)}>
            Buat akun CS lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const name = String(form.get("fullName") ?? "");
        setError(null);
        start(async () => {
          const res = await createCsAccount({ fullName: name, email: form.get("email"), phone: form.get("phone") });
          if (res.ok) {
            setCreated({ ...res.data, name: name.trim() });
            toast("ok", "Akun CS dibuat.");
            router.refresh();
          } else {
            setError(res.error);
            toast("error", res.error);
          }
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="field">
          <label htmlFor="cs-name">Nama lengkap</label>
          <input id="cs-name" name="fullName" required maxLength={120} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="cs-email">Email</label>
          <input id="cs-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="cs-phone">Nomor HP</label>
          <input id="cs-phone" name="phone" inputMode="tel" required placeholder="0812…" autoComplete="off" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-sm btn-primary" disabled={pending}>
          {pending ? "Membuat…" : "Buat akun CS"}
        </button>
        <span className="text-xs text-muted">CS bisa melihat semua client, outlet, dan status paket, serta mencatat follow-up. CS tidak bisa mengubah pesanan atau pembayaran.</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
