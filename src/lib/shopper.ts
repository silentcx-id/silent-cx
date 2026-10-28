import "server-only";
import { APPLICATION_COLUMNS, reapplyDate, type ShopperApplication } from "./shopper-application";
import { createClient } from "./supabase/server";

export * from "./shopper-application";

export type BankAccount = { bank_name: string; account_number: string; account_holder: string };
export type Notification = {
  id: number;
  kind: string;
  detail: { note?: string; reapply_at?: string; task?: string; code?: string; city?: string; respond_by?: string; urgent?: boolean };
  read_at: string | null;
  created_at: string;
};

// Lamaran terbaru milik shopper (draft, ditinjau, disetujui, atau ditolak), atau null kalau belum pernah mengisi.
export async function getLatestApplication(shopperId: string): Promise<ShopperApplication | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopper_applications")
    .select(APPLICATION_COLUMNS)
    .eq("shopper_id", shopperId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ShopperApplication | null) ?? null;
}

// Tahap lamaran yang dilihat shopper. "reapply" = ditolak dan sudah lewat 30 hari.
export type ApplicationStage = "none" | "draft" | "submitted" | "approved" | "rejected" | "reapply";

export function applicationStage(app: ShopperApplication | null, now = new Date()): ApplicationStage {
  if (!app) return "none";
  if (app.status === "rejected") {
    const at = reapplyDate(app.decided_at);
    return at && at <= now ? "reapply" : "rejected";
  }
  return app.status;
}

export async function getBankAccount(shopperId: string): Promise<BankAccount | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("shopper_bank_accounts").select("bank_name, account_number, account_holder").eq("shopper_id", shopperId).maybeSingle();
  return data ?? null;
}

export async function getActiveCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_cities").select("name").eq("active", true).order("name");
  return (data ?? []).map((c) => c.name);
}

export async function getNotifications(userId: string, limit = 8): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, detail, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Notification[];
}
