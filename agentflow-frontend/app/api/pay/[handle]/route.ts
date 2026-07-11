import { proxyBackendRequest } from "@/lib/backendProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  return proxyBackendRequest(request, `/api/pay/${handle}`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  return proxyBackendRequest(request, `/api/pay/${handle}/execute`);
}
