import type { Metadata } from "next";
import Link from "next/link";
import { AccountActions } from "./account-actions";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { isRole, type AccountStatus } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Akun" };

const TABS = ["pending", "shopper", "client", "all"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<AccountStatus, string> = {
  pending: "border-warn/50 text-warn",
  active: "border-good/50 text-good",
  rejected: "border-bad/50 text-bad",
  suspended: "border-bad/50 text-bad",
};

export default async function AccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  const [, lang, params] = await Promise.all([requireRole("admin", "/admin/accounts"), getLang(), searchParams]);
  const t = dict(lang);
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "pending";
  const tabLabel: Record<Tab, string> = {
    pending: t.admin.queues.shoppers,
    shopper: t.roles.shopper,
    client: t.roles.client,
    all: t.admin.filterAll,
  };

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, status, status_note, created_at")
    .neq("role", "admin")
    .order("created_at", { ascending: false })
    .limit(200);
  if (tab === "pending") query = query.eq("role", "shopper").eq("status", "pending");
  if (tab === "shopper" || tab === "client") query = query.eq("role", tab);
  const { data: rows } = await query;
  const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.admin.accountsTitle}</h1>
        <p className="text-muted">{t.admin.accountsLede}</p>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label={t.admin.accountsTitle}>
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/admin/accounts?tab=${k}`}
            aria-current={k === tab ? "page" : undefined}
            className={`btn btn-sm ${k === tab ? "btn-primary" : ""}`}
          >
            {tabLabel[k]}
          </Link>
        ))}
      </nav>

      {!rows?.length ? (
        <p className="card p-6 text-muted">{t.admin.empty}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">{t.admin.columns.name}</th>
                <th className="px-4 py-3 font-semibold">{t.admin.columns.role}</th>
                <th className="px-4 py-3 font-semibold">{t.admin.columns.status}</th>
                <th className="px-4 py-3 font-semibold">{t.admin.columns.joined}</th>
                <th className="px-4 py-3 font-semibold">{t.admin.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                if (!isRole(r.role)) return null;
                const status = r.status as AccountStatus;
                return (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.full_name || "—"}</div>
                      <div className="text-muted">{r.email}</div>
                      {r.phone && <div className="font-mono text-xs text-muted">{r.phone}</div>}
                    </td>
                    <td className="px-4 py-3">{t.roles[r.role]}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${STATUS_TONE[status]}`}>{t.status[status]}</span>
                      {r.status_note && <p className="mt-1 max-w-[28ch] text-xs text-muted">{r.status_note}</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">{fmt.format(new Date(r.created_at))}</td>
                    <td className="px-4 py-3">
                      <AccountActions userId={r.id} role={r.role} status={status} lang={lang} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
