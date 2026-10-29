"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { emailSendProblem, isNetworkError } from "@/lib/auth-errors";
import { dict } from "@/lib/i18n";
import { passwordProblem } from "@/lib/password";
import { getLang } from "@/lib/prefs";
import { isRole } from "@/lib/roles";
import { homeAfterLogin } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// unconfirmed: email yang belum dikonfirmasi, untuk tombol kirim ulang; next: tujuan setelah konfirmasi.
export type FormState = { error?: string; notice?: string; values?: Record<string, string>; unconfirmed?: string; next?: string };

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const t = dict(await getLang()).auth;
  const email = text(form, "email").toLowerCase();
  const next = text(form, "next");
  const values = { email };
  if (!isSupabaseConfigured) return { error: t.notConfigured, values };
  if (!z.email().safeParse(email).success) return { error: t.invalidEmail, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: String(form.get("password") ?? "") });
  if (error || !data.user) {
    if (error && isNetworkError(error)) return { error: t.network, values };
    if (error?.code === "email_not_confirmed") return { error: t.emailNotConfirmed, values, unconfirmed: email, next };
    return { error: t.wrongCredentials, values };
  }

  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", data.user.id).single();
  if (!profile || !isRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: t.wrongCredentials, values };
  }
  if (profile.status === "suspended") {
    await supabase.auth.signOut();
    return { error: t.suspended, values };
  }
  redirect(homeAfterLogin(profile.role, next));
}

async function appOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// Pendaftaran publik: client (langsung aktif) atau shopper (menunggu seleksi).
// Role yang sebenarnya ditetapkan database; nilai account_type hanya permintaan.
export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const lang = await getLang();
  const t = dict(lang).auth;
  const kind = text(form, "kind") === "shopper" ? "shopper" : "client";
  const fullName = text(form, "full_name");
  const email = text(form, "email").toLowerCase();
  const phone = text(form, "phone").replace(/[\s-]/g, "");
  const password = String(form.get("password") ?? "");
  const values = { full_name: fullName, email, phone };

  if (!isSupabaseConfigured) return { error: t.notConfigured, values };
  if (!fullName || fullName.length > 120) return { error: t.nameRequired, values };
  if (!z.email().safeParse(email).success) return { error: t.invalidEmail, values };
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { error: t.invalidPhone, values };
  const pwProblem = passwordProblem(password, lang);
  if (pwProblem) return { error: pwProblem, values };

  // Tujuan setelah daftar, misalnya paket yang dipilih di landing page.
  const home = homeAfterLogin(kind, text(form, "next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { account_type: kind, full_name: fullName, phone, locale: lang },
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(home)}`,
    },
  });

  if (error) {
    const problem = emailSendProblem(error);
    if (problem) return { error: t[problem], values };
    if (error.code === "user_already_exists" || error.code === "email_exists") return { error: t.emailTaken, values };
    if (error.code === "weak_password") return { error: dict(lang).password.mix, values };
    return { error: error.message, values };
  }
  // Saat konfirmasi email aktif, Supabase tidak membocorkan email yang sudah terdaftar:
  // pengguna dikembalikan tanpa identitas.
  if (data.user && data.user.identities?.length === 0) return { error: t.emailTaken, values };
  if (data.session) redirect(home);
  return { notice: t.checkEmail, unconfirmed: email, next: home };
}

// Kirim ulang email konfirmasi pendaftaran. Hasilnya sama untuk email terdaftar maupun tidak,
// supaya halaman ini tidak bisa dipakai menebak email siapa saja yang punya akun.
export async function resendConfirmation(email: string, next: string): Promise<{ ok: boolean; message: string }> {
  const t = dict(await getLang()).auth;
  const clean = String(email ?? "").trim().toLowerCase();
  if (!isSupabaseConfigured) return { ok: false, message: t.notConfigured };
  if (!z.email().safeParse(clean).success) return { ok: false, message: t.invalidEmail };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: clean,
    options: { emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(String(next ?? ""))}` },
  });
  const problem = error ? emailSendProblem(error) : null;
  if (problem) return { ok: false, message: t[problem] };
  if (error) console.warn(`Kirim ulang konfirmasi gagal: ${error.code ?? error.name} ${error.message}`);
  return { ok: true, message: t.resent(clean) };
}

export async function logout() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
