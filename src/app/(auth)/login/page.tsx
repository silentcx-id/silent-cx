import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-form";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [lang, viewer, params] = await Promise.all([getLang(), getViewer(), searchParams]);
  if (viewer && viewer.status !== "suspended") redirect(ROLE_HOME[viewer.role]);
  const t = dict(lang).auth;
  const status = typeof params.status === "string" ? params.status : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;
  const initialError = !isSupabaseConfigured
    ? t.notConfigured
    : status === "suspended"
      ? t.suspended
      : status === "link"
        ? t.linkInvalid
        : undefined;

  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold">{t.loginTitle}</h1>
        <p className="text-muted">{t.loginLede}</p>
      </div>
      <LoginForm lang={lang} next={next} initialError={initialError} />
      <div className="grid gap-2 border-t border-line pt-5 text-sm">
        <span className="text-muted">{t.noAccount}</span>
        <div className="flex flex-wrap gap-2">
          <Link href="/register" className="btn btn-sm">
            {t.registerClient}
          </Link>
          <Link href="/become-shopper" className="btn btn-sm">
            {t.registerShopper}
          </Link>
        </div>
      </div>
    </>
  );
}
