import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountActions } from "../account-actions";
import { ApplicationSummary } from "@/components/application-summary";
import { businessTypeLabel, getBusinessTypes, type BusinessType } from "@/lib/catalog";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/field";
import { date, dateTime, rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { maskAccountNumber } from "@/lib/mask";
import { changeFieldLabel, changeValue, holderMismatch, type ProfileChange } from "@/lib/profile-changes";
import type { InvoiceStatus, ProjectStatus } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/project-labels";
import { isRole, type AccountStatus } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { FollowupTimeline } from "@/components/followup-timeline";
import type { FollowupEntry } from "@/lib/cs-data";
import { APPLICATION_COLUMNS, type ShopperApplication } from "@/lib/shopper-application";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail akun" };

const STATUS_TONE: Record<AccountStatus, string> = {
  pending: "border-warn/50 text-warn",
  active: "border-good/50 text-good",
  rejected: "border-bad/50 text-bad",
  suspended: "border-bad/50 text-bad",
};
const APPLICATION_STATUS: Record<ShopperApplication["status"], string> = { draft: "Draf", submitted: "Menunggu keputusan", approved: "Disetujui", rejected: "Ditolak" };

type Profile = { id: string; role: string; status: AccountStatus; status_note: string | null; full_name: string; email: string; phone: string | null; locale: string; created_at: string };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-sm">{children || "—"}</dd>
    </div>
  );
}

// Data lengkap satu akun shopper atau pemilik bisnis, dengan tombol tangguhkan/aktifkan kembali.
export default async function AccountDetailPage({ params }: PageProps<"/admin/accounts/[id]">) {
  const { id } = await params;
  const [, lang, types] = await Promise.all([requireRole("admin", `/admin/accounts/${id}`), getLang(), getBusinessTypes()]);
  const t = dict(lang);
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, role, status, status_note, full_name, email, phone, locale, created_at").eq("id", id).maybeSingle();
  const profile = data as Profile | null;
  if (!profile || !isRole(profile.role) || profile.role === "admin") notFound();
  const role = profile.role;
  const back = `/admin/accounts?tab=${role}`;

  return (
    <>
      <Link href={back} className="text-sm text-muted hover:text-fg">
        ← Kembali ke daftar {t.roles[role].toLowerCase()}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <section className="card grid gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-0.5">
                <span className="eyebrow">{t.roles[role]}</span>
                <h1 className="text-2xl font-extrabold">{profile.full_name || "—"}</h1>
              </div>
              <span className={`chip ${STATUS_TONE[profile.status]}`}>{t.status[profile.status]}</span>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Email">{profile.email}</Fact>
              <Fact label="Nomor HP">{profile.phone && <span className="font-mono">{profile.phone}</span>}</Fact>
              <Fact label="Terdaftar">{dateTime(profile.created_at, lang)}</Fact>
              <Fact label="Bahasa">{profile.locale === "en" ? "English" : "Bahasa Indonesia"}</Fact>
            </dl>
            {profile.status_note && <p className="rounded-lg border border-line bg-raise p-3 text-sm text-muted">Catatan status: {profile.status_note}</p>}
          </section>
          {role === "shopper" && <ShopperDetail id={id} name={profile.full_name} lang={lang} />}
          {role === "client" && (
            <>
              <ClientDetail id={id} lang={lang} types={types} />
              <ClientFollowups id={id} />
            </>
          )}
          <ChangeHistory id={id} lang={lang} types={types} />
        </div>
        <aside className="card grid gap-3 p-5 lg:sticky lg:top-6">
          <h2 className="font-extrabold">Status akun</h2>
          <p className="text-sm text-muted">
            {role === "shopper" && (profile.status === "pending" || profile.status === "rejected")
              ? "Pelamar shopper disetujui atau ditolak lewat lamarannya di tab Lamaran masuk."
              : "Menangguhkan akun wajib dengan alasan, dan alasannya terlihat oleh pemilik akun."}
          </p>
          <AccountActions userId={profile.id} role={role} status={profile.status} lang={lang} />
        </aside>
      </div>
    </>
  );
}

