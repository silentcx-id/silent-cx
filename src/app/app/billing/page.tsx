import type { Metadata } from "next";
import Link from "next/link";
import { PaymentPanel } from "./payment-panel";
import { InvoiceStatusChip, InvoiceView } from "@/components/invoice-view";
import { getPaymentSettings } from "@/lib/catalog";
import { dateTime, rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getClientProjects } from "@/lib/orders";
import { getLang } from "@/lib/prefs";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Tagihan" };

export default async function BillingPage() {
  const [viewer, lang] = await Promise.all([requireRole("client", "/app/billing"), getLang()]);
  const t = dict(lang).orders;
  const [projects, settings] = await Promise.all([getClientProjects(viewer.id), getPaymentSettings()]);
  const withInvoice = projects.filter((p) => p.invoices[0]);
  const current = withInvoice[0];
  const invoice = current?.invoices[0];
  const rejected = invoice?.payment_proofs.find((p) => p.status === "rejected");
  // Tagihan tambahan kelebihan pembelian (terbit bersama laporan).
  const extras = projects.flatMap((p) => p.invoices.filter((i) => i.kind === "excess" && i.status !== "cancelled").map((i) => ({ invoice: i, code: p.code })));

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">{t.billingTitle}</h1>
      </section>

      {extras.map(({ invoice: x, code }) => (
        <section key={x.id} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:items-start">
          <div className="card grid gap-3 border-accent p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold">{t.excessTitle}</h2>
              <InvoiceStatusChip status={x.status} lang={lang} />
            </div>
            <p className="text-sm text-muted">{t.excessLede}</p>
            {x.status === "unpaid" && (
              <>
                {x.status_note && (
                  <p className="text-sm">
                    <strong>{t.adminNote}</strong> {x.status_note}
                  </p>
                )}
                <PaymentPanel invoiceId={x.id} total={x.total} settings={settings} lang={lang} />
              </>
            )}
            {x.status === "verifying" && <p className="text-sm">{t.stageVerifyLede}</p>}
          </div>
          <InvoiceView invoice={x} projectCode={code} lang={lang} pdfHref={`/app/billing/${x.id}/pdf`} />
        </section>
      ))}

      {!current || !invoice ? (
        <section className="card grid max-w-xl gap-4 p-6">
          <p className="text-muted">{t.noInvoices}</p>
          <Link href="/app/paket" className="btn btn-primary w-fit">
            {dict(lang).client.choosePackage} →
          </Link>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:items-start">
          <div className="grid gap-6">
            {invoice.status === "draft" && (
              <section className="grid gap-2 rounded-xl border border-warn/50 bg-warn/10 p-5">
                <h2 className="text-lg font-extrabold">{t.stageReviewTitle}</h2>
                <p className="text-sm">{t.stageReviewLede}</p>
                <ul className="list-disc pl-5 text-sm">
                  {current.review_reasons.map((r) => (
                    <li key={r}>{t.reasons[r]}</li>
                  ))}
                </ul>
              </section>
            )}
            {invoice.status === "unpaid" && (
              <>
                {(rejected || invoice.status_note) && (
                  <p className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm">
                    <strong>{rejected ? t.proofRejected : t.adminNote}</strong> {rejected?.review_note ?? invoice.status_note}
                  </p>
                )}
                <PaymentPanel invoiceId={invoice.id} total={invoice.total} settings={settings} lang={lang} />
              </>
            )}
            {invoice.status === "verifying" && (
              <section className="grid gap-2 rounded-xl border border-accent bg-accent/10 p-5">
                <h2 className="text-lg font-extrabold">{t.stageVerifyTitle}</h2>
                <p className="text-sm">{t.proofSent}</p>
              </section>
            )}
            {invoice.status === "paid" && current.status === "active" && !current.details_completed_at && (
              <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <p className="max-w-[56ch]">{t.stageDetailsLede}</p>
                <Link href="/app/outlets" className="btn btn-primary">
                  {t.completeDetails} →
                </Link>
              </section>
            )}
            {(invoice.status === "expired" || invoice.status === "cancelled") && (
              <section className="card grid gap-3 p-5">
                <p>{invoice.status === "expired" ? t.closedExpired : t.closedCancelled}</p>
                {invoice.status_note && (
                  <p className="text-sm text-muted">
                    {t.adminNote} {invoice.status_note}
                  </p>
                )}
                <Link href="/app/paket" className="btn btn-primary w-fit">
                  {t.orderAgain} →
                </Link>
              </section>
            )}
          </div>
          <InvoiceView invoice={invoice} projectCode={current.code} lang={lang} pdfHref={`/app/billing/${invoice.id}/pdf`} />
        </div>
      )}

      {withInvoice.length > 1 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-extrabold">{t.history}</h2>
          <ul className="grid gap-2">
            {withInvoice.slice(1).map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <span className="font-mono">
                  {p.invoices[0].code} · {p.package_snapshot.name}
                </span>
                <span className="text-muted">{dateTime(p.created_at, lang)}</span>
                <span className="tabular-nums">{rupiah(p.invoices[0].total)}</span>
                <InvoiceStatusChip status={p.invoices[0].status} lang={lang} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
