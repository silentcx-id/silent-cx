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
    thread?: string;
    preview?: string;
    home?: string;
    version?: number;
    auto?: boolean;
    old_email?: string;
    locked?: boolean;
    new_email?: string;
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
      return d.locked ? t.reportReadyLocked(code, rupiah(d.total ?? 0)) : t.reportPublished(code);
    case "report.unlocked":
      return t.reportUnlocked(code);
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
    case "questionnaire.review":
      return t.questionnaireReview(code, when(d.due));
    case "questionnaire.reminder":
      return t.questionnaireReminder(code, when(d.due));
    case "questionnaire.auto_approved":
      return t.questionnaireAutoApproved(code);
    case "questionnaire.final":
      return t.questionnaireFinal(code);
    case "admin.questionnaire_changes":
      return t.adminQuestionnaireChanges(name, code, Number(d.count ?? 0));
    case "admin.questionnaire_approved":
      return d.auto ? t.adminQuestionnaireAutoApproved(name, code) : t.adminQuestionnaireApproved(name, code);
    case "account.email_changed":
      return t.emailChanged(d.old_email ?? "—", d.new_email ?? "—");
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
    case "admin.chat":
      return t.adminChat(name, d.preview ?? "");
    case "chat.reply":
      return t.chatReply(d.preview ?? "");
    default:
      return n.kind;
  }
}

// Halaman terkait yang bisa dibuka langsung dari notifikasi.
export function notificationLink(n: Notification, lang: Lang): { href: string; label: string } | null {
  const t = dict(lang).notifications;
  const d = n.detail;
  if (["task.offered", "task.revision", "task.approved", "task.rejected"].includes(n.kind) && d.task) return { href: `/shopper/assignments/${d.task}`, label: t.openTask };
  if (n.kind === "report.published" && d.locked) return { href: "/app/billing", label: t.paySettlement };
  if ((n.kind === "report.published" || n.kind === "report.unlocked") && d.project) return { href: `/app/reports/${d.project}`, label: t.openReport };
  if (n.kind === "payout.paid" || n.kind === "payout.proof_replaced") return { href: "/shopper/payments", label: t.openPayments };
  if (n.kind === "payout.need_bank") return { href: "/shopper/profile", label: t.openProfile };
  if (n.kind === "application.approved") return { href: "/shopper/profile", label: t.openProfile };
  if (n.kind.startsWith("consultation.")) return { href: d.consultation ? `/app/consultation/${d.consultation}` : "/app/consultation", label: t.openConsultation };
  if (n.kind.startsWith("order.") || n.kind.startsWith("invoice.")) return { href: "/app/billing", label: t.openBilling };
  if (n.kind.startsWith("questionnaire.") && d.project) return { href: `/app/questionnaire/${d.project}`, label: t.openQuestionnaire };
  if (n.kind.startsWith("admin.questionnaire_") && d.project) return { href: `/admin/projects/${d.project}?tab=jadwal`, label: t.openProject };
  if (n.kind === "project.started") return { href: "/app/audits", label: t.openAudits };
  if (n.kind === "admin.application" && d.application) return { href: `/admin/accounts/applications/${d.application}`, label: t.openApplication };
  if (n.kind === "admin.payment" && d.project) return { href: `/admin/projects/${d.project}`, label: t.openPayment };
  if (n.kind === "admin.visit_submitted" && d.task) return { href: `/admin/qc/${d.task}`, label: t.openQc };
  if ((n.kind === "admin.offer_declined" || n.kind === "admin.offer_expired") && d.project) return { href: `/admin/projects/${d.project}`, label: t.openProject };
  // ?chat=1 membuka panel live chat di dashboard pengguna.
  if (n.kind === "chat.reply") return { href: `${d.home === "/shopper" ? "/shopper" : "/app"}?chat=1`, label: t.openChat };
  if (n.kind === "admin.chat" && d.thread) return { href: `/admin/chat?t=${d.thread}`, label: t.replyChat };
  if (n.kind.startsWith("admin.consultation_") && d.consultation) return { href: `/admin/consultations/${d.consultation}`, label: t.openConsultation };
  return null;
}
