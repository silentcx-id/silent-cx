import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isRole, ROLE_HOME, type AccountStatus, type Role } from "./roles";
import { isSupabaseConfigured } from "./supabase/env";
import { createClient } from "./supabase/server";
import { currentUser } from "./supabase/user";

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  statusNote: string | null;
};

// Pengguna yang sedang masuk beserta profilnya, atau null jika belum masuk.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("full_name, email, role, status, status_note").eq("id", user.id).single();
  if (!profile || !isRole(profile.role)) return null;

  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    role: profile.role,
    status: profile.status as AccountStatus,
    statusNote: profile.status_note,
  };
});

// Halaman khusus satu role. Belum masuk → /login; role lain → beranda role-nya;
// akun ditangguhkan → keluar dan diberi tahu alasannya.
export async function requireRole(role: Role, from: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(from)}`);
  if (viewer.status === "suspended") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?status=suspended");
  }
  if (viewer.role !== role) redirect(ROLE_HOME[viewer.role]);
  return viewer;
}

// Tujuan setelah login: halaman yang tadi diminta kalau masih area role-nya, selain itu beranda role.
export function homeAfterLogin(role: Role, next: string | null | undefined): string {
  const home = ROLE_HOME[role];
  if (next && next.startsWith("/") && !next.startsWith("//") && (next === home || next.startsWith(`${home}/`))) return next;
  return home;
}
