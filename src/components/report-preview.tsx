import Link from "next/link";
import { rupiah } from "@/lib/format";
import type { ReportPreview } from "@/lib/report/preview";
import { fmtScore, SEVERITY_LABEL } from "@/lib/report/types";

const tone = (n: number | null | undefined) => (n === null || n === undefined ? "text-muted" : n >= 70 ? "text-good" : n >= 55 ? "text-warn" : "text-bad");
const sevTone = { critical: "border-bad/60 text-bad", major: "border-warn/60 text-warn", minor: "text-muted" } as const;

// Bagian laporan yang dikunci: hanya judul dan isian samaran (data aslinya tidak dikirim ke browser).
function Locked({ title }: { title: string }) {
  return (
    <section className="card relative grid gap-3 overflow-hidden p-5" aria-label={`${title} (terkunci)`}>
      <h2 className="pr-28 text-lg font-extrabold">{title}</h2>
      <div className="grid gap-2 blur-[3px] select-none" aria-hidden>
        {[80, 64, 72, 50].map((w) => (
          <span key={w} className="block h-3 rounded-full bg-raise" style={{ width: `${w}%` }} />
        ))}
      </div>
      <span className="absolute right-4 top-4 chip">🔒 Terkunci</span>
    </section>
  );
}

// Ringkasan laporan sebelum pelunasan: skor keseluruhan, skor per outlet, dan 3 temuan teratas.
export function ReportPreviewView({ preview }: { preview: ReportPreview }) {
  const verifying = preview.settlement.status === "verifying";
  return (
    <>
      <section className="grid gap-3 rounded-xl border border-accent bg-accent/10 p-5" role="status" data-testid="report-locked">
        <p className="text-lg font-extrabold">{verifying ? "Bukti pelunasan sedang diverifikasi" : "Laporan lengkap terbuka setelah pelunasan"}</p>
        <p className="text-sm">
          {verifying
            ? "Tim SilentCX sedang memeriksa bukti pelunasan Anda. Laporan lengkap, foto bukti, dan PDF terbuka otomatis setelah diverifikasi."
            : `Ringkasan di bawah bisa Anda lihat sekarang. Detail per pertanyaan, foto bukti, rekomendasi, dan PDF terbuka setelah pelunasan ${rupiah(preview.settlement.total)} diverifikasi.`}
        </p>
        {!verifying && (
          <Link href="/app/billing" className="btn btn-primary w-fit">
            Bayar pelunasan {rupiah(preview.settlement.total)} →
          </Link>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="card grid content-start gap-1 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Skor keseluruhan</span>
          <span className={`font-display text-5xl font-extrabold tabular-nums ${tone(preview.score)}`}>{fmtScore(preview.score)}</span>
          <span className="text-xs text-muted">dari 100</span>
        </div>
        <div className="card grid content-start gap-3 p-5">
          <h2 className="text-lg font-extrabold">Skor outlet</h2>
          <ul className="divide-y divide-line text-sm">
            {preview.outlets.map((o) => (
              <li key={`${o.name}-${o.city}`} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {o.name}
                  {o.city && <span className="text-muted"> · {o.city}</span>}
                </span>
                <span className={`font-semibold tabular-nums ${tone(o.score)}`}>{fmtScore(o.score)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {preview.findings.length > 0 && (
        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">3 temuan teratas</h2>
          <ol className="grid gap-2">
            {preview.findings.map((f, i) => (
              <li key={i} className="grid gap-1 rounded-lg border border-line p-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${sevTone[f.severity] ?? ""}`}>{SEVERITY_LABEL[f.severity]}</span>
                  <span className="font-semibold">{f.title}</span>
                </span>
                {f.detail && <span className="text-sm text-muted">{f.detail}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Locked title="Skor per area dan per pertanyaan" />
        <Locked title="Foto bukti kunjungan" />
        <Locked title="Rekomendasi" />
        <Locked title="Kepatuhan SOP, red flag, dan benchmark" />
      </div>
    </>
  );
}
