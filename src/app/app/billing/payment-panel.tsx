"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { prepareProofUpload, submitPaymentProof } from "../actions";
import { toast } from "@/components/toaster";
import type { PaymentSettings } from "@/lib/catalog-types";
import { rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { shrinkImage } from "@/lib/shrink-image";
import { createClient } from "@/lib/supabase/client";

export function CopyButton({ value, lang }: { value: string; lang: Lang }) {
  const t = dict(lang).orders;
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? t.copied : t.copy}
    </button>
  );
}

// Instruksi bayar (rekening dan QRIS) dan formulir kirim bukti.
export function PaymentPanel({ invoiceId, total, settings, lang }: { invoiceId: string; total: number; settings: PaymentSettings; lang: Lang }) {
  const t = dict(lang).orders;
  const router = useRouter();
  const hasBank = Boolean(settings.bank_name && settings.account_number);
  const hasQris = Boolean(settings.qris_url);
  const [method, setMethod] = useState<"transfer" | "qris">(hasQris ? "qris" : "transfer");
  const [amount, setAmount] = useState(String(total));
  const [payer, setPayer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!hasBank && !hasQris) return <p className="rounded-lg border border-warn/50 bg-warn/10 p-4 text-sm">{t.paymentNotReady}</p>;

  function submit() {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const upload = file.type === "application/pdf" ? file : await shrinkImage(file);
        const prep = await prepareProofUpload({ invoiceId, type: upload.type, size: upload.size });
        if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
        const { error: upErr } = await createClient().storage.from("payment-proofs").uploadToSignedUrl(prep.data.path, prep.data.token, upload, { contentType: upload.type });
        if (upErr) throw new Error(upErr.message);
        const res = await submitPaymentProof({ invoiceId, path: prep.data.path, method, amount, payer });
        if (!res.ok) throw new Error(res.error);
        toast("ok", t.proofUploaded);
        router.refresh();
      } catch (e) {
        const message = e instanceof Error && e.message !== "Failed to fetch" ? e.message : dict(lang).auth.network;
        setError(message);
        toast("error", message);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <h2 className="text-xl font-extrabold">{t.howToPay}</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent bg-accent/10 p-4">
          <span className="text-sm">{t.payExact}</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{rupiah(total)}</span>
          <CopyButton value={String(total)} lang={lang} />
        </div>
        <div className={`grid gap-4 ${hasBank && hasQris ? "md:grid-cols-2" : ""}`}>
          {hasQris && (
            <div className="card grid content-start gap-3 p-5">
              <h3 className="font-extrabold">{t.qris}</h3>
              <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- QRIS dari Storage SilentCX */}
                <img src={settings.qris_url} alt="QRIS SilentCX" className="w-full" />
              </div>
              <p className="text-sm text-muted">{t.qrisHint}</p>
            </div>
          )}
          {hasBank && (
            <div className="card grid content-start gap-2 p-5">
              <h3 className="font-extrabold">{t.bankTransfer}</h3>
              <span className="text-sm text-muted">{settings.bank_name}</span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xl font-semibold tracking-wide">{settings.account_number}</span>
                <CopyButton value={settings.account_number.replace(/\D/g, "")} lang={lang} />
              </span>
              {settings.account_holder && <span className="text-sm">{t.accountHolder(settings.account_holder)}</span>}
            </div>
          )}
        </div>
      </section>

      <form
        className="card grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-xl font-extrabold">{t.uploadTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="pay-method">{t.method}</label>
            <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as "transfer" | "qris")}>
              {hasQris && <option value="qris">{t.qris}</option>}
              {hasBank && <option value="transfer">{t.bankTransfer}</option>}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pay-amount">{t.paidAmount}</label>
            <input id="pay-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
          </div>
          <div className="field">
            <label htmlFor="pay-payer">{t.payerName}</label>
            <input id="pay-payer" value={payer} maxLength={120} onChange={(e) => setPayer(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pay-file">{t.proofFile}</label>
          <input id="pay-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-fit" disabled={pending || !file || !amount}>
          {pending ? t.submitting : t.submitProof}
        </button>
      </form>
    </div>
  );
}
