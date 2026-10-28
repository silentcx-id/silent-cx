import { invoicePdf } from "@/lib/report/invoice-load";
import { requireRole } from "@/lib/session";

export async function GET(_req: Request, { params }: RouteContext<"/admin/invoices/[id]/pdf">) {
  const { id } = await params;
  await requireRole("admin", "/admin/projects");
  return invoicePdf(id, true);
}
