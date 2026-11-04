import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowupComposer, FollowupNoteForm } from "@/components/followup-panel";
import { FollowupTimeline } from "@/components/followup-timeline";
import { appOrigin } from "@/lib/app-origin";
import { getClientDetail, type ClientProject } from "@/lib/cs-data";
import { clientPhones, followupTemplates, STAGE_LABEL, STAGE_TONE } from "@/lib/followups";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import type { ProjectStatus } from "@/lib/orders";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/project-labels";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Detail client" };

const OPEN = ["awaiting_review", "awaiting_payment", "verifying"];
const RUNNING = ["active", "reporting"];

// Proyek yang paling relevan untuk follow-up: pesanan terbuka, lalu yang berjalan, lalu yang terbaru (sama dengan database).
function relevant(projects: ClientProject[]) {
  return [...projects].sort((a, b) => {
    const rank = (p: ClientProject) => (OPEN.includes(p.status) ? 0 : RUNNING.includes(p.status) ? 1 : 2);
    return rank(a) - rank(b) || b.created_at.localeCompare(a.created_at);
  })[0];
}

export default async function CsClientDetail({ params }: PageProps<"/cs/clients/[id]">) {
  const { id } = await params;
  const viewer = await requireRole("cs", `/cs/clients/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c, origin] = await Promise.all([getClientDetail(id), appOrigin()]);
  if (!c) notFound();
  const t = dict("id");
  const current = relevant(c.projects);
  const stage = current?.stage ?? "new";
  const invoice = current?.invoices.find((i) => i.status === "unpaid" || i.status === "verifying") ?? current?.invoices.at(-1);
  const brand = c.company?.name ?? "";
  const templates = followupTemplates(stage, {
    name: c.company?.pic_name || c.full_name,
    staff: viewer.fullName,
    brand,
    origin,
    projectCode: current?.code,
    packageName: current?.package_name,
    invoiceCode: invoice?.code,
    invoiceTotal: invoice?.total,
    invoiceDue: invoice?.due_at,
  });
  const phones = clientPhones({ pic_name: c.company?.pic_name, pic_phone: c.company?.pic_phone, full_name: c.full_name, phone: c.phone });

  return (
    <>
      <Link href="/cs" className="text-sm text-muted hover:text-fg">
        ← Semua client
      </Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold leading-tight">{brand || c.full_name || c.email}</h1>
          <p className="text-muted">
            {c.full_name || "—"} · {c.email}
            {c.phone && <span className="font-mono text-sm"> · {c.phone}</span>} · daftar {dateTime(c.created_at, "id")}
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          <span className={`chip ${STAGE_TONE[stage]}`}>{STAGE_LABEL[stage]}</span>
          {c.account_status !== "active" && <span className="chip border-bad/50 text-bad">{t.status[c.account_status]}</span>}
        </span>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Follow-up</h2>
        <div className="flex flex-wrap items-start gap-2">
          <FollowupComposer clientId={c.id} projectId={current?.id ?? null} phones={phones} templates={templates} primary buttonLabel="Follow-up WA" />
          <FollowupNoteForm clientId={c.id} projects={c.projects.map((p) => ({ id: p.id, code: p.code }))} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="grid gap-6">
          <section className="card grid gap-3 p-5">
            <h2 className="text-lg font-extrabold">Perusahaan</h2>
            {c.company ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Brand", c.company.name],
                  ["Kota", c.company.city],
                  ["PIC", [c.company.pic_name, c.company.pic_position && `(${c.company.pic_position})`].filter(Boolean).join(" ")],
                  ["HP PIC", c.company.pic_phone],
                  ["Instagram", c.company.instagram],
                  ["Alamat kantor", c.company.address],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className={k === "HP PIC" ? "font-mono" : ""}>{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">Client belum mengisi data perusahaan.</p>
            )}
          </section>

          <section className="grid gap-3">
            <h2 className="eyebrow">Pesanan & outlet</h2>
            {c.projects.length === 0 ? (
              <p className="card p-5 text-sm text-muted">Client belum pernah memesan paket.</p>
            ) : (
              c.projects.map((p) => <ProjectCard key={p.id} p={p} />)
            )}
          </section>
        </div>

        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">Riwayat follow-up</h2>
          <FollowupTimeline items={c.followups} viewerId={viewer.id} isAdmin={false} />
        </section>
      </div>
    </>
  );
}

function ProjectCard({ p }: { p: ClientProject }) {
  const invoiceStatus = dict("id").orders.invoiceStatus as Record<string, string>;
  const status = p.status as ProjectStatus;
  return (
    <article className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-extrabold">{p.code}</span>
          <span className={`chip ${PROJECT_STATUS_TONE[status]}`}>{PROJECT_STATUS_LABEL[status]}</span>
        </h3>
        <span className="text-sm text-muted">
          {p.package_name} · {p.outlet_count} outlet · dipesan {dateTime(p.created_at, "id")}
        </span>
      </div>
      {p.invoices.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {p.invoices.map((i) => (
            <li key={i.code} className="chip">
              {i.code} · {rupiah(i.total)} · {invoiceStatus[i.status] ?? i.status}
              {i.status === "unpaid" && i.due_at ? ` · batas ${dateTime(i.due_at, "id")}` : ""}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{p.details_completed_at ? `Data outlet ditandai lengkap ${dateTime(p.details_completed_at, "id")}.` : "Data outlet belum ditandai lengkap oleh client."}</p>
      <ol className="grid gap-2 md:grid-cols-2">
        {p.outlets.map((o) => (
          <li key={o.id} className="grid content-start gap-1 rounded-xl border border-line p-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {o.position}. {o.name || "Nama belum diisi"}
              </span>
              <span className="chip">{o.city}</span>
              {o.is_competitor && <span className="chip border-accent text-mark">Kompetitor</span>}
            </span>
            <span className="text-muted">{o.address || "Alamat belum diisi"}</span>
            {o.maps_url && (
              <a href={o.maps_url} target="_blank" rel="noreferrer" className="w-fit font-semibold text-mark hover:underline">
                Buka di Maps ↗
              </a>
            )}
            {o.notes && <span className="text-xs text-muted">Catatan client: {o.notes}</span>}
          </li>
        ))}
      </ol>
    </article>
  );
}
