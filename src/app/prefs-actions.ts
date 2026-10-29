"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ENGLISH_ENABLED, isLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const YEAR = 60 * 60 * 24 * 365;

export async function setLanguage(lang: string) {
  if (!ENGLISH_ENABLED || !isLang(lang)) return;
  (await cookies()).set("lang", lang, { path: "/", maxAge: YEAR, sameSite: "lax" });
  // Bahasa juga disimpan di profil supaya email dan notifikasi nanti memakai bahasa yang sama.
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from("profiles").update({ locale: lang }).eq("id", data.user.id);
  }
  revalidatePath("/", "layout");
}
