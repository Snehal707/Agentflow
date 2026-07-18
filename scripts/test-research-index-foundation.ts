import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  detectPortfolioImpactIntent,
  parseResearchRequest,
  stripPortfolioImpactPhrasing,
} from '../lib/portfolio-impact-intent';
import {
  indexFastResearchEvidence,
  mergeLocalEvidenceIntoLiveData,
  searchLocalEvidence,
  type EvidenceDocument,
} from '../lib/local-evidence-index';
import { buildResearchQueries } from '../agents/research/queryGen';
import { retrieveSources } from '../agents/research/retriever';
import { enforceRetrievedSourceUrls } from '../agents/research/synthesizer';
import { assessFastReportEvidence } from '../lib/reportPipeline';
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
    input: 'Research on the next Fed meeting and its impact on my portfolio',
    expected: 'Research on the next Fed meeting',
  },
  {
    input: 'research the next Fed meeting on the basis of my portfolio',
    expected: 'research the next Fed meeting',
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

// Non-portfolio research must stay untouched (no false strip).
const plainResearchCases = [
  'research the future of AI in China',
  'make a report on bitcoin',
  'Who Will Win the FIFA World Cup 2026?',
];
for (const input of plainResearchCases) {
  assert.equal(
    detectPortfolioImpactIntent(input),
    false,
    `must not detect portfolio impact: ${input}`,
  );
  assert.equal(stripPortfolioImpactPhrasing(input), input);
}

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

  const expiredButFreshSportsResult: EvidenceDocument = {
    ...fresh,
    id: 'world-cup-finalists',
    canonical_url: 'https://www.fifa.com/world-cup/finalists',
    url: 'https://www.fifa.com/world-cup/finalists',
    domain: 'fifa.com',
    title: 'Spain and Argentina advance to the World Cup final',
    publisher: 'FIFA',
    content: 'Spain defeated France and Argentina beat England to book their places in the final.',
    reliability: 'high',
    authority: 9,
    published_at: new Date(now - 36 * 60 * 60 * 1_000).toISOString(),
    expires_at: new Date(now - 60_000).toISOString(),
  };
  const expiredAndStaleSportsResult: EvidenceDocument = {
    ...expiredButFreshSportsResult,
    id: 'old-world-cup-result',
    canonical_url: 'https://www.fifa.com/world-cup/old-result',
    url: 'https://www.fifa.com/world-cup/old-result',
    title: 'Old World Cup semifinal result',
    published_at: new Date(now - 4 * 24 * 60 * 60 * 1_000).toISOString(),
  };
  const expiredButFreshAnalystResult: EvidenceDocument = {
    ...expiredButFreshSportsResult,
    id: 'world-cup-analyst-final',
    canonical_url: 'https://theanalyst.com/world-cup/final',
    url: 'https://theanalyst.com/world-cup/final',
    domain: 'theanalyst.com',
    title: 'England 1-2 Argentina sets up World Cup final against Spain',
    publisher: 'The Analyst',
    content: 'Argentina beat England 2-1 and advanced to the final against Spain.',
  };
  const expiredButFreshOddsUpdate: EvidenceDocument = {
    ...expiredButFreshSportsResult,
    id: 'world-cup-final-odds',
    canonical_url: 'https://www.foxsports.com/world-cup/final-odds',
    url: 'https://www.foxsports.com/world-cup/final-odds',
    domain: 'foxsports.com',
    title: 'World Cup title odds: Spain favored over Argentina in final',
    publisher: 'Fox Sports',
    content: 'A dated final-stage odds update lists Spain as favored over Argentina.',
    reliability: 'medium',
    authority: 6,
  };
  searchHits = [
    expiredButFreshSportsResult,
    expiredButFreshAnalystResult,
    expiredButFreshOddsUpdate,
    expiredAndStaleSportsResult,
  ];
  const sportsTask = [
    'Research the prediction market topic: Who Will Win the FIFA World Cup 2026?',
    'Prediction market category in AgentFlow: Sports.',
  ].join('\n');
  const sportsFailoverLiveData = await mergeLocalEvidenceIntoLiveData(
    sportsTask,
    { dynamic_sources: { articles: [] } },
  );
  const failoverArticles = (
    (sportsFailoverLiveData?.dynamic_sources as { articles?: EvidenceDocument[] })?.articles ?? []
  );
  assert.deepEqual(
    failoverArticles.map((article) => article.title),
    [
      'Spain and Argentina advance to the World Cup final',
      'England 1-2 Argentina sets up World Cup final against Spain',
      'World Cup title odds: Spain favored over Argentina in final',
    ],
    'an expired cache entry may be reused only while its dated sports result remains inside the gate freshness window',
  );
  const cachedSportsAssessment = assessFastReportEvidence({
    task: sportsTask,
    research: null,
    liveData: sportsFailoverLiveData,
  });
  assert.equal(
    cachedSportsAssessment.ok,
    true,
    `expected cached, still-fresh sports results to clear the pre-Analyst gate: ${cachedSportsAssessment.issues.join('; ')}`,
  );

  const unrelatedFreshWorldCupEvidence: EvidenceDocument = {
    ...fresh,
    id: 'fresh-world-cup-for-wrong-market',
    canonical_url: 'https://www.fifa.com/world-cup/final',
    url: 'https://www.fifa.com/world-cup/final',
    domain: 'fifa.com',
    title: 'Spain and Argentina meet in the FIFA World Cup final',
    publisher: 'FIFA',
    content: 'The confirmed World Cup final is Spain against Argentina.',
    published_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
  };
  const relevantFreshGtaEvidence: EvidenceDocument = {
    ...fresh,
    id: 'fresh-gta-release',
    canonical_url: 'https://www.rockstargames.com/gta-vi/release',
    url: 'https://www.rockstargames.com/gta-vi/release',
    domain: 'rockstargames.com',
    title: 'Grand Theft Auto VI release update',
    publisher: 'Rockstar Games',
    content: 'Rockstar published a GTA 6 release update for consoles.',
    published_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
  };
  searchHits = [unrelatedFreshWorldCupEvidence, relevantFreshGtaEvidence];
  const gtaTask = [
    'research the prediction market topic: Will GTA 6 launch before November 30, 2026?',
    'Prediction market category in AgentFlow: Games.',
  ].join('\n');
  const gtaLiveData = await mergeLocalEvidenceIntoLiveData(
    gtaTask,
    { dynamic_sources: { articles: [] } },
  );
  const gtaArticles = (
    (gtaLiveData?.dynamic_sources as { articles?: Array<{ title: string }> })?.articles ?? []
  );
  assert.deepEqual(
    gtaArticles.map((article) => article.title),
    ['Grand Theft Auto VI release update'],
    'cached evidence from a different prediction-market underlying must not leak into GTA research',
  );

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
