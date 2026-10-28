import "server-only";
import { createElement } from "react";
import { getPaymentSettings } from "@/lib/catalog";
import { asList, type Invoice } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDocument } from "./invoice-pdf";
import { pdfResponse } from "./render";

// PDF invoice. Akses dijaga RLS: client hanya invoicenya sendiri, admin semua.
export async function invoicePdf(invoiceId: string, inline = false) {
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("*, invoice_lines(*), payment_proofs(*), projects(code, client_id)").eq("id", invoiceId).maybeSingle();
  if (!data) return new Response("Invoice tidak ditemukan.", { status: 404 });
  const row = data as Invoice & { projects: { code: string; client_id: string } };
  const invoice: Invoice = { ...row, invoice_lines: [...asList(row.invoice_lines)].sort((a, b) => a.position - b.position), payment_proofs: asList(row.payment_proofs) };
  const [{ data: company }, { data: client }, payment] = await Promise.all([
    supabase.from("companies").select("name, pic_name, address, city").eq("client_id", row.projects.client_id).maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", row.projects.client_id).maybeSingle(),
    getPaymentSettings(),
  ]);
  const billTo = {
    company: company?.name || client?.full_name || "—",
    pic: company?.pic_name ?? "",
    address: [company?.address, company?.city].filter(Boolean).join(", "),
    email: client?.email ?? "",
  };
  return pdfResponse(
    createElement(InvoiceDocument, { invoice, projectCode: row.projects.code, billTo, payment }) as Parameters<typeof pdfResponse>[0],
    `invoice-${invoice.code}.pdf`,
    inline,
  );
}
