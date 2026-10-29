"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { emailSendProblem, isCaptchaError, isNetworkError } from "@/lib/auth-errors";
import { dict } from "@/lib/i18n";
import { passwordProblem } from "@/lib/password";
import { getLang } from "@/lib/prefs";
import { clearResetGrant, hasResetGrant } from "@/lib/reset-token";
import { isRole, ROLE_HOME } from "@/lib/roles";
import { getViewer, homeAfterLogin } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPublishedContent } from "@/lib/site";
import { legalVersion } from "@/lib/site-content";
import { createClient } from "@/lib/supabase/server";

// unconfirmed: email yang belum dikonfirmasi, untuk tombol kirim ulang; next: tujuan setelah konfirmasi.
export type FormState = { error?: string; notice?: string; values?: Record<string, string>; unconfirmed?: string; next?: string };

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
// Token captcha Turnstile (kosong kalau captcha belum dipasang); Supabase yang memeriksanya.
const captchaOf = (form: FormData) => text(form, "cf-turnstile-response") || undefined;
const captchaOption = (token: string | undefined) => (token ? { captchaToken: token } : {});

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const t = dict(await getLang()).auth;
  const email = text(form, "email").toLowerCase();
  const next = text(form, "next");
  const values = { email };
  if (!isSupabaseConfigured) return { error: t.notConfigured, values };
  if (!z.email().safeParse(email).success) return { error: t.invalidEmail, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: String(form.get("password") ?? ""), options: captchaOption(captchaOf(form)) });
  if (error || !data.user) {
    if (error && isNetworkError(error)) return { error: t.network, values };
    if (error && isCaptchaError(error)) return { error: t.captcha, values };
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

// Alamat untuk tautan di email. Di produksi Vercel selalu alamat resmi (NEXT_PUBLIC_APP_URL), bukan header permintaan;
// di laptop dan preview mengikuti alamat yang sedang dibuka. Supabase tetap hanya menerima alamat di Redirect URLs.
async function appOrigin() {
  if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
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
  const agreed = form.get("agree") === "on";
  const values = { full_name: fullName, email, phone, agree: agreed ? "on" : "" };

  if (!isSupabaseConfigured) return { error: t.notConfigured, values };
  if (!fullName || fullName.length > 120) return { error: t.nameRequired, values };
  if (!z.email().safeParse(email).success) return { error: t.invalidEmail, values };
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { error: t.invalidPhone, values };
  const pwProblem = passwordProblem(password, lang);
  if (pwProblem) return { error: pwProblem, values };
  if (!agreed) return { error: dict(lang).legal.agreeRequired, values };

  // Tujuan setelah daftar, misalnya paket yang dipilih di landing page.
  const home = homeAfterLogin(kind, text(form, "next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Versi Syarat & Kebijakan Privasi yang disetujui, dicatat database saat akun dibuat.
      data: { account_type: kind, full_name: fullName, phone, locale: lang, terms_version: legalVersion(await getPublishedContent()) },
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(home)}`,
      ...captchaOption(captchaOf(form)),
    },
  });

  if (error) {
    const problem = emailSendProblem(error);
    if (problem) return { error: t[problem], values };
    if (isCaptchaError(error)) return { error: t.captcha, values };
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
export async function resendConfirmation(email: string, next: string, captcha?: string): Promise<{ ok: boolean; message: string }> {
  const t = dict(await getLang()).auth;
  const clean = String(email ?? "").trim().toLowerCase();
  if (!isSupabaseConfigured) return { ok: false, message: t.notConfigured };
  if (!z.email().safeParse(clean).success) return { ok: false, message: t.invalidEmail };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: clean,
    options: { emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(String(next ?? ""))}`, ...captchaOption(captcha || undefined) },
  });
  const problem = error ? emailSendProblem(error) : null;
  if (problem) return { ok: false, message: t[problem] };
  if (error && isCaptchaError(error)) return { ok: false, message: t.captcha };
  if (error) console.warn(`Kirim ulang konfirmasi gagal: ${error.code ?? error.name} ${error.message}`);
  return { ok: true, message: t.resent(clean) };
}

// Kirim tautan reset password. Jawabannya sama untuk email terdaftar maupun tidak.
export async function requestPasswordReset(email: string, captcha?: string): Promise<{ ok: boolean; message: string }> {
  const t = dict(await getLang()).auth;
  const clean = String(email ?? "").trim().toLowerCase();
  if (!isSupabaseConfigured) return { ok: false, message: t.notConfigured };
  if (!z.email().safeParse(clean).success) return { ok: false, message: t.invalidEmail };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${await appOrigin()}/auth/callback?next=/reset-password`, ...captchaOption(captcha || undefined) });
  const problem = error ? emailSendProblem(error) : null;
  if (problem) return { ok: false, message: t[problem] };
  if (error && isCaptchaError(error)) return { ok: false, message: t.captcha };
  if (error && isNetworkError(error)) return { ok: false, message: t.network };
  if (error) console.warn(`Kirim tautan reset gagal: ${error.code ?? error.name} ${error.message}`);
  return { ok: true, message: t.resetSent(clean) };
}

// Simpan password baru dari tautan reset. Hanya berlaku untuk sesi yang datang dari tautan itu (lib/reset-token.ts).
export async function setNewPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const lang = await getLang();
  const t = dict(lang);
  const viewer = await getViewer();
  if (!viewer || !(await hasResetGrant(viewer.id))) return { error: t.auth.resetExpired };
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password, lang);
  if (problem) return { error: problem };
  if (password !== String(form.get("confirm") ?? "")) return { error: t.password.mismatch };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: t.password.same };
    if (error.code === "weak_password") return { error: t.password.mix };
    if (isNetworkError(error)) return { error: t.auth.network };
    return { error: error.message };
  }
  await clearResetGrant();
  // Siapa pun yang mungkin masih masuk dengan password lama dikeluarkan.
  await supabase.auth.signOut({ scope: "others" });
  redirect(`${ROLE_HOME[viewer.role]}?status=password`);
}

export async function logout() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
