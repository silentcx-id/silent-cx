import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { VoucherCardView } from "@/components/voucher-card";
import { date } from "@/lib/format";
import { getViewer } from "@/lib/session";
import { getVoucherCard } from "@/lib/voucher-data";
import { groupedRules, lastDay } from "@/lib/vouchers";

// Voucher bersifat personal: tidak diindeks mesin pencari, tetapi punya gambar pratinjau saat tautannya dibagikan.
export async function generateMetadata({ params }: PageProps<"/voucher/[code]">): Promise<Metadata> {
  const card = await getVoucherCard((await params).code);
  if (!card) return { title: "Voucher tidak ditemukan", robots: { index: false } };
  const offer = groupedRules(card)
    .map((r) => `${r.text} paket ${r.names}`)
    .join(", ");
  const title = `Voucher khusus ${card.brand}`;
  const description = `${offer}. Berlaku s.d. ${date(lastDay(card.ends_at), "id")}. Kode ${card.code}.`;
  const image = { url: `/voucher/${card.code}/gambar?format=og`, width: 1200, height: 630, alt: title };
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", images: [image.url] } };
}

const STEPS = [
  "Daftar atau masuk ke akun SilentCX Anda.",
  "Pilih paket audit dan isi kota outlet, lalu kirim pesanan.",
  "Di halaman Tagihan, kode voucher sudah terisi. Klik Pakai voucher, total langsung terpotong.",
  "Bayar sesuai total baru dan unggah bukti bayar.",
];

export default async function VoucherPage({ params }: PageProps<"/voucher/[code]">) {
  const { code } = await params;
  const [card, viewer] = await Promise.all([getVoucherCard(code), getViewer()]);
  if (!card) notFound();
  const usable = card.state === "active" || card.state === "scheduled";
  const notice: Record<string, string> = {
    scheduled: `Voucher ini mulai berlaku ${date(card.starts_at, "id")}. Anda sudah bisa mendaftar dan menyiapkan pesanan sekarang.`,
    claimed: "Voucher ini sudah dipasang di sebuah tagihan.",
    used: "Voucher ini sudah dipakai.",
    expired: `Voucher ini sudah berakhir ${date(lastDay(card.ends_at), "id")}.`,
    cancelled: "Voucher ini sudah tidak berlaku.",
  };
  const isClient = viewer?.role === "client";

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <Link href="/artikel/promo" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
          Promo lainnya
        </Link>
      </header>
      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
        <div className="grid gap-4">
          <h1 className="sr-only">Voucher khusus {card.brand}</h1>
          <VoucherCardView card={card} />
          {card.state !== "active" && (
            <p role="status" className={`rounded-xl border p-4 text-sm ${usable ? "border-accent bg-accent/10" : "border-bad/40 bg-bad/10"}`}>
              {notice[card.state]}
            </p>
          )}
        </div>
        <section className="card grid gap-5 p-5 sm:p-6">
          <h2 className="text-xl font-extrabold">Cara pakai voucher</h2>
          <ol className="grid gap-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-ink">{i + 1}</span>
                <span className="pt-1">{s}</span>
              </li>
            ))}
          </ol>
          {usable && (
            <div className="grid gap-2">
              {viewer ? (
                isClient ? (
                  <Link href={`/voucher/${card.code}/klaim`} className="btn btn-primary">
                    Pakai voucher ini →
                  </Link>
                ) : (
                  <p className="text-sm text-muted">Voucher dipakai dari akun pemilik bisnis (client).</p>
                )
              ) : (
                <>
                  <Link href={`/voucher/${card.code}/klaim?ke=register`} className="btn btn-primary">
                    Daftar & pakai voucher →
                  </Link>
                  <Link href={`/voucher/${card.code}/klaim?ke=login`} className="btn">
                    Sudah punya akun? Masuk
                  </Link>
                </>
              )}
              <p className="text-xs text-muted">Kode tersimpan otomatis di browser ini dan terisi di halaman Tagihan.</p>
            </div>
          )}
          <p className="border-t border-line pt-4 text-xs text-muted">
            Voucher tidak bisa digabung dengan promo paket lain. Baca{" "}
            <Link href="/artikel/promo/syarat-ketentuan-promo-launching" className="underline underline-offset-4 hover:text-fg">
              syarat & ketentuan
            </Link>{" "}
            dan{" "}
            <Link href="/artikel/promo/cara-klaim-voucher-silentcx" className="underline underline-offset-4 hover:text-fg">
              panduan klaim
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
