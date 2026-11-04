import type { Metadata } from "next";
import { VoucherEdit, VoucherForm, VoucherShare, type PackageOption } from "./voucher-forms";
import { Tabs } from "@/components/tabs";
import { appOrigin } from "@/lib/app-origin";
import { getCatalog } from "@/lib/catalog";
import { date, dateTime, rupiah } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getAdminVouchers, type AdminVoucher } from "@/lib/voucher-data";
import { groupedRules, LAUNCH_DRAFT, lastDay, VOUCHER_STATE_LABEL, wibDay, wibLastDay } from "@/lib/vouchers";

export const metadata: Metadata = { title: "Voucher" };

const TABS = [
  { id: "aktif", label: "Bisa dipakai" },
  { id: "dipakai", label: "Dipakai" },
  { id: "selesai", label: "Berakhir & batal" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const IN_TAB: Record<Tab, AdminVoucher["state"][]> = { aktif: ["active", "scheduled"], dipakai: ["claimed", "used"], selesai: ["expired", "cancelled"] };
const TONE: Record<AdminVoucher["state"], string> = {
  active: "border-good/60 text-good",
  scheduled: "text-muted",
  claimed: "border-accent text-mark",
  used: "border-accent text-mark",
  expired: "text-muted",
  cancelled: "border-bad/60 text-bad",
};

export default async function VouchersPage({ searchParams }: PageProps<"/admin/vouchers">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/vouchers"), searchParams]);
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "aktif";
  const [vouchers, { packages }, origin] = await Promise.all([getAdminVouchers(), getCatalog(), appOrigin()]);
  const options: PackageOption[] = packages
    .filter((p) => p.active)
    .map((p) => ({ key: p.key, name: p.name, minPrice: Math.min(...p.prices.map((x) => x.price)) }));
  const names = Object.fromEntries(packages.map((p) => [p.key, p.name]));
  // Voucher baru memakai aturan dan tanggal voucher terakhir; kalau belum ada, aturan Promo Launching.
  const last = vouchers[0];
  const initial = last
    ? { rules: last.rules, starts: wibDay(last.starts_at), ends: wibLastDay(last.ends_at) }
    : LAUNCH_DRAFT;
  const shown = vouchers.filter((v) => IN_TAB[tab].includes(v.state));
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Voucher</h1>
        <p className="text-muted">
          Satu voucher untuk satu brand, sekali pakai. Client memasukkan kodenya di halaman Tagihan sebelum membayar. Voucher tidak digabung dengan promo paket: client memilih salah satu.
        </p>
      </section>

      <details className="card group p-5" open={vouchers.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="text-lg font-extrabold">+ Buat voucher</span>
          <span className="text-sm text-muted group-open:hidden">Isi nama brand, logo, potongan, dan masa berlaku</span>
        </summary>
        <div className="mt-5 border-t border-line pt-5">
          <VoucherForm packages={options} initial={{ brand: "", logo: "", code: "", note: "", ...initial }} />
        </div>
      </details>

      <Tabs
        base="/admin/vouchers"
        label="Status voucher"
        current={tab}
        items={TABS.map((t) => ({ ...t, count: vouchers.filter((v) => IN_TAB[t.id].includes(v.state)).length }))}
      />

      {shown.length === 0 ? (
        <p className="card p-5 text-muted">Belum ada voucher di bagian ini.</p>
      ) : (
        <ul className="grid gap-3" data-testid="voucher-list">
          {shown.map((v) => {
            const rules = groupedRules({ rules: v.rules.map((r) => ({ ...r, name: names[r.package] ?? r.package })) });
            const offer = rules.map((r) => `${r.text} paket ${r.names}`).join(", ");
            const message = [
              `Halo ${v.brand_name}! Ini voucher khusus dari SilentCX untuk Anda:`,
              ``,
              `Kode: *${v.code}*`,
              `${offer}.`,
              `Berlaku ${date(v.starts_at, "id")} – ${date(lastDay(v.ends_at), "id")}, sekali pakai.`,
              ``,
              `Cara pakai: daftar atau masuk di ${host}, pilih paket, lalu masukkan kode di halaman Tagihan.`,
              `Detail voucher: ${origin}/voucher/${v.code}`,
            ].join("\n");
            return (
              <li key={v.id} className="card grid gap-4 p-5" data-testid="voucher-item">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element -- logo dari Supabase Storage */}
                    {v.brand_logo ? <img src={v.brand_logo} alt={`Logo ${v.brand_name}`} className="size-[88%] object-contain" /> : <span className="font-display text-xl font-extrabold text-black">{v.brand_name.charAt(0).toUpperCase()}</span>}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-extrabold">{v.brand_name}</span>
                      <span className={`chip ${TONE[v.state]}`}>{VOUCHER_STATE_LABEL[v.state]}</span>
                    </span>
                    <span className="break-all font-mono text-sm tracking-wider text-mark">{v.code}</span>
                  </span>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="grid gap-0.5">
                    <dt className="text-xs text-muted">Potongan</dt>
                    <dd>{offer}</dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-xs text-muted">Masa berlaku</dt>
                    <dd>
                      {date(v.starts_at, "id")} – {date(lastDay(v.ends_at), "id")}
                    </dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-xs text-muted">{v.invoice ? "Dipakai" : "Dibuat"}</dt>
                    <dd>
                      {v.invoice ? (
                        <>
                          {v.redeemer?.full_name ?? "Client"} · <span className="font-mono">{v.invoice.code}</span> · {rupiah(v.invoice.total)}
                          <span className="block text-xs text-muted">
                            {v.invoice.status === "paid" ? "Lunas" : "Belum lunas"} · {dateTime(v.redeemed_at, "id")}
                          </span>
                        </>
                      ) : (
                        dateTime(v.created_at, "id")
                      )}
                    </dd>
                  </div>
                </dl>
                {v.note && <p className="text-sm text-muted">Catatan: {v.note}</p>}
                {v.state !== "cancelled" && <VoucherShare code={v.code} brand={v.brand_name} message={message} />}
                {!v.invoice_id && v.state !== "cancelled" && (
                  <VoucherEdit
                    packages={options}
                    draft={{ id: v.id, brand: v.brand_name, logo: v.brand_logo, code: v.code, rules: v.rules, starts: wibDay(v.starts_at), ends: wibLastDay(v.ends_at), note: v.note }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
