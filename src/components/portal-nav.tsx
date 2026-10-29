"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icon";
import { dict, type Lang } from "@/lib/i18n";
import { ROLE_HOME, ROLE_MENU, type Role } from "@/lib/roles";

// Menu samping (desktop). Di HP menu dilipat di balik tombol yang menampilkan halaman aktif, supaya semua menu
// terlihat sekali buka tanpa perlu digeser. Menu yang terkunci (shopper belum disetujui, fitur di luar paket) diberi tanda ⌀.
export function PortalNav({ role, lang, locked, entitlements = [] }: { role: Role; lang: Lang; locked: boolean; entitlements?: string[] }) {
  const pathname = usePathname();
  const t = dict(lang).common;
  const home = ROLE_HOME[role];
  const [open, setOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  // Menu HP tertutup lagi setelah pindah halaman.
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }
  const hrefOf = (slug: string) => (slug ? `${home}/${slug}` : home);
  const isActive = (slug: string) => (slug ? pathname === hrefOf(slug) || pathname.startsWith(`${hrefOf(slug)}/`) : pathname === home);
  const current = ROLE_MENU[role].find((m) => isActive(m.slug));
  return (
    <nav aria-label={t.menu}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm md:hidden"
        aria-expanded={open}
        aria-controls="portal-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-3">
          {current && <Icon name={current.icon} className="size-[18px] flex-none text-mark" />}
          <span className="font-semibold">{current?.label[lang] ?? t.menu}</span>
        </span>
        <span className="flex items-center gap-2 text-muted">
          {t.menu}
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </span>
      </button>
      <ul id="portal-menu" className={`${open ? "mt-2 grid" : "hidden"} gap-1 sm:grid-cols-2 md:mt-0 md:grid md:grid-cols-1 md:gap-0.5`}>
        {ROLE_MENU[role].map((item) => {
          const href = hrefOf(item.slug);
          const active = isActive(item.slug);
          const blocked = (locked && item.activeOnly) || (item.entitlement !== undefined && !entitlements.includes(item.entitlement));
          return (
            <li key={item.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-accent font-semibold text-accent-ink" : "text-fg hover:bg-raise"
                }`}
              >
                <Icon name={item.icon} className="size-[18px] flex-none" />
                <span className="flex-1">{item.label[lang]}</span>
                {blocked ? (
                  <span aria-hidden="true" className={active ? "" : "text-muted"}>
                    ⌀
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
