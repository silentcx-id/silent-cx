import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Penanda bahwa sesi ini datang dari tautan reset password di email, bukan sesi masuk biasa.
// Supabase memberi tanda yang sama ("otp") untuk tautan reset dan tautan masuk, jadi penandanya dibuat sendiri:
// cookie httpOnly bertanda tangan, berlaku 15 menit, terikat ke satu akun.
export const RESET_COOKIE = "pw_reset";
const TTL_SECONDS = 15 * 60;

function sign(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi.");
  return createHmac("sha256", secret).update(`${RESET_COOKIE}:${payload}`).digest("base64url");
}

export function resetCookieValue(userId: string, now = Date.now()) {
  const payload = `${userId}.${Math.floor(now / 1000) + TTL_SECONDS}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: TTL_SECONDS };
}

export function isValidResetValue(value: string | undefined, userId: string, now = Date.now()) {
  if (!value) return false;
  const [id, exp, mac] = value.split(".");
  if (!id || !exp || !mac || id !== userId || Number(exp) * 1000 < now) return false;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function hasResetGrant(userId: string) {
  return isValidResetValue((await cookies()).get(RESET_COOKIE)?.value, userId);
}

export async function clearResetGrant() {
  (await cookies()).delete(RESET_COOKIE);
}
