import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = encodeURIComponent(rawId);
  const u = new URL(request.url);
  const q = u.search;
  return proxyBackendRequest(request, `/api/pay/schedule/${id}${q}`);
}
