import type { Metadata } from "next";
import Link from "next/link";
import { AccountActions } from "./account-actions";
import { ApplicationDecision } from "./application-decision";
import { ApplicationSummary } from "@/components/application-summary";
import { dateTime } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { isRole, type AccountStatus } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { APPLICATION_COLUMNS, type ShopperApplication } from "@/lib/shopper-application";
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

type Person = { full_name: string; email: string; phone: string | null };
type QueuedApplication = ShopperApplication & { shopper_id: string; profile: Person | null };

export default async function AccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  const [, lang, params] = await Promise.all([requireRole("admin", "/admin/accounts"), getLang(), searchParams]);
  const t = dict(lang);
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "pending";
  const tabLabel: Record<Tab, string> = {
    pending: t.admin.applicationsTab,
    shopper: t.roles.shopper,
    client: t.roles.client,
    all: t.admin.filterAll,
  };

  const supabase = await createClient();
  const { data: cityRows } = await supabase.from("service_cities").select("name").order("name");
  const cities = (cityRows ?? []).map((c) => c.name as string);
  const city = typeof params.kota === "string" && cities.includes(params.kota) ? params.kota : "";
  const withCity = tab === "pending" || tab === "shopper";

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.admin.accountsTitle}</h1>
        <p className="text-muted">{t.admin.accountsLede}</p>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label={t.admin.accountsTitle}>
          {TABS.map((k) => (
            <Link key={k} href={`/admin/accounts?tab=${k}`} aria-current={k === tab ? "page" : undefined} className={`btn btn-sm ${k === tab ? "btn-primary" : ""}`}>
              {tabLabel[k]}
            </Link>
          ))}
        </nav>
        {withCity && cities.length > 0 && (
          // Form GET biasa: memilih kota memuat ulang halaman dengan ?kota=.
          <form className="field min-w-48" action="/admin/accounts">
            <input type="hidden" name="tab" value={tab} />
            <label htmlFor="kota">{t.admin.city}</label>
            <div className="flex gap-2">
              <select id="kota" name="kota" defaultValue={city} className="flex-1">
                <option value="">{t.admin.allCities}</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm">OK</button>
            </div>
          </form>
        )}
      </div>

      {tab === "pending" ? <ApplicationsQueue city={city} lang={lang} /> : <AccountsTable tab={tab} city={city} lang={lang} />}
    </>
  );
}

// Lamaran yang menunggu keputusan, lengkap dengan isinya, lalu pelamar yang belum mengirim lamaran.
async function ApplicationsQueue({ city, lang }: { city: string; lang: Lang }) {
  const t = dict(lang);
  const supabase = await createClient();
  let query = supabase
    .from("shopper_applications")
    .select(`${APPLICATION_COLUMNS}, shopper_id, profile:profiles!shopper_applications_shopper_id_fkey(full_name, email, phone)`)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (city) query = query.contains("reachable_cities", [city]);
  const [{ data: apps }, { data: waiting }, { data: drafts }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email, phone, created_at").eq("role", "shopper").eq("status", "pending").order("created_at", { ascending: false }).limit(200),
    supabase.from("shopper_applications").select("shopper_id, status").in("status", ["draft", "submitted"]),
  ]);
  const queued = (apps ?? []) as unknown as QueuedApplication[];
  const openStatus = new Map((drafts ?? []).map((d) => [d.shopper_id as string, d.status as string]));
  const notSubmitted = (waiting ?? []).filter((p) => openStatus.get(p.id) !== "submitted");

  return (
    <>
      <section className="grid gap-3">
        <p className="text-sm text-muted">{t.admin.applicationsLede}</p>
        {queued.length === 0 ? (
          <p className="card p-6 text-muted">{t.admin.noApplications}</p>
        ) : (
          <ul className="grid gap-3">
            {queued.map((a) => (
              <li key={a.id} className="card grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid gap-4">
                  <div className="grid gap-0.5">
                    <span className="text-lg font-extrabold">{a.profile?.full_name || "—"}</span>
                    <span className="text-sm text-muted">
                      {a.profile?.email}
                      {a.profile?.phone && <span className="font-mono"> · {a.profile.phone}</span>}
                    </span>
                    <span className="text-xs text-muted">
                      {t.admin.submittedAt(dateTime(a.submitted_at, lang))} · {t.application.attempts(a.quiz_attempts)}
                    </span>
                  </div>
                  <ApplicationSummary app={a} lang={lang} />
                </div>
                <div className="lg:border-l lg:border-line lg:pl-5">
                  <ApplicationDecision applicationId={a.id} lang={lang} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!city && notSubmitted.length > 0 && (
        <section className="grid gap-3">
          <div className="grid gap-1">
            <h2 className="eyebrow">{t.admin.notSubmitted}</h2>
            <p className="text-sm text-muted">{t.admin.notSubmittedLede}</p>
          </div>
          <ul className="card divide-y divide-line">
            {notSubmitted.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="grid">
                  <span className="font-semibold">{p.full_name || "—"}</span>
                  <span className="text-muted">{p.email}</span>
                </span>
                <span className="chip">{openStatus.has(p.id) ? t.admin.draftSaved : t.admin.noForm}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// Daftar akun. Di tab shopper dengan filter kota, hanya shopper aktif yang lamarannya menjangkau kota itu (pool per kota).
async function AccountsTable({ tab, city, lang }: { tab: Exclude<Tab, "pending">; city: string; lang: Lang }) {
  const t = dict(lang);
  const supabase = await createClient();

  let poolIds: string[] | null = null;
  if (tab === "shopper" && city) {
    const { data } = await supabase.from("shopper_applications").select("shopper_id").eq("status", "approved").contains("reachable_cities", [city]);
    poolIds = (data ?? []).map((r) => r.shopper_id as string);
  }

  let query = supabase.from("profiles").select("id, full_name, email, phone, role, status, status_note, created_at").neq("role", "admin").order("created_at", { ascending: false }).limit(200);
  if (tab === "shopper" || tab === "client") query = query.eq("role", tab);
  if (poolIds) query = query.eq("status", "active").in("id", poolIds.length ? poolIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: rows } = await query;

  // Jangkauan kota dari lamaran yang disetujui, untuk kolom shopper.
  const shopperIds = (rows ?? []).filter((r) => r.role === "shopper").map((r) => r.id as string);
  const { data: reach } = shopperIds.length
    ? await supabase.from("shopper_applications").select("shopper_id, reachable_cities").eq("status", "approved").in("shopper_id", shopperIds)
    : { data: [] };
  const reachOf = new Map((reach ?? []).map((r) => [r.shopper_id as string, r.reachable_cities as string[]]));
  const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

  return (
    <>
      {poolIds && <p className="text-sm text-muted">{t.admin.poolNote(city, rows?.length ?? 0)}</p>}
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
                {tab !== "client" && <th className="px-4 py-3 font-semibold">{t.admin.reach}</th>}
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
                    {tab !== "client" && <td className="max-w-[24ch] px-4 py-3 text-muted">{reachOf.get(r.id)?.join(", ") || "—"}</td>}
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
