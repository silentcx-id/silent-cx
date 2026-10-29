import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth-form";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Lupa password" };

export default async function ForgotPasswordPage() {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  if (viewer && viewer.status !== "suspended") redirect(ROLE_HOME[viewer.role]);
  const t = dict(lang).auth;
  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold">{t.forgotTitle}</h1>
        <p className="text-muted">{t.forgotLede}</p>
      </div>
      <ForgotPasswordForm lang={lang} />
      <p className="border-t border-line pt-5 text-sm">
        <Link href="/login" className="font-semibold text-fg underline underline-offset-4">
          ← {t.backToLogin}
        </Link>
      </p>
    </>
  );
}
