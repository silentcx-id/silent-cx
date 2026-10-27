import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";
import { freshFetch } from "./fresh-fetch";

// Klien dengan service role: melewati RLS. Hanya untuk aksi server yang sudah
// memeriksa sendiri siapa penggunanya.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: freshFetch } });
}
