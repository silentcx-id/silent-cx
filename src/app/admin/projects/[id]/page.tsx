import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm, ReviewForm, VerifyForm } from "../project-actions";
import { OutletSchedule, QuestionnairePicker, type AdminTask, type Candidate, type OutletTasks, type QuestionnaireReview, type ReviewStatus } from "./scheduling";
import { InvoiceView } from "@/components/invoice-view";
import { pickTab, Tabs } from "@/components/tabs";
import { businessTypeLabel, getBusinessTypes } from "@/lib/catalog";
import { dayLabel, wibDate, windowLabel } from "@/lib/field";
import { clientPhones } from "@/lib/followups";
import { cleanTemplates, draftFromQuestionnaire, type QuestionnaireLike } from "@/lib/instructions";
import { ConfirmWa } from "./confirm-wa";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getProject, type Invoice, type PaymentProof, type Project } from "@/lib/orders";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/project-labels";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail proyek" };

// Penjadwalan (Fase 3): kuesioner proyek, tugas per outlet, calon shopper, dan hasil check-in.
async function Scheduling({ project }: { project: Project }) {
  const supabase = await createClient();
  await Promise.all([supabase.rpc("expire_offers"), supabase.rpc("questionnaire_review_tick")]);
  const [{ data: assigned }, { data: questionnaires }, { data: taskRows }, { data: field }, { data: rounds }, { data: company }] = await Promise.all([
    supabase.from("project_questionnaires").select("questionnaire_id, snapshot, assigned_at, review_id, questionnaire:questionnaires(project_id, instruction_templates)").eq("project_id", project.id).maybeSingle(),
    // Template umum dan salinan khusus proyek ini; salinan untuk proyek lain tidak ditawarkan.
    supabase.from("questionnaires").select("id, name").eq("active", true).or(`project_id.is.null,project_id.eq.${project.id}`).order("name"),
    supabase
      .from("audit_tasks")
      .select("*, task_offers(status, respond_by, urgent, followups, last_followup_at), visit_photos(id, kind)")
      .eq("project_id", project.id)
      .order("created_at"),
    supabase.from("app_settings").select("value").eq("key", "field").maybeSingle(),
    supabase.from("questionnaire_reviews").select("id, version, status, sent_at, due_at, decided_at, flags, additions").eq("project_id", project.id).order("sent_at", { ascending: false }),
    supabase.from("companies").select("name").eq("client_id", project.client_id).maybeSingle(),
  ]);
  type Round = { id: string; version: number; status: ReviewStatus; sent_at: string; due_at: string | null; decided_at: string | null; flags: NonNullable<QuestionnaireReview["request"]>["flags"]; additions: string };
  const history = (rounds ?? []) as Round[];
  const live = history.find((r) => r.id === assigned?.review_id);
  const lastRequest = history.find((r) => r.status === "changes_requested");
  const review: QuestionnaireReview = {
    status: live?.status ?? "none",
    version: live?.version ?? null,
    due_at: live?.due_at ?? null,
    decided_at: live?.decided_at ?? null,
    revisions_used: history.filter((r) => r.status === "changes_requested").length,
    request: lastRequest ? { version: lastRequest.version, decided_at: lastRequest.decided_at ?? lastRequest.sent_at, flags: lastRequest.flags ?? [], additions: lastRequest.additions } : null,
    history: history.map(({ id, version, status, sent_at, decided_at }) => ({ id, version, status, sent_at, decided_at })),
  };
  const options = await Promise.all(
    (questionnaires ?? []).map(async (q) => {
      const { data: issues } = await supabase.rpc("questionnaire_issues", { p_questionnaire: q.id });
      return { id: q.id as string, name: q.name as string, ready: !(issues ?? []).length };
    }),
  );

  const rows = (taskRows ?? []) as (Omit<AdminTask, "shopper" | "offer" | "photos" | "candidates"> & {
    outlet_id: string;
    shopper_id: string | null;
    task_offers: { status: string; respond_by: string; urgent: boolean; followups: number; last_followup_at: string | null }[];
    visit_photos: AdminTask["photos"];
  })[];
  const shopperIds = [...new Set(rows.map((r) => r.shopper_id).filter((x): x is string => Boolean(x)))];
  const { data: people } = shopperIds.length ? await supabase.from("profiles").select("id, full_name, phone").in("id", shopperIds) : { data: [] };
  const personOf = new Map((people ?? []).map((p) => [p.id as string, { full_name: p.full_name as string, phone: p.phone as string | null }]));

  const tasks: (AdminTask & { outlet_id: string })[] = await Promise.all(
    rows.map(async ({ task_offers, visit_photos, shopper_id, ...r }) => {
      const candidates = r.status === "open" ? (((await supabase.rpc("admin_task_candidates", { p_task: r.id })).data ?? []) as Candidate[]) : [];
      const offer = task_offers.find((o) => o.status === "offered") ?? null;
      return { ...r, shopper: shopper_id ? (personOf.get(shopper_id) ?? null) : null, offer, photos: visit_photos ?? [], candidates };
    }),
  );
  const outlets: OutletTasks[] = project.project_outlets.map((o) => ({ ...o, tasks: tasks.filter((t) => t.outlet_id === o.id) }));

  const copyOf = assigned?.questionnaire as unknown as { project_id: string | null; instruction_templates: unknown } | null;
  const settings = (field?.value ?? {}) as { default_fee?: number; default_response_hours?: number };
  const defaults = {
    fee: settings.default_fee ?? 150000,
    reimburse: project.package_snapshot.purchase_allowance ?? 50000,
    hours: settings.default_response_hours ?? 24,
    today: wibDate(),
    inAWeek: wibDate(7),
    questionnaireApproved: review.status === "approved" || review.status === "auto_approved" || review.status === "final",
    // Template instruksi dari kuesioner proyek; draf otomatis dari isi kuesioner selalu tersedia di urutan pertama.
    instructions: assigned ? [draftFromQuestionnaire(assigned.snapshot as QuestionnaireLike), ...cleanTemplates(copyOf?.instruction_templates)] : [],
    brand: (company?.name as string | undefined) ?? "",
  };
  const locked = tasks.some((t) => t.status === "in_progress" || t.status === "submitted");
  const current = assigned
    ? {
        id: assigned.questionnaire_id as string | null,
        name: (assigned.snapshot as { name?: string }).name ?? "Kuesioner",
        assigned_at: assigned.assigned_at as string,
        projectCopy: copyOf?.project_id === project.id,
      }
    : null;
  const canCreate = Boolean(assigned) && Boolean(project.details_completed_at);
  const visitsPlanned = project.package_snapshot.visits ?? 1;
  const { data: earliest } = await supabase.rpc("reaudit_earliest_visit", { p_project: project.id });

  return (
    <section className="grid gap-4">
      <h2 className="eyebrow">Penjadwalan kunjungan</h2>
      {!project.details_completed_at && (
        <p className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">Client belum menandai data outlet lengkap. Tugas bisa dibuat setelah itu.</p>
      )}
      {earliest && (
        <p className="rounded-xl border border-accent bg-accent/10 p-4 text-sm">
          Audit ulang: jendela kunjungan paling cepat mulai <strong>{dayLabel(earliest)}</strong> (30 hari setelah laporan sebelumnya terbit).
        </p>
      )}
      {project.entitlements.includes("custom_scope") && (
        <p className="rounded-xl border border-line p-4 text-sm">
          <strong>Brief kuesioner khusus:</strong> {project.custom_brief || "Belum diisi client."}
        </p>
      )}
      <QuestionnairePicker projectId={project.id} current={current} options={options} locked={locked} review={review} />
      {outlets.map((o) => (
        <OutletSchedule key={o.id} outlet={o} defaults={defaults} canCreate={canCreate} visitsPlanned={o.is_competitor ? 1 : visitsPlanned + (o.extra_visits ?? 0)} />
      ))}
    </section>
  );
}

