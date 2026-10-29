import "server-only";
import type { Metadata } from "next";
import { AccountDataForm, ChangePasswordForm } from "@/components/account-forms";
import { dict } from "./i18n";
import { getLang } from "./prefs";
import { ROLE_HOME, type Role } from "./roles";
import { requireRole } from "./session";
import { createClient } from "./supabase/server";

export const accountMetadata: Metadata = { title: "Akun saya" };

// Halaman Akun saya, sama untuk setiap role: data akun dan ganti password.
export async function accountPage(role: Role) {
  const viewer = await requireRole(role, `${ROLE_HOME[role]}/account`);
  const lang = await getLang();
  const t = dict(lang).account;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", viewer.id).single();
  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-3xl font-extrabold">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>
      <section className="card grid max-w-3xl gap-5 p-6">
        <h2 className="text-xl font-bold">{t.dataTitle}</h2>
        <AccountDataForm lang={lang} email={viewer.email} fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
      </section>
      <section className="card grid max-w-3xl gap-5 p-6">
        <div className="grid gap-1">
          <h2 className="text-xl font-bold">{t.passwordTitle}</h2>
          <p className="text-sm text-muted">{t.passwordLede}</p>
        </div>
        <ChangePasswordForm lang={lang} />
      </section>
    </>
  );
}
