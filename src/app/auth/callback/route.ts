import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isRole } from "@/lib/roles";
import { homeAfterLogin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Tujuan tautan email konfirmasi akun (dan nanti reset password).
// Mendukung dua bentuk tautan Supabase: ?code= (PKCE) dan ?token_hash=&type=.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");

  const supabase = await createClient();
  const verify = () =>
    code
      ? supabase.auth.exchangeCodeForSession(code)
      : tokenHash && type
        ? supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        : Promise.resolve({ error: { name: "MissingToken", message: "missing token", status: 400 } });

  // Gangguan jaringan sesaat ke Supabase dicoba ulang; tautan yang memang tidak berlaku langsung ditolak.
  let { error } = await verify();
  for (let i = 1; error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500 || error.status === 0) && i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 400 * i));
    ({ error } = await verify());
  }

  if (error) {
    console.warn(`Verifikasi tautan gagal: ${error.name} ${error.status ?? ""} ${error.message}`);
    return NextResponse.redirect(new URL("/login?status=link", url.origin));
  }

  const { data } = await supabase.auth.getUser();
  const { data: profile } = data.user ? await supabase.from("profiles").select("role").eq("id", data.user.id).single() : { data: null };
  const dest = profile && isRole(profile.role) ? homeAfterLogin(profile.role, next) : "/login";
  return NextResponse.redirect(new URL(dest, url.origin));
}
