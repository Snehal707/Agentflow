const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;

interface GARequestContext {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

interface GAEventParams {
  [key: string]: unknown;
}

interface GAEventOptions {
  eventOrigin?: 'server' | 'browser';
  ipOverride?: string;
  request?: GARequestContext;
}

function getHeaderValue(
  headers: GARequestContext['headers'] | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeIpCandidate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withoutQuotes = trimmed.replace(/^"|"$/g, '');
  const ipv4Mapped = withoutQuotes.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4Mapped) return ipv4Mapped[1];

  if (withoutQuotes.startsWith('[')) {
    const end = withoutQuotes.indexOf(']');
    return end > 0 ? withoutQuotes.slice(1, end) : null;
  }

  const ipv4WithPort = withoutQuotes.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  if (ipv4WithPort) return ipv4WithPort[1];

  return withoutQuotes;
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;

  return true;
}

function isPublicIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return false;
  }

  return normalized.includes(':');
}

function isPublicIp(ip: string): boolean {
  return ip.includes(':') ? isPublicIpv6(ip) : isPublicIpv4(ip);
}

function firstPublicIpFromList(value: string | undefined): string | null {
  const candidates = value?.split(',') ?? [];
  for (const candidate of candidates) {
    const normalized = normalizeIpCandidate(candidate);
    if (normalized && isPublicIp(normalized)) return normalized;
  }

  return null;
}

function extractClientIp(request: GARequestContext | undefined): string | null {
  const headers = request?.headers;
  return (
    firstPublicIpFromList(getHeaderValue(headers, 'x-forwarded-for')) ||
    firstPublicIpFromList(getHeaderValue(headers, 'cf-connecting-ip')) ||
    firstPublicIpFromList(getHeaderValue(headers, 'true-client-ip')) ||
    firstPublicIpFromList(getHeaderValue(headers, 'fastly-client-ip')) ||
    firstPublicIpFromList(getHeaderValue(headers, 'x-real-ip')) ||
    firstPublicIpFromList(request?.ip) ||
    firstPublicIpFromList(request?.socket?.remoteAddress)
  );
}

export async function sendGAEvent(
  name: string,
  params: GAEventParams = {},
  options: GAEventOptions = {},
): Promise<void> {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;
  const ipOverride = firstPublicIpFromList(options.ipOverride) || extractClientIp(options.request);

  const body: {
    client_id: string;
    ip_override?: string;
    events: Array<{
      name: string;
      params: GAEventParams;
    }>;
  } = {
    client_id: (params.wallet_address as string) || "server",
    events: [
      {
        name,
        params: {
          event_origin: options.eventOrigin ?? 'server',
          ...params,
        },
      },
    ],
  };
  if (ipOverride) {
    body.ip_override = ipOverride;
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Analytics failures should never break main flow
  }
}

