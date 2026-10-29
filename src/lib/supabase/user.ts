import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionUser = { id: string; email: string };

// Pengguna yang sedang masuk, dari token sesi. Token ES256 diverifikasi lokal dengan kunci publik project
// (getClaims), jadi tidak perlu satu panggilan ke Supabase Auth di setiap halaman; token kedaluwarsa diperbarui otomatis.
// Gangguan jaringan sesaat (misalnya saat memperbarui token) dicoba ulang, supaya pengguna tidak terlempar
// ke halaman masuk hanya karena satu permintaan gagal. Sesi yang memang tidak berlaku dikembalikan sebagai null.
export async function currentUser(supabase: SupabaseClient, attempts = 4): Promise<SessionUser | null> {
  for (let i = 1; ; i++) {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims?.sub) return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
    const transient = error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500 || error.status === 0);
    if (!transient) {
      // Tidak ada sesi itu wajar (pengunjung belum masuk); selain itu dicatat agar sesi yang terputus bisa ditelusuri.
      if (error && error.name !== "AuthSessionMissingError") console.warn(`Sesi tidak berlaku: ${error.name} ${error.status ?? ""} ${error.message}`);
      return null;
    }
    if (i >= attempts) {
      console.warn(`Supabase Auth tidak terjangkau setelah ${attempts} percobaan: ${error.message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 300 * i));
  }
}
