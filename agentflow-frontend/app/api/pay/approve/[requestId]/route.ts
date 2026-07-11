import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const id = encodeURIComponent(requestId);
  return proxyBackendRequest(request, `/api/pay/approve/${id}`);
}
