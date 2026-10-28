import "server-only";
import { cache } from "react";
import { DEFAULT_CONTENT, normalizeContent, type SiteContent } from "./site-content";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";

// Versi terbit untuk pengunjung. Kalau belum pernah terbit (atau database belum tersambung), pakai isi bawaan.
export const getPublishedContent = cache(async (): Promise<SiteContent> => {
  if (!isSupabaseConfigured) return DEFAULT_CONTENT;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_site_content");
  return error || !data ? DEFAULT_CONTENT : normalizeContent(data);
});

export type AdminContent = { content: SiteContent; unpublished: boolean; draftUpdatedAt: string | null; publishedAt: string | null };

// Draf untuk editor dan pratinjau. Sebelum ada draf tersimpan, editor mulai dari isi bawaan.
export async function getAdminContent(): Promise<AdminContent> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_site_content");
  if (error) throw new Error(error.message);
  if (!data) return { content: DEFAULT_CONTENT, unpublished: true, draftUpdatedAt: null, publishedAt: null };
  const s = data as { draft: unknown; unpublished: boolean; draft_updated_at: string; published_at: string | null };
  return { content: normalizeContent(s.draft), unpublished: s.unpublished, draftUpdatedAt: s.draft_updated_at, publishedAt: s.published_at };
}
