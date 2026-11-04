"use client";

import { useState } from "react";
import { setPaymentPlan } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";

const dpMinimum = (total: number) => Math.ceil(total * 0.8);

// Pilihan cara bayar invoice pesanan paket: penuh, atau DP minimal 80% (persentase atau nominal).
export function PaymentPlan({ invoiceId, total, dp, lang }: { invoiceId: string; total: number; dp: number | null; lang: Lang }) {
  const t = dict(lang).orders;
  const { pending, status, act } = useAction();
  const min = dpMinimum(total);
  const [mode, setMode] = useState<"full" | "dp">(dp ? "dp" : "full");
  const [unit, setUnit] = useState<"pct" | "amount">("pct");
  const [pct, setPct] = useState(dp ? String(Math.floor((dp / total) * 100)) : "80");
  const [amount, setAmount] = useState(String(dp ?? min));

  const value = unit === "pct" ? Math.ceil((total * (Number(pct) || 0)) / 100) : Number(amount) || 0;
  const tooLow = mode === "dp" && value < min;
  const asFull = mode === "dp" && value >= total;
  const chosen = mode === "full" || asFull ? null : value;
  const unchanged = chosen === dp;

  const card = (active: boolean) => `grid cursor-pointer gap-1 rounded-xl border p-4 text-sm transition ${active ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`;

  return (
    <form
      className="card grid gap-4 p-5"
      aria-labelledby="plan-title"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => setPaymentPlan({ invoiceId, dp: chosen }), t.planSaved);
      }}
    >
      <div className="grid gap-1">
        <h2 id="plan-title" className="text-xl font-extrabold">
          {t.planTitle}
        </h2>
        <p className="text-sm text-muted">{t.planChangeNote}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.planTitle}>
        <label className={card(mode === "full")}>
          <span className="flex items-center gap-2 font-semibold">
            <input type="radio" name="plan" className="size-4 accent-[var(--accent)]" checked={mode === "full"} onChange={() => setMode("full")} />
            {t.planFull}
          </span>
          <span className="text-muted">{t.planFullHint}</span>
          <span className="font-display text-xl font-extrabold tabular-nums">{rupiah(total)}</span>
        </label>
        <label className={card(mode === "dp")}>
          <span className="flex items-center gap-2 font-semibold">
            <input type="radio" name="plan" className="size-4 accent-[var(--accent)]" checked={mode === "dp"} onChange={() => setMode("dp")} />
            {t.planDp}
          </span>
          <span className="text-muted">{t.planDpHint}</span>
          <span className="font-display text-xl font-extrabold tabular-nums">mulai {rupiah(min)}</span>
        </label>
      </div>

      {mode === "dp" && (
        <div className="grid gap-3 rounded-xl border border-dashed border-line p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Isi DP dengan">
            {(["pct", "amount"] as const).map((u) => (
              <button key={u} type="button" className={`btn btn-sm ${unit === u ? "btn-primary" : ""}`} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                {u === "pct" ? t.dpPercent : t.dpNominal}
              </button>
            ))}
          </div>
          {unit === "pct" ? (
            <div className="field sm:max-w-48">
              <label htmlFor="dp-pct">{t.dpPercent} (%)</label>
              <input id="dp-pct" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </div>
          ) : (
            <div className="field sm:max-w-64">
              <label htmlFor="dp-amount">{t.dpNominal} (Rp)</label>
              <input id="dp-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            </div>
          )}
          <p className={`text-sm ${tooLow ? "text-bad" : ""}`} aria-live="polite" data-testid="dp-preview">
            {tooLow ? t.dpMinimum(rupiah(min)) : asFull ? t.planFullHint : t.dpSummary(rupiah(value), rupiah(total - value))}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending || tooLow || unchanged}>
          {pending ? "Menyimpan…" : t.planSave}
        </button>
        {unchanged && <span className="text-sm text-muted">Cara bayar ini sedang dipakai.</span>}
        <StatusText status={status} />
      </div>
    </form>
  );
}