const REASON: Record<string, string> = {
  quote: "Ada add-on yang harganya perlu diisi admin.",
  city: "Ada outlet di kota yang belum ada di daftar kota dilayani.",
  addon: "Ada add-on yang perlu persetujuan admin.",
};

const TABS = ["ringkasan", "outlet", "jadwal", "pembayaran"] as const;

export default async function ProjectDetail({ params, searchParams }: PageProps<"/admin/projects/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await requireRole("admin", `/admin/projects/${id}`);
  const project = await getProject(id);
  if (!project) notFound();
  const supabase = await createClient();
  const [{ data: client }, { data: company }, { data: cities }, types, { data: windows }, { data: lastConfirm }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone").eq("id", project.client_id).single(),
    supabase.from("companies").select("*").eq("client_id", project.client_id).maybeSingle(),
    supabase.from("service_cities").select("name").eq("active", true),
    getBusinessTypes(),
    supabase.from("audit_tasks").select("outlet_id, window_start, window_end, hours_start, hours_end").eq("project_id", project.id).neq("status", "cancelled").order("window_start"),
    supabase
      .from("client_followups")
      .select("created_at, staff:profiles!client_followups_staff_id_fkey(full_name)")
      .eq("project_id", project.id)
      .eq("purpose", "project_confirm")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const served = new Set((cities ?? []).map((c) => c.name.trim().toLowerCase()));
  const invoice = project.invoices[0];
  const settlement = project.invoices.find((i) => i.kind === "settlement");
  // Invoice yang buktinya menunggu diperiksa: pesanan, atau tagihan tambahan setelah laporan terbit.
  const verifyingInvoice = project.invoices.find((i) => i.status === "verifying");
  const pendingProof = verifyingInvoice?.payment_proofs.find((p) => p.status === "pending");
  const open = ["awaiting_review", "awaiting_payment", "verifying"].includes(project.status);
  const needsReview = project.status === "awaiting_review" && Boolean(invoice);
  const outside = project.project_outlets.filter((o) => !served.has(o.city.trim().toLowerCase())).length;
  const extraTotal = project.addons_snapshot.filter((a) => a.item_key === "additional_visit").reduce((n, a) => n + a.quantity, 0);
  const extraShared = project.project_outlets.reduce((n, o) => n + (o.extra_visits ?? 0), 0);
  const parentCode = project.parent_project_id
    ? ((await supabase.from("projects").select("code").eq("id", project.parent_project_id).maybeSingle()).data?.code as string | undefined)
    : undefined;
  // Proyek aktif tanpa bukti bayar yang menunggu langsung dibuka di tab jadwal, karena itu pekerjaan utamanya.
  const tab = pickTab(query.tab, TABS, project.status === "active" && !pendingProof ? "jadwal" : "ringkasan");
  const proofs = project.invoices.flatMap((i) => i.payment_proofs.map((p) => ({ ...p, invoiceCode: i.code })));
  const invoiceStatus = dict("id").orders.invoiceStatus;

  return (
    <>
      <Link href="/admin/projects" className="text-sm text-muted hover:text-fg">
        ← Semua proyek
      </Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-mono text-[clamp(26px,4vw,36px)] font-extrabold">{project.code}</h1>
          <p className="text-muted">
            {client?.full_name || "—"} · {project.package_snapshot.name} · {project.outlet_count} outlet · dipesan {dateTime(project.created_at, "id")}
          </p>
        </div>
        <span className={`chip ${PROJECT_STATUS_TONE[project.status]}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
      </section>

      <section className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Konfirmasi ke client">
        <ConfirmWa
          clientId={project.client_id}
          projectId={project.id}
          phones={clientPhones({ pic_name: company?.pic_name, pic_phone: company?.pic_phone, full_name: client?.full_name, phone: client?.phone })}
          hasSchedule={(windows ?? []).length > 0}
          base={{
            name: company?.pic_name || client?.full_name || "",
            brand: company?.name ?? "",
            projectCode: project.code,
            packageName: project.package_snapshot.name,
            statusLabel: PROJECT_STATUS_LABEL[project.status],
            admin: viewer.fullName,
            outlets: project.project_outlets.map((o) => {
              const w = (windows ?? []).find((x) => x.outlet_id === o.id);
              return { position: o.position, name: o.name, city: o.city, address: o.address, maps_url: o.maps_url, is_competitor: o.is_competitor, window: w ? windowLabel(w) : null };
            }),
          }}
        />
        {lastConfirm && (
          <span className="text-xs text-muted">
            Terakhir dikonfirmasi {dateTime(lastConfirm.created_at as string, "id")}
            {(lastConfirm.staff as unknown as { full_name: string } | null)?.full_name ? ` oleh ${(lastConfirm.staff as unknown as { full_name: string }).full_name}` : ""}
          </span>
        )}
      </section>

      <Tabs
        base={`/admin/projects/${project.id}`}
        label="Bagian proyek"
        current={tab}
        items={[
          { id: "ringkasan", label: "Ringkasan", count: needsReview || pendingProof ? 1 : 0 },
          { id: "outlet", label: "Outlet", count: project.project_outlets.length },
          { id: "jadwal", label: "Jadwal kunjungan" },
          { id: "pembayaran", label: "Pembayaran", count: pendingProof ? 1 : 0 },
        ]}
      />

      {tab === "ringkasan" && (
        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <div className="grid gap-6">
            {needsReview && invoice && (
              <section className="card grid gap-4 border-warn/60 p-5">
                <h2 className="text-xl font-extrabold">Tinjau pesanan</h2>
                <ul className="list-disc pl-5 text-sm">
                  {project.review_reasons.map((r) => (
                    <li key={r}>{REASON[r] ?? r}</li>
                  ))}
                </ul>
                <ReviewForm
                  projectId={project.id}
                  pendingLines={invoice.invoice_lines.filter((l) => l.amount == null)}
                  cities={project.project_outlets.filter((o) => !served.has(o.city.trim().toLowerCase())).map((o) => o.city)}
                />
              </section>
            )}

            {verifyingInvoice && pendingProof && <VerifyCard invoice={verifyingInvoice} proof={pendingProof} />}

            <section className="card grid gap-4 p-5">
              <h2 className="text-xl font-extrabold">Pesanan</h2>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Fact label="Paket" value={project.package_snapshot.name} />
                <Fact
                  label="Kunjungan per outlet"
                  value={`${project.package_snapshot.visits ?? 1}${extraTotal ? ` · +${extraTotal} kunjungan tambahan (${extraShared}/${extraTotal} dibagikan client)` : ""}`}
                />
                {project.parent_project_id && <Fact label="Audit ulang dari" value={parentCode ?? "Proyek sebelumnya"} />}
                {project.entitlements.includes("priority") && <Fact label="Laporan" value="Express: 2 hari kerja setelah kunjungan terakhir lolos QC" />}
                <Fact label="Outlet" value={`${project.outlet_count} outlet${outside ? ` · ${outside} di luar kota dilayani` : ""}`} />
                <Fact label="Data outlet" value={project.details_completed_at ? `Lengkap sejak ${dateTime(project.details_completed_at, "id")}` : "Belum ditandai lengkap"} />
                <Fact label="Total pesanan" value={invoice ? rupiah(invoice.total) : "—"} />
                <Fact label="Status invoice" value={invoice ? invoiceStatus[invoice.status] : "—"} />
                {invoice && !project.parent_project_id && (
                  <Fact
                    label="Cara bayar"
                    value={invoice.dp_amount != null ? `DP ${rupiah(invoice.dp_amount)} · sisa ${rupiah(invoice.total - invoice.dp_amount)} ditagih saat laporan siap` : "Bayar penuh"}
                  />
                )}
                {settlement && <Fact label="Pelunasan" value={`${settlement.code} · ${rupiah(settlement.total)} · ${invoiceStatus[settlement.status]}`} />}
              </dl>
              {project.addons_snapshot.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {project.addons_snapshot.map((a) => (
                    <li key={a.item_key} className="chip">
                      {a.label}
                      {a.quantity > 1 ? ` × ${a.quantity}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {project.status_note && (
                <p className="rounded-xl border border-line p-4 text-sm">
                  <strong>Catatan terakhir:</strong> {project.status_note}
                </p>
              )}
            </section>
          </div>

          <div className="grid gap-6">
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
                      {company.name || "—"} {company.industry && `· ${businessTypeLabel(types, company.industry, "id")}`}
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
            {open && <CancelForm projectId={project.id} />}
          </div>
        </div>
      )}

      {tab === "outlet" && (
        <section className="grid gap-3">
          <p className="text-sm text-muted">{project.details_completed_at ? `Ditandai lengkap oleh client ${dateTime(project.details_completed_at, "id")}.` : "Client belum menandai data outlet lengkap."}</p>
          <ol className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {project.project_outlets.map((o) => (
              <li key={o.id} className="card grid content-start gap-1 p-4 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {o.position}. {o.name || "Nama belum diisi"}
                  </span>
                  <span className="chip">{o.city}</span>
                  {o.is_competitor && <span className="chip border-accent text-mark">Kompetitor</span>}
                  {(o.extra_visits ?? 0) > 0 && <span className="chip">+{o.extra_visits} kunjungan tambahan</span>}
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
      )}

      {tab === "jadwal" &&
        (project.status === "active" ? (
          <Scheduling project={project} />
        ) : (
          <p className="card p-6 text-muted">
            {project.status === "reporting" || project.status === "completed"
              ? "Semua kunjungan proyek ini sudah selesai."
              : "Penjadwalan kunjungan dibuka setelah pembayaran diverifikasi dan proyek aktif."}
          </p>
        ))}

      {tab === "pembayaran" && (
        <div className="grid gap-6">
          {verifyingInvoice && pendingProof && <VerifyCard invoice={verifyingInvoice} proof={pendingProof} />}
          {project.invoices.length === 0 ? (
            <p className="card p-6 text-muted">Belum ada invoice.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              {project.invoices.map((inv) => (
                <InvoiceView key={inv.id} invoice={inv} projectCode={project.code} lang="id" pdfHref={`/admin/invoices/${inv.id}/pdf`} />
              ))}
            </div>
          )}
          {proofs.length > 0 && (
            <section className="card grid gap-3 p-5">
              <h2 className="text-xl font-extrabold">Riwayat bukti bayar</h2>
              <ul className="grid gap-2 text-sm">
                {proofs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                    <span>
                      <span className="font-mono">{p.invoiceCode}</span> · {dateTime(p.uploaded_at, "id")} · {p.method === "qris" ? "QRIS" : "Transfer"} · {rupiah(p.amount)}
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
        </div>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

// Bukti bayar yang menunggu diperiksa; tampil di tab Ringkasan dan Pembayaran.
function VerifyCard({ invoice, proof }: { invoice: Invoice; proof: PaymentProof }) {
  return (
    <section className="card grid gap-4 border-accent p-5">
      <h2 className="text-xl font-extrabold">{invoice.kind === "settlement" ? "Verifikasi pelunasan" : invoice.kind === "excess" ? "Verifikasi tagihan tambahan" : invoice.kind === "consultation" ? "Verifikasi konsultasi tambahan" : "Verifikasi pembayaran"}</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Tagihan</dt>
          <dd className="font-display text-xl font-extrabold tabular-nums">{rupiah(invoice.total)}</dd>
        </div>
        <div>
          <dt className="text-muted">Dibayar menurut client</dt>
          <dd className={`font-display text-xl font-extrabold tabular-nums ${proof.amount !== invoice.total ? "text-bad" : "text-good"}`}>{rupiah(proof.amount)}</dd>
        </div>
        <div>
          <dt className="text-muted">Metode</dt>
          <dd>{proof.method === "qris" ? "QRIS" : "Transfer bank"}</dd>
        </div>
        <div>
          <dt className="text-muted">Pengirim</dt>
          <dd>{proof.payer_name || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Dikirim</dt>
          <dd>{dateTime(proof.uploaded_at, "id")}</dd>
        </div>
      </dl>
      <VerifyForm invoiceId={invoice.id} proofId={proof.id} extra={invoice.kind !== "order"} />
    </section>
  );
}
