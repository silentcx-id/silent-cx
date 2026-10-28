import type { Metadata } from "next";
import Link from "next/link";
import { waLink } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pembayaran" };

type Item = { code: string; outlet_name: string; city: string; fee: number; reimburse: number };
type Mine = {
  has_bank: boolean;
  pending: (Item & { task: string; decided_at: string; due_at: string | null; overdue: boolean })[];
  paid: {
    id: string;
    code: string;
    total: number;
    fee_total: number;
    reimburse_total: number;
    bank_name: string;
    account_number: string;
    account_holder: string;
    paid_at: string;
    note: string | null;
    proof_replaced_at: string | null;
    items: Item[];
  }[];
};

// Pembayaran fee dan reimburse milik shopper, dengan bukti transfer dan kontak admin kalau ada masalah.
export default async function PaymentsPage() {
  const [viewer, lang] = await Promise.all([requireRole("shopper", "/shopper/payments"), getLang()]);
  const t = dict(lang);
  const p = t.payments;
  if (viewer.status !== "active") {
    return (
      <section className="card grid max-w-xl gap-3 p-6">
        <h1 className="text-2xl font-extrabold">{t.shopper.lockedTitle}</h1>
        <p className="text-muted">{t.shopper.lockedBody}</p>
      </section>
    );
  }
  const supabase = await createClient();
  const [mineRes, proofsRes, contactRes] = await Promise.all([
    supabase.rpc("shopper_payouts"),
    // RLS: shopper hanya bisa membaca payout miliknya sendiri.
    supabase.from("payouts").select("id, proof_path"),
    supabase.from("app_settings").select("value").eq("key", "admin_contact").maybeSingle(),
  ]);
  const mine = (mineRes.data ?? { has_bank: false, pending: [], paid: [] }) as Mine;
  const proofs = (proofsRes.data ?? []) as { id: string; proof_path: string }[];
  const contact = (contactRes.data?.value ?? {}) as { name?: string; whatsapp?: string };
  const canContact = Boolean(contact.name && contact.whatsapp);

  const urls = new Map<string, string>();
  if (proofs.length) {
    const { data: signed } = await createAdminClient().storage.from("payout-proofs").createSignedUrls(proofs.map((x) => x.proof_path), 600);
    proofs.forEach((x, i) => signed?.[i]?.signedUrl && urls.set(x.id, signed[i].signedUrl));
  }

  const contactLink = (text: string) =>
    canContact && (
      <a className="btn btn-sm w-fit" href={waLink(contact.whatsapp!, text)} target="_blank" rel="noreferrer">
        {p.contact(contact.name!)}
      </a>
    );

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{p.title}</h1>
        <p className="text-muted">{p.lede}</p>
      </section>

      {!mine.has_bank && (
        <section className="grid max-w-2xl gap-2 rounded-xl border border-warn/50 bg-warn/10 p-5">
          <h2 className="font-extrabold">{p.noBankTitle}</h2>
          <p className="text-sm">{p.noBankBody}</p>
          <Link href="/shopper/profile" className="btn btn-primary btn-sm w-fit">
            {p.fillBank} →
          </Link>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="eyebrow">{p.pendingTitle}</h2>
        {mine.pending.length === 0 ? (
          <p className="card p-6 text-muted">{p.pendingEmpty}</p>
        ) : (
          <ul className="grid gap-3">
            {mine.pending.map((x) => (
              <li key={x.task} className="card grid gap-2 p-4">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold">{x.code}</span>
                  <span className="font-display text-xl font-extrabold tabular-nums">{rupiah(x.fee + x.reimburse)}</span>
                </span>
                <span className="font-extrabold">{x.outlet_name || x.city}</span>
                <span className="text-sm text-muted">
                  {p.fee} {rupiah(x.fee)} · {p.reimburse} {rupiah(x.reimburse)}
                </span>
                <span className={`text-sm font-semibold ${x.due_at ? "" : "text-warn"}`}>{x.due_at ? p.dueBy(dateTime(x.due_at, lang)) : p.waitingBank}</span>
                {x.overdue && contactLink(p.pendingMessage(x.code, rupiah(x.fee + x.reimburse)))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="eyebrow">{p.paidTitle}</h2>
        {mine.paid.length === 0 ? (
          <p className="card p-6 text-muted">{p.paidEmpty}</p>
        ) : (
          <ul className="grid gap-3">
            {mine.paid.map((x) => (
              <li key={x.id} className="card grid gap-3 p-4">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold">{x.code}</span>
                    {x.proof_replaced_at && <span className="chip">{p.proofReplaced}</span>}
                  </span>
                  <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(x.total)}</span>
                </span>
                <span className="text-sm text-muted">
                  {p.paidOn(dateTime(x.paid_at, lang))} · {p.toAccount(x.bank_name, x.account_number, x.account_holder)}
                </span>
                <ul className="grid gap-1 border-t border-line pt-2 text-sm">
                  {x.items.map((i) => (
                    <li key={i.code} className="flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-mono">{i.code}</span> · {i.outlet_name || i.city}
                      </span>
                      <span className="tabular-nums text-muted">
                        {p.fee} {rupiah(i.fee)} + {p.reimburse} {rupiah(i.reimburse)}
                      </span>
                    </li>
                  ))}
                </ul>
                {x.note && (
                  <span className="text-sm text-muted">
                    {p.note} {x.note}
                  </span>
                )}
                <span className="flex flex-wrap gap-2">
                  {urls.get(x.id) && (
                    <a className="btn btn-sm" href={urls.get(x.id)} target="_blank" rel="noreferrer">
                      {p.proof}
                    </a>
                  )}
                  {contactLink(p.contactMessage(x.code, rupiah(x.total)))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canContact && <p className="text-sm text-muted">{p.contactHint}</p>}
      </section>
    </>
  );
}
