import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId: rawRequestId } = await params;
  const requestId = encodeURIComponent(rawRequestId);
  return proxyBackendRequest(request, `/api/x402/attempts/${requestId}`);
}
