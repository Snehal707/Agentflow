function normalizeAppBase(value: string | undefined): string {
  const raw = value?.trim() || 'https://agentflow.one';
  return raw.replace(/\/+$/, '');
}

export const APP_BASE_URL = normalizeAppBase(
  process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL,
);

export function appUrl(path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE_URL}${normalizedPath}`;
}

/** Live product surfaces (match agentflow-frontend/lib/appData.ts nav). */
export const APP_URLS = {
  home: APP_BASE_URL,
  chat: appUrl('/chat'),
  pay: appUrl('/pay'),
  funding: appUrl('/funding'),
  portfolio: appUrl('/portfolio'),
  agents: appUrl('/agents'),
  telegram: appUrl('/telegram'),
  /** @deprecated Use `funding` — old `/funds` path; kept as alias for callers. */
  funds: appUrl('/funding'),
  /** @deprecated Use `telegram` — there is no `/settings` app page. */
  settings: appUrl('/telegram'),
} as const;
