import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-form";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { hasResetGrant } from "@/lib/reset-token";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Buat password baru" };

// Hanya terbuka lewat tautan reset di email (15 menit). Dibuka langsung tanpa tautan: diminta tautan baru.
export default async function ResetPasswordPage() {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  const t = dict(lang).auth;
  const allowed = viewer ? await hasResetGrant(viewer.id) : false;
  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold">{t.resetTitle}</h1>
        {allowed && viewer && (
          <>
            <p className="text-muted">{t.resetLede}</p>
            <p className="font-mono text-sm">{viewer.email}</p>
          </>
        )}
      </div>
      {allowed ? (
        <ResetPasswordForm lang={lang} />
      ) : (
        <div className="grid gap-4">
          <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
            {t.resetExpired}
          </p>
          <Link href="/forgot-password" className="btn btn-primary justify-self-start">
            {t.forgotTitle}
          </Link>
        </div>
      )}
    </>
  );
}
