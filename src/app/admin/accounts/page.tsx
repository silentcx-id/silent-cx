import type { Metadata } from "next";
import Link from "next/link";
import { AccountActions } from "./account-actions";
import { CsAccountForm } from "./cs-form";
import { appOrigin } from "@/lib/app-origin";
import { Tabs } from "@/components/tabs";
import { businessTypeLabel, getBusinessTypes, type BusinessType } from "@/lib/catalog";
import { dateTime } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { isRole, type AccountStatus, type Role } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { APPLICATION_COLUMNS, GENDERS, optionLabel, type ShopperApplication } from "@/lib/shopper-application";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Akun" };

const TABS = ["pending", "shopper", "client", "cs", "all"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<AccountStatus, string> = {
  pending: "border-warn/50 text-warn",
  active: "border-good/50 text-good",
  rejected: "border-bad/50 text-bad",
  suspended: "border-bad/50 text-bad",
};
const STATUSES: AccountStatus[] = ["pending", "active", "rejected", "suspended"];
const PER_PAGE = 10;

type Person = { full_name: string; email: string; phone: string | null };
type QueuedApplication = ShopperApplication & { shopper_id: string; profile: Person | null };

// Isian filter dari alamat halaman; nilai yang tidak dikenal diabaikan.
type Filters = { q: string; status: AccountStatus | ""; city: string; interest: string; gender: string; page: number };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  const [, lang, params, types] = await Promise.all([requireRole("admin", "/admin/accounts"), getLang(), searchParams, getBusinessTypes()]);
  const t = dict(lang);
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "pending";
  const tabLabel: Record<Tab, string> = {
    pending: t.admin.applicationsTab,
    shopper: t.roles.shopper,
    client: t.roles.client,
    cs: "Tim CS",
    all: t.admin.filterAll,
  };

  const supabase = await createClient();
  const { data: cityRows } = await supabase.from("service_cities").select("name").order("name");
  const cities = (cityRows ?? []).map((c) => c.name as string);
  const status = one(params.status) as AccountStatus;
  const filters: Filters = {
    q: one(params.q).trim().slice(0, 80),
    status: STATUSES.includes(status) ? status : "",
    city: cities.includes(one(params.kota)) ? one(params.kota) : "",
    interest: types.some((b) => b.key === one(params.minat)) ? one(params.minat) : "",
    gender: GENDERS.some((g) => g.value === one(params.gender)) ? one(params.gender) : "",
    page: Math.max(1, Math.floor(Number(one(params.hal)) || 1)),
  };

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.admin.accountsTitle}</h1>
        <p className="text-muted">{t.admin.accountsLede}</p>
      </section>

      <Tabs base="/admin/accounts" label={t.admin.accountsTitle} current={tab} items={TABS.map((k) => ({ id: k, label: tabLabel[k] }))} />

      {tab === "pending" ? (
        <>
          {cities.length > 0 && (
            <div className="flex flex-wrap items-end justify-end gap-3">
              {/* Form GET biasa: memilih kota memuat ulang halaman dengan ?kota=. */}
              <form className="field min-w-48" action="/admin/accounts">
                <input type="hidden" name="tab" value={tab} />
                <label htmlFor="kota">{t.admin.city}</label>
                <div className="flex gap-2">
                  <select id="kota" name="kota" defaultValue={filters.city} className="flex-1">
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
            </div>
          )}
          <ApplicationsQueue city={filters.city} lang={lang} />
        </>
      ) : tab === "cs" ? (
        <CsTeam lang={lang} />
      ) : (
        <>
          <FilterForm tab={tab} filters={filters} cities={cities} types={types} lang={lang} />
          <AccountsTable tab={tab} filters={filters} types={types} lang={lang} />
        </>
      )}
    </>
  );
}

