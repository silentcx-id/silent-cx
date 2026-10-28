import { invoicePdf } from "@/lib/report/invoice-load";
import { requireRole } from "@/lib/session";

export async function GET(_req: Request, { params }: RouteContext<"/app/billing/[id]/pdf">) {
  const { id } = await params;
  await requireRole("client", "/app/billing");
  return invoicePdf(id);
}
