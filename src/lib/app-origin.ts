import "server-only";
import { headers } from "next/headers";

// Alamat untuk tautan di email. Di produksi Vercel selalu alamat resmi (NEXT_PUBLIC_APP_URL), bukan header permintaan;
// di laptop dan preview mengikuti alamat yang sedang dibuka. Supabase tetap hanya menerima alamat di Redirect URLs.
export async function appOrigin() {
  if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
