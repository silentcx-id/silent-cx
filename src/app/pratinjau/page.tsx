import type { Metadata } from "next";
import Link from "next/link";
import { Landing } from "@/components/landing";
import { getCatalog } from "@/lib/catalog";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";
import { getAdminContent } from "@/lib/site";

export const metadata: Metadata = { title: "Pratinjau konten", robots: { index: false } };

// Pratinjau draf CMS persis seperti landing page, hanya untuk admin. Pengunjung belum melihatnya.
export default async function PreviewPage() {
  await requireRole("admin", "/pratinjau");
  const [lang, { content }, catalog] = await Promise.all([getLang(), getAdminContent(), getCatalog()]);
  const packages = catalog.packages.filter((p) => p.active && p.prices.length > 0);
  const banner = (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-3 border-b border-accent bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
      Pratinjau draf. Pengunjung belum melihat perubahan ini.
      <Link href="/admin/content" className="underline underline-offset-4">
        Kembali ke editor
      </Link>
    </div>
  );
  return <Landing content={content} packages={packages} lang={lang} banner={banner} />;
}