type Task = {
  id: string;
  code: string;
  status: TaskStatus;
  fee: number;
  window_start: string;
  window_end: string;
  checkin_at: string | null;
  project: { id: string; code: string } | null;
  outlet: { name: string; city: string } | null;
};

async function ShopperDetail({ id, name, lang }: { id: string; name: string; lang: Lang }) {
  const supabase = await createClient();
  const [{ data: apps }, { data: bank }, { data: taskRows }, { data: payouts }] = await Promise.all([
    supabase.from("shopper_applications").select(APPLICATION_COLUMNS).eq("shopper_id", id).order("created_at", { ascending: false }),
    supabase.from("shopper_bank_accounts").select("bank_name, account_number, account_holder, updated_at").eq("shopper_id", id).maybeSingle(),
    supabase
      .from("audit_tasks")
      .select("id, code, status, fee, window_start, window_end, checkin_at, project:projects(id, code), outlet:project_outlets(name, city)")
      .eq("shopper_id", id)
      .order("window_start", { ascending: false })
      .limit(50),
    supabase.from("payouts").select("id, code, total, paid_at").eq("shopper_id", id).order("paid_at", { ascending: false }).limit(20),
  ]);
  const applications = (apps ?? []) as unknown as ShopperApplication[];
  // Lamaran yang disetujui lebih dulu, kalau belum ada, yang terbaru.
  const main = applications.find((a) => a.status === "approved") ?? applications[0];
  const tasks = (taskRows ?? []) as unknown as Task[];
  const paid = (payouts ?? []).reduce((s, p) => s + (p.total as number), 0);
  const approved = tasks.filter((x) => x.status === "approved").length;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card grid gap-1 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Tugas</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{tasks.length}</span>
        </div>
        <div className="card grid gap-1 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Lolos QC</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{approved}</span>
        </div>
        <div className="card grid gap-1 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Sudah dibayar</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(paid)}</span>
        </div>
      </section>

      <section className="card grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">Data lamaran</h2>
          {main && <span className="chip">{APPLICATION_STATUS[main.status]}</span>}
        </div>
        {main ? <ApplicationSummary app={main} lang={lang} /> : <p className="text-sm text-muted">Belum mengisi formulir lamaran.</p>}
        {applications.length > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Riwayat lamaran ({applications.length})</summary>
            <ul className="mt-2 grid gap-2">
              {applications.map((a) => (
                <li key={a.id} className="rounded-lg border border-line p-3">
                  <span className="font-semibold">{APPLICATION_STATUS[a.status]}</span>
                  <span className="text-muted"> · dikirim {dateTime(a.submitted_at, lang)}</span>
                  {a.decided_at && <span className="text-muted"> · diputuskan {dateTime(a.decided_at, lang)}</span>}
                  {a.decision_note && <p className="mt-1 text-muted">{a.decision_note}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Rekening pembayaran</h2>
        {bank && holderMismatch(name, bank.account_holder as string) && (
          <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm" data-testid="holder-mismatch">
            <strong>Nama akun berbeda dengan nama rekening.</strong> Akun atas nama {name}, rekening atas nama {bank.account_holder as string}. Pastikan rekening ini
            milik shopper sebelum mentransfer fee.
          </p>
        )}
        {bank ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Bank">{bank.bank_name}</Fact>
            <Fact label="Nomor rekening">
              <span className="font-mono">{maskAccountNumber(bank.account_number as string)}</span>
            </Fact>
            <Fact label="Atas nama">{bank.account_holder}</Fact>
          </dl>
        ) : (
          <p className="text-sm text-muted">Belum mengisi rekening.</p>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Tugas kunjungan</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted">Belum pernah mendapat tugas.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-2 font-semibold">Tugas</th>
                  <th className="px-5 py-2 font-semibold">Outlet</th>
                  <th className="px-5 py-2 font-semibold">Jadwal</th>
                  <th className="px-5 py-2 font-semibold">Fee</th>
                  <th className="px-5 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((x) => (
                  <tr key={x.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2">
                      <span className="font-mono text-xs">{x.code}</span>
                      {x.project && (
                        <Link href={`/admin/projects/${x.project.id}`} className="block text-xs text-mark">
                          {x.project.code}
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-2">
                      {x.outlet?.name || "—"}
                      <span className="block text-xs text-muted">{x.outlet?.city}</span>
                    </td>
                    <td className="px-5 py-2 text-muted">
                      {date(x.window_start, lang)} – {date(x.window_end, lang)}
                      {x.checkin_at && <span className="block text-xs">Check-in {dateTime(x.checkin_at, lang)}</span>}
                    </td>
                    <td className="px-5 py-2 tabular-nums">{rupiah(x.fee)}</td>
                    <td className="px-5 py-2">
                      <span className={`chip ${TASK_STATUS_TONE[x.status] ?? ""}`}>{TASK_STATUS_LABEL[x.status] ?? x.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Pembayaran ke shopper</h2>
        {!payouts?.length ? (
          <p className="text-sm text-muted">Belum ada pembayaran.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {payouts.map((p) => (
              <li key={p.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/payouts/${p.id}`} className="font-mono text-xs text-mark">
                  {p.code as string}
                </Link>
                <span className="text-muted">{dateTime(p.paid_at as string, lang)}</span>
                <span className="font-semibold tabular-nums">{rupiah(p.total as number)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

type Company = { name: string; industry: string; address: string; city: string; instagram: string; pic_name: string; pic_position: string; pic_phone: string };
type ProjectRow = {
  id: string;
  code: string;
  status: ProjectStatus;
  outlet_count: number;
  created_at: string;
  package_snapshot: { name?: string } | null;
  outlets: { id: string; name: string; city: string; address: string }[];
  report: { status: string } | null;
};
type InvoiceRow = { id: string; code: string; status: InvoiceStatus; total: number; created_at: string; project: { code: string } | null };

async function ClientDetail({ id, lang, types }: { id: string; lang: Lang; types: BusinessType[] }) {
  const t = dict(lang);
  const supabase = await createClient();
  const [{ data: company }, { data: projectRows }, { data: invoiceRows }] = await Promise.all([
    supabase.from("companies").select("name, industry, address, city, instagram, pic_name, pic_position, pic_phone").eq("client_id", id).maybeSingle(),
    supabase
      .from("projects")
      .select("id, code, status, outlet_count, created_at, package_snapshot, outlets:project_outlets(id, name, city, address), report:reports(status)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, code, status, total, created_at, project:projects(code)").eq("client_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const c = company as Company | null;
  const projects = (projectRows ?? []) as unknown as ProjectRow[];
  const invoices = (invoiceRows ?? []) as unknown as InvoiceRow[];
  // Outlet unik di semua pesanan (nama dan kota sama dianggap outlet yang sama).
  const outlets = [...new Map(projects.flatMap((p) => p.outlets).filter((o) => o.name).map((o) => [`${o.name.toLowerCase()}|${o.city.toLowerCase()}`, o])).values()];
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card grid gap-1 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Proyek</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{projects.length}</span>
        </div>
        <div className="card grid gap-1 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Outlet</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{outlets.length}</span>
        </div>
        <div className="card grid gap-1 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Total dibayar</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(paid)}</span>
        </div>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-extrabold">Perusahaan</h2>
        {c && c.name ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Nama perusahaan">{c.name}</Fact>
            <Fact label="Jenis usaha">{c.industry && businessTypeLabel(types, c.industry, lang)}</Fact>
            <Fact label="Kota">{c.city}</Fact>
            <Fact label="Alamat">{c.address}</Fact>
            <Fact label="Instagram">{c.instagram}</Fact>
            <Fact label="PIC">
              {c.pic_name}
              {c.pic_position && <span className="text-muted"> · {c.pic_position}</span>}
              {c.pic_phone && <span className="block font-mono text-xs">{c.pic_phone}</span>}
            </Fact>
          </dl>
        ) : (
          <p className="text-sm text-muted">Data perusahaan belum diisi.</p>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Outlet</h2>
        {outlets.length === 0 ? (
          <p className="text-sm text-muted">Belum ada outlet yang diisi.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {outlets.map((o) => (
              <li key={o.id} className="rounded-lg border border-line p-3 text-sm">
                <span className="font-semibold">{o.name}</span>
                <span className="text-muted"> · {o.city}</span>
                {o.address && <span className="block text-xs text-muted">{o.address}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Proyek</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted">Belum pernah memesan.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="grid">
                  <Link href={`/admin/projects/${p.id}`} className="font-semibold text-mark">
                    {p.code}
                  </Link>
                  <span className="text-xs text-muted">
                    {p.package_snapshot?.name ?? "—"} · {p.outlet_count} outlet · dipesan {date(p.created_at, lang)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {p.report?.status === "published" && (
                    <Link href={`/admin/reports/${p.id}`} className="btn btn-sm">
                      Laporan
                    </Link>
                  )}
                  <span className={`chip ${PROJECT_STATUS_TONE[p.status]}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Tagihan</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted">Belum ada tagihan.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="grid">
                  <Link href={`/admin/invoices/${i.id}`} className="font-mono text-xs text-mark">
                    {i.code}
                  </Link>
                  <span className="text-xs text-muted">
                    {i.project?.code ?? "—"} · {date(i.created_at, lang)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{rupiah(i.total)}</span>
                  <span className="chip">{t.orders.invoiceStatus[i.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// Riwayat perubahan data akun oleh pemilik akun (atau admin), terbaru di atas.
async function ChangeHistory({ id, lang, types }: { id: string; lang: Lang; types: BusinessType[] }) {
  const supabase = await createClient();
  const { data } = await supabase.from("profile_changes").select("id, field, old_value, new_value, changed_by, changed_at").eq("user_id", id).order("changed_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as ProfileChange[];
  const label = (k: string) => businessTypeLabel(types, k, lang);
  const who = (r: ProfileChange) => (r.changed_by === null ? "lewat tautan konfirmasi email" : r.changed_by === id ? "oleh pemilik akun" : "oleh admin");
  return (
    <section className="card grid gap-3 p-5" aria-labelledby="riwayat-perubahan">
      <div className="grid gap-1">
        <h2 id="riwayat-perubahan" className="text-lg font-extrabold">
          Riwayat perubahan data
        </h2>
        <p className="text-sm text-muted">Setiap perubahan data akun tercatat di sini. Perubahan jenis kelamin dan tanggal lahir hanya berlaku untuk tawaran tugas berikutnya.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Belum ada perubahan sejak akun dibuat.</p>
      ) : (
        <ul className="divide-y divide-line text-sm" data-testid="change-history">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-0.5 py-2">
              <span>
                <strong>{changeFieldLabel(r.field)}</strong> diubah dari <span className="text-muted line-through">{changeValue(r.field, r.old_value, lang, label)}</span> ke{" "}
                <strong>{changeValue(r.field, r.new_value, lang, label)}</strong>
              </span>
              <span className="text-xs text-muted">
                {dateTime(r.changed_at, lang)} · {who(r)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Riwayat follow-up CS dan konfirmasi WA admin untuk client ini (Putaran 16).
async function ClientFollowups({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_followups")
    .select("id, created_at, channel, purpose, outcome, note, message, next_at, staff_id, staff:profiles!client_followups_staff_id_fkey(full_name, role), project:projects(code)")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  type Row = Omit<FollowupEntry, "staff" | "staff_role" | "project_code"> & { staff: { full_name: string; role: "admin" | "cs" } | null; project: { code: string } | null };
  const items: FollowupEntry[] = ((data ?? []) as unknown as Row[]).map(({ staff, project, ...f }) => ({
    ...f,
    staff: staff?.full_name || null,
    staff_role: staff?.role ?? null,
    project_code: project?.code ?? null,
  }));
  return (
    <section className="card grid gap-3 p-5">
      <h2 className="text-lg font-extrabold">Riwayat follow-up</h2>
      <FollowupTimeline items={items} viewerId="" isAdmin />
    </section>
  );
}
