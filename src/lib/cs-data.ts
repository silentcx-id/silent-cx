import "server-only";
import type { ClientStage, Outcome, Channel } from "./followups";
import { createClient } from "./supabase/server";

export type ClientRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  account_status: "pending" | "active" | "rejected" | "suspended";
  created_at: string;
  company: string | null;
  industry: string | null;
  city: string | null;
  pic_name: string | null;
  pic_phone: string | null;
  stage: ClientStage;
  project_id: string | null;
  project_code: string | null;
  project_status: string | null;
  package_name: string | null;
  outlet_count: number | null;
  project_count: number;
  invoice_code: string | null;
  invoice_status: string | null;
  invoice_total: number | null;
  invoice_due_at: string | null;
  last_followup_at: string | null;
  last_followup_by: string | null;
  last_outcome: Outcome | null;
  next_followup_at: string | null;
  followups: number;
  total: number;
};

export type FollowupEntry = {
  id: string;
  created_at: string;
  channel: Channel;
  purpose: "followup" | "project_confirm";
  outcome: Outcome;
  note: string;
  message: string;
  next_at: string | null;
  staff_id: string | null;
  staff: string | null;
  staff_role: "admin" | "cs" | null;
  project_code: string | null;
};

export type ClientOutlet = { id: string; position: number; name: string; city: string; address: string; maps_url: string; notes: string; is_competitor: boolean };
export type ClientProject = {
  id: string;
  code: string;
  status: string;
  stage: ClientStage;
  package_name: string;
  outlet_count: number;
  created_at: string;
  activated_at: string | null;
  details_completed_at: string | null;
  invoices: { code: string; status: string; total: number; due_at: string | null; paid_at: string | null }[];
  outlets: ClientOutlet[];
};
export type ClientDetail = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  account_status: ClientRow["account_status"];
  created_at: string;
  company: { name: string; industry: string; address: string; city: string; instagram: string; pic_name: string; pic_position: string; pic_phone: string } | null;
  projects: ClientProject[];
  followups: FollowupEntry[];
};

export type LogRow = {
  id: string;
  created_at: string;
  client_id: string;
  client_name: string;
  company: string | null;
  project_code: string | null;
  staff: string | null;
  staff_role: "admin" | "cs" | null;
  channel: Channel;
  purpose: FollowupEntry["purpose"];
  outcome: Outcome;
  note: string;
  next_at: string | null;
  total: number;
};

export async function getClients(stage: string, q: string, page: number, perPage = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cs_list_clients", { p_stage: stage, p_q: q, p_limit: perPage, p_offset: (page - 1) * perPage });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ClientRow[];
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

export async function getClientCounts() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cs_client_counts");
  return (data ?? {}) as Record<string, number>;
}

export async function getClientDetail(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cs_client_detail", { p_client: id });
  if (error) throw new Error(error.message);
  return (data ?? null) as ClientDetail | null;
}

export async function getFollowupLog(staff: string | null, page: number, perPage = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cs_followup_log", { p_staff: staff, p_limit: perPage, p_offset: (page - 1) * perPage });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LogRow[];
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

export async function getStaff() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cs_staff");
  return (data ?? []) as { id: string; full_name: string; role: "admin" | "cs" }[];
}
