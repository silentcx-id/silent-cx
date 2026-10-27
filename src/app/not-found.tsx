import Link from "next/link";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";

export default async function NotFound() {
  const lang = await getLang();
  return (
    <main className="grid min-h-dvh place-content-center gap-4 px-4 text-center">
      <span className="font-display text-7xl font-extrabold text-mark">404</span>
      <p className="text-muted">{lang === "en" ? "This page does not exist." : "Halaman ini tidak ada."}</p>
      <Link href="/" className="btn mx-auto">
        {dict(lang).common.back}
      </Link>
    </main>
  );
}
