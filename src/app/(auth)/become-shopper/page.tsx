import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-form";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Jadi mystery shopper" };

export default async function BecomeShopperPage() {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  const t = dict(lang);
  return (
    <>
      <div className="grid gap-2">
        <span className="eyebrow">{t.roles.shopper}</span>
        <h1 className="text-3xl font-extrabold">{t.auth.shopperTitle}</h1>
        <p className="text-muted">{t.auth.shopperLede}</p>
      </div>
      <RegisterForm lang={lang} kind="shopper" />
      <p className="text-sm text-muted">{t.auth.shopperNote}</p>
      <p className="border-t border-line pt-5 text-sm text-muted">
        {t.landing.haveAccount}{" "}
        <Link href="/login" className="font-semibold text-fg underline underline-offset-4">
          {t.common.login}
        </Link>
      </p>
    </>
  );
}
