import "server-only";
import { createClient } from "./supabase/server";

export type Consultation = {
  id: string;
  code: string;
  project_id: string;
  client_id: string;
  source: "package" | "addon" | "purchase";
  minutes: number;
  status: "available" | "scheduled" | "done" | "no_show";
  expires_at: string;
  starts_at: string | null;
  ends_at: string | null;
  topic: string;
  meeting_url: string;
  reschedule_count: number;
  summary: string;
  action_plan: string;
  status_note: string | null;
  booked_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ConsultationWindow = { id: string; starts_at: string; ends_at: string };

// Status yang ditampilkan: jatah yang lewat batas berlaku dianggap kedaluwarsa.
export type ConsultationState = "available" | "expired" | "scheduled" | "done" | "no_show";

export function consultationState(c: Consultation, now = Date.now()): ConsultationState {
  if (c.status === "available" && new Date(c.expires_at).getTime() <= now) return "expired";
  return c.status;
}

// Client boleh menggeser sekali, paling lambat 24 jam sebelum sesi.
export function canReschedule(c: Consultation, now = Date.now()): boolean {
  return c.status === "scheduled" && c.reschedule_count < 1 && !!c.starts_at && new Date(c.starts_at).getTime() - now >= 24 * 3_600_000;
}

export async function getClientConsultations(clientId: string): Promise<Consultation[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("consultations").select("*").eq("client_id", clientId).order("created_at");
  return (data ?? []) as Consultation[];
}

export async function getConsultation(id: string): Promise<Consultation | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("consultations").select("*").eq("id", id).maybeSingle();
  return (data as Consultation | null) ?? null;
}

// Jam mulai yang masih kosong untuk durasi tertentu.
export async function getOpenTimes(minutes: number, from: string, to: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("consultation_open_times", { p_minutes: minutes, p_from: from, p_to: to });
  return ((data ?? []) as { starts_at: string }[]).map((r) => new Date(r.starts_at).toISOString());
}
