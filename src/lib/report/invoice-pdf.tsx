import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PaymentSettings } from "@/lib/catalog-types";
import { rupiah } from "@/lib/format";
import type { Invoice } from "@/lib/orders";
import { C, LOGO } from "./pdf-base";

// Invoice dalam PDF A4, isinya sama dengan rincian invoice di dashboard.

const STATUS: Record<Invoice["status"], string> = {
  draft: "Menunggu konfirmasi",
  unpaid: "Belum dibayar",
  verifying: "Sedang diverifikasi",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

const s = StyleSheet.create({
  page: { fontFamily: "Familjen", fontSize: 10, color: C.text, padding: 48, lineHeight: 1.45 },
  tape: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: C.gold },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 3 },
  row: { flexDirection: "row" },
  th: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  td: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line },
});

const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(d)) : "—");

export type InvoicePdfData = {
  invoice: Invoice;
  projectCode: string;
  billTo: { company: string; pic: string; address: string; email: string };
  payment: PaymentSettings;
};

export function InvoiceDocument({ invoice, projectCode, billTo, payment }: InvoicePdfData) {
  const due = invoice.status === "unpaid" && invoice.due_at;
  return (
    <Document title={`Invoice ${invoice.code}`} author="SilentCX">
      <Page size="A4" style={s.page}>
        <View style={s.tape} fixed />
        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya prop alt */}
          <Image src={LOGO} style={{ width: 130 }} />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Bricolage", fontWeight: 800, fontSize: 26, color: C.ink, lineHeight: 1.1, marginBottom: 2 }}>INVOICE</Text>
            <Text style={{ color: C.muted }}>{invoice.code}</Text>
            <Text style={{ marginTop: 4, fontWeight: 600, color: invoice.status === "paid" ? C.good : invoice.status === "unpaid" ? C.warn : C.muted }}>{STATUS[invoice.status]}</Text>
          </View>
        </View>

        <View style={[s.row, { marginTop: 36, gap: 24 }]}>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Text style={s.eyebrow}>Ditagihkan kepada</Text>
            <Text style={{ fontWeight: 600 }}>{billTo.company}</Text>
            {billTo.pic && <Text>{billTo.pic}</Text>}
            {billTo.address && <Text style={{ color: C.muted }}>{billTo.address}</Text>}
            <Text style={{ color: C.muted }}>{billTo.email}</Text>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            {[
              ["Tanggal", fmt(invoice.created_at)],
              ["Proyek", projectCode],
              [invoice.status === "paid" ? "Dibayar" : "Batas bayar", invoice.status === "paid" ? fmt(invoice.paid_at) : due ? fmt(invoice.due_at) : "—"],
            ].map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", marginBottom: 3 }]}>
                <Text style={{ color: C.muted }}>{k}</Text>
                <Text>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 28 }}>
          <View style={s.row}>
            <Text style={[s.th, { flexGrow: 1 }]}>Item</Text>
            <Text style={[s.th, { width: 40, textAlign: "right" }]}>Qty</Text>
            <Text style={[s.th, { width: 110, textAlign: "right" }]}>Jumlah</Text>
          </View>
          {invoice.invoice_lines.map((l) => (
            <View key={l.id} style={s.row} wrap={false}>
              <Text style={[s.td, { flexGrow: 1, flexShrink: 1, paddingRight: 8 }]}>{l.label}</Text>
              <Text style={[s.td, { width: 40, textAlign: "right" }]}>{l.quantity}</Text>
              <Text style={[s.td, { width: 110, textAlign: "right" }]}>{l.amount == null ? "Menunggu harga" : rupiah(l.amount)}</Text>
            </View>
          ))}
          <View style={[s.row, { justifyContent: "flex-end", marginTop: 12, alignItems: "baseline", gap: 16 }]}>
            <Text style={{ color: C.muted }}>Total (sudah termasuk PPN)</Text>
            <Text style={{ fontFamily: "Bricolage", fontWeight: 800, fontSize: 20, color: C.ink, lineHeight: 1.1 }}>{rupiah(invoice.total)}</Text>
          </View>
        </View>

        {invoice.status === "unpaid" && (payment.bank_name || payment.qris_url) && (
          <View style={{ marginTop: 32, borderWidth: 1, borderColor: C.gold, borderRadius: 8, padding: 14, backgroundColor: C.goldSoft }} wrap={false}>
            <Text style={s.eyebrow}>Cara bayar</Text>
            <Text>Bayar tepat {rupiah(invoice.total)}, lalu unggah bukti di menu Tagihan pada dashboard SilentCX.</Text>
            {payment.bank_name && (
              <Text style={{ marginTop: 4, fontWeight: 600 }}>
                {payment.bank_name} {payment.account_number} a.n. {payment.account_holder}
              </Text>
            )}
            {payment.qris_url && <Text style={{ marginTop: 2, color: C.muted }}>QRIS tersedia di menu Tagihan.</Text>}
          </View>
        )}

        <Text style={{ position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 8, color: C.muted }} fixed>
          SilentCX · Audit pengalaman pelanggan lewat mystery shopping · Invoice ini dibuat otomatis dan sah tanpa tanda tangan.
        </Text>
      </Page>
    </Document>
  );
}