// Pencarian dan filter. Form GET biasa, jadi hasilnya bisa di-refresh dan dibagikan sebagai link.
function FilterForm({ tab, filters, cities, types, lang }: { tab: Exclude<Tab, "pending" | "cs">; filters: Filters; cities: string[]; types: BusinessType[]; lang: Lang }) {
  const t = dict(lang);
  const active = Boolean(filters.q || filters.status || filters.city || filters.interest || filters.gender);
  return (
    <form action="/admin/accounts" className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="tab" value={tab} />
      <div className="field min-w-0 basis-full">
        <label htmlFor="q">Cari</label>
        <input id="q" name="q" type="search" defaultValue={filters.q} placeholder={tab === "client" ? "Nama, email, HP, atau perusahaan" : "Nama, email, atau nomor HP"} />
      </div>
      <div className="field min-w-0 flex-[1_1_170px]">
        <label htmlFor="status">Status akun</label>
        <select id="status" name="status" defaultValue={filters.status}>
          <option value="">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.status[s]}
            </option>
          ))}
        </select>
      </div>
      {tab !== "all" && (
        <>
          <div className="field min-w-0 flex-[1_1_170px]">
            <label htmlFor="kota">{tab === "shopper" ? "Jangkauan kota" : t.admin.city}</label>
            <select id="kota" name="kota" defaultValue={filters.city}>
              <option value="">{t.admin.allCities}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field min-w-0 flex-[1_1_190px]">
            <label htmlFor="minat">{tab === "shopper" ? "Bisnis yang diminati" : "Jenis usaha"}</label>
            <select id="minat" name="minat" defaultValue={filters.interest}>
              <option value="">Semua jenis</option>
              {types.map((b) => (
                <option key={b.key} value={b.key}>
                  {businessTypeLabel(types, b.key, lang)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {tab === "shopper" && (
        <div className="field min-w-0 flex-[1_1_150px]">
          <label htmlFor="gender">Jenis kelamin</label>
          <select id="gender" name="gender" defaultValue={filters.gender}>
            <option value="">Semua</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label[lang]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary">Terapkan</button>
        {active && (
          <Link href={`/admin/accounts?tab=${tab}`} className="btn btn-sm">
            Reset
          </Link>
        )}
      </div>
    </form>
  );
}

// Lamaran yang menunggu keputusan. Pelamar yang belum mengirim lamaran tidak ditampilkan.
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
  const { data: apps } = await query;
  const queued = (apps ?? []) as unknown as QueuedApplication[];

  return (
    <>
      <section className="grid gap-3">
        <p className="text-sm text-muted">{t.admin.applicationsLede}</p>
        {queued.length === 0 ? (
          <p className="card p-6 text-muted">{t.admin.noApplications}</p>
        ) : (
          // Ringkasan saja; isi lamaran dan tombol keputusan ada di halaman detail.
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t.admin.columns.name}</th>
                  <th className="px-4 py-3 font-semibold">{t.admin.domicile}</th>
                  <th className="px-4 py-3 font-semibold">{t.admin.reach}</th>
                  <th className="px-4 py-3 font-semibold">{t.admin.submitted}</th>
                </tr>
              </thead>
              <tbody>
                {queued.map((a) => (
                  <tr key={a.id} className="relative border-b border-line align-top transition last:border-0 hover:bg-raise">
                    <td className="px-4 py-3">
                      <Link href={`/admin/accounts/applications/${a.id}`} className="font-semibold text-mark after:absolute after:inset-0 after:content-['']">
                        {a.profile?.full_name || "—"}
                      </Link>
                      <div className="text-muted">{a.profile?.email}</div>
                    </td>
                    <td className="px-4 py-3">{a.domicile || "—"}</td>
                    <td className="max-w-[32ch] px-4 py-3 text-muted">{a.reachable_cities.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-muted">{dateTime(a.submitted_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </>
  );
}

type AccountRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: AccountStatus;
  status_note: string | null;
  created_at: string;
  cities: string[];
  interests: string[];
  gender: string | null;
  company: string | null;
  total: number;
};

// Daftar akun 10 per halaman. Filter kota shopper memakai jangkauan kota di lamarannya; kota pemilik bisnis memakai
// kota perusahaan dan kota outlet pesanannya.
async function AccountsTable({ tab, filters, types, lang }: { tab: Exclude<Tab, "pending">; filters: Filters; types: BusinessType[]; lang: Lang }) {
  const t = dict(lang);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_accounts", {
    p_role: tab === "all" ? null : tab,
    p_status: filters.status || null,
    p_q: filters.q,
    p_city: tab === "all" ? "" : filters.city,
    p_interest: tab === "all" ? "" : filters.interest,
    p_gender: tab === "shopper" ? filters.gender : "",
    p_limit: PER_PAGE,
    p_offset: (filters.page - 1) * PER_PAGE,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AccountRow[];
  const total = Number(rows[0]?.total ?? 0);
  const from = (filters.page - 1) * PER_PAGE + 1;
  const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
  const href = (page: number) => {
    const qs = new URLSearchParams({ tab });
    if (filters.q) qs.set("q", filters.q);
    if (filters.status) qs.set("status", filters.status);
    if (filters.city) qs.set("kota", filters.city);
    if (filters.interest) qs.set("minat", filters.interest);
    if (filters.gender) qs.set("gender", filters.gender);
    if (page > 1) qs.set("hal", String(page));
    return `/admin/accounts?${qs}`;
  };

  if (!rows.length) {
    return filters.page > 1 ? (
      <p className="card p-6 text-muted">
        Halaman ini kosong.{" "}
        <Link href={href(1)} className="font-semibold text-mark">
          Kembali ke halaman 1
        </Link>
      </p>
    ) : (
      <p className="card p-6 text-muted">{filters.q || filters.status || filters.city || filters.interest || filters.gender ? "Tidak ada akun yang cocok dengan pencarian atau filter ini." : t.admin.empty}</p>
    );
  }

  const pages = Math.ceil(total / PER_PAGE);
  return (
    <section className="grid gap-3">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">{t.admin.columns.name}</th>
              {tab === "all" && <th className="px-4 py-3 font-semibold">{t.admin.columns.role}</th>}
              <th className="px-4 py-3 font-semibold">{t.admin.columns.status}</th>
              {tab !== "all" && <th className="px-4 py-3 font-semibold">{tab === "shopper" ? t.admin.reach : t.admin.city}</th>}
              {tab !== "all" && <th className="px-4 py-3 font-semibold">{tab === "shopper" ? "Minat bisnis" : "Jenis usaha"}</th>}
              {tab === "shopper" && <th className="px-4 py-3 font-semibold">Jenis kelamin</th>}
              <th className="px-4 py-3 font-semibold">{t.admin.columns.joined}</th>
              <th className="px-4 py-3 font-semibold">{t.admin.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (!isRole(r.role)) return null;
              return (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/accounts/${r.id}`} className="font-semibold hover:text-mark">
                      {r.full_name || "—"}
                    </Link>
                    {r.company && <div className="text-xs font-semibold text-muted">{r.company}</div>}
                    <div className="text-muted">{r.email}</div>
                    {r.phone && <div className="font-mono text-xs text-muted">{r.phone}</div>}
                  </td>
                  {tab === "all" && <td className="px-4 py-3">{t.roles[r.role]}</td>}
                  <td className="px-4 py-3">
                    <span className={`chip ${STATUS_TONE[r.status]}`}>{t.status[r.status]}</span>
                    {r.status_note && <p className="mt-1 max-w-[28ch] text-xs text-muted">{r.status_note}</p>}
                  </td>
                  {tab !== "all" && <td className="max-w-[22ch] px-4 py-3 text-muted">{r.cities.join(", ") || "—"}</td>}
                  {tab !== "all" && <td className="max-w-[22ch] px-4 py-3 text-muted">{r.interests.map((k) => businessTypeLabel(types, k, lang)).join(", ") || "—"}</td>}
                  {tab === "shopper" && <td className="px-4 py-3 text-muted">{optionLabel(GENDERS, r.gender, lang)}</td>}
                  <td className="px-4 py-3 tabular-nums text-muted">{fmt.format(new Date(r.created_at))}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <Link href={`/admin/accounts/${r.id}`} className="btn btn-sm">
                        Detail
                      </Link>
                      <AccountActions userId={r.id} role={r.role} status={r.status} lang={lang} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Halaman daftar akun" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted tabular-nums">
          {from}–{from + rows.length - 1} dari {total} akun
        </span>
        <span className="flex items-center gap-2">
          {filters.page > 1 ? (
            <Link href={href(filters.page - 1)} className="btn btn-sm" rel="prev">
              ← Sebelumnya
            </Link>
          ) : (
            <span className="btn btn-sm pointer-events-none opacity-40" aria-disabled="true">
              ← Sebelumnya
            </span>
          )}
          <span className="tabular-nums text-muted">
            Halaman {filters.page} dari {pages}
          </span>
          {filters.page < pages ? (
            <Link href={href(filters.page + 1)} className="btn btn-sm" rel="next">
              Berikutnya →
            </Link>
          ) : (
            <span className="btn btn-sm pointer-events-none opacity-40" aria-disabled="true">
              Berikutnya →
            </span>
          )}
        </span>
      </nav>
    </section>
  );
}

// Tim CS (Putaran 16): akun dibuat admin, langsung aktif. Penangguhan memakai tombol yang sama dengan akun lain.
async function CsTeam({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const supabase = await createClient();
  const [{ data }, origin] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, status, status_note, created_at").eq("role", "cs").order("created_at", { ascending: false }),
    appOrigin(),
  ]);
  const team = (data ?? []) as { id: string; full_name: string; email: string; phone: string | null; status: AccountStatus; status_note: string | null; created_at: string }[];
  return (
    <>
      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Buat akun CS</h2>
        <CsAccountForm loginUrl={`${origin}/login`} />
      </section>
      {team.length === 0 ? (
        <p className="card p-6 text-muted">Belum ada akun CS.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {team.map((m) => (
            <li key={m.id} className="card grid content-start gap-2 p-4 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{m.full_name || "—"}</span>
                <span className={`chip ${STATUS_TONE[m.status]}`}>{t.status[m.status]}</span>
              </span>
              <span className="text-muted">{m.email}</span>
              {m.phone && <span className="font-mono text-xs text-muted">{m.phone}</span>}
              {m.status_note && <span className="text-xs text-muted">{m.status_note}</span>}
              <span className="text-xs text-muted">Dibuat {dateTime(m.created_at, lang)}</span>
              <AccountActions userId={m.id} role="cs" status={m.status} lang={lang} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
