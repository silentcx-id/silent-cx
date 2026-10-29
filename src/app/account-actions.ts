"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { z } from "zod";
import { check, run } from "@/lib/action";
import { isCaptchaError } from "@/lib/auth-errors";
import { dict } from "@/lib/i18n";
import { passwordProblem } from "@/lib/password";
import { getLang } from "@/lib/prefs";
import { getViewer } from "@/lib/session";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const AREAS = ["/shopper", "/app", "/admin"];

// Nama dan nomor WhatsApp di halaman Akun saya (semua role). Email tidak bisa diubah sendiri.
export async function updateAccount(raw: { fullName: string; phone: string }) {
  const viewer = await getViewer();
  const t = dict(await getLang()).auth;
  return run(
    z.object({
      fullName: z.string().trim().min(1, t.nameRequired).max(120, t.nameRequired),
      phone: z
        .string()
        .transform((v) => v.replace(/[\s-]/g, ""))
        .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, t.invalidPhone)),
    }),
    raw,
    async ({ fullName, phone }) => {
      if (!viewer) throw new Error("Silakan masuk dulu.");
      const supabase = await createClient();
      check(await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", viewer.id));
    },
    AREAS,
  );
}

// Ganti password dengan password saat ini, lalu keluarkan perangkat lain.
export async function changePassword(raw: { current: string; password: string; confirm: string; captcha?: string }) {
  const viewer = await getViewer();
  const lang = await getLang();
  const t = dict(lang);
  return run(z.object({ current: z.string(), password: z.string(), confirm: z.string(), captcha: z.string().optional() }), raw, async ({ current, password, confirm, captcha }) => {
    if (!viewer) throw new Error("Silakan masuk dulu.");
    const problem = passwordProblem(password, lang);
    if (problem) throw new Error(problem);
    if (password !== confirm) throw new Error(t.password.mismatch);
    if (password === current) throw new Error(t.password.same);

    // Password saat ini dicek dengan klien terpisah supaya sesi yang sedang dipakai tidak tertimpa.
    const probe = createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: wrong } = await probe.auth.signInWithPassword({ email: viewer.email, password: current, options: captcha ? { captchaToken: captcha } : {} });
    if (wrong) throw new Error(wrong.code === "invalid_credentials" ? t.account.wrongCurrent : isCaptchaError(wrong) ? t.auth.captcha : wrong.message);
    await probe.auth.signOut({ scope: "local" });

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.code === "same_password" ? t.password.same : error.code === "weak_password" ? t.password.mix : error.message);
    await supabase.auth.signOut({ scope: "others" });
  });
}
