type AuthError = { name?: string; status?: number; code?: string; message?: string };

export function isNetworkError(error: AuthError) {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500;
}

// Alasan email (konfirmasi, kirim ulang) gagal dikirim, atau null kalau bukan masalah pengiriman.
export function emailSendProblem(error: AuthError): "rateLimited" | "emailNotAllowed" | "network" | null {
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429) return "rateLimited";
  // Server email bawaan Supabase hanya mengirim ke anggota tim proyek.
  if (error.code === "email_address_not_authorized") return "emailNotAllowed";
  if (isNetworkError(error)) return "network";
  return null;
}

// Token captcha (Turnstile) tidak ada, kedaluwarsa, atau ditolak Supabase.
export function isCaptchaError(error: AuthError) {
  return error.code === "captcha_failed" || /captcha/i.test(error.message ?? "");
}
