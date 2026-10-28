import type { Metadata } from "next";
import Link from "next/link";
import { ShopperPayout } from "../payout-forms";
import { getPayoutGroups } from "../queue";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Payout shopper" };

// Tugas yang belum dibayar untuk satu shopper, lengkap dengan form pencatatan transfer.
export default async function ShopperPayoutPage({ params }: PageProps<"/admin/payouts/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/payouts/${id}`);
  const group = (await getPayoutGroups()).find((g) => g.id === id);

  return (
    <>
      <Link href="/admin/payouts" className="text-sm text-muted hover:text-fg">
        ← Antrian payout
      </Link>
      {group ? (
        <ShopperPayout shopperId={group.id} name={group.name} phone={group.phone} bank={group.bank} tasks={group.tasks} />
      ) : (
        <section className="card grid gap-3 p-6">
          <h1 className="text-xl font-extrabold">Tidak ada payout tertunda</h1>
          <p className="text-muted">Semua tugas shopper ini sudah dibayar. Riwayatnya ada di tab Sudah dibayar.</p>
          <Link href="/admin/payouts?tab=dibayar" className="btn w-fit">
            Lihat yang sudah dibayar
          </Link>
        </section>
      )}
    </>
  );
}
