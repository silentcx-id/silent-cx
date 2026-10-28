import type { Metadata } from "next";
import { AddonForm, CityManager, NewItemForm, PackageForm, PaymentForm } from "./catalog-forms";
import { Tabs } from "@/components/tabs";
import { getCatalog, getPaymentSettings, promoActive } from "@/lib/catalog";
import { rupiah } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Katalog" };

const TABS = [
  { id: "paket", label: "Paket" },
  { id: "addon", label: "Add-on" },
  { id: "kota", label: "Kota dilayani" },
  { id: "pembayaran", label: "Pembayaran" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function CatalogPage({ searchParams }: PageProps<"/admin/catalog">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/catalog"), searchParams]);
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "paket";
  const [{ packages, addons, cities }, payment] = await Promise.all([getCatalog(), getPaymentSettings()]);
  const paymentReady = Boolean((payment.bank_name && payment.account_number) || payment.qris_url);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Katalog</h1>
        <p className="text-muted">Paket, harga, add-on, promo, kota yang dilayani, dan cara pembayaran. Perubahan langsung berlaku untuk pesanan baru; pesanan yang sudah dibuat tidak berubah.</p>
      </section>

      {(!paymentReady || cities.length === 0) && (
        <div className="grid gap-1 rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">
          {!paymentReady && <p>Rekening atau QRIS belum diisi, jadi client belum bisa membayar. Isi di tab Pembayaran.</p>}
          {cities.length === 0 && <p>Belum ada kota yang dilayani, jadi semua pesanan akan masuk antrian review. Isi di tab Kota dilayani.</p>}
        </div>
      )}

      <Tabs base="/admin/catalog" label="Bagian katalog" current={tab} items={[...TABS]} />

      {tab === "paket" && (
        <div className="grid gap-4">
          {packages.map((p) => (
            <details key={p.id} className="card group p-5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <span className="grid gap-0.5">
                  <span className="text-lg font-extrabold">{p.name}</span>
                  <span className="text-sm text-muted tabular-nums">{p.prices.map((r) => `${r.outlets} outlet ${rupiah(r.price)}`).join(" · ")}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {promoActive(p) && <span className="chip border-accent text-mark">Promo {p.promo_pct}%</span>}
                  {p.recommended && <span className="chip">Rekomendasi</span>}
                  <span className={`chip ${p.active ? "text-good" : "text-muted"}`}>{p.active ? "Aktif" : "Nonaktif"}</span>
                </span>
              </summary>
              <div className="mt-5 border-t border-line pt-5">
                <PackageForm pkg={p} />
              </div>
            </details>
          ))}
          <section className="card grid gap-3 p-5">
            <h2 className="font-extrabold">Paket baru</h2>
            <NewItemForm kind="package" />
          </section>
        </div>
      )}

      {tab === "addon" && (
        <div className="grid gap-4">
          {addons.map((a) => (
            <details key={a.id} className="card p-5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <span className="grid gap-0.5">
                  <span className="font-extrabold">{a.name}</span>
                  <span className="text-sm text-muted">
                    {a.pricing === "quote" ? `Dikonfirmasi admin${a.price ? `, mulai ${rupiah(a.price)}` : ""}` : `${rupiah(a.price)} ${a.unit}`}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {promoActive(a) && <span className="chip border-accent text-mark">Promo {a.promo_pct}%</span>}
                  <span className={`chip ${a.active ? "text-good" : "text-muted"}`}>{a.active ? "Aktif" : "Nonaktif"}</span>
                </span>
              </summary>
              <div className="mt-5 border-t border-line pt-5">
                <AddonForm addon={a} packageKeys={packages.map((p) => ({ key: p.key, name: p.name }))} />
              </div>
            </details>
          ))}
          <section className="card grid gap-3 p-5">
            <h2 className="font-extrabold">Add-on baru</h2>
            <NewItemForm kind="addon" />
          </section>
        </div>
      )}

      {tab === "kota" && (
        <section className="grid gap-3">
          <p className="max-w-[70ch] text-sm text-muted">
            Outlet di kota yang tidak ada di daftar ini tetap bisa dipesan, tapi pesanannya otomatis masuk antrian review dan client ditawari add-on Tugas luar kota.
          </p>
          <CityManager cities={cities} />
        </section>
      )}

      {tab === "pembayaran" && (
        <section className="card grid gap-3 p-5">
          <p className="text-sm text-muted">Client membayar ke rekening atau QRIS ini, lalu mengunggah bukti. Semua harga sudah termasuk PPN.</p>
          <PaymentForm settings={payment} />
        </section>
      )}
    </>
  );
}
