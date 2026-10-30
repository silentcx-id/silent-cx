"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { orderReaudit } from "../../actions";
import { StatusText, useAction } from "@/components/use-action";
import { rupiah } from "@/lib/format";

// Pesan audit ulang untuk semua outlet di laporan ini. Kunjungan paling cepat 30 hari setelah laporan terbit.
export function ReauditCard({
  projectId,
  outlets,
  unitPrice,
  quote,
  review,
  earliest,
  existing,
  blocked,
}: {
  projectId: string;
  outlets: number;
  unitPrice: number;
  quote: boolean;
  review: boolean;
  earliest: string;
  existing: { code: string; status: string } | null;
  blocked: boolean;
}) {
  const router = useRouter();
  const { pending, status, act } = useAction();
  return (
    <section className="card grid gap-3 border-accent p-5" aria-labelledby="reaudit-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="reaudit-title" className="text-lg font-extrabold">
            Audit ulang
          </h2>
          <p className="text-sm text-muted">
            Ukur apakah perbaikan sudah berjalan. Outlet, tujuan audit, dan kuesioner yang sama dipakai lagi, lalu laporan berikutnya membandingkan skor dengan
            laporan ini. Kunjungan paling cepat {earliest}.
          </p>
        </div>
        {!existing && (
          <span className="text-right">
            <span className="block font-display text-2xl font-extrabold tabular-nums">{quote ? "Harga dikonfirmasi admin" : rupiah(unitPrice * outlets)}</span>
            {!quote && (
              <span className="text-xs text-muted">
                {rupiah(unitPrice)} × {outlets} outlet
              </span>
            )}
          </span>
        )}
      </div>
      {existing ? (
        <p className="text-sm">
          Audit ulang sudah dipesan ({existing.code}).{" "}
          <Link href="/app/billing" className="font-semibold underline">
            Lihat tagihan
          </Link>
        </p>
      ) : blocked ? (
        <p className="text-sm text-muted">Selesaikan pesanan yang masih berjalan di Tagihan dulu, lalu pesan audit ulang.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              confirm(
                `Pesan audit ulang untuk ${outlets} outlet?${review ? " Admin meninjau pesanan dulu sebelum tagihan bisa dibayar." : " Tagihan dibuat dengan batas bayar 48 jam."}`,
              ) &&
              act(
                () => orderReaudit({ projectId }),
                "Audit ulang dipesan.",
                () => router.push("/app/billing"),
              )
            }
          >
            Pesan audit ulang
          </button>
          <StatusText status={status} />
        </div>
      )}
    </section>
  );
}
