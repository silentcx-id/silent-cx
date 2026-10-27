import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-form";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const [lang, viewer, params] = await Promise.all([getLang(), getViewer(), searchParams]);
  const next = typeof params.next === "string" ? params.next : undefined;
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  const t = dict(lang);
  return (
    <>
      <div className="grid gap-2">
        <span className="eyebrow">{t.roles.client}</span>
        <h1 className="text-3xl font-extrabold">{t.auth.registerTitle}</h1>
        <p className="text-muted">{t.auth.registerLede}</p>
      </div>
      <RegisterForm lang={lang} kind="client" next={next} />
      <p className="border-t border-line pt-5 text-sm text-muted">
        {t.landing.haveAccount}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-fg underline underline-offset-4">
          {t.common.login}
        </Link>
      </p>
    </>
  );
}
