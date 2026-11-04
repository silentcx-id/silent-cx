import { date } from "@/lib/format";
import { groupedRules, lastDay } from "@/lib/vouchers";

export type VoucherCardData = {
  code: string;
  brand: string;
  logo: string;
  starts_at: string;
  ends_at: string;
  rules: { name: string; pct?: number | null; amount?: number | null }[];
};

// Kartu voucher (versi halaman), sama dengan gambar PNG yang dikirim ke brand.
export function VoucherCardView({ card, compact = false }: { card: VoucherCardData; compact?: boolean }) {
  const rules = groupedRules(card);
  return (
    <div className="relative grid gap-5 overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-7" data-testid="voucher-card">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-accent" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-sm font-extrabold tracking-wide text-mark">SilentCX</span>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">Voucher khusus brand</span>
      </div>
      <div className={`flex items-center gap-4 ${compact ? "" : "sm:gap-6"}`}>
        <span className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ${compact ? "size-16" : "size-20 sm:size-24"}`}>
          {card.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo brand dari Supabase Storage
            <img src={card.logo} alt={`Logo ${card.brand}`} className="size-[88%] object-contain" />
          ) : (
            <span className="font-display text-3xl font-extrabold text-black">{card.brand.trim().charAt(0).toUpperCase() || "?"}</span>
          )}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm text-muted">Khusus untuk</span>
          <span className={`break-words font-display font-extrabold leading-tight ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`}>{card.brand || "Nama brand"}</span>
        </span>
      </div>
      <ul className="grid gap-2">
        {rules.map((r) => (
          <li key={r.text} className="flex flex-wrap items-baseline gap-x-3">
            <span className={`font-display font-extrabold leading-none text-mark ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>{r.text}</span>
            <span className="text-sm">Paket {r.names}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Kode voucher</span>
        <span className="w-fit max-w-full break-all rounded-xl border-2 border-dashed border-accent bg-accent/10 px-4 py-2 font-mono text-xl font-semibold tracking-widest sm:text-2xl">{card.code}</span>
      </div>
      <p className="text-sm text-muted">
        Berlaku {date(card.starts_at, "id")} – {date(lastDay(card.ends_at), "id")} · sekali pakai
      </p>
    </div>
  );
}
