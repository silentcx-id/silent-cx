import Link from "next/link";
import { Logo } from "./logo";
import { PrefsSwitch } from "./prefs-switch";
import { date } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { getPublishedContent } from "@/lib/site";
import { legalBlocks } from "@/lib/legal-blocks";
import { LEGAL_PATH, pick, type LegalKey } from "@/lib/site-content";

// Halaman Kebijakan Privasi atau Syarat & Ketentuan, isinya diatur admin di Konten → Halaman hukum.
export async function LegalPage({ k }: { k: LegalKey }) {
  const [lang, content] = await Promise.all([getLang(), getPublishedContent()]);
  const t = dict(lang);
  const doc = content.legal[k];
  const other: LegalKey = k === "privacy" ? "terms" : "privacy";
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <PrefsSwitch lang={lang} />
      </header>
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 pt-6 sm:px-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-extrabold sm:text-4xl">{pick(doc.title, lang)}</h1>
          <p className="text-sm text-muted">
            {t.legal.updated} {date(doc.updated, lang)}
          </p>
        </div>
        <article className="grid gap-4 leading-relaxed">
          {legalBlocks(pick(doc.body, lang)).map((b, i) =>
            b.kind === "h2" ? (
              <h2 key={i} className="mt-4 text-xl font-bold">
                {b.text}
              </h2>
            ) : b.kind === "ul" ? (
              <ul key={i} className="grid list-disc gap-1.5 pl-6 text-muted marker:text-mark">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ) : (
              <p key={i} className="whitespace-pre-line text-muted">
                {b.text}
              </p>
            ),
          )}
        </article>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-sm">
          <Link href="/" className="text-muted underline-offset-4 hover:text-fg hover:underline">
            ← {t.common.back}
          </Link>
          <Link href={LEGAL_PATH[other]} className="text-muted underline-offset-4 hover:text-fg hover:underline">
            {pick(content.legal[other].title, lang)}
          </Link>
        </nav>
      </main>
    </div>
  );
}
