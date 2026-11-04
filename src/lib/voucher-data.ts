import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { VoucherCard, VoucherRule, VoucherState } from "./vouchers";

// Kartu voucher publik; null kalau kode tidak ada.
export const getVoucherCard = cache(async (code: string): Promise<VoucherCard | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("voucher_card", { p_code: code });
  return (data as VoucherCard | null) ?? null;
});

export type AdminVoucher = {
  id: string;
  code: string;
  brand_name: string;
  brand_logo: string;
  rules: VoucherRule[];
  starts_at: string;
  ends_at: string;
  note: string;
  invoice_id: string | null;
  redeemed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  state: VoucherState;
  invoice: { code: string; status: string; total: number } | null;
  redeemer: { full_name: string; email: string } | null;
};

// Sama dengan voucher_state di database.
function stateOf(v: Omit<AdminVoucher, "state">, now = Date.now()): VoucherState {
  if (v.cancelled_at) return "cancelled";
  if (v.invoice_id) return v.invoice?.status === "paid" ? "used" : "claimed";
  if (now < new Date(v.starts_at).getTime()) return "scheduled";
  if (now >= new Date(v.ends_at).getTime()) return "expired";
  return "active";
}

export async function getAdminVouchers(): Promise<AdminVoucher[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vouchers")
    .select("*, invoice:invoices(code, status, total), redeemer:profiles!vouchers_redeemed_by_fkey(full_name, email)")
    .order("created_at", { ascending: false });
  return ((data ?? []) as Omit<AdminVoucher, "state">[]).map((v) => ({ ...v, state: stateOf(v) }));
}
