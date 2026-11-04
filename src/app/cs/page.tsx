import type { Metadata } from "next";
import Link from "next/link";
import { FollowupComposer } from "@/components/followup-panel";
import { Pager } from "@/components/pager";
import { Tabs } from "@/components/tabs";
import { appOrigin } from "@/lib/app-origin";
import { getClientCounts, getClients, type ClientRow } from "@/lib/cs-data";
import { dayLabel, wibDate } from "@/lib/field";
import { clientPhones, followupTemplates, isStage, OUTCOME_LABEL, STAGE_LABEL, STAGE_TONE, STAGES } from "@/lib/followups";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Client" };

const PER_PAGE = 20;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CsHome({ searchParams }: PageProps<"/cs">) {
  const [viewer, params, counts, origin] = await Promise.all([requireRole("cs", "/cs"), searchParams, getClientCounts(), appOrigin()]);
  const tabParam = one(params.tab);
  const tab = tabParam === "all" || tabParam === "due" || isStage(tabParam) ? tabParam : (counts.due ?? 0) > 0 ? "due" : "all";
  const q = one(params.q).trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(one(params.hal)) || 1));
  const { rows, total } = await getClients(tab === "all" ? "" : tab, q, page, PER_PAGE);
  const today = wibDate();
  const href = (p: number) => {
    const qs = new URLSearchParams({ tab });
    if (q) qs.set("q", q);
    if (p > 1) qs.set("hal", String(p));
    return `/cs?${qs}`;
  };

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Client</h1>
        <p className="text-muted">Semua akun pemilik bisnis beserta status paketnya. Follow-up lewat WhatsApp tercatat otomatis, lalu lengkapi hasilnya dan jadwalkan follow-up berikutnya.</p>
      </section>

      <Tabs
        base="/cs"
        label="Tahap client"
        current={tab}
        extra={q ? `&q=${encodeURIComponent(q)}` : ""}
        items={[
          { id: "due", label: "Perlu follow-up", count: counts.due ?? 0, alert: (counts.due ?? 0) > 0 },
          { id: "all", label: "Semua", count: counts.all ?? 0 },
          ...STAGES.map((s) => ({ id: s, label: STAGE_LABEL[s], count: counts[s] ?? 0 })),
        ]}
      />

      <form action="/cs" className="card flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="tab" value={tab} />
        <div className="field min-w-0 flex-[1_1_280px]">
          <label htmlFor="q">Cari client</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nama, email, nomor HP, brand, atau kode proyek" />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm btn-primary">Cari</button>
          {q && (
            <Link href={`/cs?tab=${tab}`} className="btn btn-sm">
              Reset
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="card p-6 text-muted">
          {q ? "Tidak ada client yang cocok dengan pencarian ini." : tab === "due" ? "Tidak ada jadwal follow-up untuk hari ini. Semua aman." : "Belum ada client di tahap ini."}
        </p>
      ) : (
        <section className="grid gap-3">
          <ul className="grid gap-3">
            {rows.map((r) => (
              <ClientCard key={r.id} r={r} staff={viewer.fullName} origin={origin} today={today} />
            ))}
          </ul>
          <Pager page={page} perPage={PER_PAGE} total={total} shown={rows.length} noun="client" href={href} label="Halaman daftar client" />
        </section>
      )}
    </>
  );
}

function ClientCard({ r, staff, origin, today }: { r: ClientRow; staff: string; origin: string; today: string }) {
  const t = dict("id");
  const brand = r.company ?? "";
  const templates = followupTemplates(r.stage, {
    name: r.pic_name || r.full_name,
    staff,
    brand,
    origin,
    projectCode: r.project_code,
    packageName: r.package_name,
    invoiceCode: r.invoice_code,
    invoiceTotal: r.invoice_total,
    invoiceDue: r.invoice_due_at,
  });
  const due = r.next_followup_at && String(r.next_followup_at).slice(0, 10) <= today;
  return (
    <li className={`card grid gap-3 p-4 ${due ? "border-warn/60" : ""}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-0.5">
          <Link href={`/cs/clients/${r.id}`} className="truncate font-semibold hover:text-mark">
            {r.company || r.full_name || r.email}
          </Link>
          <span className="truncate text-sm text-muted">
            {r.company ? `${r.full_name || "—"} · ` : ""}
            {r.email}
          </span>
          <span className="font-mono text-xs text-muted">
            {r.pic_phone || r.phone || "Nomor HP belum ada"}
            {r.city ? ` · ${r.city}` : ""}
          </span>
          {r.account_status !== "active" && <span className="chip mt-1 w-fit border-bad/50 text-bad">{t.status[r.account_status]}</span>}
        </div>
        <div className="grid gap-1 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`chip ${STAGE_TONE[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
            {r.project_code && <span className="font-mono text-xs font-bold">{r.project_code}</span>}
          </span>
          {r.package_name && (
            <span className="text-muted">
              {r.package_name} · {r.outlet_count} outlet{r.project_count > 1 ? ` · ${r.project_count} pesanan` : ""}
            </span>
          )}
          {r.invoice_code && (r.invoice_status === "unpaid" || r.invoice_status === "verifying") && (
            <span className="text-muted">
              {r.invoice_code} · {rupiah(r.invoice_total)}
              {r.invoice_status === "unpaid" && r.invoice_due_at ? ` · batas ${dateTime(r.invoice_due_at, "id")}` : ""}
            </span>
          )}
          {!r.project_code && <span className="text-muted">Daftar {dateTime(r.created_at, "id")}</span>}
        </div>
        <div className="grid gap-1 text-sm">
          {r.last_followup_at ? (
            <>
              <span>
                <span className="text-muted">Terakhir:</span> {r.last_outcome ? OUTCOME_LABEL[r.last_outcome] : "—"}
              </span>
              <span className="text-xs text-muted">
                {dateTime(r.last_followup_at, "id")}
                {r.last_followup_by ? ` · ${r.last_followup_by}` : ""} · {r.followups}x
              </span>
            </>
          ) : (
            <span className="text-muted">Belum pernah di-follow-up</span>
          )}
          {r.next_followup_at && <span className={`text-xs font-semibold ${due ? "text-warn" : "text-muted"}`}>Jadwal berikutnya: {dayLabel(String(r.next_followup_at).slice(0, 10))}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <FollowupComposer clientId={r.id} projectId={r.project_id} phones={clientPhones(r)} templates={templates} primary />
        <Link href={`/cs/clients/${r.id}`} className="btn btn-sm">
          Detail & outlet
        </Link>
      </div>
    </li>
  );
}
