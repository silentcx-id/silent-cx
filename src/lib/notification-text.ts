import { date, dateTime, rupiah } from "./format";
import { dict, type Lang } from "./i18n";

export type Notification = {
  id: number;
  kind: string;
  detail: {
    note?: string;
    reapply_at?: string;
    task?: string;
    code?: string;
    city?: string;
    respond_by?: string;
    urgent?: boolean;
    due?: string;
    fee?: string;
    project?: string;
    payout?: string;
    total?: number;
    consultation?: string;
    starts_at?: string;
    count?: number;
    application?: string;
    invoice?: string;
    name?: string;
    resubmitted?: boolean;
  };
  read_at: string | null;
  created_at: string;
};

// Teks notifikasi disusun dari jenisnya supaya mengikuti bahasa pengguna.
export function notificationText(n: Notification, lang: Lang): string {
  const t = dict(lang).notifications;
  const d = n.detail;
  const code = d.code ?? "";
  const note = d.note || "—";
  const name = d.name || "—";
  const when = (v?: string) => (v ? dateTime(v, lang) : "—");
  switch (n.kind) {
    case "application.approved":
      return t.approved;
    case "application.rejected":
      return `${t.rejected(note)}${d.reapply_at ? ` ${t.reapplyAt(date(d.reapply_at, lang))}` : ""}`;
    case "task.offered":
      return t.taskOffered(code, d.city ?? "—", when(d.respond_by));
    case "task.withdrawn":
      return t.taskWithdrawn(code);
    case "task.cancelled":
      return t.taskCancelled(code, note);
    case "task.approved":
      return t.taskApproved(code);
    case "task.revision":
      return t.taskRevision(code, note, when(d.due));
    case "task.rejected":
      return t.taskRejected(code, note);
    case "report.published":
      return t.reportPublished(code);
    case "payout.paid":
      return t.payoutPaid(code, rupiah(d.total ?? 0));
    case "payout.need_bank":
      return t.payoutNeedBank(code);
    case "payout.proof_replaced":
      return t.payoutProofReplaced(code, note);
    case "consultation.link":
      return t.consultationLink(code, when(d.starts_at));
    case "consultation.rescheduled":
      return t.consultationRescheduled(code, when(d.starts_at), note);
    case "consultation.cancelled":
      return t.consultationCancelled(code, note);
    case "consultation.done":
      return t.consultationDone(code);
    case "consultation.no_show":
      return t.consultationNoShow(code);
    case "consultation.credited":
      return t.consultationCredited(Number(d.count ?? 0));
    case "order.ready":
      return t.orderReady(code);
    case "order.cancelled":
      return t.orderCancelled(code, note);
    case "invoice.paid":
      return t.invoicePaid(code);
    case "invoice.rejected":
      return t.invoiceRejected(code, note);
    case "invoice.due_soon":
      return t.invoiceDueSoon(code, rupiah(d.total ?? 0), when(d.due));
    case "project.started":
      return t.projectStarted(code);
    case "admin.application":
      return t.adminApplication(name);
    case "admin.payment":
      return t.adminPayment(name, code, rupiah(d.total ?? 0));
    case "admin.visit_submitted":
      return d.resubmitted ? t.adminVisitResubmitted(code) : t.adminVisitSubmitted(code);
    case "admin.offer_declined":
      return t.adminOfferDeclined(name, code, note);
    case "admin.offer_expired":
      return t.adminOfferExpired(name, code);
    case "admin.consultation_booked":
      return t.adminConsultationBooked(name, code, when(d.starts_at));
    case "admin.consultation_rescheduled":
      return t.adminConsultationRescheduled(name, code, when(d.starts_at));
    default:
      return n.kind;
  }
}

// Halaman terkait yang bisa dibuka langsung dari notifikasi.
export function notificationLink(n: Notification, lang: Lang): { href: string; label: string } | null {
  const t = dict(lang).notifications;
  const d = n.detail;
  if (["task.offered", "task.revision", "task.approved", "task.rejected"].includes(n.kind) && d.task) return { href: `/shopper/assignments/${d.task}`, label: t.openTask };
  if (n.kind === "report.published" && d.project) return { href: `/app/reports/${d.project}`, label: t.openReport };
  if (n.kind === "payout.paid" || n.kind === "payout.proof_replaced") return { href: "/shopper/payments", label: t.openPayments };
  if (n.kind === "payout.need_bank") return { href: "/shopper/profile", label: t.openProfile };
  if (n.kind === "application.approved") return { href: "/shopper/profile", label: t.openProfile };
  if (n.kind.startsWith("consultation.")) return { href: d.consultation ? `/app/consultation/${d.consultation}` : "/app/consultation", label: t.openConsultation };
  if (n.kind.startsWith("order.") || n.kind.startsWith("invoice.")) return { href: "/app/billing", label: t.openBilling };
  if (n.kind === "project.started") return { href: "/app/audits", label: t.openAudits };
  if (n.kind === "admin.application" && d.application) return { href: `/admin/accounts/applications/${d.application}`, label: t.openApplication };
  if (n.kind === "admin.payment" && d.project) return { href: `/admin/projects/${d.project}`, label: t.openPayment };
  if (n.kind === "admin.visit_submitted" && d.task) return { href: `/admin/qc/${d.task}`, label: t.openQc };
  if ((n.kind === "admin.offer_declined" || n.kind === "admin.offer_expired") && d.project) return { href: `/admin/projects/${d.project}`, label: t.openProject };
  if (n.kind.startsWith("admin.consultation_") && d.consultation) return { href: `/admin/consultations/${d.consultation}`, label: t.openConsultation };
  return null;
}
