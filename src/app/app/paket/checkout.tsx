"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createOrder } from "../actions";
import { CityPicker } from "@/components/city-picker";
import { toast } from "@/components/toaster";
import { displayPrice, promoActive, type Addon, type City, type Package } from "@/lib/catalog-types";
import { rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";

// Pilih paket, jumlah dan kota outlet, serta add-on. Angka di sini perkiraan tampilan;
// total yang mengikat dihitung ulang database saat pesanan dibuat.
export function Checkout({ packages, addons, cities, initialKey, lang }: { packages: Package[]; addons: Addon[]; cities: City[]; initialKey?: string; lang: Lang }) {
  const t = dict(lang).orders;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(packages.some((p) => p.key === initialKey) ? initialKey! : (packages.find((p) => p.recommended) ?? packages[0]).key);
  const pkg = packages.find((p) => p.key === key)!;
  const [tier, setTier] = useState(pkg.prices[0]?.outlets ?? 1);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [cityValues, setCityValues] = useState<string[]>([]);

  const available = addons.filter((a) => a.applicable_packages.length === 0 || a.applicable_packages.includes(key));
  const selected = available.filter((a) => chosen[a.key]);
  const extraOutlets = selected.filter((a) => a.adds_outlets).reduce((n, a) => n + chosen[a.key], 0);
  const outletCount = tier + extraOutlets;
  const served = useMemo(() => new Set(cities.map((c) => c.name.trim().toLowerCase())), [cities]);
  const cityNames = useMemo(() => cities.map((c) => c.name), [cities]);
  const cityList = Array.from({ length: outletCount }, (_, i) => cityValues[i] ?? "");
  const citiesMissing = cityList.some((c) => c.trim().length < 2);
  const unserved = cityList.some((c) => c.trim().length >= 2 && !served.has(c.trim().toLowerCase()));

  const basePrice = pkg.prices.find((p) => p.outlets === tier)?.price ?? 0;
  const lines = [
    { label: `${pkg.name} (${tier} outlet)`, amount: displayPrice(basePrice, pkg), list: basePrice, quote: false },
    ...selected.map((a) => ({
      label: chosen[a.key] > 1 ? `${a.name} × ${chosen[a.key]}` : a.name,
      amount: a.pricing === "quote" ? null : displayPrice(a.price, a) * chosen[a.key],
      list: a.price * chosen[a.key],
      quote: a.pricing === "quote",
    })),
  ];
  const total = lines.reduce((n, l) => n + (l.amount ?? 0), 0);
  const needsReview = unserved || selected.some((a) => a.pricing === "quote" || a.requires_review);

  function pick(k: string) {
    const next = packages.find((p) => p.key === k)!;
    setKey(k);
    setTier(next.prices[0]?.outlets ?? 1);
    setChosen((c) => Object.fromEntries(Object.entries(c).filter(([ak]) => addons.find((a) => a.key === ak && (a.applicable_packages.length === 0 || a.applicable_packages.includes(k))))));
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        const res = await createOrder({ package: key, cities: cityList.map((c) => c.trim()), addons: selected.map((a) => ({ key: a.key, qty: chosen[a.key] })) });
        if (res.ok) router.push("/app/billing");
        else {
          setError(res.error);
          toast("error", res.error);
        }
      } catch {
        setError(dict(lang).auth.network);
        toast("error", dict(lang).auth.network);
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="grid gap-8">
        <ul className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={t.checkoutTitle}>
          {packages.map((p) => {
            const from = p.prices[0];
            const active = p.key === key;
            return (
              <li key={p.key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pick(p.key)}
                  className={`card grid h-full w-full content-start gap-3 p-5 text-left transition ${active ? "border-accent bg-accent/10" : "hover:border-muted"}`}
                >
                  {p.recommended && <span className="chip w-fit border-accent text-mark">{t.recommended}</span>}
                  <span className="font-display text-lg font-extrabold">{p.name}</span>
                  <span className="text-sm text-muted">{p.tagline}</span>
                  {from && (
                    <span className="grid">
                      {promoActive(p) && <s className="text-sm text-muted tabular-nums">{rupiah(from.price)}</s>}
                      <span className="font-display text-2xl font-extrabold tabular-nums">
                        {rupiah(displayPrice(from.price, p))}
                        {promoActive(p) && <span className="ml-2 align-middle text-xs font-semibold text-mark">−{p.promo_pct}%</span>}
                      </span>
                      <span className="text-xs text-muted">
                        {p.prices.length > 1 ? `${t.from} ` : ""}
                        {t.perOutlets(from.outlets)}
                      </span>
                    </span>
                  )}
                  <span className="text-xs text-muted">{p.indicators}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <section className="card grid gap-2 p-5">
          <h2 className="font-extrabold">{pkg.name}</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {pkg.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-mark">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {pkg.prices.length > 1 && (
          <section className="grid gap-2">
            <h2 className="font-extrabold">{t.outletCount}</h2>
            <div className="flex flex-wrap gap-2">
              {pkg.prices.map((p) => (
                <button key={p.outlets} type="button" aria-pressed={tier === p.outlets} onClick={() => setTier(p.outlets)} className={`btn btn-sm ${tier === p.outlets ? "btn-primary" : ""}`}>
                  {p.outlets} outlet · {rupiah(displayPrice(p.price, pkg))}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-3">
          <h2 className="font-extrabold">{t.addonsTitle}</h2>
          <ul className="grid gap-2">
            {available.map((a) => {
              const qty = chosen[a.key] ?? 0;
              return (
                <li key={a.key} className={`card flex flex-wrap items-center gap-3 p-4 ${qty ? "border-accent" : ""}`}>
                  <label className="flex min-w-0 flex-1 items-start gap-3" htmlFor={`addon-${a.key}`}>
                    <input
                      id={`addon-${a.key}`}
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--accent)]"
                      checked={qty > 0}
                      onChange={(e) => setChosen({ ...chosen, [a.key]: e.target.checked ? 1 : 0 })}
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-semibold">{a.name}</span>
                      <span className="text-sm text-muted">{a.description}</span>
                      <span className="text-sm tabular-nums">
                        {a.pricing === "quote" ? (
                          a.price ? t.addonQuoteFrom(rupiah(a.price)) : t.addonQuote
                        ) : (
                          <>
                            {promoActive(a) && <s className="mr-2 text-muted">{rupiah(a.price)}</s>}
                            {rupiah(displayPrice(a.price, a))} {a.unit}
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                  {qty > 0 && a.max_qty > 1 && (
                    <label className="flex items-center gap-2 text-sm" htmlFor={`qty-${a.key}`}>
                      {t.quantity}
                      <select id={`qty-${a.key}`} className="min-h-9 rounded-lg border border-line bg-raise px-2" value={qty} onChange={(e) => setChosen({ ...chosen, [a.key]: Number(e.target.value) })}>
                        {Array.from({ length: a.max_qty }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section id="kota-outlet" className="grid scroll-mt-24 gap-3">
          <div className="grid gap-1">
            <h2 className="font-extrabold">{t.citiesTitle}</h2>
            <p className="text-sm text-muted">{t.citiesHint}</p>
          </div>
          {/* Kota lain tetap bisa dipesan; pesanannya masuk antrian review admin. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {cityList.map((value, i) => (
              <CityPicker
                key={i}
                id={`city-${i}`}
                label={t.cityLabel(i + 1)}
                value={value}
                onChange={(city) => {
                  const next = [...cityList];
                  next[i] = city;
                  setCityValues(next);
                }}
                cities={cityNames}
                lang={lang}
                note={dict(lang).common.cityOtherNote}
                required
              />
            ))}
          </div>
        </section>
      </div>

      <aside className="card grid gap-4 p-5 lg:sticky lg:top-6">
        <h2 className="font-extrabold">{t.summaryTitle}</h2>
        <ul className="grid gap-2 text-sm">
          {lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span className="min-w-0">{l.label}</span>
              <span className="shrink-0 text-right tabular-nums">
                {l.quote ? (
                  <span className="text-muted">{t.pendingQuote}</span>
                ) : (
                  <>
                    {l.amount !== l.list && <s className="block text-xs text-muted">{rupiah(l.list)}</s>}
                    {rupiah(l.amount)}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-semibold">{t.total}</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(total)}</span>
        </div>
        <p className="-mt-2 text-xs text-muted">{t.totalNote}</p>
        {needsReview && <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">{t.reviewNotice}</p>}
        {error && (
          <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-primary" disabled={pending || citiesMissing} onClick={submit}>
          {pending ? t.placing : t.placeOrder}
        </button>
        {/* Alasan tombol belum aktif, di dekat tombolnya; tautan langsung ke isian kota. */}
        {citiesMissing && (
          <p className="text-sm text-muted">
            {t.citiesMissing}{" "}
            <a href="#kota-outlet" className="font-semibold text-mark underline underline-offset-4">
              {t.citiesMissingLink}
            </a>
          </p>
        )}
      </aside>
    </div>
  );
}
