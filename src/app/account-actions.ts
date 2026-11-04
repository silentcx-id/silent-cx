"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { z } from "zod";
import { check, run } from "@/lib/action";
import { appOrigin } from "@/lib/app-origin";
import { emailSendProblem, isCaptchaError } from "@/lib/auth-errors";
import { dict } from "@/lib/i18n";
import { passwordProblem } from "@/lib/password";
import { DAYS, TIMES } from "@/lib/profile-changes";
import { getLang } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { GENDER_VALUES, VEHICLE_VALUES } from "@/lib/shopper-application";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const AREAS = ["/shopper", "/app", "/admin"];

// Nama dan nomor WhatsApp di halaman Akun saya (semua role). Setiap bagian disimpan sendiri, jadi isian boleh salah satu.
export async function updateAccount(raw: { fullName?: string; phone?: string }) {
  const viewer = await getViewer();
  const t = dict(await getLang()).auth;
  return run(
    z.object({
      fullName: z.string().trim().min(1, t.nameRequired).max(120, t.nameRequired).optional(),
      phone: z
        .string()
        .transform((v) => v.replace(/[\s-]/g, ""))
        .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, t.invalidPhone))
        .optional(),
    }),
    raw,
    async ({ fullName, phone }) => {
      if (!viewer) throw new Error("Silakan masuk dulu.");
      const fields = { ...(fullName !== undefined && { full_name: fullName }), ...(phone !== undefined && { phone }) };
      if (!Object.keys(fields).length) return;
      const supabase = await createClient();
      check(await supabase.from("profiles").update(fields).eq("id", viewer.id));
    },
    AREAS,
  );
}

// Ganti email: Supabase mengirim tautan konfirmasi ke email baru. Email lama tetap dipakai untuk masuk sampai tautannya
// diklik; setelah itu email lama menerima pemberitahuan (migrasi 20261104000022).
export async function changeEmail(raw: { email: string }) {
  const viewer = await getViewer();
  const lang = await getLang();
  const t = dict(lang);
  return run(z.object({ email: z.string().trim().toLowerCase().pipe(z.email(t.auth.invalidEmail)) }), raw, async ({ email }) => {
    if (!viewer) throw new Error("Silakan masuk dulu.");
    if (email === viewer.email.toLowerCase()) throw new Error(t.account.sameEmail);
    const home = ROLE_HOME[viewer.role];
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(`${home}/account?status=email`)}` });
    if (error) {
      if (error.code === "email_exists" || /already been registered/i.test(error.message)) throw new Error(t.account.emailTaken);
      const problem = emailSendProblem(error);
      throw new Error(problem === "network" ? t.auth.network : problem ? t.auth[problem] : error.message);
    }
    return email;
  });
}

const list = (max: number) => z.array(z.string().trim().min(1).max(80)).max(max);

// Data profil shopper aktif. Hanya bagian yang dikirim yang diubah; aturan isian diperiksa database.
export async function updateShopperProfile(raw: unknown) {
  const viewer = await getViewer();
  const t = dict(await getLang()).auth;
  return run(
    z.object({
      fullName: z.string().trim().min(1, t.nameRequired).max(120, t.nameRequired).optional(),
      gender: z.enum(GENDER_VALUES).optional(),
      birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal lahir.").optional(),
      occupation: z.string().trim().max(80).optional(),
      vehicle: z.enum(VEHICLE_VALUES).optional(),
      domicile: z.string().trim().max(80).optional(),
      reachable_cities: list(20).optional(),
      industries: list(20).optional(),
      available_days: z.array(z.enum(DAYS.map((d) => d.value) as [string, ...string[]])).optional(),
      available_times: z.array(z.enum(TIMES.map((d) => d.value) as [string, ...string[]])).optional(),
    }),
    raw,
    async ({ fullName, ...data }) => {
      if (!viewer || viewer.role !== "shopper") throw new Error("Silakan masuk sebagai shopper.");
      const supabase = await createClient();
      if (fullName !== undefined) check(await supabase.from("profiles").update({ full_name: fullName }).eq("id", viewer.id));
      if (Object.keys(data).length) check(await supabase.rpc("shopper_update_profile", { p_data: data }));
    },
    AREAS,
  );
}

// Data perusahaan client (juga dipakai di formulir data outlet).
export async function updateCompany(raw: unknown) {
  const viewer = await getViewer();
  return run(
    z.object({
      name: z.string().trim().min(2, "Isi nama usaha.").max(120),
      industry: z.string().trim().max(80),
      city: z.string().trim().max(80),
      address: z.string().trim().max(300),
    }),
    raw,
    async (c) => {
      if (!viewer || viewer.role !== "client") throw new Error("Silakan masuk sebagai client.");
      const supabase = await createClient();
      // Bukan upsert: kolom client_id memang tidak boleh di-update dari browser.
      const existing = check(await supabase.from("companies").select("client_id").eq("client_id", viewer.id).maybeSingle());
      if (existing) check(await supabase.from("companies").update(c).eq("client_id", viewer.id));
      else check(await supabase.from("companies").insert({ client_id: viewer.id, ...c }));
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
