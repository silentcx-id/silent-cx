import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QueueTask } from "./payout-forms";

type QueueRow = QueueTask & {
  shopper_id: string;
  shopper_name: string;
  shopper_phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
};

export type ShopperGroup = {
  id: string;
  name: string;
  phone: string | null;
  bank: { bank_name: string; account_number: string; account_holder: string } | null;
  tasks: QueueTask[];
  total: number;
  late: number;
  // Batas 48 jam paling dekat dari tugas-tugas shopper ini.
  due: string | null;
};

// Antrian payout dikelompokkan per shopper, urutan mengikuti tugas paling mendesak dari database.
export async function getPayoutGroups(): Promise<ShopperGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_payout_queue");
  const groups = new Map<string, ShopperGroup>();
  for (const r of (data ?? []) as QueueRow[]) {
    const g = groups.get(r.shopper_id) ?? {
      id: r.shopper_id,
      name: r.shopper_name,
      phone: r.shopper_phone,
      bank: r.bank_name && r.account_number && r.account_holder ? { bank_name: r.bank_name, account_number: r.account_number, account_holder: r.account_holder } : null,
      tasks: [],
      total: 0,
      late: 0,
      due: null,
    };
    g.tasks.push(r);
    g.total += r.total;
    if (r.payout_status === "overdue") g.late += 1;
    if (r.due_at && (!g.due || r.due_at < g.due)) g.due = r.due_at;
    groups.set(r.shopper_id, g);
  }
  return [...groups.values()];
}
