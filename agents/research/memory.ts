import { sourceHostname } from '../../lib/source-policy';
import type { MarketUnderstanding } from '../../lib/market-understanding';
import type {
  ResearchChunkType,
  ResearchClaimRow,
  ResearchMemorySearchResult,
  ResearchReportKind,
  ResearchRunRow,
  ResearchSourceRow,
  ResearchRunStatus,
  SaveResearchMemoryInput,
} from '../../lib/research-memory';
import { saveResearchMemory, searchResearchMemory } from '../../lib/research-memory';
import { detectProtocolQueryShape } from '../../lib/protocol-query-shape';
import type { ResearchBrief, Source, SourceDiagnostics, VerifiedClaim } from './types';

const MEMORY_RESULT_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.RESEARCH_MEMORY_RESULT_LIMIT || '4', 10) || 4,
);

const MEMORY_THRESHOLD = Math.max(
  0,
  Math.min(1, Number.parseFloat(process.env.RESEARCH_MEMORY_THRESHOLD || '0.76') || 0.76),
);

type FastMemoryLiveData = Record<string, unknown>;

export type ResearchMemoryContext = {
  results: ResearchMemorySearchResult[];
  promptBlock: string;
};

export function inferReportKind(task: string, options?: { portfolioImpact?: boolean }): ResearchReportKind {
  if (/\bprediction market\b/i.test(task)) return 'prediction_market';
  if (options?.portfolioImpact) return 'portfolio_impact';
  if (detectProtocolQueryShape(task) !== 'none') return 'protocol';
  if (/\b(macro|inflation|fed|rates?|gdp|economy|tariffs?|sanctions?)\b/i.test(task)) return 'macro';
  return 'general';
}

export function summarizeMarkdown(markdown: string): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= 280) return cleaned;

  const sentenceBoundary = cleaned.slice(0, 280).lastIndexOf('. ');
  if (sentenceBoundary >= 120) {
    return cleaned.slice(0, sentenceBoundary + 1).trim();
  }
  return `${cleaned.slice(0, 277).trim()}...`;
}

function normalizeWalletAddress(value: unknown): string | null {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value.trim())
    ? value.trim()
    : null;
}

function collectDistinctDomains(sources: Array<{ domain?: string | null; url?: string | null }>): number {
  return new Set(
    sources
      .map((source) => source.domain || (source.url ? sourceHostname(source.url) : ''))
      .filter((domain): domain is string => Boolean(domain?.trim()))
      .map((domain) => domain.trim().toLowerCase()),
  ).size;
}

function isOfficialSource(source: { domain?: string | null }, understanding?: MarketUnderstanding | null): boolean {
  const domain = source.domain?.trim().toLowerCase() || '';
  if (!domain || !understanding?.entity?.officialDomains?.length) return false;
  return understanding.entity.officialDomains.some((official) => {
    const normalized = official.trim().toLowerCase();
    return normalized === domain || normalized.endsWith(`.${domain}`) || domain.endsWith(`.${normalized}`);
  });
}

function resolveEntity(
  task: string,
  options?: {
    brief?: ResearchBrief;
    understanding?: MarketUnderstanding | null;
  },
): string | null {
  if (options?.understanding?.entity?.canonicalName?.trim()) {
    return options.understanding.entity.canonicalName.trim();
  }
  if (options?.understanding?.subject?.trim()) {
    return options.understanding.subject.trim();
  }
  if (options?.brief?.scope === 'narrow' && options.brief.query.trim()) {
    return options.brief.query.trim();
  }
  return task.trim() || null;
}

