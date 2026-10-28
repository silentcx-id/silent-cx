import type { Metadata } from "next";
import { dateTime, rupiah } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ContactForm, PaidPayout, ShopperPayout, type PaidRow, type QueueTask } from "./payout-forms";

export const metadata: Metadata = { title: "Keuangan" };

type QueueRow = QueueTask & {
  shopper_id: string;
  shopper_name: string;
  shopper_phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
};

// Payout shopper: paling lambat 48 jam setelah kunjungan disetujui QC (atau setelah rekening diisi).
export default async function PayoutsPage() {
  await requireRole("admin", "/admin/payouts");
  const supabase = await createClient();
  const [queueRes, contactRes, paidRes] = await Promise.all([
    supabase.rpc("admin_payout_queue"),
    supabase.from("app_settings").select("value").eq("key", "admin_contact").maybeSingle(),
    supabase
      .from("payouts")
      .select("id, code, shopper_id, total, fee_total, reimburse_total, bank_name, account_number, account_holder, paid_at, note, proof_replaced_at, profiles!payouts_shopper_id_fkey(full_name)")
      .order("paid_at", { ascending: false })
      .limit(30),
  ]);
  const rows = (queueRes.data ?? []) as QueueRow[];
  const contact = (contactRes.data?.value ?? {}) as { name?: string; whatsapp?: string };
  const paid = (paidRes.data ?? []) as unknown as (PaidRow & { profiles: { full_name: string } | null })[];

  // Dikelompokkan per shopper, urutan mengikuti tugas paling mendesak dari database.
  const groups = new Map<string, { name: string; phone: string | null; bank: { bank_name: string; account_number: string; account_holder: string } | null; tasks: QueueTask[] }>();
  for (const r of rows) {
    const g = groups.get(r.shopper_id) ?? {
      name: r.shopper_name,
      phone: r.shopper_phone,
      bank: r.bank_name && r.account_number && r.account_holder ? { bank_name: r.bank_name, account_number: r.account_number, account_holder: r.account_holder } : null,
      tasks: [],
    };
    g.tasks.push(r);
    groups.set(r.shopper_id, g);
  }
  const overdue = rows.filter((r) => r.payout_status === "overdue");
  const outstanding = rows.filter((r) => r.payout_status !== "waiting_bank").reduce((sum, r) => sum + r.total, 0);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Keuangan · payout shopper</h1>
        <p className="text-muted">
          Bayar fee dan reimburse paling lambat 48 jam setelah kunjungan disetujui QC. Untuk shopper yang belum mengisi rekening, hitungan baru mulai setelah rekening diisi. Beberapa tugas dari shopper yang
          sama boleh digabung dalam satu transfer.
        </p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-3">
        <li className={`card grid gap-2 p-5 ${overdue.length ? "border-bad/60" : ""}`}>
          <span className="text-sm text-muted">Lewat 48 jam</span>
          <span className={`font-display text-4xl font-extrabold tabular-nums ${overdue.length ? "text-bad" : ""}`}>{overdue.length}</span>
        </li>
        <li className="card grid gap-2 p-5">
          <span className="text-sm text-muted">Tugas belum dibayar</span>
          <span className="font-display text-4xl font-extrabold tabular-nums">{rows.length}</span>
        </li>
        <li className="card grid gap-2 p-5">
          <span className="text-sm text-muted">Siap ditransfer</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{rupiah(outstanding)}</span>
        </li>
      </ul>

      <section className="grid gap-3">
        <h2 className="eyebrow">Antrian payout ({rows.length})</h2>
        {groups.size === 0 ? (
          <p className="card p-6 text-muted">Semua kunjungan yang disetujui sudah dibayar.</p>
        ) : (
          <ul className="grid gap-4">
            {[...groups.entries()].map(([id, g]) => (
              <li key={id}>
                <ShopperPayout shopperId={id} name={g.name} phone={g.phone} bank={g.bank} tasks={g.tasks} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="eyebrow">Sudah dibayar</h2>
        {paid.length === 0 ? (
          <p className="card p-6 text-muted">Belum ada payout.</p>
        ) : (
          <ul className="grid gap-3">
            {paid.map((p) => (
              <li key={p.id}>
                <PaidPayout payout={p} shopperName={p.profiles?.full_name ?? "—"} paidLabel={dateTime(p.paid_at, "id")} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid max-w-2xl gap-3">
        <h2 className="eyebrow">Kontak untuk shopper</h2>
        <ContactForm name={contact.name ?? ""} whatsapp={contact.whatsapp ?? ""} />
      </section>
    </>
  );
}
