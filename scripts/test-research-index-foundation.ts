import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  detectPortfolioImpactIntent,
  parseResearchRequest,
  stripPortfolioImpactPhrasing,
} from '../lib/portfolio-impact-intent';
import {
  indexFastResearchEvidence,
  searchLocalEvidence,
  type EvidenceDocument,
} from '../lib/local-evidence-index';
import { buildResearchQueries } from '../agents/research/queryGen';
import { retrieveSources } from '../agents/research/retriever';
import { enforceRetrievedSourceUrls } from '../agents/research/synthesizer';
import {
  deriveAllowedEntities,
  hasNamedEntityAndStrongNarrowingSignal,
} from '../agents/research/entityDetection';
import type { ResearchBrief, Source } from '../agents/research/types';

const portfolioCases = [
  {
    input: 'How would new US stablecoin regulation affect my portfolio holdings?',
    expected: 'new US stablecoin regulation',
  },
  {
    input: 'make report on next fed meeting and how does it affect my portfolio',
    expected: 'make report on next fed meeting',
  },
  {
    input: 'make a research report on global warming and how can it affect my holdings',
    expected: 'make a research report on global warming',
  },
  {
    input: 'Research Arc and explain how it affects my USDC and Gateway holdings',
    expected: 'Research Arc',
  },
  {
    input: 'Research the next Fed meeting and personalize this report based on my holdings',
    expected: 'Research the next Fed meeting',
  },
];

for (const testCase of portfolioCases) {
  assert.equal(
    detectPortfolioImpactIntent(testCase.input),
    true,
    `expected portfolio intent: ${testCase.input}`,
  );
  assert.equal(stripPortfolioImpactPhrasing(testCase.input), testCase.expected);
  const parsed = parseResearchRequest(testCase.input);
  assert.equal(parsed.originalTask, testCase.input);
  assert.equal(parsed.researchTask, testCase.expected);
  assert.equal(parsed.portfolioImpact, true);
}

const plain = parseResearchRequest('research the future of AI in China');
assert.equal(plain.portfolioImpact, false);
assert.equal(plain.researchTask, plain.originalTask);

const aiBrief = {
  query: 'future of AI in China latest report',
  intent: 'forecast',
  scope: 'broad',
  query_strategy: 'standard',
  time_sensitivity: 'recent',
  required_freshness_days: 30,
  geography: ['China'],
  domains_priority: [],
  domains_avoid: [],
  preferred_source_types: ['official', 'news', 'research'],
  must_answer: ['What is changing in Chinese AI?'],
  avoid_drift: ['Future the rapper'],
  minimum_source_diversity: 3,
  max_query_variants: 8,
  target_source_count: 10,
  sub_questions: ['China AI models and policy'],
  evaluation_rubric: 'source-backed',
} satisfies ResearchBrief;
const aiFutureQueries = buildResearchQueries(aiBrief);
assert.ok(aiFutureQueries.some((query) => /^AI in China\b/i.test(query)));
assert.equal(aiFutureQueries.some((query) => /^future\b/i.test(query)), false);
assert.deepEqual(deriveAllowedEntities(aiBrief), ['China']);
assert.equal(
  hasNamedEntityAndStrongNarrowingSignal(aiBrief.query, aiBrief).matched,
  false,
  'freshness terms must not convert a broad geographic topic into narrow scope',
);
assert.equal(
  hasNamedEntityAndStrongNarrowingSignal('Compare OpenAI vs Anthropic models', {
    query: 'Compare OpenAI vs Anthropic models',
    must_answer: [],
    sub_questions: [],
  }).matched,
  true,
  'comparison language should still force entity-aware narrow scope',
);

