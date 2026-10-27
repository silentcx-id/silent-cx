import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm, ReviewForm, VerifyForm } from "../project-actions";
import { InvoiceView } from "@/components/invoice-view";
import { dateTime, rupiah } from "@/lib/format";
import { getProject } from "@/lib/orders";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/project-labels";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail proyek" };

const REASON: Record<string, string> = {
  quote: "Ada add-on yang harganya perlu diisi admin.",
  city: "Ada outlet di kota yang belum ada di daftar kota dilayani.",
  addon: "Ada add-on yang perlu persetujuan admin.",
};

export default async function ProjectDetail({ params }: PageProps<"/admin/projects/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/projects/${id}`);
  const project = await getProject(id);
  if (!project) notFound();
  const supabase = await createClient();
  const [{ data: client }, { data: company }, { data: cities }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone").eq("id", project.client_id).single(),
    supabase.from("companies").select("*").eq("client_id", project.client_id).maybeSingle(),
    supabase.from("service_cities").select("name").eq("active", true),
  ]);
  const served = new Set((cities ?? []).map((c) => c.name.trim().toLowerCase()));
  const invoice = project.invoices[0];
  const pendingProof = invoice?.payment_proofs.find((p) => p.status === "pending");
  const open = ["awaiting_review", "awaiting_payment", "verifying"].includes(project.status);

  return (
    <>
      <Link href="/admin/projects" className="text-sm text-muted hover:text-fg">
        ← Semua proyek
      </Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-mono text-[clamp(26px,4vw,36px)] font-extrabold">{project.code}</h1>
          <p className="text-muted">
            {project.package_snapshot.name} · {project.outlet_count} outlet · dipesan {dateTime(project.created_at, "id")}
          </p>
        </div>
        <span className={`chip ${PROJECT_STATUS_TONE[project.status]}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:items-start">
        <div className="grid gap-6">
          {project.status === "awaiting_review" && invoice && (
            <section className="card grid gap-4 border-warn/60 p-5">
              <h2 className="text-xl font-extrabold">Tinjau pesanan</h2>
              <ul className="list-disc pl-5 text-sm">
                {project.review_reasons.map((r) => (
                  <li key={r}>{REASON[r] ?? r}</li>
                ))}
              </ul>
              <ReviewForm projectId={project.id} pendingLines={invoice.invoice_lines.filter((l) => l.amount == null)} />
            </section>
          )}

          {project.status === "verifying" && invoice && pendingProof && (
            <section className="card grid gap-4 border-accent p-5">
              <h2 className="text-xl font-extrabold">Verifikasi pembayaran</h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Tagihan</dt>
                  <dd className="font-display text-xl font-extrabold tabular-nums">{rupiah(invoice.total)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Dibayar menurut client</dt>
                  <dd className={`font-display text-xl font-extrabold tabular-nums ${pendingProof.amount !== invoice.total ? "text-bad" : "text-good"}`}>{rupiah(pendingProof.amount)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Metode</dt>
                  <dd>{pendingProof.method === "qris" ? "QRIS" : "Transfer bank"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Pengirim</dt>
                  <dd>{pendingProof.payer_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Dikirim</dt>
                  <dd>{dateTime(pendingProof.uploaded_at, "id")}</dd>
                </div>
              </dl>
              <VerifyForm invoiceId={invoice.id} proofId={pendingProof.id} />
            </section>
          )}

          {project.status_note && (
            <p className="rounded-xl border border-line p-4 text-sm">
              <strong>Catatan terakhir:</strong> {project.status_note}
            </p>
          )}

          <section className="card grid gap-3 p-5">
            <h2 className="text-xl font-extrabold">Client</h2>
            <p>
              <span className="font-semibold">{client?.full_name || "—"}</span> · {client?.email} {client?.phone && <span className="font-mono text-sm">· {client.phone}</span>}
            </p>
            {company ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Perusahaan</dt>
                  <dd>
                    {company.name || "—"} {company.industry && `· ${company.industry}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">PIC</dt>
                  <dd>
                    {company.pic_name || "—"} {company.pic_position && `(${company.pic_position})`} {company.pic_phone && <span className="font-mono">{company.pic_phone}</span>}
                  </dd>
                </div>
                {company.address && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Alamat kantor</dt>
                    <dd>
                      {company.address}, {company.city}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted">Data perusahaan belum diisi.</p>
            )}
            {project.objectives && (
              <p className="text-sm">
                <span className="text-muted">Tujuan audit:</span> {project.objectives}
              </p>
            )}
          </section>

          <section className="card grid gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-extrabold">Outlet</h2>
              <span className="text-sm text-muted">{project.details_completed_at ? `Ditandai lengkap ${dateTime(project.details_completed_at, "id")}` : "Belum ditandai lengkap"}</span>
            </div>
            <ol className="grid gap-2">
              {project.project_outlets.map((o) => (
                <li key={o.id} className="grid gap-0.5 rounded-lg border border-line p-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {o.position}. {o.name || "Nama belum diisi"}
                    </span>
                    <span className="chip">{o.city}</span>
                    {!served.has(o.city.trim().toLowerCase()) && <span className="chip border-warn/50 text-warn">Di luar kota dilayani</span>}
                  </span>
                  {o.address && <span className="text-muted">{o.address}</span>}
                  {o.maps_url && (
                    <a href={o.maps_url} target="_blank" rel="noreferrer" className="w-fit text-mark underline underline-offset-4">
                      Google Maps ↗
                    </a>
                  )}
                  {o.notes && <span className="text-muted">Catatan: {o.notes}</span>}
                </li>
              ))}
            </ol>
          </section>

          {invoice && invoice.payment_proofs.length > 0 && (
            <section className="card grid gap-3 p-5">
              <h2 className="text-xl font-extrabold">Riwayat bukti bayar</h2>
              <ul className="grid gap-2 text-sm">
                {invoice.payment_proofs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                    <span>
                      {dateTime(p.uploaded_at, "id")} · {p.method === "qris" ? "QRIS" : "Transfer"} · {rupiah(p.amount)}
                    </span>
                    <span className={`chip ${p.status === "accepted" ? "text-good" : p.status === "rejected" ? "text-bad" : "text-mark"}`}>
                      {p.status === "accepted" ? "Diterima" : p.status === "rejected" ? "Ditolak" : "Menunggu"}
                    </span>
                    {p.review_note && <span className="w-full text-muted">{p.review_note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open && <CancelForm projectId={project.id} />}
        </div>
        {invoice && <InvoiceView invoice={invoice} projectCode={project.code} lang="id" />}
      </div>
    </>
  );
}
