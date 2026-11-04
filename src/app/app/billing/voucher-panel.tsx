"use client";

import { useState } from "react";
import { applyVoucher, quoteVoucher, removeVoucher, type VoucherQuote } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 font-mono text-sm uppercase tracking-wider";

// Kolom kode voucher (opsional) di tagihan pesanan paket. Kode dicek dulu supaya client melihat perbandingan
// dengan promo paket yang sedang terpasang, lalu memilih.
export function VoucherPanel({ invoiceId, applied, savedCode, lang }: { invoiceId: string; applied: { code: string; brand: string; discount: number } | null; savedCode: string; lang: Lang }) {
  const t = dict(lang).orders;
  const { pending, status, setStatus, act } = useAction();
  const [code, setCode] = useState(applied ? "" : savedCode);
  const [quote, setQuote] = useState<VoucherQuote | null>(null);

  if (applied) {
    return (
      <section className="card grid gap-3 border-accent p-5" aria-labelledby="voucher-title" data-testid="voucher-applied">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 id="voucher-title" className="text-lg font-extrabold">
              {t.voucherActive(applied.code, applied.brand)}
            </h2>
            <p className="text-sm text-good">{t.voucherSaving(rupiah(applied.discount))}</p>
          </div>
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => removeVoucher({ invoiceId }), t.voucherRemoved)}>
            {t.voucherRemove}
          </button>
        </div>
        <p className="text-xs text-muted">{t.voucherRemoveNote}</p>
        <StatusText status={status} />
      </section>
    );
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    setQuote(null);
    act(() => quoteVoucher({ invoiceId, code }), undefined, (q) => q && setQuote(q));
  }

  const apply = () => act(() => applyVoucher({ invoiceId, code: quote!.code }), t.voucherApplied(quote!.code), () => setQuote(null));
  const diff = quote ? quote.current_total - quote.voucher_total : 0;

  return (
    <section className="card grid gap-4 p-5" aria-labelledby="voucher-title" data-testid="voucher-panel">
      <div className="grid gap-1">
        <h2 id="voucher-title" className="text-lg font-extrabold">
          {t.voucherTitle}
        </h2>
        <p className="text-sm text-muted">{t.voucherHint}</p>
      </div>
      {savedCode && code === savedCode && !quote && <p className="rounded-lg border border-accent/60 bg-accent/10 p-3 text-sm">{t.voucherSaved(savedCode)}</p>}
      <form onSubmit={check} className="flex flex-wrap gap-2">
        <label htmlFor="voucher-code" className="sr-only">
          {t.voucherCode}
        </label>
        <input
          id="voucher-code"
          className={`${input} max-w-xs flex-1`}
          value={code}
          maxLength={30}
          autoComplete="off"
          placeholder="KOPISENJA-7K2Q"
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setQuote(null);
            setStatus(null);
          }}
        />
        <button className="btn" disabled={pending || !code.trim()}>
          {pending && !quote ? "Memeriksa…" : t.voucherCheck}
        </button>
      </form>
      <StatusText status={status} />

      {quote && (
        <div className="grid gap-4 rounded-xl border border-accent/60 bg-accent/5 p-4" role="status" data-testid="voucher-quote">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo brand dari Supabase Storage */}
              {quote.logo ? <img src={quote.logo} alt="" className="size-[88%] object-contain" /> : <span className="font-display text-lg font-extrabold text-black">{quote.brand.charAt(0)}</span>}
            </span>
            <span className="grid min-w-0">
              <span className="font-semibold">{quote.brand}</span>
              <span className="text-sm text-good">
                {t.voucherSaving(rupiah(quote.discount))} {quote.package} {rupiah(quote.list_price)} → {rupiah(quote.list_price - quote.discount)}
              </span>
            </span>
          </div>

          {quote.promo > 0 ? (
            <>
              <p className="text-sm">{t.voucherPromoClash(quote.promo_label ?? "promo paket", rupiah(quote.promo))}</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div className={`grid gap-0.5 rounded-lg border p-3 ${diff < 0 ? "border-good/60" : "border-line"}`}>
                  <dt className="text-xs text-muted">{t.voucherWithPromo}</dt>
                  <dd className="text-lg font-extrabold tabular-nums">{rupiah(quote.current_total)}</dd>
                </div>
                <div className={`grid gap-0.5 rounded-lg border p-3 ${diff > 0 ? "border-good/60" : "border-line"}`}>
                  <dt className="text-xs text-muted">{t.voucherWithVoucher}</dt>
                  <dd className="text-lg font-extrabold tabular-nums">{rupiah(quote.voucher_total)}</dd>
                </div>
              </dl>
              {diff !== 0 && <p className={`text-sm font-semibold ${diff > 0 ? "text-good" : "text-warn"}`}>{diff > 0 ? t.voucherBetter(rupiah(diff)) : t.voucherPromoBetter(rupiah(-diff))}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={diff >= 0 ? "btn btn-primary" : "btn"} disabled={pending} onClick={apply}>
                  {t.voucherSwap}
                </button>
                <button type="button" className={diff < 0 ? "btn btn-primary" : "btn"} disabled={pending} onClick={() => setQuote(null)}>
                  {t.voucherKeepPromo}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">{t.voucherNewTotal(rupiah(quote.voucher_total), rupiah(quote.current_total))}</p>
              <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={apply}>
                {pending ? "Memasang…" : t.voucherApply}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
