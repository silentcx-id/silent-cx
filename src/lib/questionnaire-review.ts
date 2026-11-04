import "server-only";
import { createClient } from "./supabase/server";

// Kuesioner proyek yang dikirim ke client untuk ditinjau (client_questionnaire_review, migrasi 20261104000022).
export type ClientReviewStatus = "pending" | "approved" | "changes_requested" | "auto_approved" | "final";
export type ReviewFlag = { question: string; section: string; prompt: string; note: string };
export type ClientReview = {
  project: string;
  code: string;
  status: ClientReviewStatus;
  version: number;
  sent_at: string;
  due_at: string | null;
  decided_at: string | null;
  revisions_used: number;
  revisions_left: number;
  flags: ReviewFlag[];
  additions: string;
  previous: { version: number; flags: ReviewFlag[]; additions: string } | null;
  sections: { title: string; questions: { id: string; prompt: string; help: string; photo: boolean }[] }[];
};

export async function getClientReview(projectId: string): Promise<ClientReview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_questionnaire_review", { p_project: projectId });
  if (error) return null;
  return (data ?? null) as ClientReview | null;
}