function buildRunBase(input: {
  task: string;
  markdown: string;
  reportKind: ResearchReportKind;
  queryStrategy: ResearchBrief['query_strategy'] | 'light';
  status: ResearchRunStatus;
  walletAddress?: string | null;
  sessionId?: string | null;
  sourceCount: number;
  distinctDomainCount: number;
  hasSufficientDiversity: boolean;
  driftRisk?: 'low' | 'medium' | 'high' | null;
  timeSensitivity?: ResearchBrief['time_sensitivity'] | null;
  resolvedEntity?: string | null;
  entityAliases?: string[];
  entityCategory?: string | null;
  underlyingEntity?: string | null;
}): ResearchRunRow {
  return {
    wallet_address: input.walletAddress ?? null,
    session_id: input.sessionId ?? null,
    query: input.task,
    normalized_query: input.task,
    report_kind: input.reportKind,
    query_strategy: input.queryStrategy,
    resolved_entity: input.resolvedEntity ?? null,
    entity_aliases: input.entityAliases ?? [],
    entity_category: input.entityCategory ?? null,
    underlying_entity: input.underlyingEntity ?? null,
    time_sensitivity: input.timeSensitivity ?? 'recent',
    status: input.status,
    source_count: input.sourceCount,
    distinct_domain_count: input.distinctDomainCount,
    has_sufficient_diversity: input.hasSufficientDiversity,
    drift_risk: input.driftRisk ?? null,
    report_summary: summarizeMarkdown(input.markdown),
    report_markdown: input.markdown,
  };
}

function buildMemoryPromptBlock(results: ResearchMemorySearchResult[]): string {
  if (!results.length) return '';
  const lines = results.slice(0, 4).map((result, index) => {
    const label =
      result.chunk_type === 'claim'
        ? 'Prior claim'
        : result.chunk_type === 'source_snippet'
          ? 'Prior source note'
          : 'Prior summary';
    const entity = result.metadata?.resolved_entity ? ` | entity: ${result.metadata.resolved_entity}` : '';
    const domain = result.metadata?.source_domain ? ` | source: ${result.metadata.source_domain}` : '';
    return `${index + 1}. ${label}${entity}${domain} -> ${result.content}`;
  });

  return [
    'PRIOR RESEARCH MEMORY:',
    'Use these only as retrieval hints or historical context.',
    'Do not treat them as current evidence unless the current run independently re-verifies them.',
    ...lines,
  ].join('\n');
}