const bibliographySources: Source[] = [
  {
    title: 'Circle launches Arc public testnet',
    url: 'https://www.circle.com/pressroom/arc-public-testnet',
    date: '2025-10-28',
    snippet: 'Official launch evidence.',
    domain: 'circle.com',
    reliability: 'high',
  },
  {
    title: 'Arc roadmap [analysis]',
    url: 'https://example.com/arc-roadmap_(2026)',
    date: '',
    snippet: 'Roadmap analysis.',
    domain: 'example.com',
    reliability: 'medium',
  },
];
const reportWithNameOnlySources = enforceRetrievedSourceUrls(
  '# Arc report\n\n## Summary\nEvidence-backed summary.\n\n### **Sources**\n\n1. Circle Official Blog\n2. Example News',
  bibliographySources,
);
assert.match(reportWithNameOnlySources, /\[Circle launches Arc public testnet\]\(<https:\/\/www\.circle\.com\/pressroom\/arc-public-testnet>\)/);
assert.match(reportWithNameOnlySources, /https:\/\/example\.com\/arc-roadmap_\(2026\)/);
assert.doesNotMatch(reportWithNameOnlySources, /1\. Circle Official Blog/);
assert.equal((reportWithNameOnlySources.match(/^## Sources$/gm) ?? []).length, 1);

const reportWithoutSources = enforceRetrievedSourceUrls('# Arc report\n\n## Summary\nText.', bibliographySources);
assert.match(reportWithoutSources, /## Sources[\s\S]+https:\/\/www\.circle\.com/);

const requests: Array<{ method: string; url: string; authorization: string; body: unknown }> = [];
const now = Date.now();
const fresh: EvidenceDocument = {
  id: 'fresh',
  canonical_url: 'https://example.com/evidence',
  url: 'https://example.com/evidence',
  domain: 'example.com',
  title: 'Fresh evidence',
  publisher: 'Example',
  content: 'Fresh source-backed evidence about the topic.',
  content_hash: 'hash',
  source_type: 'article',
  reliability: 'medium',
  authority: 6,
  published_at: new Date(now - 60_000).toISOString(),
  fetched_at: new Date(now - 30_000).toISOString(),
  recheck_at: new Date(now + 60_000).toISOString(),
  expires_at: new Date(now + 60_000).toISOString(),
  entities: ['Example'],
  topics: ['example'],
  supported_claims: ['A supported claim'],
  retrieval_providers: ['test'],
  evidence_version: 1,
};
const expired = { ...fresh, id: 'expired', expires_at: new Date(now - 60_000).toISOString() };

let searchHits: EvidenceDocument[] = [fresh, expired];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    const bodyText = Buffer.concat(chunks).toString('utf8');
    requests.push({
      method: req.method || '',
      url: req.url || '',
      authorization: String(req.headers.authorization || ''),
      body: bodyText ? JSON.parse(bodyText) : null,
    });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/search')) {
      res.end(JSON.stringify({ hits: searchHits }));
      return;
    }
    res.end(JSON.stringify({ taskUid: 1 }));
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  process.env.RESEARCH_INDEX_ENABLED = 'true';
  process.env.RESEARCH_INDEX_URL = `http://127.0.0.1:${address.port}`;
  process.env.RESEARCH_INDEX_KEY = 'test-key';

  const hits = await searchLocalEvidence('example topic', { limit: 5 });
  assert.deepEqual(hits.map((hit) => hit.id), ['fresh'], 'expired evidence must not be reused');

  const indexed = await indexFastResearchEvidence('latest example topic', {
    dynamic_sources: {
      articles: [
        {
          title: 'Publisher evidence',
          publisher: 'Example Publisher',
          url: 'https://publisher.example/story?utm_source=test',
          snippet: 'A concise evidence passage from the public source.',
          published_at: new Date().toISOString(),
        },
      ],
    },
    wallet_context: {
      holdings: [{ symbol: 'USDC', balance: 'private' }],
    },
  });
  assert.equal(indexed, 1);
  const upsertRequest = requests.find((request) => request.url.includes('/documents'));
  assert.ok(upsertRequest, 'expected evidence document upsert');
  assert.equal(upsertRequest.authorization, 'Bearer test-key');
  assert.equal(JSON.stringify(upsertRequest.body).includes('wallet_context'), false);
  assert.equal(JSON.stringify(upsertRequest.body).includes('private'), false);

  searchHits = Array.from({ length: 6 }, (_, index) => ({
    ...fresh,
    id: `local-${index}`,
    canonical_url: `https://source${index}.example/china-ai`,
    url: `https://source${index}.example/china-ai`,
    domain: `source${index}.example`,
    title: `China AI evidence ${index}`,
    publisher: `Publisher ${index}`,
    content: 'AI in China models policy chips infrastructure adoption future outlook.',
  }));
  const localOnlySources = await retrieveSources(aiBrief, aiFutureQueries);
  assert.equal(localOnlySources.length, 6);
  assert.equal(new Set(localOnlySources.map((source) => source.domain)).size, 6);
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log('research index foundation tests passed');
