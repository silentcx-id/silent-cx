import { notFound } from "next/navigation";
import { appOrigin } from "@/lib/app-origin";
import { getVoucherCard } from "@/lib/voucher-data";
import { voucherImage } from "@/lib/voucher-image";

// Gambar voucher PNG. ?format=og = 1200×630 untuk pratinjau tautan; ?unduh=1 = diunduh sebagai file.
export async function GET(request: Request, { params }: RouteContext<"/voucher/[code]/gambar">) {
  const { code } = await params;
  const card = await getVoucherCard(code);
  if (!card) notFound();
  const url = new URL(request.url);
  // Alamat resmi di produksi, alamat yang sedang dibuka di staging dan laptop.
  const host = (await appOrigin()).replace(/^https?:\/\//, "");
  const img = await voucherImage(card, host, url.searchParams.get("format") === "og");
  const headers = new Headers(img.headers);
  headers.set("Cache-Control", "no-store");
  if (url.searchParams.get("unduh")) headers.set("Content-Disposition", `attachment; filename="voucher-${card.code}.png"`);
  return new Response(img.body, { status: 200, headers });
}
