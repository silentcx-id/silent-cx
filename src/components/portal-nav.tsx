"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";
import { dict, type Lang } from "@/lib/i18n";
import { ROLE_HOME, ROLE_MENU, type Role } from "@/lib/roles";

// Menu samping (desktop) atau baris geser (HP). Menu yang terkunci untuk shopper yang belum disetujui diberi gembok.
export function PortalNav({ role, lang, locked, entitlements = [] }: { role: Role; lang: Lang; locked: boolean; entitlements?: string[] }) {
  const pathname = usePathname();
  const t = dict(lang).common;
  const home = ROLE_HOME[role];
  return (
    <nav aria-label={t.menu} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:grid md:gap-0.5">
        {ROLE_MENU[role].map((item) => {
          const href = item.slug ? `${home}/${item.slug}` : home;
          const active = item.slug ? pathname === href || pathname.startsWith(`${href}/`) : pathname === home;
          const blocked = (locked && item.activeOnly) || (item.entitlement !== undefined && !entitlements.includes(item.entitlement));
          return (
            <li key={item.slug} className="flex-none">
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
