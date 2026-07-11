import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name: rawName } = await params;
  const name = encodeURIComponent(rawName ?? "");
  return proxyBackendRequest(request, `/api/pay/name/check/${name}`);
}
