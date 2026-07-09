CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text,
  session_id text,
  query text NOT NULL,
  normalized_query text NOT NULL,
  report_kind text NOT NULL,
  query_strategy text NOT NULL CHECK (query_strategy IN ('direct', 'light', 'standard')),
  resolved_entity text,
  entity_aliases text[] DEFAULT '{}'::text[],
  entity_category text,
  underlying_entity text,
  time_sensitivity text CHECK (time_sensitivity IN ('live', 'recent', 'historical') OR time_sensitivity IS NULL),
  status text NOT NULL CHECK (status IN ('done', 'thin', 'failed')),
  source_count integer DEFAULT 0,
  distinct_domain_count integer DEFAULT 0,
  has_sufficient_diversity boolean DEFAULT false,
  drift_risk text CHECK (drift_risk IN ('low', 'medium', 'high') OR drift_risk IS NULL),
  report_summary text,
  report_markdown text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_runs_entity_created
  ON research_runs (resolved_entity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_runs_kind_created
  ON research_runs (report_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_runs_status_created
  ON research_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_runs_wallet_created
  ON research_runs (wallet_address, created_at DESC);

CREATE TABLE IF NOT EXISTS research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  url text NOT NULL,
  domain text NOT NULL,
  title text,
  snippet text,
  source_type text,
  reliability text CHECK (reliability IN ('high', 'medium', 'low') OR reliability IS NULL),
  published_at timestamptz,
  retrieval_provider text CHECK (
    retrieval_provider IN ('firecrawl', 'searxng', 'registry', 'live_data', 'unknown')
    OR retrieval_provider IS NULL
  ),
  is_primary boolean DEFAULT false,
  is_official_domain boolean DEFAULT false,
  used_in_final_report boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sources_run
  ON research_sources (run_id);

CREATE INDEX IF NOT EXISTS idx_research_sources_domain_published
  ON research_sources (domain, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_sources_url
  ON research_sources (url);

CREATE TABLE IF NOT EXISTS research_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  claim text NOT NULL,
  normalized_claim text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('Confirmed', 'Reported', 'Disputed', 'Outdated', 'Insufficient')
  ),
  confidence numeric DEFAULT 0.5,
  date_or_period text,
  resolved_entity text,
  supporting_source_url text,
  supporting_source_domain text,
  supporting_snippet text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_claims_run
  ON research_claims (run_id);

CREATE INDEX IF NOT EXISTS idx_research_claims_entity_status
  ON research_claims (resolved_entity, status);

CREATE TABLE IF NOT EXISTS research_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  chunk_type text NOT NULL CHECK (chunk_type IN ('summary', 'claim', 'source_snippet')),
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_chunks_run
  ON research_chunks (run_id);

CREATE INDEX IF NOT EXISTS idx_research_chunks_metadata_entity
  ON research_chunks ((metadata->>'resolved_entity'));

CREATE INDEX IF NOT EXISTS idx_research_chunks_embedding
  ON research_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.match_research_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.72,
  match_count int DEFAULT 8,
  filter_entity text DEFAULT NULL,
  filter_report_kind text DEFAULT NULL,
  filter_chunk_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  run_id uuid,
  chunk_type text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    rc.id,
    rc.run_id,
    rc.chunk_type,
    rc.content,
    rc.metadata,
    1 - (rc.embedding <=> query_embedding) AS similarity
  FROM research_chunks rc
  WHERE
    1 - (rc.embedding <=> query_embedding) >= match_threshold
    AND (filter_entity IS NULL OR lower(coalesce(rc.metadata->>'resolved_entity', '')) = lower(filter_entity))
    AND (filter_report_kind IS NULL OR lower(coalesce(rc.metadata->>'report_kind', '')) = lower(filter_report_kind))
    AND (filter_chunk_type IS NULL OR lower(rc.chunk_type) = lower(filter_chunk_type))
  ORDER BY rc.embedding <=> query_embedding
  LIMIT match_count;
$$;

ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_runs_own_rows ON research_runs;
CREATE POLICY research_runs_own_rows ON research_runs
  USING (
    wallet_address IS NULL
    OR lower(wallet_address) = public.agentflow_auth_wallet()
  )
  WITH CHECK (
    wallet_address IS NULL
    OR lower(wallet_address) = public.agentflow_auth_wallet()
  );

DROP POLICY IF EXISTS research_sources_own_rows ON research_sources;
CREATE POLICY research_sources_own_rows ON research_sources
  USING (
    EXISTS (
      SELECT 1
      FROM research_runs rr
      WHERE rr.id = research_sources.run_id
        AND (
          rr.wallet_address IS NULL
          OR lower(rr.wallet_address) = public.agentflow_auth_wallet()
        )
    )
  );

DROP POLICY IF EXISTS research_claims_own_rows ON research_claims;
CREATE POLICY research_claims_own_rows ON research_claims
  USING (
    EXISTS (
      SELECT 1
      FROM research_runs rr
      WHERE rr.id = research_claims.run_id
        AND (
          rr.wallet_address IS NULL
          OR lower(rr.wallet_address) = public.agentflow_auth_wallet()
        )
    )
  );

DROP POLICY IF EXISTS research_chunks_own_rows ON research_chunks;
CREATE POLICY research_chunks_own_rows ON research_chunks
  USING (
    EXISTS (
      SELECT 1
      FROM research_runs rr
      WHERE rr.id = research_chunks.run_id
        AND (
          rr.wallet_address IS NULL
          OR lower(rr.wallet_address) = public.agentflow_auth_wallet()
        )
    )
  );
