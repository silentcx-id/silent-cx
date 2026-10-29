import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm, PaidPayout, type PaidRow } from "./payout-forms";
import { getPayoutGroups } from "./queue";
import { pickTab, Tabs } from "@/components/tabs";
import { dateTime, rupiah } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Keuangan" };

const TABS = ["antrian", "dibayar", "kontak"] as const;

// Payout shopper: paling lambat 48 jam setelah kunjungan disetujui QC (atau setelah rekening diisi).
// Antrian hanya menampilkan ringkasan per shopper; transfer dicatat di halaman shopper masing-masing.
export default async function PayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/payouts"), searchParams]);
  const tab = pickTab(params.tab, TABS, "antrian");
  const supabase = await createClient();
  const [groups, contactRes, paidRes] = await Promise.all([
    getPayoutGroups(),
    supabase.from("app_settings").select("value").eq("key", "admin_contact").maybeSingle(),
    supabase
      .from("payouts")
      .select("id, code, shopper_id, total, fee_total, reimburse_total, bank_name, account_number, account_holder, paid_at, note, replace_note, proof_replaced_at, profiles!payouts_shopper_id_fkey(full_name)")
      .order("paid_at", { ascending: false })
      .limit(30),
  ]);
  const contact = (contactRes.data?.value ?? {}) as { name?: string; whatsapp?: string };
  const paid = (paidRes.data ?? []) as unknown as (PaidRow & { profiles: { full_name: string } | null })[];

  const tasks = groups.reduce((n, g) => n + g.tasks.length, 0);
  const late = groups.reduce((n, g) => n + g.late, 0);
  const outstanding = groups.filter((g) => g.bank).reduce((sum, g) => sum + g.total, 0);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Keuangan · payout shopper</h1>
        <p className="text-muted">Bayar fee dan reimburse paling lambat 48 jam setelah kunjungan disetujui QC. Untuk shopper yang belum mengisi rekening, hitungan baru mulai setelah rekening diisi.</p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-3">
        <li className={`card grid gap-2 p-5 ${late ? "border-bad/60" : ""}`}>
          <span className="text-sm text-muted">Lewat 48 jam</span>
          <span className={`font-display text-4xl font-extrabold tabular-nums ${late ? "text-bad" : ""}`}>{late}</span>
        </li>
        <li className="card grid gap-2 p-5">
          <span className="text-sm text-muted">Tugas belum dibayar</span>
          <span className="font-display text-4xl font-extrabold tabular-nums">{tasks}</span>
        </li>
        <li className="card grid gap-2 p-5">
          <span className="text-sm text-muted">Siap ditransfer</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{rupiah(outstanding)}</span>
        </li>
      </ul>

      <Tabs
        base="/admin/payouts"
        label="Bagian keuangan"
        current={tab}
        items={[
          { id: "antrian", label: "Antrian payout", count: groups.length, alert: late > 0 },
          { id: "dibayar", label: "Sudah dibayar" },
          { id: "kontak", label: "Kontak untuk shopper" },
        ]}
      />

      {tab === "antrian" &&
        (groups.length === 0 ? (
          <p className="card p-6 text-muted">Semua kunjungan yang disetujui sudah dibayar.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Shopper</th>
                  <th className="px-4 py-3 font-semibold">Rekening</th>
                  <th className="px-4 py-3 font-semibold">Tugas</th>
                  <th className="px-4 py-3 font-semibold">Batas bayar</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  // Seluruh baris bisa diklik: tautan nama shopper direntangkan menutupi baris.
                  <tr key={g.id} className={`relative border-b border-line align-top transition last:border-0 hover:bg-raise ${g.late ? "bg-bad/5" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/payouts/${g.id}`} className="font-semibold text-mark after:absolute after:inset-0 after:content-['']">
                        {g.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{g.bank ? g.bank.bank_name : <span className="font-semibold text-warn">Belum diisi</span>}</td>
                    <td className="px-4 py-3 tabular-nums">{g.tasks.length}</td>
                    <td className="px-4 py-3">
                      {g.late ? <span className="chip border-bad/50 text-bad">Lewat 48 jam</span> : g.due ? dateTime(g.due, "id") : <span className="text-muted">Menunggu rekening</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{rupiah(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "dibayar" &&
        (paid.length === 0 ? (
          <p className="card p-6 text-muted">Belum ada payout.</p>
        ) : (
          <ul className="grid gap-3">
            {paid.map((p) => (
              <li key={p.id}>
                <PaidPayout payout={p} shopperName={p.profiles?.full_name ?? "—"} paidLabel={dateTime(p.paid_at, "id")} />
              </li>
            ))}
          </ul>
        ))}

      {tab === "kontak" && <ContactForm name={contact.name ?? ""} whatsapp={contact.whatsapp ?? ""} />}
    </>
  );
}
