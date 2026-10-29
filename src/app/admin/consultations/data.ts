import "server-only";
import type { Consultation, ConsultationWindow } from "@/lib/consultation";
import { createClient } from "@/lib/supabase/server";

export type AdminConsultation = Consultation & { clientName: string; projectCode: string; packageName: string };

// Semua sesi dengan nama client dan kode proyek. Jumlahnya kecil (satu sampai beberapa per proyek).
export async function getAdminConsultations(filter?: { id?: string }): Promise<AdminConsultation[]> {
  const supabase = await createClient();
  let query = supabase.from("consultations").select("*, projects(code, package_snapshot)").order("starts_at", { ascending: true, nullsFirst: false });
  if (filter?.id) query = query.eq("id", filter.id);
  const { data } = await query;
  const rows = (data ?? []) as (Consultation & { projects: { code: string; package_snapshot: { name: string } } | null })[];
  const ids = [...new Set(rows.map((r) => r.client_id))];
  const [companies, profiles] = ids.length
    ? await Promise.all([
        supabase.from("companies").select("client_id, name").in("client_id", ids),
        supabase.from("profiles").select("id, full_name").in("id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const company = new Map(((companies.data ?? []) as { client_id: string; name: string }[]).map((c) => [c.client_id, c.name]));
  const person = new Map(((profiles.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  return rows.map(({ projects, ...r }) => ({
    ...r,
    clientName: company.get(r.client_id) || person.get(r.client_id) || "—",
    projectCode: projects?.code ?? "—",
    packageName: projects?.package_snapshot?.name ?? "—",
  }));
}

export async function getWindows(from: string, to: string): Promise<ConsultationWindow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("consultation_windows").select("id, starts_at, ends_at").lt("starts_at", to).gt("ends_at", from).order("starts_at");
  return (data ?? []) as ConsultationWindow[];
}

export const SOURCE_LABEL: Record<Consultation["source"], string> = { package: "Paket", addon: "Add-on pesanan", purchase: "Add-on dibeli" };
