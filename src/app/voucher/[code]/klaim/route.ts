import { NextResponse } from "next/server";
import { VOUCHER_COOKIE } from "@/lib/vouchers";

// Menyimpan kode voucher di browser (30 hari), lalu mengarahkan ke daftar, masuk, atau Tagihan.
// Kode otomatis terisi di halaman Tagihan setelah client memesan paket.
export async function GET(request: Request, { params }: RouteContext<"/voucher/[code]/klaim">) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
  const url = new URL(request.url);
  const to = url.searchParams.get("ke");
  const target = to === "register" ? "/register?next=/app/billing" : to === "login" ? "/login?next=/app/billing" : "/app/billing";
  const res = NextResponse.redirect(new URL(target, url.origin));
  if (clean) res.cookies.set(VOUCHER_COOKIE, clean, { maxAge: 30 * 86_400, path: "/", sameSite: "lax", httpOnly: true, secure: url.protocol === "https:" });
  return res;
}
