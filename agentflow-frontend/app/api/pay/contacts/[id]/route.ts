import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = encodeURIComponent(rawId);
  return proxyBackendRequest(request, `/api/pay/contacts/${id}`);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = encodeURIComponent(rawId);
  return proxyBackendRequest(request, `/api/pay/contacts/${id}`);
}
