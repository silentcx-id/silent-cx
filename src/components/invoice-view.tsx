import { dateTime, rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import type { Invoice, InvoiceStatus } from "@/lib/orders";

export const INVOICE_TONE: Record<InvoiceStatus, string> = {
  draft: "border-warn/50 text-warn",
  unpaid: "border-warn/50 text-warn",
  verifying: "border-accent text-mark",
  paid: "border-good/50 text-good",
  expired: "border-bad/50 text-bad",
  cancelled: "border-bad/50 text-bad",
};

export function InvoiceStatusChip({ status, lang }: { status: InvoiceStatus; lang: Lang }) {
  return <span className={`chip ${INVOICE_TONE[status]}`}>{dict(lang).orders.invoiceStatus[status]}</span>;
}

// Rincian invoice: kode, status, batas bayar, baris harga (harga promo dengan harga normal dicoret), dan total.
export function InvoiceView({ invoice, projectCode, lang, pdfHref }: { invoice: Invoice; projectCode?: string; lang: Lang; pdfHref?: string }) {
  const t = dict(lang).orders;
  return (
    <section className="card grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="font-mono text-sm text-muted">
            {invoice.code}
            {projectCode ? ` · ${projectCode}` : ""}
          </span>
          <span className="text-sm text-muted">
            {invoice.status === "paid" && invoice.paid_at ? t.paidAt(dateTime(invoice.paid_at, lang)) : invoice.due_at && invoice.status === "unpaid" ? t.dueAt(dateTime(invoice.due_at, lang)) : dateTime(invoice.created_at, lang)}
          </span>
        </div>
        <InvoiceStatusChip status={invoice.status} lang={lang} />
      </div>
      <div>
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 font-semibold">{t.item}</th>
              <th className="w-32 py-2 text-right font-semibold">{t.amount}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoice_lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="break-words py-2 pr-3">
                  {l.label}
                  {l.quantity > 1 && <span className="text-muted"> × {l.quantity}</span>}
                  {!!l.details?.length && (
                    <span className="mt-1 block text-xs text-muted" data-testid="line-details">
                      {l.details.map((d) => `${d.label} ${rupiah(d.amount)}`).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2 text-right align-top tabular-nums">
                  {l.amount == null ? (
                    <span className="text-muted">{t.pendingQuote}</span>
                  ) : (
                    <>
                      {l.list_price != null && l.list_price * l.quantity !== l.amount && <s className="block text-xs text-muted">{rupiah(l.list_price * l.quantity)}</s>}
                      {rupiah(l.amount)}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="font-semibold">
          {t.total} <span className="text-xs font-normal text-muted">({t.totalNote})</span>
        </span>
        <span className="font-display text-2xl font-extrabold tabular-nums">{rupiah(invoice.total)}</span>
      </div>
      {invoice.dp_amount != null && (
        <dl className="grid gap-1 rounded-lg border border-accent bg-accent/10 p-3 text-sm" data-testid="dp-summary">
          <div className="flex justify-between gap-3">
            <dt>{invoice.status === "paid" ? t.dpPaid : t.dpNow}</dt>
            <dd className="font-semibold tabular-nums">{rupiah(invoice.dp_amount)}</dd>
          </div>
          <div className="flex justify-between gap-3 text-muted">
            <dt>{t.settlementLater}</dt>
            <dd className="tabular-nums">{rupiah(invoice.total - invoice.dp_amount)}</dd>
          </div>
        </dl>
      )}
      {pdfHref && invoice.status !== "draft" && (
        <a href={pdfHref} className="btn btn-sm w-fit">
          {t.downloadPdf}
        </a>
      )}
    </section>
  );
}
