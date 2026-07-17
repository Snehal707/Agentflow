import { createHash } from 'node:crypto';
import type { ResearchBrief, Source, VerifiedClaim } from '../agents/research/types';

const DEFAULT_INDEX_UID = 'research_evidence';
const DEFAULT_TIMEOUT_MS = 3_000;

export type EvidenceReliability = 'high' | 'medium' | 'low';

export type EvidenceDocument = {
  id: string;
  canonical_url: string;
  url: string;
  domain: string;
  title: string;
  publisher: string;
  content: string;
  content_hash: string;
  source_type: string;
  reliability: EvidenceReliability;
  authority: number;
  published_at: string | null;
  fetched_at: string;
  recheck_at: string;
  expires_at: string;
  entities: string[];
  topics: string[];
  supported_claims: string[];
  retrieval_providers: string[];
  evidence_version: number;
};

export type LocalEvidenceSearchResult = EvidenceDocument & {
  _rankingScore?: number;
};

function indexBaseUrl(): string {
  return (process.env.RESEARCH_INDEX_URL || process.env.MEILISEARCH_URL || '').trim().replace(/\/+$/, '');
}

function indexUid(): string {
  return (process.env.RESEARCH_INDEX_UID || DEFAULT_INDEX_UID).trim() || DEFAULT_INDEX_UID;
}

