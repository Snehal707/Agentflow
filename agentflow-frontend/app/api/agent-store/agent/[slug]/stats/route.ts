import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return proxyBackendRequest(
    request,
    `/api/agent-store/agent/${encodeURIComponent(slug)}/stats`,
  );
}
