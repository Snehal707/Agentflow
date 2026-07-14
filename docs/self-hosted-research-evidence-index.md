# Self-hosted research evidence index

AgentFlow uses a query-driven evidence index. It does not attempt to crawl or copy the whole web.
Every successful research run can contribute public source passages and verified claims, while
wallet context and generated report prose remain outside the shared index.

## Runtime flow

1. Parse the request into an external research topic and an independent portfolio-impact flag.
2. Search unexpired evidence in the local Meilisearch index.
3. If local evidence satisfies the source/domain floor, reuse it. Otherwise query Firecrawl,
   SearXNG, the source registry, RSS feeds, and official APIs for the missing coverage.
4. Apply source policy and entity relevance gates.
5. Extract and verify claims.
6. Store public source excerpts and supported claims in the evidence index.
7. Synthesize the report and add private portfolio analysis only after public-event research.

Generated summaries are never promoted into the shared evidence index. Only retrieved public
source material and source-linked verified claims are indexed.

## Evidence document boundary

The index stores:

- canonical and retrieved URL
- publisher/domain, title, source type, and reliability
- publication, fetch, recheck, and expiry timestamps
- a bounded source excerpt
- content hash, entities, topics, and verified claims
- retrieval-provider provenance

The index does not store:

- wallet addresses, balances, positions, PnL, or wallet context
- generated report prose as factual evidence
- full third-party articles by default
- secrets or paid-provider credentials

## VPS deployment

The VPS should have 4-8 GB of swap before enabling local embedding jobs. Meilisearch is bound to
localhost, limited to two CPUs and 2 GB RAM, and configured to use at most 1.5 GB for indexing.

From the repository on the VPS:

```bash
cd infra/research-index
export MEILI_MASTER_KEY="$(openssl rand -hex 32)"
docker compose up -d
```

Persist the generated key in the VPS secret/environment mechanism. Do not commit it.

Configure AgentFlow:

```dotenv
RESEARCH_INDEX_ENABLED=true
RESEARCH_INDEX_URL=http://127.0.0.1:7700
RESEARCH_INDEX_UID=research_evidence
RESEARCH_INDEX_KEY=<same master key>
RESEARCH_INDEX_LOCAL_EMBEDDINGS=false
```

Initialize the index:

```bash
npm run setup:research-index
```

Start with lexical search. After the service is stable and the local model has downloaded, set:

```dotenv
RESEARCH_INDEX_LOCAL_EMBEDDINGS=true
RESEARCH_INDEX_EMBEDDER_MODEL=BAAI/bge-small-en-v1.5
RESEARCH_INDEX_SEMANTIC_RATIO=0.35
```

Run `npm run setup:research-index` again to configure the local Hugging Face embedder.

## Failure behavior

The evidence index is optional and fail-open. If it is disabled or unhealthy, research continues
through the existing self-hosted retrieval path. Index reads have a short timeout; writes are
asynchronous and cannot fail a completed report.

Expired evidence is not reused for a report. The source may remain stored for audit/history, but a
new external retrieval must refresh it before it can support current claims.

## Verification

```bash
npm run test:research-index-foundation
npm run typecheck
```

The foundation test verifies portfolio-query preservation, expiry handling, authenticated index
requests, and that wallet context cannot leak into indexed evidence documents.