export async function buildResearchMemoryContext(input: {
  task: string;
  reportKind: ResearchReportKind;
  resolvedEntity?: string | null;
}): Promise<ResearchMemoryContext | null> {
  const query = input.resolvedEntity?.trim() || input.task.trim();
  if (!query) return null;

  try {
    const results = await searchResearchMemory(query, {
      threshold: MEMORY_THRESHOLD,
      limit: MEMORY_RESULT_LIMIT,
      entity: input.resolvedEntity ?? undefined,
      reportKind: input.reportKind,
    });
    if (!results.length) return null;
    return {
      results,
      promptBlock: buildMemoryPromptBlock(results),
    };
  } catch (error) {
    console.warn('[research-memory] retrieval skipped:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function persistDeepResearchMemory(input: {
  task: string;
  markdownReport: string;
  brief: ResearchBrief;
  sources: Source[];
  claims: VerifiedClaim[];
  sourceDiagnostics: SourceDiagnostics;
  walletAddress?: string | null;
  sessionId?: string | null;
}): Promise<string> {
  const reportKind = inferReportKind(input.task);
  const resolvedEntity = resolveEntity(input.task, { brief: input.brief });

  const memoryInput: SaveResearchMemoryInput = {
    run: buildRunBase({
      task: input.task,
      markdown: input.markdownReport,
      reportKind,
      queryStrategy: input.brief.query_strategy,
      status:
        input.sources.length === 0 || input.sourceDiagnostics.has_sufficient_diversity === false ? 'thin' : 'done',
      walletAddress: input.walletAddress ?? null,
      sessionId: input.sessionId ?? null,
      sourceCount: input.sources.length,
      distinctDomainCount: input.sourceDiagnostics.distinct_domains,
      hasSufficientDiversity: input.sourceDiagnostics.has_sufficient_diversity,
      driftRisk: input.sourceDiagnostics.drift_risk,
      timeSensitivity: input.brief.time_sensitivity,
      resolvedEntity,
    }),
    sources: input.sources.map((source): ResearchSourceRow => ({
      run_id: '',
      url: source.url,
      domain: source.domain,
      title: source.title,
      snippet: source.snippet,
      source_type: inferSourceTypeFromReliability(source),
      reliability: source.reliability,
      published_at: source.date || null,
      retrieval_provider: 'registry',
      is_primary: source.reliability === 'high',
      is_official_domain: false,
      used_in_final_report: true,
    })),
    claims: input.claims.map((claim): ResearchClaimRow => ({
      run_id: '',
      claim: claim.claim,
      normalized_claim: claim.claim,
      status: claim.status,
      confidence: claim.confidence,
      date_or_period: claim.date || null,
      resolved_entity: claim.entities[0] || resolvedEntity,
      supporting_source_url: claim.source_url,
      supporting_source_domain: sourceHostname(claim.source_url) || null,
      supporting_snippet: claim.supporting_snippet || null,
    })),
    chunks: [
      {
        chunk_type: 'summary' as ResearchChunkType,
        content: summarizeMarkdown(input.markdownReport) || input.markdownReport,
      },
      ...input.claims.slice(0, 12).map((claim) => ({
        chunk_type: 'claim' as ResearchChunkType,
        content: claim.claim,
        metadata: {
          claim_status: claim.status,
          source_domain: sourceHostname(claim.source_url) || null,
          published_at: claim.date || null,
        },
      })),
      ...input.sources.slice(0, 8).map((source) => ({
        chunk_type: 'source_snippet' as ResearchChunkType,
        content: `${source.title}. ${source.snippet}`.trim(),
        metadata: {
          source_domain: source.domain,
          published_at: source.date || null,
          is_primary: source.reliability === 'high',
          is_official_domain: false,
        },
      })),
    ].filter((chunk) => chunk.content.trim()),
  };

  return saveResearchMemory(memoryInput);
}

function inferSourceTypeFromReliability(source: Source): string {
  if (source.reliability === 'high') return 'official';
  if (/\b(blog|substack|medium)\b/i.test(source.domain)) return 'blog';
  if (/\b(reddit|forum)\b/i.test(source.domain)) return 'forum';
  return 'news';
}

function getArrayObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function collectFastSources(
  liveData: FastMemoryLiveData,
  understanding?: MarketUnderstanding | null,
): ResearchSourceRow[] {
  const out: ResearchSourceRow[] = [];
  const push = (source: ResearchSourceRow) => {
    if (!source.url?.trim()) return;
    const domain = source.domain || sourceHostname(source.url) || '';
    if (!domain) return;
    out.push({
      ...source,
      run_id: '',
      domain,
      is_official_domain:
        source.is_official_domain ?? isOfficialSource({ domain }, understanding),
    });
  };

  const currentEvents =
    liveData.current_events && typeof liveData.current_events === 'object'
      ? (liveData.current_events as Record<string, unknown>)
      : null;
  for (const article of getArrayObjects(currentEvents?.article_snapshots)) {
    const url = typeof article.url === 'string' ? article.url.trim() : '';
    const title = typeof article.title === 'string' ? article.title.trim() : '';
    if (!url || !title) continue;
    push({
      run_id: '',
      url,
      domain: sourceHostname(url) || '',
      title,
      snippet: typeof article.snippet === 'string' ? article.snippet.trim() : null,
      source_type: 'news',
      reliability: 'high',
      published_at: typeof article.published_at === 'string' ? article.published_at : null,
      retrieval_provider: 'firecrawl',
      is_primary: true,
      used_in_final_report: true,
    });
  }

  const dynamicSources =
    liveData.dynamic_sources && typeof liveData.dynamic_sources === 'object'
      ? (liveData.dynamic_sources as Record<string, unknown>)
      : null;
  for (const article of getArrayObjects(dynamicSources?.articles)) {
    const url = typeof article.url === 'string' ? article.url.trim() : '';
    const title = typeof article.title === 'string' ? article.title.trim() : '';
    if (!url || !title) continue;
    push({
      run_id: '',
      url,
      domain: sourceHostname(url) || '',
      title,
      snippet: typeof article.snippet === 'string' ? article.snippet.trim() : null,
      source_type: 'news',
      reliability: 'medium',
      published_at: typeof article.published_at === 'string' ? article.published_at : null,
      retrieval_provider: 'searxng',
      is_primary: false,
      used_in_final_report: true,
    });
  }

  const wikipedia =
    liveData.wikipedia && typeof liveData.wikipedia === 'object'
      ? (liveData.wikipedia as Record<string, unknown>)
      : null;
  for (const page of getArrayObjects(wikipedia?.pages)) {
    const url = typeof page.url === 'string' ? page.url.trim() : '';
    const title = typeof page.title === 'string' ? page.title.trim() : '';
    if (!url || !title) continue;
    push({
      run_id: '',
      url,
      domain: sourceHostname(url) || '',
      title,
      snippet: typeof page.extract === 'string' ? page.extract.trim() : null,
      source_type: 'reference',
      reliability: 'medium',
      retrieval_provider: 'live_data',
      is_primary: false,
      used_in_final_report: true,
    });
  }

  const deduped = new Map<string, ResearchSourceRow>();
  for (const source of out) {
    const key = source.url.trim().toLowerCase();
    if (!deduped.has(key)) deduped.set(key, source);
  }
  return [...deduped.values()].slice(0, 16);
}

export async function persistFastResearchMemory(input: {
  task: string;
  markdownReport: string;
  liveDataPayload?: FastMemoryLiveData | null;
  brief?: ResearchBrief | null;
  marketUnderstanding?: MarketUnderstanding | null;
  portfolioImpact?: boolean;
  walletAddress?: string | null;
  sessionId?: string | null;
}): Promise<string> {
  const reportKind = inferReportKind(input.task, { portfolioImpact: input.portfolioImpact });
  const resolvedEntity = resolveEntity(input.task, {
    brief: input.brief ?? undefined,
    understanding: input.marketUnderstanding ?? undefined,
  });
  const sources = input.liveDataPayload
    ? collectFastSources(input.liveDataPayload, input.marketUnderstanding)
    : [];
  const sourceDiagnostics =
    input.liveDataPayload?.source_diagnostics &&
    typeof input.liveDataPayload.source_diagnostics === 'object'
      ? (input.liveDataPayload.source_diagnostics as Record<string, unknown>)
      : null;
  const sourceCount = sources.length;
  const distinctDomainCount = collectDistinctDomains(sources);
  const hasSufficientDiversity =
    typeof sourceDiagnostics?.has_sufficient_diversity === 'boolean'
      ? Boolean(sourceDiagnostics.has_sufficient_diversity)
      : distinctDomainCount >= 2;
  const driftRisk =
    sourceDiagnostics?.drift_risk === 'low' ||
    sourceDiagnostics?.drift_risk === 'medium' ||
    sourceDiagnostics?.drift_risk === 'high'
      ? sourceDiagnostics.drift_risk
      : null;

  const memoryInput: SaveResearchMemoryInput = {
    run: buildRunBase({
      task: input.task,
      markdown: input.markdownReport,
      reportKind,
      queryStrategy: input.brief?.query_strategy ?? 'light',
      status: sourceCount === 0 || !hasSufficientDiversity ? 'thin' : 'done',
      walletAddress: input.walletAddress ?? null,
      sessionId: input.sessionId ?? null,
      sourceCount,
      distinctDomainCount,
      hasSufficientDiversity,
      driftRisk,
      timeSensitivity: input.brief?.time_sensitivity ?? 'recent',
      resolvedEntity,
      entityAliases: input.marketUnderstanding?.entity?.aliases ?? [],
      entityCategory:
        reportKind === 'prediction_market'
          ? 'prediction_market'
          : reportKind === 'portfolio_impact'
            ? 'portfolio_impact'
            : null,
      underlyingEntity: input.marketUnderstanding?.underlying ?? null,
    }),
    sources,
    chunks: [
      {
        chunk_type: 'summary' as ResearchChunkType,
        content: summarizeMarkdown(input.markdownReport) || input.markdownReport,
      },
      ...sources.slice(0, 8).map((source) => ({
        chunk_type: 'source_snippet' as ResearchChunkType,
        content: `${source.title}. ${source.snippet || ''}`.trim(),
        metadata: {
          source_domain: source.domain,
          published_at: source.published_at ?? null,
          is_primary: source.is_primary ?? null,
          is_official_domain: source.is_official_domain ?? null,
        },
      })),
    ].filter((chunk) => chunk.content.trim()),
  };

  return saveResearchMemory(memoryInput);
}

export function extractRequestMemoryIdentity(body: Record<string, unknown> | undefined): {
  walletAddress: string | null;
  sessionId: string | null;
} {
  return {
    walletAddress: normalizeWalletAddress(body?.userAddress),
    sessionId: typeof body?.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : null,
  };
}