function requestHeaders(): Record<string, string> {
  const key = (process.env.RESEARCH_INDEX_KEY || process.env.MEILI_MASTER_KEY || '').trim();
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

export function isLocalEvidenceIndexEnabled(): boolean {
  return Boolean(indexBaseUrl()) && process.env.RESEARCH_INDEX_ENABLED !== 'false';
}

async function indexRequest<T>(path: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const baseUrl = indexBaseUrl();
  if (!baseUrl) throw new Error('RESEARCH_INDEX_URL is not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...requestHeaders(), ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`research index ${response.status}: ${raw.slice(0, 300)}`);
    }
    return (raw ? JSON.parse(raw) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getLocalEvidenceIndexHealth(): Promise<{
  enabled: boolean;
  healthy: boolean;
  url?: string;
  error?: string;
}> {
  if (!isLocalEvidenceIndexEnabled()) return { enabled: false, healthy: false };
  try {
    await indexRequest('/health', { method: 'GET' }, 2_000);
    return { enabled: true, healthy: true, url: indexBaseUrl() };
  } catch (error) {
    return {
      enabled: true,
      healthy: false,
      url: indexBaseUrl(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function searchLocalEvidence(
  query: string,
  options: { limit?: number; includeExpired?: boolean } = {},
): Promise<LocalEvidenceSearchResult[]> {
  if (!isLocalEvidenceIndexEnabled() || !query.trim()) return [];

  const useHybrid = /^(?:1|true|yes|on)$/i.test(
    String(process.env.RESEARCH_INDEX_LOCAL_EMBEDDINGS || '').trim(),
  );
  const semanticRatio = Math.max(
    0,
    Math.min(1, Number.parseFloat(process.env.RESEARCH_INDEX_SEMANTIC_RATIO || '0.35') || 0.35),
  );
  const searchPath = `/indexes/${encodeURIComponent(indexUid())}/search`;
  const baseSearchBody = {
        q: query.trim(),
        limit: Math.max(1, Math.min(40, options.limit ?? 12)),
        showRankingScore: true,
        attributesToRetrieve: [
          'id',
          'canonical_url',
          'url',
          'domain',
          'title',
          'publisher',
          'content',
          'content_hash',
          'source_type',
          'reliability',
          'authority',
          'published_at',
          'fetched_at',
          'recheck_at',
          'expires_at',
          'entities',
          'topics',
          'supported_claims',
          'retrieval_providers',
          'evidence_version',
        ],
  };
  let response: { hits?: LocalEvidenceSearchResult[] };
  try {
    response = await indexRequest(searchPath, {
      method: 'POST',
      body: JSON.stringify({
        ...baseSearchBody,
        ...(useHybrid
          ? {
              hybrid: {
                embedder: process.env.RESEARCH_INDEX_EMBEDDER_NAME || 'local',
                semanticRatio,
              },
            }
          : {}),
      }),
    });
  } catch (error) {
    if (!useHybrid) throw error;
    console.warn(
      '[research-index] hybrid lookup failed; retrying lexical:',
      error instanceof Error ? error.message : String(error),
    );
    response = await indexRequest(searchPath, {
      method: 'POST',
      body: JSON.stringify(baseSearchBody),
    });
  }

  const now = Date.now();
  return (response.hits ?? []).filter((hit) => {
    if (options.includeExpired) return true;
    const expiresAt = Date.parse(hit.expires_at);
    return !Number.isFinite(expiresAt) || expiresAt > now;
  });
}

export async function upsertLocalEvidence(documents: EvidenceDocument[]): Promise<number> {
  if (!isLocalEvidenceIndexEnabled() || documents.length === 0) return 0;
  const unique = new Map<string, EvidenceDocument>();
  for (const document of documents) {
    if (!document.url || !document.content.trim()) continue;
    unique.set(document.id, document);
  }
  if (unique.size === 0) return 0;

  await indexRequest(
    `/indexes/${encodeURIComponent(indexUid())}/documents?primaryKey=id`,
    {
      method: 'POST',
      body: JSON.stringify([...unique.values()]),
    },
    10_000,
  );
  return unique.size;
}

export async function indexDeepResearchEvidence(input: {
  brief: ResearchBrief;
  sources: Source[];
  claims: VerifiedClaim[];
  retrievalProvider?: string;
}): Promise<number> {
  const claimsByUrl = new Map<string, VerifiedClaim[]>();
  for (const claim of input.claims) {
    if (!/^https?:\/\//i.test(claim.source_url)) continue;
    const key = canonicalizeUrl(claim.source_url);
    claimsByUrl.set(key, [...(claimsByUrl.get(key) ?? []), claim]);
  }

  const documents = input.sources.map((source) => {
    const claims = claimsByUrl.get(canonicalizeUrl(source.url)) ?? [];
    return sourceToEvidenceDocument(source, {
      brief: input.brief,
      claims,
      retrievalProvider: input.retrievalProvider ?? 'research_pipeline',
    });
  });
  return upsertLocalEvidence(documents);
}

export async function indexFastResearchEvidence(
  task: string,
  liveData: Record<string, unknown> | null | undefined,
): Promise<number> {
  if (!liveData || !isLocalEvidenceIndexEnabled()) return 0;
  const documents: EvidenceDocument[] = [];
  const seen = new Set<string>();
  const now = new Date();

  const pushArticles = (value: unknown, provider: string, reliability: EvidenceReliability) => {
    if (!Array.isArray(value)) return;
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const url = stringValue(item.url);
      const title = stringValue(item.title) || stringValue(item.name);
      const content =
        stringValue(item.snippet) ||
        stringValue(item.summary) ||
        stringValue(item.description) ||
        stringValue(item.extract);
      if (!url || !title || !content || !/^https?:\/\//i.test(url)) continue;
      const canonicalUrl = canonicalizeUrl(url);
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);
      const domain = hostname(canonicalUrl);
      if (!domain) continue;
      const publishedAt = normalizeDate(
        stringValue(item.published_at) || stringValue(item.date) || stringValue(item.seen_at),
      );
      const expiresAt = addMilliseconds(now, inferTtlMs(task, publishedAt));
      documents.push({
        id: stableId(canonicalUrl),
        canonical_url: canonicalUrl,
        url,
        domain,
        title,
        publisher: stringValue(item.publisher) || domain,
        content: normalizeEvidenceText(`${title}. ${content}`),
        content_hash: contentHash(`${title}\n${content}`),
        source_type: provider === 'wikipedia' ? 'reference' : 'article',
        reliability,
        authority: reliability === 'high' ? 9 : reliability === 'medium' ? 6 : 3,
        published_at: publishedAt,
        fetched_at: now.toISOString(),
        recheck_at: expiresAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        entities: [],
        topics: topicTerms(task),
        supported_claims: [],
        retrieval_providers: [provider],
        evidence_version: 1,
      });
    }
  };

  const currentEvents = objectValue(liveData.current_events);
  pushArticles(currentEvents?.article_snapshots, 'firecrawl', 'high');
  pushArticles(currentEvents?.articles, 'firecrawl', 'medium');
  const dynamicSources = objectValue(liveData.dynamic_sources);
  pushArticles(dynamicSources?.articles, 'searxng', 'medium');
  const wikipedia = objectValue(liveData.wikipedia);
  pushArticles(wikipedia?.pages, 'wikipedia', 'medium');

  return upsertLocalEvidence(documents);
}

export async function mergeLocalEvidenceIntoLiveData(
  task: string,
  liveData: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  if (!isLocalEvidenceIndexEnabled() || !task.trim()) return liveData;
  const isSportsWinnerTask =
    /\b(world cup|fifa|champions league|nba|nfl|mlb|nhl|tennis)\b/i.test(task) &&
    /\b(win|winner|champion|title|world cup)\b/i.test(task);
  const sportsStateSignal = (value: string) =>
    /\b(match report|latest results?|semi[- ]?final results?|finalists?|final|advanced to (?:the )?final|booked (?:a|their) place in (?:the )?final|qualified|eliminated|beat|defeated|lost to|fixtures?|bracket|standings)\b/i.test(
      value,
    );
  const hits = await searchLocalEvidence(task, {
    limit: isSportsWinnerTask ? 20 : 8,
    // A fast sports run can outlive the generic 12-hour cache TTL while the
    // source itself is still inside the stricter 2.25-day event-state window.
    // Inspect those documents below instead of discarding them blindly.
    includeExpired: isSportsWinnerTask,
  }).catch((error) => {
    console.warn('[research-index] local lookup skipped:', error instanceof Error ? error.message : String(error));
    return [];
  });
  const now = Date.now();
  const reusableHits = hits.filter((hit) => {
    const expiresAt = Date.parse(hit.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt > now) return true;
    if (!isSportsWinnerTask || hit.reliability === 'low') return false;
    const publishedAt = Date.parse(hit.published_at || '');
    if (!Number.isFinite(publishedAt)) return false;
    const ageDays = (now - publishedAt) / 86_400_000;
    if (ageDays < -0.5 || ageDays > 2.25) return false;
    return sportsStateSignal(`${hit.title} ${hit.content}`);
  });
  if (!reusableHits.length) return liveData;

  const base = liveData ?? {};
  const dynamic = objectValue(base.dynamic_sources) ?? {};
  const existing = Array.isArray(dynamic.articles) ? dynamic.articles : [];
  const existingUrls = new Set(
    existing
      .map((item) => (item && typeof item === 'object' ? stringValue((item as Record<string, unknown>).url) : ''))
      .filter(Boolean)
      .map(canonicalizeUrl),
  );
  const reusableByUrl = new Map(
    reusableHits.map((hit) => [canonicalizeUrl(hit.url), hit] as const),
  );
  const enrichedExisting = existing.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const item = raw as Record<string, unknown>;
    const url = stringValue(item.url);
    const hit = url ? reusableByUrl.get(canonicalizeUrl(url)) : undefined;
    if (!hit) return raw;
    return {
      ...item,
      title: stringValue(item.title) || hit.title,
      publisher: stringValue(item.publisher) || hit.publisher || hit.domain,
      snippet:
        stringValue(item.snippet) ||
        stringValue(item.summary) ||
        stringValue(item.description) ||
        hit.content.slice(0, 1_200),
      summary:
        stringValue(item.summary) ||
        stringValue(item.snippet) ||
        stringValue(item.description) ||
        hit.content.slice(0, 1_200),
      published_at:
        stringValue(item.published_at) ||
        stringValue(item.seen_at) ||
        hit.published_at,
      seen_at:
        stringValue(item.seen_at) ||
        stringValue(item.published_at) ||
        hit.published_at,
      retrieval_provider:
        stringValue(item.retrieval_provider) || 'local_evidence_index',
    };
  });
  const localArticles = reusableHits
    .filter((hit) => !existingUrls.has(canonicalizeUrl(hit.url)))
    .map((hit) => {
      const publishedAt = Date.parse(hit.published_at || '');
      const sportsFreshUntil = Number.isFinite(publishedAt)
        ? new Date(publishedAt + 2.25 * 86_400_000).toISOString()
        : hit.expires_at;
      return {
        title: hit.title,
        publisher: hit.publisher || hit.domain,
        url: hit.url,
        snippet: hit.content.slice(0, 1_200),
        summary: hit.content.slice(0, 1_200),
        published_at: hit.published_at,
        seen_at: hit.published_at,
        fetched_at: hit.fetched_at,
        retrieval_provider: 'local_evidence_index',
        evidence_fresh_until:
          isSportsWinnerTask && sportsStateSignal(`${hit.title} ${hit.content}`)
            ? sportsFreshUntil
            : hit.expires_at,
      };
    });

  return {
    ...base,
    dynamic_sources: {
      ...dynamic,
      articles: [...enrichedExisting, ...localArticles].slice(0, 30),
      local_evidence_count: localArticles.length,
    },
  };
}

function sourceToEvidenceDocument(
  source: Source,
  input: { brief: ResearchBrief; claims: VerifiedClaim[]; retrievalProvider: string },
): EvidenceDocument {
  const now = new Date();
  const canonicalUrl = canonicalizeUrl(source.url);
  const publishedAt = normalizeDate(source.date);
  const supportedClaims = input.claims
    .filter((claim) => claim.status !== 'Disputed' && claim.status !== 'Insufficient')
    .map((claim) => normalizeEvidenceText(claim.claim))
    .filter(Boolean)
    .slice(0, 12);
  const supportingText = input.claims
    .flatMap((claim) => [claim.supporting_snippet, claim.claim])
    .filter(Boolean)
    .join(' ');
  const content = normalizeEvidenceText(
    [source.title, source.snippet, supportingText].filter(Boolean).join('. '),
  ).slice(0, 8_000);
  const expiresAt = addMilliseconds(now, inferTtlMs(input.brief.query, publishedAt, input.brief.time_sensitivity));

  return {
    id: stableId(canonicalUrl),
    canonical_url: canonicalUrl,
    url: source.url,
    domain: source.domain || hostname(canonicalUrl),
    title: source.title,
    publisher: source.domain || hostname(canonicalUrl),
    content,
    content_hash: contentHash(content),
    source_type: inferSourceType(source),
    reliability: source.reliability,
    authority: source.reliability === 'high' ? 9 : source.reliability === 'medium' ? 6 : 3,
    published_at: publishedAt,
    fetched_at: now.toISOString(),
    recheck_at: expiresAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    entities: uniqueStrings(input.claims.flatMap((claim) => claim.entities)).slice(0, 20),
    topics: uniqueStrings([...topicTerms(input.brief.query), ...input.brief.domains_priority]).slice(0, 30),
    supported_claims: supportedClaims,
    retrieval_providers: [input.retrievalProvider],
    evidence_version: 1,
  };
}

function inferSourceType(source: Source): string {
  if (/\.(?:gov|edu)(?:\.|$)/i.test(source.domain) || source.reliability === 'high') return 'primary_or_authoritative';
  if (/\b(?:wikipedia|wikidata)\b/i.test(source.domain)) return 'reference';
  if (/\b(?:github|docs\.)\b/i.test(source.domain)) return 'documentation';
  return 'article';
}

function inferTtlMs(
  task: string,
  publishedAt: string | null,
  sensitivity?: ResearchBrief['time_sensitivity'],
): number {
  if (
    /\b(world cup|fifa|champions league|nba|nfl|mlb|nhl|tennis)\b/i.test(task) &&
    /\b(win|winner|champion|title|world cup)\b/i.test(task)
  ) {
    // Align cached sports event evidence with the report gate's freshness
    // window so a transient search outage does not erase a still-current
    // verified bracket/result source.
    return 2.25 * 24 * 60 * 60 * 1_000;
  }
  if (sensitivity === 'live' || /\b(?:today|breaking|latest|current|price|market)\b/i.test(task)) {
    return 12 * 60 * 60 * 1_000;
  }
  if (publishedAt || sensitivity === 'recent') return 3 * 24 * 60 * 60 * 1_000;
  if (sensitivity === 'historical') return 90 * 24 * 60 * 60 * 1_000;
  return 14 * 24 * 60 * 60 * 1_000;
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return value.trim();
  }
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function contentHash(value: string): string {
  return createHash('sha256').update(normalizeEvidenceText(value)).digest('hex');
}

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function topicTerms(value: string): string[] {
  const stopwords = new Set(['about', 'analysis', 'current', 'latest', 'make', 'report', 'research', 'the', 'this', 'with']);
  return uniqueStrings((value.toLowerCase().match(/[a-z0-9][a-z0-9+.-]{2,}/g) ?? []).filter((term) => !stopwords.has(term))).slice(0, 20);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeEvidenceText(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
