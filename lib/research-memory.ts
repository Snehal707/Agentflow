import { adminDb } from './supabase';
import { generateEmbedding, generateEmbeddings } from './rag/embeddings';

export type ResearchReportKind =
  | 'general'
  | 'prediction_market'
  | 'portfolio_impact'
  | 'protocol'
  | 'macro';

export type ResearchQueryStrategy = 'direct' | 'light' | 'standard';
export type ResearchRunStatus = 'done' | 'thin' | 'failed';
export type ResearchChunkType = 'summary' | 'claim' | 'source_snippet';
export type ResearchClaimStatus =
  | 'Confirmed'
  | 'Reported'
  | 'Disputed'
  | 'Outdated'
  | 'Insufficient';
export type ResearchReliability = 'high' | 'medium' | 'low';
export type ResearchRetrievalProvider =
  | 'firecrawl'
  | 'searxng'
  | 'registry'
  | 'live_data'
  | 'unknown';

export type ResearchRunRow = {
  id?: string;
  wallet_address?: string | null;
  session_id?: string | null;
  query: string;
  normalized_query: string;
  report_kind: ResearchReportKind;
  query_strategy: ResearchQueryStrategy;
  resolved_entity?: string | null;
  entity_aliases?: string[];
  entity_category?: string | null;
  underlying_entity?: string | null;
  time_sensitivity?: 'live' | 'recent' | 'historical' | null;
  status: ResearchRunStatus;
  source_count?: number | null;
  distinct_domain_count?: number | null;
  has_sufficient_diversity?: boolean | null;
  drift_risk?: 'low' | 'medium' | 'high' | null;
  report_summary?: string | null;
  report_markdown?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ResearchSourceRow = {
  id?: string;
  run_id: string;
  url: string;
  domain: string;
  title?: string | null;
  snippet?: string | null;
  source_type?: string | null;
  reliability?: ResearchReliability | null;
  published_at?: string | null;
  retrieval_provider?: ResearchRetrievalProvider | null;
  is_primary?: boolean | null;
  is_official_domain?: boolean | null;
  used_in_final_report?: boolean | null;
  created_at?: string;
};

export type ResearchClaimRow = {
  id?: string;
  run_id: string;
  claim: string;
  normalized_claim: string;
  status: ResearchClaimStatus;
  confidence?: number | null;
  date_or_period?: string | null;
  resolved_entity?: string | null;
  supporting_source_url?: string | null;
  supporting_source_domain?: string | null;
  supporting_snippet?: string | null;
  created_at?: string;
};

export type ResearchChunkMetadata = {
  run_id: string;
  report_kind: ResearchReportKind;
  resolved_entity?: string | null;
  entity_category?: string | null;
  source_domain?: string | null;
  claim_status?: ResearchClaimStatus | null;
  published_at?: string | null;
  is_primary?: boolean | null;
  is_official_domain?: boolean | null;
  created_at?: string | null;
};

export type ResearchChunkRow = {
  id?: string;
  run_id: string;
  chunk_type: ResearchChunkType;
  content: string;
  embedding: number[];
  metadata?: ResearchChunkMetadata;
  created_at?: string;
};

export type ResearchMemorySearchResult = {
  id: string;
  run_id: string;
  chunk_type: ResearchChunkType;
  content: string;
  metadata: ResearchChunkMetadata;
  similarity: number;
};

export type SaveResearchMemoryInput = {
  run: ResearchRunRow;
  sources?: ResearchSourceRow[];
  claims?: ResearchClaimRow[];
  chunks?: Array<{
    chunk_type: ResearchChunkType;
    content: string;
    metadata?: Omit<ResearchChunkMetadata, 'run_id' | 'report_kind'>;
  }>;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeArray(values: Array<string | null | undefined> | undefined, limit: number): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = typeof raw === 'string' ? normalizeText(raw) : '';
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeResearchRun(input: ResearchRunRow): ResearchRunRow {
  return {
    ...input,
    query: normalizeText(input.query),
    normalized_query: normalizeText(input.normalized_query).toLowerCase(),
    resolved_entity: input.resolved_entity ? normalizeText(input.resolved_entity) : null,
    entity_aliases: normalizeArray(input.entity_aliases, 12),
    entity_category: input.entity_category ? normalizeText(input.entity_category) : null,
    underlying_entity: input.underlying_entity ? normalizeText(input.underlying_entity) : null,
    report_summary: input.report_summary ? normalizeText(input.report_summary) : null,
    report_markdown: input.report_markdown ?? null,
    source_count: input.source_count ?? 0,
    distinct_domain_count: input.distinct_domain_count ?? 0,
    has_sufficient_diversity: input.has_sufficient_diversity ?? false,
  };
}

export async function saveResearchMemory(input: SaveResearchMemoryInput): Promise<string> {
  const run = normalizeResearchRun(input.run);
  const insertedRun = await adminDb.from('research_runs').insert(run).select('id').single();
  if (insertedRun.error) {
    throw insertedRun.error;
  }

  const runId = String((insertedRun.data as { id: string }).id);

  if (input.sources?.length) {
    const sources = input.sources.map((source) => ({
      ...source,
      run_id: runId,
      url: source.url.trim(),
      domain: source.domain.trim().toLowerCase(),
      title: source.title ? normalizeText(source.title) : null,
      snippet: source.snippet ? normalizeText(source.snippet) : null,
    }));
    const { error } = await adminDb.from('research_sources').insert(sources);
    if (error) {
      throw error;
    }
  }

  if (input.claims?.length) {
    const claims = input.claims.map((claim) => ({
      ...claim,
      run_id: runId,
      claim: normalizeText(claim.claim),
      normalized_claim: normalizeText(claim.normalized_claim).toLowerCase(),
      resolved_entity: claim.resolved_entity ? normalizeText(claim.resolved_entity) : null,
      supporting_snippet: claim.supporting_snippet ? normalizeText(claim.supporting_snippet) : null,
    }));
    const { error } = await adminDb.from('research_claims').insert(claims);
    if (error) {
      throw error;
    }
  }

  if (input.chunks?.length) {
    const contents = input.chunks.map((chunk) => normalizeText(chunk.content)).filter(Boolean);
    const embeddings = contents.length ? await generateEmbeddings(contents) : [];
    const chunks: ResearchChunkRow[] = contents.map((content, index) => ({
      run_id: runId,
      chunk_type: input.chunks![index]!.chunk_type,
      content,
      embedding: embeddings[index]!,
      metadata: {
        run_id: runId,
        report_kind: run.report_kind,
        resolved_entity: run.resolved_entity ?? null,
        entity_category: run.entity_category ?? null,
        created_at: run.created_at ?? new Date().toISOString(),
        ...(input.chunks![index]!.metadata ?? {}),
      },
    }));
    const { error } = await adminDb.from('research_chunks').insert(chunks);
    if (error) {
      throw error;
    }
  }

  return runId;
}

export async function searchResearchMemory(
  query: string,
  options: {
    threshold?: number;
    limit?: number;
    entity?: string;
    reportKind?: ResearchReportKind;
    chunkType?: ResearchChunkType;
  } = {},
): Promise<ResearchMemorySearchResult[]> {
  const embedding = await generateEmbedding(query);
  const { data, error } = await adminDb.rpc('match_research_chunks', {
    query_embedding: embedding,
    match_threshold: options.threshold ?? 0.72,
    match_count: options.limit ?? 8,
    filter_entity: options.entity ?? null,
    filter_report_kind: options.reportKind ?? null,
    filter_chunk_type: options.chunkType ?? null,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    run_id: String(row.run_id),
    chunk_type: row.chunk_type as ResearchChunkType,
    content: String(row.content ?? ''),
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as ResearchChunkMetadata)
        : ({ run_id: String(row.run_id), report_kind: 'general' } as ResearchChunkMetadata),
    similarity: Number(row.similarity ?? 0),
  }));
}
