import type { SupabaseClient, User } from "@supabase/supabase-js";

// Mengambil pengguna yang sedang masuk. Gangguan jaringan sesaat ke Supabase Auth (koneksi putus, 5xx)
// dicoba ulang, supaya pengguna tidak terlempar ke halaman masuk hanya karena satu permintaan gagal.
// Sesi yang memang tidak berlaku (token kedaluwarsa/dicabut) langsung dikembalikan sebagai null.
export async function currentUser(supabase: SupabaseClient, attempts = 4): Promise<User | null> {
  for (let i = 1; ; i++) {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return data.user;
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
