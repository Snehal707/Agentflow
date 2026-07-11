import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId: rawInvoiceId } = await context.params;
  const invoiceId = encodeURIComponent(rawInvoiceId);
  return proxyBackendRequest(request, `/api/business/invoices/${invoiceId}/approve`);
}
