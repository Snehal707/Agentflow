import assert from 'node:assert/strict';
import {
  assessFastReportEvidence,
  collectPreferredReportSources,
  finalizeReportMarkdown,
} from '../lib/reportPipeline';
import {
  buildPrimaryFirecrawlQueryVariants,
  buildCurrentEventQueries,
  extractSportsWinnerNumericEvidenceSnippet,
  filterFastResearchDynamicEvidence,
  selectPredictionMarketEvidenceWithHostDiversity,
  shouldGatherCurrentEvents,
} from '../lib/live-data';
import { isLowValueSourceForTask } from '../lib/source-policy';
import { mergeUnderstandingWithHeuristic, type MarketUnderstanding } from '../lib/market-understanding';
import { buildAnalystModelInput, buildWriterModelInput } from '../lib/reportInputs';
import { buildPredictionTopicResearchPrompt } from '../lib/predmarket-research-context';

const topicOnlyPredictionResearchPrompt = buildPredictionTopicResearchPrompt(
  'Who Will Win the FIFA World Cup 2026?',
  'Sports',
);
assert.match(topicOnlyPredictionResearchPrompt, /Who Will Win the FIFA World Cup 2026/i);
assert.match(topicOnlyPredictionResearchPrompt, /latest real-world event state/i);
assert.doesNotMatch(
  topicOnlyPredictionResearchPrompt,
  /achmarket|provider-implied|market address|France=|Spain=|listed outcomes/i,
);

const badWriterMarkdown = `# Iran-US Tensions Research Report

**Prepared by:** AgentFlow AI

## Executive Summary

No active full-scale war is confirmed. The Strait of Hormuz is fully blocked and fresh direct shipping strikes are confirmed.

## Current Status

- No active full-scale war is confirmed
- The route is fully blocked
- Fresh direct shipping strikes are confirmed

## Analysis

Global shipping is severely impacted and no immediate safe route alternatives remain.

## Conclusion

No war is confirmed and the route is fully blocked.`;

const directApUrl =
  'https://apnews.com/article/iran-hormuz-shipping-tolls-china-de5159966cde7de7b964b3c2c67eec07';
const directPbsUrl =
  'https://www.pbs.org/newshour/world/a-houthi-missile-attack-on-israel-raises-concerns-about-red-sea-shipping-routes-being-blocked';
const aggregatorUrl =
  'https://news.google.com/rss/articles/example-google-news-link';

const research = {
  topic: 'Iran-US Tensions and Shipping Route Impact',
  facts: [
    {
      claim: 'Recent strong-source reporting describes the broader conflict as active',
      value: 'Active conflict framing in late March 2026',
      status: 'reported',
      date_or_period: '2026-03-30',
      confidence: 'high',
      support: 'Current article set',
      source_name: 'Reuters',
      source_url:
        'https://www.reuters.com/world/middle-east/chinese-container-ships-pass-through-strait-hormuz-second-attempt-data-shows-2026-03-30/',
    },
    {
      claim: 'The Strait of Hormuz is severely constrained, with limited passage still occurring',
      value: 'Limited transit resumed',
      status: 'reported',
      date_or_period: '2026-03-26',
      confidence: 'high',
      support: 'Latest shipping article',
      source_name: 'AP News',
      source_url: directApUrl,
    },
    {
      claim: 'Red Sea route risk is elevated, but fresh direct strikes on shipping are not confirmed',
      value: 'Elevated risk only',
      status: 'reported',
      date_or_period: '2026-03-29',
      confidence: 'medium',
      support: 'Latest Red Sea article',
      source_name: 'PBS News',
      source_url: directPbsUrl,
    },
  ],
  recent_developments: [
    {
      event: 'AP News reported that Iran was formalizing passage controls in Hormuz while some traffic still moved.',
      status: 'reported',
      date_or_period: '2026-03-26',
      importance: 'Route-level shipping status',
      support: 'AP News article',
      source_name: 'AP News',
      source_url: directApUrl,
    },
    {
      event: 'PBS News reported that a Houthi strike on Israel raised Red Sea shipping fears without confirming fresh shipping attacks.',
      status: 'reported',
      date_or_period: '2026-03-29',
      importance: 'Route risk',
      support: 'PBS News article',
      source_name: 'PBS News',
      source_url: directPbsUrl,
    },
  ],
  metrics: [
    {
      name: 'Traffic collapse signal',
      value: 'About 90%',
      unit: 'drop in transit since the war began',
      date_or_period: '2026-03-26',
      support: 'AP News article',
      source_name: 'AP News',
      source_url: directApUrl,
    },
  ],
  risks_or_caveats: [
    'Route access remains highly sensitive to political and military signaling.',
    'Red Sea route risk could increase further even if fresh direct shipping strikes are not yet confirmed.',
  ],
  sources: [
    {
      name: 'AP News',
      url: aggregatorUrl,
      used_for: 'Aggregator duplicate that should lose to the direct URL',
    },
    {
      name: 'AP News',
      url: directApUrl,
      used_for: 'Direct Hormuz article',
    },
    {
      name: 'PBS News',
      url: directPbsUrl,
      used_for: 'Direct Red Sea article',
    },
  ],
};

assert.equal(
  shouldGatherCurrentEvents('research on future of AI in India'),
  true,
  'Expected explicit fast research requests to gather live evidence.',
);
assert.equal(
  shouldGatherCurrentEvents('research report on future of AI in India'),
  true,
  'Expected explicit fast research reports to gather live evidence.',
);
assert.equal(
  shouldGatherCurrentEvents('China open-source AI models outlook'),
  true,
  'Expected outlook-shaped paid research tasks to gather current source evidence even without the word research.',
);

const portfolioLiveData = {
  portfolio_impact: true,
  wallet_context: {
    source: 'agentflow_portfolio_snapshot',
    holdings: [{ symbol: 'USDC', name: 'USD Coin', kind: 'stablecoin', usd_value: 100 }],
    positions: [{ name: 'Circle Gateway', protocol: 'Circle Gateway', kind: 'payment_liquidity', usd_value: 50 }],
  },
};
const analystPortfolioInput = buildAnalystModelInput({
  task: 'Middle East shipping routes impact on my portfolio',
  researchText: '{}',
  liveData: portfolioLiveData,
  portfolioImpact: true,
});
const writerPortfolioInput = buildWriterModelInput({
  task: 'Middle East shipping routes impact on my portfolio',
  researchText: '{}',
  analysisText: '{}',
  liveData: portfolioLiveData,
  portfolioImpact: true,
});
assert.match(
  analystPortfolioInput,
  /direct, indirect, or no clear material effect/i,
  'Expected analyst input to require direct/indirect/no-effect portfolio classification.',
);
assert.match(
  writerPortfolioInput,
  /impact label: direct, indirect, or no clear material effect/i,
  'Expected writer input to require direct/indirect/no-effect portfolio labels.',
);
assert.match(
  writerPortfolioInput,
  /may affect or may not affect each relevant exposure/i,
  'Expected writer input to personalize even when event evidence is thin.',
);

const repeatedAiChinaReportQueries = buildPrimaryFirecrawlQueryVariants(
  'research on future of AI in china and make a latest report on future of AI',
  'research on future of AI in china and make a latest report on future of AI',
);
assert.ok(
  repeatedAiChinaReportQueries.every((query) => !/and make a|make a on future/i.test(query)),
  'Expected repeated report instructions to be removed from live search queries.',
);
assert.ok(
  repeatedAiChinaReportQueries.some((query) => /AI in china.*latest news/i.test(query)),
  'Expected broad AI outlook requests to include a subject-scoped latest-news query.',
);
assert.ok(
  repeatedAiChinaReportQueries.some((query) => /AI in china.*policy regulation report/i.test(query)),
  'Expected broad AI outlook requests to search policy and regulation evidence.',
);
assert.ok(
  repeatedAiChinaReportQueries.some((query) => /AI in china.*chips compute infrastructure report/i.test(query)),
  'Expected broad AI outlook requests to search compute and chip evidence.',
);

const genericAiModelOutlookQueries = buildPrimaryFirecrawlQueryVariants(
  'China open-source AI models outlook',
  'China open-source AI models outlook',
);

const spaceXQueries = buildPrimaryFirecrawlQueryVariants(
  'research on space x',
  'research on space x',
);
assert.ok(
  spaceXQueries.some((query) => /\bSpaceX\b/i.test(query)),
  'Expected split Space X wording to normalize to SpaceX in fast live-search queries.',
);

const spaceXFilteredEvidence = filterFastResearchDynamicEvidence('research on space x', [
  {
    title: 'NASA SpaceX CRS-34 Dragon returns packed with space station science',
    url: 'https://www.nasa.gov/missions/station/iss-research/nasas-spacex-crs-34-dragon-returns-packed-with-space-station-science/',
    publisher: 'NASA',
    summary: 'NASA reported details from a SpaceX Dragon cargo mission.',
    seen_at: '2026-07-14T00:00:00.000Z',
  },
  {
    title: 'SpaceX stumbles',
    url: 'https://www.ft.com/content/37bf4703-f441-4adf-bd68-9131299c4171',
    publisher: 'Financial Times',
    summary: 'Financial Times coverage of SpaceX launch and business developments.',
    seen_at: '2026-07-13T00:00:00.000Z',
  },
]);
assert.equal(
  spaceXFilteredEvidence.length,
  2,
  'Expected one-token entity research topics like SpaceX to keep matching article evidence.',
);

const syntheticFuelQueries = buildPrimaryFirecrawlQueryVariants(
  'do research on synthetic fuels aviation',
  'do research on synthetic fuels aviation',
);
assert.ok(
  syntheticFuelQueries.every((query) => !/^do\s+/i.test(query) && !/\bdo on\b/i.test(query)),
  'Expected generic "do research on" scaffolding to be removed from fast live-search queries.',
);
assert.ok(
  syntheticFuelQueries.some((query) => /^synthetic fuels aviation\b/i.test(query)),
  'Expected the actual synthetic-fuels subject to lead fast live-search queries.',
);

const multipleArticlesFromSamePublisher = finalizeReportMarkdown({
  task: 'research China AI policy and model development',
  writerMarkdown: `## Summary

China AI policy and model development both have recent source support.

## Sources`,
  research: {
    topic: 'China AI policy and model development',
    recent_developments: [
      {
        event: 'China announced a new AI policy initiative.',
        source_name: 'Reuters',
        source_url: 'https://www.reuters.com/world/china/china-ai-policy-example-2026-07-01/',
        date_or_period: '2026-07-01',
      },
      {
        event: 'A Chinese lab released a new AI model.',
        source_name: 'Reuters',
        source_url: 'https://www.reuters.com/technology/china-ai-model-example-2026-07-02/',
        date_or_period: '2026-07-02',
      },
    ],
  },
  analysis: null,
  liveData: {
    dynamic_sources: {
      articles: [
        {
          title: 'China AI policy initiative',
          publisher: 'Reuters',
          url: 'https://www.reuters.com/world/china/china-ai-policy-example-2026-07-01/',
          summary: 'China announced a new AI policy initiative.',
          seen_at: '2026-07-01',
        },
        {
          title: 'Chinese lab releases AI model',
          publisher: 'Reuters',
          url: 'https://www.reuters.com/technology/china-ai-model-example-2026-07-02/',
          summary: 'A Chinese lab released a new AI model.',
          seen_at: '2026-07-02',
        },
      ],
    },
  },
});
assert.match(
  multipleArticlesFromSamePublisher.markdown,
  /china-ai-policy-example-2026-07-01/,
  'Expected the first Reuters article URL to survive source normalization.',
);
assert.match(
  multipleArticlesFromSamePublisher.markdown,
  /china-ai-model-example-2026-07-02/,
  'Expected a second distinct Reuters article URL to survive source normalization.',
);

const htmlSourcesDisclosureReport = finalizeReportMarkdown({
  task: 'research on synthetic biology startups',
  writerMarkdown: `## Summary

Synthetic biology startups have current source-backed momentum.

</details> <details> <summary>Sources</summary>

- Internal writer source list that should be replaced.

</details>`,
  research: null,
  analysis: null,
  liveData: {
    dynamic_sources: {
      articles: [
        {
          title: 'Synthetic biology startup raises new funding',
          publisher: 'Bio News',
          url: 'https://example.com/synthetic-biology-startup-funding',
          summary: 'A synthetic biology startup raised new funding.',
          seen_at: '2026-07-15',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  htmlSourcesDisclosureReport.markdown,
  /<\/?details\b|<\/?summary\b/i,
  'Expected HTML details/summary source disclosure tags to be stripped from final reports.',
);
assert.match(
  htmlSourcesDisclosureReport.markdown,
  /## Sources[\s\S]*synthetic-biology-startup-funding/,
  'Expected canonical markdown Sources section to replace writer HTML source disclosure.',
);

assert.ok(
  genericAiModelOutlookQueries.some((query) => /AI models.*latest news/i.test(query)),
  'Expected generic AI-model research to generate live model/company news queries.',
);

const analysis = {
  core_thesis:
    'The broader conflict is active in current reporting, Hormuz is severely constrained with limited passage resuming, and Red Sea risk is elevated without fresh direct shipping strikes being confirmed.',
  key_insights: [
    {
      title: 'Conflict status',
      insight:
        'The active-conflict framing should be preserved rather than downgraded to generic tensions.',
      why_it_matters: 'That changes the baseline risk context for investors.',
      confidence: 'high',
      evidence_refs: ['Reuters late-March 2026 conflict coverage'],
    },
  ],
  decision_relevant_conclusion:
    'Investors should treat Hormuz as severely disrupted but not absolutely closed, and treat the Red Sea as elevated risk rather than a confirmed fresh shipping shutdown.',
};

const liveData = {
  current_events: {
    article_snapshots: [
      {
        title: 'Iran starts to formalize its chokehold on the Strait of Hormuz with a toll booth regime',
        url: directApUrl,
        publisher: 'AP News',
        seen_at: '2026-03-26T00:00:00.000Z',
        summary: 'AP reported that traffic had fallen sharply and some vessels still paid for passage.',
      },
      {
        title:
          'A Houthi missile attack on Israel raises concerns about Red Sea shipping routes being blocked',
        url: directPbsUrl,
        publisher: 'PBS News',
        seen_at: '2026-03-29T00:00:00.000Z',
        summary:
          'PBS reported elevated shipping concerns without confirming fresh direct commercial shipping strikes.',
      },
    ],
    framing_signals: {
      broader_conflict_status: 'reported_active_war',
      hormuz_route_status: 'severely_constrained_with_limited_passage',
      red_sea_route_status: 'elevated_risk_latest_direct_shipping_strikes_not_confirmed',
      support: [
        {
          title: 'Active-conflict reporting',
          source_name: 'Reuters',
          source_url:
            'https://www.reuters.com/world/middle-east/chinese-container-ships-pass-through-strait-hormuz-second-attempt-data-shows-2026-03-30/',
          date_or_period: '2026-03-30',
        },
        {
          title: 'Hormuz route status',
          source_name: 'AP News',
          source_url: directApUrl,
          date_or_period: '2026-03-26',
        },
        {
          title: 'Red Sea route status',
          source_name: 'PBS News',
          source_url: directPbsUrl,
          date_or_period: '2026-03-29',
        },
      ],
    },
  },
};

const preferredSources = collectPreferredReportSources({
  research,
  liveData,
});
assert.ok(
  preferredSources.some((source) => source.url === directApUrl),
  'Expected direct AP URL to be retained as a preferred source.',
);
assert.ok(
  !preferredSources.some((source) => source.url === aggregatorUrl),
  'Expected Google News aggregator URL to be dropped when a direct URL exists.',
);

const finalized = finalizeReportMarkdown({
  task: 'Iran-US Tensions and Shipping Route Impact Report',
  writerMarkdown: badWriterMarkdown,
  research,
  analysis,
  liveData,
});

assert.equal(
  finalized.validationIssues.length,
  0,
  `Expected no validation issues, got: ${finalized.validationIssues.join('; ')}`,
);
assert.match(
  finalized.markdown,
  /broader conflict .* active|describes the broader conflict as active/i,
);
assert.doesNotMatch(finalized.markdown, /\bno active full-scale war is confirmed\b/i);
assert.doesNotMatch(finalized.markdown, /\bfresh direct shipping strikes are confirmed\b/i);
assert.doesNotMatch(finalized.markdown, /\bis fully blocked\b/i);
assert.doesNotMatch(finalized.markdown, /\bnot confirmed\b[^.\n]*\bbut confirmed\b/i);
assert.match(finalized.markdown, /limited successful transits? still occurring/i);
assert.match(
  finalized.markdown,
  /fresh direct strikes on commercial shipping are not confirmed/i,
);
assert.doesNotMatch(finalized.markdown, /\binsurance spikes? (?:are|were|remain)\b/i);
assert.doesNotMatch(finalized.markdown, /\bno immediate safe route alternatives remain\b/i);
assert.ok(finalized.markdown.includes(directApUrl));
assert.ok(!finalized.markdown.includes(aggregatorUrl));

const narrativeLines = finalized.markdown
  .split('\n')
  .map((line) => line.trim())
  .filter(
    (line) =>
      line &&
      !/^#/.test(line) &&
      !/^\*\*Prepared by:\*\*/.test(line) &&
      !/^- /.test(line) &&
      !/^## /.test(line),
  );
const duplicateNarrativeLines = narrativeLines.filter(
  (line, index) =>
    narrativeLines.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) !==
    index,
);
assert.equal(
  duplicateNarrativeLines.length,
  0,
  `Expected no repeated narrative lines, got: ${duplicateNarrativeLines.join(' | ')}`,
);

const normalizedClaimSections = new Set(
  finalized.claims
    .filter((claim) =>
      ['current_status', 'reported_developments', 'data_and_statistics'].includes(claim.section),
    )
    .map((claim) => claim.section),
);
assert.ok(
  normalizedClaimSections.has('current_status'),
  'Expected current-status claims to exist in normalized claim layer.',
);
assert.ok(
  normalizedClaimSections.has('reported_developments'),
  'Expected reported-development claims to exist in normalized claim layer.',
);

const writerOnlyMarkdown = `# Arc Network — Research Report

**Prepared by:** AgentFlow AI

## Executive Summary

Arc is Circle's L1 where USDC is native gas; this report is grounded in the writer pass only.

## Key Facts

- Sub-second finality on Arc testnet for USDC-first apps.

## Conclusion

Writer output must be shown even when research JSON has no facts array.`;

const writerWinsUnstructured = finalizeReportMarkdown({
  task: 'Arc Network overview',
  writerMarkdown: writerOnlyMarkdown,
  research: null,
  analysis: null,
  liveData: null,
});
assert.match(writerWinsUnstructured.markdown, /Arc is Circle's L1/i);
assert.doesNotMatch(
  writerWinsUnstructured.markdown,
  /too thin to support a confident executive summary/i,
  'Writer markdown must not be replaced by claim fallback when research lacks structured JSON.',
);

const writerWithNestedDuplicateSources = `## Summary

Bitcoin has live market data available.

- **Sources:**
  - coingecko.com (2026-06-01, via API)
  - defillama.com (2026-06-01, via API and BTC page)

- **Takeaway:**

Keep the report source list clean.`;

const normalizedNestedSources = finalizeReportMarkdown({
  task: 'Bitcoin fast report',
  writerMarkdown: writerWithNestedDuplicateSources,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-01T00:00:00.000Z',
    coingecko: {
      assets: [{ coinId: 'bitcoin', last_updated_at: '2026-06-01T00:00:00.000Z' }],
    },
    defillama: {
      chains: [{ chain: 'Bitcoin' }],
    },
  },
});
assert.equal(
  normalizedNestedSources.markdown.match(/^## Sources$/gm)?.length,
  1,
  'Expected one normalized Sources section for nested bold source headings.',
);
assert.doesNotMatch(normalizedNestedSources.markdown, /\bvia API\b/i);
assert.match(normalizedNestedSources.markdown, /https:\/\/www\.coingecko\.com\/en\/coins\/bitcoin/);
assert.match(normalizedNestedSources.markdown, /https:\/\/defillama\.com\/chain\/Bitcoin/);
assert.match(
  normalizedNestedSources.markdown,
  /- \[CoinGecko\]\(https:\/\/www\.coingecko\.com\/en\/coins\/bitcoin\) - live market data/,
);
assert.doesNotMatch(normalizedNestedSources.markdown, /CoinGecko: https:\/\//);
assert.match(normalizedNestedSources.markdown, /Keep the report source list clean\./);

const bitcoinWithIrrelevantDynamicSources = finalizeReportMarkdown({
  task: 'make a research report on bitcoin',
  writerMarkdown: '## Summary\n\nBitcoin report.',
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-01T00:00:00.000Z',
    coingecko: {
      assets: [{ coinId: 'bitcoin', last_updated_at: '2026-06-01T00:00:00.000Z' }],
    },
    dynamic_sources: {
      articles: [
        { title: 'Unrelated key page', url: 'https://key.com/example', summary: 'Unrelated.' },
        { title: 'Unrelated app page', url: 'https://play.google.com/store/apps/example', summary: 'Unrelated.' },
        { title: 'Unrelated music page', url: 'https://tunebat.com/example', summary: 'Unrelated.' },
        { title: 'Unrelated dictionary page', url: 'https://dict.leo.org/example', summary: 'Unrelated.' },
      ],
    },
  },
});
assert.match(bitcoinWithIrrelevantDynamicSources.markdown, /CoinGecko/);
assert.doesNotMatch(
  bitcoinWithIrrelevantDynamicSources.markdown,
  /\b(?:key\.com|play\.google\.com|tunebat\.com|dict\.leo\.org)\b/i,
);

const bitcoinTransactionsWithOnchainSource = finalizeReportMarkdown({
  task: "Make research report on the bitcoin's last 24h transactions",
  writerMarkdown: '## Summary\n\nBitcoin network transaction report.',
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-01T00:00:00.000Z',
    bitcoin_onchain: {
      source: 'Mempool.space blocks API',
      chain: 'Bitcoin',
      window: 'last_24h_from_tip',
      latest_block_height: 951982,
      latest_block_time: '2026-06-01T12:00:00.000Z',
      window_start_time: '2026-05-31T12:00:00.000Z',
      confirmed_transaction_count_24h: 612345,
      block_count_24h: 144,
    },
  },
});
assert.match(bitcoinTransactionsWithOnchainSource.markdown, /Mempool\.space/);
assert.match(bitcoinTransactionsWithOnchainSource.markdown, /https:\/\/mempool\.space\/blocks/);

const predmarketWithMergedFallbackSources = finalizeReportMarkdown({
  task: 'research the prediction market topic: Will ARC launch its Mainnet before June 30, 2026?',
  writerMarkdown: `## Summary

ARC launch timing remains uncertain.

## Sources

- [MEXC](https://www.mexc.com/news/1144042) - live exchange article (accessed 2026-06-13)`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-13T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Arc roadmap update',
          publisher: 'Circle',
          url: 'https://www.circle.com/blog/arc-mainnet-roadmap',
          summary: 'Circle discusses the Arc roadmap and 2026 launch plan.',
          seen_at: '2026-06-13T00:00:00.000Z',
        },
        {
          title: 'Arc progress update',
          publisher: 'MEXC',
          url: 'https://www.mexc.com/news/1144042',
          summary: 'MEXC covers Arc progress and upcoming milestones.',
          seen_at: '2026-06-13T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(predmarketWithMergedFallbackSources.markdown, /https:\/\/www\.mexc\.com\/news\/1144042/);
assert.match(predmarketWithMergedFallbackSources.markdown, /https:\/\/www\.circle\.com\/blog\/arc-mainnet-roadmap/);

const predmarketExpandedQueries = buildPrimaryFirecrawlQueryVariants(
  'GTA 6 release date news | GTA 6 launch delay latest | GTA 6 official announcement',
  'research the prediction market topic: Will GTA 6 launch before November 30, 2026?',
);
assert.ok(
  predmarketExpandedQueries.some((query) => /gta 6 release date news/i.test(query)),
  'Expected prediction-market query builder to preserve subject-specific GTA 6 release queries.',
);
assert.ok(
  predmarketExpandedQueries.some((query) => /rockstar games gta 6 launch confirmed launch timeline|official announcement/i.test(query)),
  'Expected prediction-market query builder to preserve an official GTA release-status query.',
);

const predmarketPromptOnlyQueries = buildPrimaryFirecrawlQueryVariants(
  `research the prediction market topic: Will ARC launch its Mainnet before June 30, 2026?
Listed outcomes in AgentFlow: Yes / No.
Prediction market category in AgentFlow: Crypto.
Prediction market provider in AgentFlow: achmarket.
AgentFlow market address reference: 0xe1F30dd444A8A85cD8C7882e06abA26dBA894B96.
Use the market category to disambiguate the subject before searching. For example: crypto markets should be researched as crypto/blockchain topics, sports markets as teams/tournaments, and macro/commodity markets by their real-world underlying drivers.
Focus on the real-world event, relevant stats/news, timing, outcome probabilities, and what evidence would help someone compare the listed outcomes.`,
  `research the prediction market topic: Will ARC launch its Mainnet before June 30, 2026?
Listed outcomes in AgentFlow: Yes / No.
Prediction market category in AgentFlow: Crypto.
Prediction market provider in AgentFlow: achmarket.
AgentFlow market address reference: 0xe1F30dd444A8A85cD8C7882e06abA26dBA894B96.
Use the market category to disambiguate the subject before searching. For example: crypto markets should be researched as crypto/blockchain topics, sports markets as teams/tournaments, and macro/commodity markets by their real-world underlying drivers.
Focus on the real-world event, relevant stats/news, timing, outcome probabilities, and what evidence would help someone compare the listed outcomes.`,
);
assert.ok(
  predmarketPromptOnlyQueries.some((query) => /site:arc\.network ARC Network mainnet/i.test(query)),
  'Expected prompt-only ARC prediction-market queries to still generate ARC-specific site queries.',
);
assert.ok(
  predmarketPromptOnlyQueries.every((query) => !/Prediction market category in AgentFlow|AgentFlow market address reference|Focus on the real-world event/i.test(query)),
  'Expected prompt-only prediction-market queries to strip AgentFlow scaffolding instead of searching the whole prompt.',
);
assert.ok(
  predmarketPromptOnlyQueries.every((query) => !/long term forecast|future outlook|growth potential/i.test(query)),
  'Expected launch-deadline prediction markets to avoid generic forecast variants and stay on status/roadmap queries.',
);

const topicOnlyWorldCupQueries = buildPrimaryFirecrawlQueryVariants(
  topicOnlyPredictionResearchPrompt,
  topicOnlyPredictionResearchPrompt,
);
assert.ok(
  topicOnlyWorldCupQueries.every(
    (query) =>
      !/achmarket|internal prediction provider|market category to disambiguate|retrieval time|routing metadata/i.test(
        query,
      ),
  ),
  'Expected the topic-only prompt scaffolding to be removed before search query generation.',
);
assert.ok(
  topicOnlyWorldCupQueries.some((query) => /world cup/i.test(query)),
  'Expected the topic-only prompt to retain the real-world subject.',
);

const worldCupWinnerQueries = buildPrimaryFirecrawlQueryVariants(
  `research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Listed outcomes in AgentFlow: France / Argentina / Brazil / Other.
Prediction market category in AgentFlow: Sports.
Prediction market provider in AgentFlow: achmarket.
Use the market category to disambiguate the subject before searching.
Focus on the real-world event, relevant stats/news, timing, outcome probabilities, and what evidence would help someone compare the listed outcomes.`,
  `research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Listed outcomes in AgentFlow: France / Argentina / Brazil / Other.
Prediction market category in AgentFlow: Sports.
Prediction market provider in AgentFlow: achmarket.
Use the market category to disambiguate the subject before searching.
Focus on the real-world event, relevant stats/news, timing, outcome probabilities, and what evidence would help someone compare the listed outcomes.`,
);
assert.ok(
  worldCupWinnerQueries.some((query) => /winner odds|favorites odds|outright odds|power rankings|opta prediction/i.test(query)),
  'Expected sports winner markets to generate outright-odds or ranking queries.',
);
assert.ok(
  worldCupWinnerQueries.every((query) => !/world cup 2026 latest(?: news)?/i.test(query)),
  'Expected the odds/model query lane to stay decision-specific while the current-event lane handles results.',
);
const worldCupCurrentEventQueries = buildCurrentEventQueries(
  `research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Listed outcomes in AgentFlow: France / Argentina / Brazil / Other.
Prediction market category in AgentFlow: Sports.`,
  {
    subject: 'FIFA World Cup 2026 winner',
    underlying: null,
    questionType: 'event_outcome',
    resolutionDate: '2026-07-19',
    searchQueries: [],
    entity: {
      canonicalName: 'FIFA World Cup 2026',
      aliases: ['World Cup 2026'],
      officialDomains: ['fifa.com'],
      avoidTerms: [],
      ambiguity: 'low',
      rationale: 'Sports category identifies the tournament.',
    },
  },
);
assert.ok(
  worldCupCurrentEventQueries.some((query) => /latest results|finalists|semifinal results/i.test(query)),
  'Expected sports winner current-event retrieval to query the latest bracket and completed results.',
);
const freshSportsEvidenceDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
const sportsEvidenceKeepsResultsAheadOfOdds = selectPredictionMarketEvidenceWithHostDiversity(
  `research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Prediction market category in AgentFlow: Sports.`,
  [
    {
      title: 'World Cup winner odds',
      publisher: 'Odds Publisher',
      url: 'https://odds.example/world-cup-winner',
      seen_at: '2026-07-12T00:00:00.000Z',
      summary: 'France has a 34.0% chance to win in a pre-semifinal model.',
    },
    {
      title: 'World Cup predictions',
      publisher: 'Model Publisher',
      url: 'https://model.example/world-cup-predictions',
      seen_at: '2026-07-12T00:00:00.000Z',
      summary: 'Pre-semifinal tournament probabilities.',
    },
    {
      title: 'Spain beat France 2-0 in the World Cup semi-final',
      publisher: 'FIFA',
      url: 'https://fifa.example/spain-france-result',
      seen_at: freshSportsEvidenceDate,
      summary: 'Spain defeated France and advanced to the final.',
    },
    {
      title: 'Argentina defeated England to set the World Cup final',
      publisher: 'BBC News',
      url: 'https://bbc.example/argentina-england-result',
      seen_at: freshSportsEvidenceDate,
      summary: 'Argentina beat England in the semi-final; Spain will face Argentina in the final.',
    },
  ],
  4,
);
assert.match(sportsEvidenceKeepsResultsAheadOfOdds[0]?.title || '', /beat|defeated/i);
assert.match(sportsEvidenceKeepsResultsAheadOfOdds[1]?.title || '', /beat|defeated/i);
assert.ok(
  sportsEvidenceKeepsResultsAheadOfOdds.every(
    (source) => !/pre-semifinal|World Cup winner odds/i.test(`${source.title} ${source.summary}`),
  ),
  'Expected forecasts superseded by the confirmed final matchup to be removed.',
);

const gtaPredmarketFiltersLowValueSources = finalizeReportMarkdown({
  task: 'research the prediction market topic: Will GTA 6 launch before November 30, 2026?',
  writerMarkdown: `## Summary

Evidence remains mixed.

## Sources

- [dict.leo.org](https://dict.leo.org/englisch-deutsch/grand) - dictionary result
- [speisekartenweb.de](https://www.speisekartenweb.de/restaurants/mannheim/grand-luise-12345) - menu page
- [grandcityproperty.de](https://grandcityproperty.de/) - property page
- [apps.microsoft.com](https://apps.microsoft.com/detail/9NTL0GZ6C1Q2?hl=en-us&gl=US) - Grand Theft Auto V Legacy app listing
- [Rockstar Games](https://www.rockstargames.com/VI) - Grand Theft Auto VI official game page`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Grand Theft Auto VI official page',
          publisher: 'Rockstar Games',
          url: 'https://www.rockstargames.com/VI',
          summary: 'Official Rockstar Games page for Grand Theft Auto VI.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(gtaPredmarketFiltersLowValueSources.markdown, /rockstargames\.com\/VI/i);
assert.doesNotMatch(
  gtaPredmarketFiltersLowValueSources.markdown,
  /\b(?:dict\.leo\.org|speisekartenweb\.de|grandcityproperty\.de|apps\.microsoft\.com)\b/i,
);

const predmarketPromptLeakFallsBack = finalizeReportMarkdown({
  task: 'research the prediction market topic: Will GTA 6 launch before November 30, 2026?',
  writerMarkdown: `Research Pipeline
research agent started
research the prediction market topic: Will GTA 6 launch before November 30, 2026?
Prediction market category in AgentFlow: Games.

## Overview

Thin evidence.`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Grand Theft Auto VI official page',
          publisher: 'Rockstar Games',
          url: 'https://www.rockstargames.com/VI',
          summary: 'Official Rockstar Games page for Grand Theft Auto VI.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
        {
          title: 'Take-Two confirms GTA VI release timing',
          publisher: 'Take-Two Interactive',
          url: 'https://www.take2games.com/ir/news/gta-vi-release-timing',
          summary: 'Corporate release-timing update for GTA VI.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  predmarketPromptLeakFallsBack.markdown,
  /\bresearch the prediction market topic:|Prediction market category in AgentFlow:|Research Pipeline|research agent started/i,
);

const arcPredmarketDropsBrowserHomonyms = finalizeReportMarkdown({
  task: `research the prediction market topic: Will ARC launch its Mainnet before June 30, 2026?
Listed outcomes in AgentFlow: Yes / No.
Prediction market category in AgentFlow: Crypto.
Prediction market provider in AgentFlow: achmarket.
AgentFlow market address reference: 0xe1F30dd444A8A85cD8C7882e06abA26dBA894B96.
Use the market category to disambiguate the subject before searching.`,
  writerMarkdown: `# ARC mainnet launch before June 30, 2026

## Overview

Thin evidence.

## Sources

- [arc.net](https://arc.net/download)
- [chip.de](https://www.chip.de/downloads/Arc-Browser_185256830.html)
- [DefiLlama](https://defillama.com/chain/Arc)`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Arc browser download',
          publisher: 'arc.net',
          url: 'https://arc.net/download',
          summary: 'Browser page.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
        {
          title: 'Arc Browser download',
          publisher: 'chip.de',
          url: 'https://www.chip.de/downloads/Arc-Browser_185256830.html',
          summary: 'Browser listing.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
      ],
    },
    defillama: {
      source: 'DefiLlama chains API + stablecoins API',
      chains: [{ chain: 'Arc', tvl: 7.77, stablecoins: 0 }],
    },
  },
});
assert.doesNotMatch(
  arcPredmarketDropsBrowserHomonyms.markdown,
  /\barc\.net\b|\bchip\.de\b/i,
);

const arcLaunchPredmarketOmitsDefiLlamaSource = finalizeReportMarkdown({
  task: `research the prediction market topic: Will ARC launch its Mainnet before June 30, 2026?
Listed outcomes in AgentFlow: Yes / No.
Prediction market category in AgentFlow: Crypto.
Prediction market provider in AgentFlow: achmarket.
AgentFlow market address reference: 0xe1F30dd444A8A85cD8C7882e06abA26dBA894B96.
Use the market category to disambiguate the subject before searching.`,
  writerMarkdown: `# ARC mainnet launch before June 30, 2026

## Overview

ARC remains in a pre-mainnet stage.

## Sources

- [DefiLlama](https://defillama.com/chain/Arc)`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-15T00:00:00.000Z',
    prediction_market_understanding: {
      subject: 'ARC Network mainnet launch',
      underlying: null,
      questionType: 'launch_milestone',
      resolutionDate: '2026-06-30',
      searchQueries: ['ARC Network mainnet'],
      entity: {
        canonicalName: 'ARC Network',
        aliases: ['ARC', 'ARC Network'],
        officialDomains: ['arc.io', 'circle.com'],
        avoidTerms: ['arc browser'],
        ambiguity: 'medium',
        rationale: 'Crypto category plus mainnet wording points to a blockchain project.',
      },
    },
    dynamic_sources: {
      articles: [
        {
          title: 'ARC Network official page',
          publisher: 'arc.io',
          url: 'https://arc.io/',
          summary: 'Arc L1 blockchain official page.',
          seen_at: '2026-06-15T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  arcLaunchPredmarketOmitsDefiLlamaSource.markdown,
  /defillama\.com\/chain\/Arc/i,
);

const predmarketMarkdownNormalizerStripsPromptLines = finalizeReportMarkdown({
  task: `research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Listed outcomes in AgentFlow: France / Argentina / Brazil / Other.
Prediction market category in AgentFlow: Sports.
Prediction market provider in AgentFlow: achmarket.
Use the market category to disambiguate the subject before searching.
Focus on the real-world event, relevant stats/news, timing, outcome probabilities, and what evidence would help someone compare the listed outcomes.`,
  writerMarkdown: `# research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Listed outcomes in AgentFlow: France / Argentina / Brazil / Other.
Prediction market category in AgentFlow: Sports.
Prediction market provider in AgentFlow: achmarket.
Use the market category to disambiguate the subject before searching.
Focus on the real-world event, relevant stats/news, timing, outcome probabilities, and what evidence would help someone compare the listed outcomes.

## Summary

Thin evidence.`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: '2026 FIFA World Cup official information',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026',
          summary: 'Tournament format and official information.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  predmarketMarkdownNormalizerStripsPromptLines.markdown,
  /\bresearch the prediction market topic:|Prediction market category in AgentFlow:|Prediction market provider in AgentFlow:|Listed outcomes in AgentFlow:/i,
);

const xautPredmarketRequiresUnderlyingEvidence = finalizeReportMarkdown({
  task: 'research the prediction market topic: Will Tether Gold (XAUT) reach $4,750 by July 31st?',
  writerMarkdown: `## Summary

XAUT may rise if momentum improves.

## Sources

- [CoinGecko](https://www.coingecko.com/en/coins/tether-gold) - live market data (accessed 2026-06-14)`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    coingecko: {
      assets: [{ coinId: 'tether-gold', last_updated_at: '2026-06-14T00:00:00.000Z' }],
    },
  },
});
assert.match(
  xautPredmarketRequiresUnderlyingEvidence.validationIssues.join('\n'),
  /underlying gold-market evidence/i,
);

const worldCupPredmarketRequiresFreshStateEvidence = finalizeReportMarkdown({
  task: 'research the prediction market topic: Who Will Win the FIFA World Cup 2026?',
  writerMarkdown: `## Summary

France, Argentina, and Brazil remain strong teams.

## Sources

- [FIFA](https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026) - tournament structure
- [Sporting News](https://www.sportingnews.com/us/soccer/news/world-cup-2026-schedule-teams/xyz) - schedule and teams`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'World Cup 2026 schedule and teams',
          publisher: 'Sporting News',
          url: 'https://www.sportingnews.com/us/soccer/news/world-cup-2026-schedule-teams/xyz',
          summary: 'Schedule and participating teams.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
        {
          title: '2026 FIFA World Cup official information',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026',
          summary: 'Tournament format and official information.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  worldCupPredmarketRequiresFreshStateEvidence.validationIssues.join('\n'),
  /fresh event-stage or result evidence/i,
);

const worldCupEvidenceTask = `research the prediction market topic: Who Will Win the FIFA World Cup 2026?
Prediction market category in AgentFlow: Sports.`;
const normalFastResearchCanProceedWithSparseSources = assessFastReportEvidence({
  task: 'research on space x',
  research: null,
  liveData: {
    snapshot_at: '2026-07-15T00:00:00.000Z',
    dynamic_sources: {
      articles: [],
    },
  },
});
assert.equal(
  normalFastResearchCanProceedWithSparseSources.ok,
  true,
  'Expected ordinary fast research to continue through Analyst/Writer even when the first live retrieval pass is sparse.',
);
assert.equal(normalFastResearchCanProceedWithSparseSources.requiredDistinctDomains, 0);

const factualWorldCupEvidenceWithoutNumericOdds = assessFastReportEvidence({
  task: worldCupEvidenceTask,
  research: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'World Cup 2026 schedule and teams',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/schedule',
          summary: 'Official tournament schedule.',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
        {
          title: 'World Cup semifinal schedule',
          publisher: 'BBC News',
          url: 'https://www.bbc.com/sport/football/world-cup-2026-semifinal-schedule',
          summary: 'Remaining fixtures and kickoff times.',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
        {
          title: 'World Cup teams remaining',
          publisher: 'Sporting News',
          url: 'https://www.sportingnews.com/us/soccer/news/world-cup-2026-teams-remaining/example',
          summary: 'Tournament bracket background.',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.equal(
  factualWorldCupEvidenceWithoutNumericOdds.ok,
  true,
  `Expected a fresh factual World Cup report to proceed without numeric odds, got: ${factualWorldCupEvidenceWithoutNumericOdds.issues.join('; ')}`,
);

const confirmedFinalEvidenceWithoutNumericOdds = assessFastReportEvidence({
  task: worldCupEvidenceTask,
  research: null,
  liveData: {
    snapshot_at: '2026-07-16T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Spain beat France in the World Cup semifinal and advance to the final',
          publisher: 'ESPN',
          url: 'https://www.espn.com/soccer/story/_/id/world-cup-spain-france-semifinal',
          summary: 'Spain defeated France in the semifinal and secured a place in the final.',
          seen_at: '2026-07-14T23:00:00.000Z',
        },
        {
          title: 'Argentina defeat England to reach the World Cup final',
          publisher: 'CBS Sports',
          url: 'https://www.cbssports.com/soccer/news/argentina-england-world-cup-semifinal-result/',
          summary: 'Argentina beat England in the semifinal and will face Spain in the final.',
          seen_at: '2026-07-15T23:00:00.000Z',
        },
        {
          title: 'FIFA World Cup 2026 final schedule',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/schedule',
          summary: 'The official FIFA schedule lists the confirmed World Cup final.',
          seen_at: '2026-07-16T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.equal(
  confirmedFinalEvidenceWithoutNumericOdds.ok,
  true,
  `Expected confirmed-final evidence to proceed without numeric odds, got: ${confirmedFinalEvidenceWithoutNumericOdds.issues.join('; ')}`,
);

const unsupportedNumericWinnerClaimIsWithheld = finalizeReportMarkdown({
  task: worldCupEvidenceTask,
  writerMarkdown: `# Who Will Win the FIFA World Cup 2026?

## Overview

Spain has a 61% chance of winning the tournament and is the clear numerical favorite.

## Sources

- [ESPN](https://www.espn.com/soccer/story/_/id/world-cup-spain-france-semifinal) - semifinal result
- [CBS Sports](https://www.cbssports.com/soccer/news/argentina-england-world-cup-semifinal-result/) - semifinal result
- [FIFA](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/schedule) - final schedule`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-16T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Spain beat France in the World Cup semifinal and advance to the final',
          publisher: 'ESPN',
          url: 'https://www.espn.com/soccer/story/_/id/world-cup-spain-france-semifinal',
          summary: 'Spain defeated France in the semifinal and secured a place in the final.',
          seen_at: '2026-07-14T23:00:00.000Z',
        },
        {
          title: 'Argentina defeat England to reach the World Cup final',
          publisher: 'CBS Sports',
          url: 'https://www.cbssports.com/soccer/news/argentina-england-world-cup-semifinal-result/',
          summary: 'Argentina beat England in the semifinal and will face Spain in the final.',
          seen_at: '2026-07-15T23:00:00.000Z',
        },
        {
          title: 'FIFA World Cup 2026 final schedule',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/schedule',
          summary: 'The official FIFA schedule lists the confirmed World Cup final.',
          seen_at: '2026-07-16T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  unsupportedNumericWinnerClaimIsWithheld.validationIssues.join('\n'),
  /numeric odds or probability claims without source-backed numeric winner evidence/i,
);
assert.doesNotMatch(
  unsupportedNumericWinnerClaimIsWithheld.markdown,
  /61%/i,
  'Expected an unsupported numerical winner ranking to be withheld from the final report.',
);

const decisionGradeWorldCupEvidence = assessFastReportEvidence({
  task: worldCupEvidenceTask,
  research: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'World Cup 2026 winner odds entering the semifinals',
          publisher: 'OddsChecker',
          url: 'https://www.oddschecker.com/us/insight/soccer/20260713-2026-fifa-world-cup-winner-odds',
          summary: 'Current outright prices imply France at 40%, Spain at 25%, England at 22%, and Argentina at 20%.',
          seen_at: '2026-07-13T12:00:00.000Z',
        },
        {
          title: 'World Cup prediction model and team probabilities',
          publisher: 'The Analyst',
          url: 'https://theanalyst.com/articles/world-cup-2026-predictions-semifinals',
          summary: 'The Opta supercomputer gives numeric win probabilities for the remaining teams.',
          seen_at: '2026-07-13T12:00:00.000Z',
        },
        {
          title: 'World Cup 2026 official semifinal schedule',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/schedule',
          summary: 'Official remaining fixtures and final date.',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.equal(
  decisionGradeWorldCupEvidence.ok,
  true,
  `Expected decision-grade World Cup evidence, got: ${decisionGradeWorldCupEvidence.issues.join('; ')}`,
);

const awardMarketIsNotWinnerEvidence = assessFastReportEvidence({
  task: worldCupEvidenceTask,
  research: null,
  liveData: {
    dynamic_sources: {
      articles: [
        {
          title: 'World Cup Golden Glove odds',
          publisher: 'OddsChecker',
          url: 'https://www.oddschecker.com/us/insight/soccer/world-cup-golden-glove-odds',
          summary: 'A goalkeeper is priced at +250 for the Golden Glove.',
        },
        {
          title: 'World Cup Golden Boot race',
          publisher: 'The Analyst',
          url: 'https://theanalyst.com/articles/2026-world-cup-golden-boot-race-goals',
          summary: 'Top scorer probabilities include a 35% favorite.',
        },
        {
          title: 'World Cup semifinal quiz',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/semi-final-quiz',
          summary: 'Official fan quiz.',
        },
      ],
    },
  },
});
assert.equal(awardMarketIsNotWinnerEvidence.ok, false);
assert.match(
  awardMarketIsNotWinnerEvidence.issues.join('\n'),
  /fresh event-stage or result evidence|independent source domain/i,
  'Expected Golden Boot/Glove and quiz pages not to satisfy the tournament-winner gate.',
);

const encodedPercentAndTournamentNoiseAreNotWinnerEvidence = assessFastReportEvidence({
  task: worldCupEvidenceTask,
  research: null,
  liveData: {
    dynamic_sources: {
      articles: [
        {
          title: 'FIFA disciplinary statistics and red cards',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/articles/world-cup-2026%20disciplinary-stats',
          summary: 'Red and yellow card leaders during the tournament.',
        },
        {
          title: 'World Cup coach exits after semifinal',
          publisher: 'BBC News',
          url: 'https://www.bbc.com/sport/football/world-cup-coach-exit',
          summary: 'The manager steps down after the final match.',
        },
        {
          title: 'Dalic steps down from Croatia role',
          publisher: 'The Analyst',
          url: 'https://theanalyst.com/articles/world-cup-croatia-role',
          summary: 'Post-tournament team news.',
        },
        {
          title: 'Closing ceremony to celebrate the tournament',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/articles/world-cup-closing-ceremony',
          summary: 'Entertainment plans before the final.',
        },
      ],
    },
  },
});
assert.equal(encodedPercentAndTournamentNoiseAreNotWinnerEvidence.ok, false);
assert.match(
  encodedPercentAndTournamentNoiseAreNotWinnerEvidence.issues.join('\n'),
  /fresh event-stage or result evidence|independent source domain/i,
  'Expected URL-encoded spaces and tournament noise not to pass the winner-odds gate.',
);

const oddsPagesWithoutFreshStateDoNotPass = assessFastReportEvidence({
  task: worldCupEvidenceTask,
  research: null,
  liveData: {
    dynamic_sources: {
      articles: [
        {
          title: 'World Cup winner odds update',
          publisher: 'OddsChecker',
          url: 'https://www.oddschecker.com/us/insight/soccer/20260709-2026-world-cup-winner-odds',
          summary: 'France remains the favorite, but the visible snippet contains no price or probability.',
        },
        {
          title: 'World Cup outright odds',
          publisher: 'Fox Sports',
          url: 'https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds',
          summary: 'A current winner market overview without numeric values in the retrieved text.',
        },
        {
          title: 'World Cup tournament predictions',
          publisher: 'BBC News',
          url: 'https://www.bbc.com/sport/football/articles/cjrgew3wv4xo',
          summary: 'A qualitative view from the semifinalists.',
        },
      ],
    },
  },
});
assert.equal(oddsPagesWithoutFreshStateDoNotPass.ok, false);
assert.match(
  oddsPagesWithoutFreshStateDoNotPass.issues.join('\n'),
  /fresh event-stage or result evidence/i,
  'Expected undated odds pages without fresh competition-state evidence not to pass the fast gate.',
);

const extractedSportsWinnerEvidence = extractSportsWinnerNumericEvidenceSnippet(`
[Share](https://example.com/share?title=World%20Cup%202026%20predictions)
Navigation and newsletter copy.
The Opta supercomputer gives France a 28.9% chance of winning the tournament.
Spain are favourites with a 31.4% title probability after the quarter-finals.
Goalkeeper saves reached 75% in the last match.
`);
assert.match(extractedSportsWinnerEvidence || '', /France a 28\.9% chance of winning/i);
assert.match(extractedSportsWinnerEvidence || '', /Spain are favourites with a 31\.4% title probability/i);
assert.doesNotMatch(extractedSportsWinnerEvidence || '', /World%20Cup|Goalkeeper saves/i);
assert.equal(
  isLowValueSourceForTask(worldCupEvidenceTask, {
    domain: 'theanalyst.com',
    publisher: 'The Analyst',
    url: 'https://theanalyst.com/articles/world-cup-predictions-2026-quarter-finals-opta-supercomputer',
    title: 'World Cup Predictions 2026: Opta Supercomputer Projections',
    summary: extractedSportsWinnerEvidence || '',
  }),
  false,
  'Expected an authoritative sports probability model not to be dropped as generic forecast spam.',
);

const deterministicWorldCupUnderstanding: MarketUnderstanding = {
  subject: 'FIFA World Cup 2026 winner',
  underlying: null,
  questionType: 'event_outcome',
  resolutionDate: null,
  searchQueries: ['FIFA World Cup 2026 winner odds'],
  entity: {
    canonicalName: 'FIFA World Cup 2026',
    aliases: ['World Cup 2026'],
    officialDomains: ['fifa.com', 'theanalyst.com'],
    avoidTerms: ['wikipedia'],
    ambiguity: 'low',
    rationale: 'Known sports competition.',
  },
};
const driftedWorldCupUnderstanding: MarketUnderstanding = {
  ...deterministicWorldCupUnderstanding,
  subject: 'World Cup brand contest',
  searchQueries: ['World Cup brand contest'],
  entity: {
    canonicalName: 'World Cup brand contest',
    aliases: ['World Cup'],
    officialDomains: ['example.com'],
    avoidTerms: ['fifa', 'football', 'soccer'],
    ambiguity: 'low',
    rationale: 'Incorrect model-produced entity.',
  },
};
const mergedWorldCupUnderstanding = mergeUnderstandingWithHeuristic(
  worldCupEvidenceTask,
  driftedWorldCupUnderstanding,
  deterministicWorldCupUnderstanding,
);
assert.equal(mergedWorldCupUnderstanding?.entity?.canonicalName, 'FIFA World Cup 2026');
assert.deepEqual(mergedWorldCupUnderstanding?.entity?.avoidTerms, ['wikipedia']);

const bitcoinMarketCapTask = `research the prediction market topic: Will Bitcoin Reach a $2 Trillion Market Cap Before December 31, 2026?
Listed outcomes in AgentFlow: Yes / No.
Prediction market category in AgentFlow: Crypto.`;
const thinBitcoinMarketCapEvidence = assessFastReportEvidence({
  task: bitcoinMarketCapTask,
  research: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    coingecko: {
      assets: [{ coinId: 'bitcoin' }],
    },
    dynamic_sources: {
      articles: [
        {
          title: 'Bitcoin market update',
          publisher: 'CoinDesk',
          url: 'https://www.coindesk.com/markets/2026/07/14/bitcoin-market-update/',
          summary: 'Current Bitcoin market coverage.',
        },
        {
          title: 'Bitcoin institutional flows',
          publisher: 'Reuters',
          url: 'https://www.reuters.com/technology/bitcoin-institutional-flows-2026-07-14/',
          summary: 'Current institutional demand context.',
        },
      ],
    },
  },
});
assert.equal(thinBitcoinMarketCapEvidence.ok, false);
assert.match(
  thinBitcoinMarketCapEvidence.issues.join('\n'),
  /current numeric price and market-cap snapshot/i,
  'Expected Bitcoin target research without the numeric baseline to stop before paid agents.',
);

const decisionGradeBitcoinMarketCapEvidence = assessFastReportEvidence({
  task: bitcoinMarketCapTask,
  research: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    coingecko: {
      assets: [
        {
          coinId: 'bitcoin',
          price_usd: 65432,
          market_cap_usd: 1_302_000_000_000,
          last_updated_at: '2026-07-14T00:00:00.000Z',
        },
      ],
    },
    dynamic_sources: {
      articles: [
        {
          title: 'Bitcoin ETF flows and current market outlook',
          publisher: 'Reuters',
          url: 'https://www.reuters.com/technology/bitcoin-etf-flows-2026-07-14/',
          summary: 'Current institutional demand and macro context.',
        },
        {
          title: 'Bitcoin market-cap outlook',
          publisher: 'CoinDesk',
          url: 'https://www.coindesk.com/markets/2026/07/14/bitcoin-market-cap-outlook/',
          summary: 'Current Bitcoin market drivers and risks.',
        },
      ],
    },
  },
});
assert.equal(
  decisionGradeBitcoinMarketCapEvidence.ok,
  true,
  `Expected decision-grade Bitcoin evidence, got: ${decisionGradeBitcoinMarketCapEvidence.issues.join('; ')}`,
);

const repairedBitcoinThresholdMath = finalizeReportMarkdown({
  task: bitcoinMarketCapTask,
  writerMarkdown: `# Bitcoin market-cap threshold

## Summary

Bitcoin would need to double to about $130,000 per BTC.

## Evidence

- Price increase needed: 64.5% from $64,455.

## Sources`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    prediction_market_metrics: {
      metric: 'market_cap_threshold',
      target_market_cap_usd: 2_000_000_000_000,
      current_market_cap_usd: 1_292_623_459_292,
      current_price_usd: 64_455,
      required_increase_pct: 54.723,
      equivalent_price_usd: 99_727.7,
    },
    coingecko: {
      assets: [
        {
          coinId: 'bitcoin',
          price_usd: 64_455,
          market_cap_usd: 1_292_623_459_292,
          last_updated_at: '2026-07-14T00:00:00.000Z',
        },
      ],
    },
    dynamic_sources: {
      articles: [
        {
          title: 'Bitcoin ETF flows and current market outlook',
          publisher: 'Reuters',
          url: 'https://www.reuters.com/technology/bitcoin-etf-flows-2026-07-14/',
          summary: 'Current institutional demand and macro context.',
        },
        {
          title: 'Bitcoin market-cap outlook',
          publisher: 'CoinDesk',
          url: 'https://www.coindesk.com/markets/2026/07/14/bitcoin-market-cap-outlook/',
          summary: 'Current Bitcoin market drivers and risks.',
        },
      ],
    },
  },
});
assert.match(repairedBitcoinThresholdMath.markdown, /54\.7% increase/i);
assert.match(repairedBitcoinThresholdMath.markdown, /\$99,728 per coin/i);
assert.doesNotMatch(repairedBitcoinThresholdMath.markdown, /\b(?:double|doubling)\b/i);
assert.doesNotMatch(repairedBitcoinThresholdMath.markdown, /\$130,000|64\.5%/i);

const worldCupPredmarketDoesNotTreatSourceUrlSlugAsFutureDate = finalizeReportMarkdown({
  task: 'research the prediction market topic: Who Will Win the FIFA World Cup 2026?',
  writerMarkdown: `## Overview

France, Argentina, and Brazil remain the leading contenders based on current form and odds coverage.

## Sources

- [The New York Times](https://www.nytimes.com/athletic/7329359/2026/07/08/world-cup-2026-48-teams-ranked/) - team rankings
- [foxsports.com](https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds) - odds`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-09T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Re-ranking the World Cup teams before the quarter-finals',
          publisher: 'The New York Times',
          url: 'https://www.nytimes.com/athletic/7329359/2026/07/08/world-cup-2026-48-teams-ranked/',
          summary: 'Team rankings and contender context.',
          seen_at: '2026-07-08T00:00:00.000Z',
        },
        {
          title: 'FIFA World Cup 2026 odds and predictions',
          publisher: 'foxsports.com',
          url: 'https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds',
          summary: 'Outright odds and favorites.',
          seen_at: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    source_diagnostics: {
      source_diversity: 'sufficient',
      unique_source_domains: 2,
      has_official_match: false,
      authoritative_category_matches: 2,
      relevant_entity_matches: 2,
      unresolved_entity: false,
      drift_risk: 'low',
      entity_ambiguity: 'low',
      search_backend_unhealthy: true,
      search_backend_failures: ['firecrawl: firecrawl search failed: This operation was aborted'],
      search_backends: [
        {
          provider: 'firecrawl',
          status: 'unavailable',
        },
      ],
    },
  },
});
assert.ok(
  !worldCupPredmarketDoesNotTreatSourceUrlSlugAsFutureDate.validationIssues.some((issue) =>
    /future date/i.test(issue),
  ),
  `Expected source URL slugs not to trigger future-date validation, got: ${worldCupPredmarketDoesNotTreatSourceUrlSlugAsFutureDate.validationIssues.join('; ')}`,
);

const sportsPredmarketRetainsNonWhitelistedSources = finalizeReportMarkdown({
  task: 'research the prediction market topic: Who Will Win the FIFA World Cup 2026?',
  writerMarkdown: `## Summary

France, Argentina, and Brazil remain the main contenders.

## Sources

- [ESPN](https://www.espn.com/soccer/story/_/id/12345) - contender analysis
- [ABC News](https://abcnews.go.com/Sports/story?id=12345) - squad update
- [USA Today](https://www.usatoday.com/story/sports/soccer/2026/06/14/example/12345/) - tournament watch list`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-06-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Contender analysis',
          publisher: 'ESPN',
          url: 'https://www.espn.com/soccer/story/_/id/12345',
          summary: 'Team form analysis.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
        {
          title: 'Squad update',
          publisher: 'ABC News',
          url: 'https://abcnews.go.com/Sports/story?id=12345',
          summary: 'Roster and injury update.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
        {
          title: 'Tournament watch list',
          publisher: 'USA Today',
          url: 'https://www.usatoday.com/story/sports/soccer/2026/06/14/example/12345/',
          summary: 'Team watch list.',
          seen_at: '2026-06-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(sportsPredmarketRetainsNonWhitelistedSources.markdown, /espn\.com\/soccer\/story/i);
assert.match(sportsPredmarketRetainsNonWhitelistedSources.markdown, /abcnews\.go\.com\/sports/i);
assert.match(sportsPredmarketRetainsNonWhitelistedSources.markdown, /usatoday\.com\/story\/sports\/soccer/i);

const sportsPredmarketPrioritizesDecisionEvidence = finalizeReportMarkdown({
  task: worldCupEvidenceTask,
  writerMarkdown: `## Overview

France led the latest retrieved model at 34.0%, followed by Spain, England, and Argentina.

## Sources

- [The Analyst](https://theanalyst.com/articles/buck-buchanan-award-fcs-football-defensive-player-preseason-watch-list-2026) - unrelated FCS watch list
- [The Analyst](https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer) - current tournament model
- [Fox Sports](https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds) - current title odds
- [BBC News](https://www.bbc.com/sport/football/articles/cjrgew3wv4xo) - semifinalist context`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'FIFA World Cup 2026 Predictions: Opta Supercomputer Ahead of the Semi-Finals',
          publisher: 'The Analyst',
          url: 'https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer',
          summary: 'France won the tournament in 34.0% of simulations, Spain 23.4%, England 21.9%, and Argentina 20.6%.',
          seen_at: '2026-07-12T00:00:00.000Z',
        },
        {
          title: 'World Cup 2026 title odds',
          publisher: 'Fox Sports',
          url: 'https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds',
          summary: 'Current outright winner odds and favorites.',
        },
        {
          title: 'Who will win the World Cup?',
          publisher: 'BBC News',
          url: 'https://www.bbc.com/sport/football/articles/cjrgew3wv4xo',
          summary: 'The view from the semifinalists.',
        },
      ],
    },
  },
});
assert.equal(sportsPredmarketPrioritizesDecisionEvidence.sources[0]?.url,
  'https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer');
assert.match(sportsPredmarketPrioritizesDecisionEvidence.sources[0]?.usedFor || '', /34\.0% of simulations/i);
assert.doesNotMatch(sportsPredmarketPrioritizesDecisionEvidence.markdown, /buck-buchanan|fcs-football/i);

const postSemifinalWorldCupTask = worldCupEvidenceTask;
const postSemifinalContradictionIsRejected = finalizeReportMarkdown({
  task: postSemifinalWorldCupTask,
  writerMarkdown: `# Who Will Win the FIFA World Cup 2026?

Spain is the slight market favorite with a 23.4% Opta simulation probability, while France has a 34.0% chance to win. Four teams remain in the semi-final stage, with France facing Spain and Argentina playing England. France has a 57.7% chance to reach the final.

## Sources

- [The Analyst](https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer)
- [FIFA](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/france-spain-match-report-highlights)
- [AP](https://apnews.com/article/world-cup-final-spain-argentina-example)`,
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-16T20:07:00.000Z',
    source_diagnostics: {
      has_sufficient_diversity: true,
      drift_risk: 'low',
      unresolved_entity: false,
    },
    dynamic_sources: {
      articles: [
        {
          title: 'FIFA World Cup 2026 predictions ahead of the semi-finals',
          publisher: 'The Analyst',
          url: 'https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer',
          summary: 'Before the semi-finals, France won 34.0% of simulations and Spain 23.4%.',
          seen_at: '2026-07-12T00:00:00.000Z',
        },
        {
          title: 'Spain beat France 2-0 to reach the World Cup final',
          publisher: 'FIFA',
          url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/france-spain-match-report-highlights',
          summary: 'Spain defeated France 2-0 in the semi-final and advanced to the final.',
          seen_at: '2026-07-15T00:30:00.000Z',
        },
        {
          title: 'World Cup final is set: Spain will face Argentina',
          publisher: 'AP News',
          url: 'https://apnews.com/article/world-cup-final-spain-argentina-example',
          summary: 'Argentina beat England 2-1, so the final is set between Spain and Argentina.',
          seen_at: '2026-07-16T00:30:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  postSemifinalContradictionIsRejected.validationIssues.join('\n'),
  /conflates model or simulation probabilities with market probabilities/i,
);
assert.match(
  postSemifinalContradictionIsRejected.validationIssues.join('\n'),
  /timeline contradicts fresh source evidence/i,
);
assert.doesNotMatch(postSemifinalContradictionIsRejected.markdown, /four teams remain/i);
assert.doesNotMatch(postSemifinalContradictionIsRejected.markdown, /France has a 57\.7% chance/i);
assert.match(postSemifinalContradictionIsRejected.markdown, /generated ranking was withheld/i);

const suppliedWorldCupCurrentState = {
  snapshot_at: '2026-07-16T21:05:00.000Z',
  source_diagnostics: {
    has_sufficient_diversity: true,
    drift_risk: 'low',
    unresolved_entity: false,
  },
  dynamic_sources: {
    articles: [
      {
        title: 'FIFA World Cup 2026 predictions ahead of the semi-finals',
        publisher: 'The Analyst',
        url: 'https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer',
        summary: 'Published before the semi-finals: France won 34.0% of simulations and had a 57.7% chance of reaching the final.',
        seen_at: '2026-07-12T00:00:00.000Z',
      },
      {
        title: 'Spain beat France 2-0 in the World Cup semi-final',
        publisher: 'FIFA',
        url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/france-spain-match-report-highlights',
        summary: 'Spain defeated France 2-0 and advanced to the final; France was eliminated.',
        seen_at: '2026-07-14T23:00:00.000Z',
      },
      {
        title: 'World Cup final is set: Spain will face Argentina',
        publisher: 'BBC News',
        url: 'https://www.bbc.com/sport/football/articles/world-cup-final-spain-argentina',
        summary: 'Argentina beat England 2-1, confirming Spain against Argentina in the final.',
        seen_at: '2026-07-16T00:30:00.000Z',
      },
    ],
  },
};

const suppliedReportOneRejected = finalizeReportMarkdown({
  task: postSemifinalWorldCupTask,
  writerMarkdown: `# Who Will Win the FIFA World Cup 2026?

France currently leads as the most probable winner, holding a 14.7% implied probability in the achmarket prediction market as of July 16, 2026. An Opta simulation gives France a 57.7% chance of reaching the final and a 34.0% chance of winning from the semi-final stage. France is currently favored. The top five exceed 50%, indicating a concentrated market view.

## Sources

- [The Analyst](https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer)`,
  research: null,
  analysis: null,
  liveData: suppliedWorldCupCurrentState,
});
assert.match(
  suppliedReportOneRejected.validationIssues.join('\n'),
  /internal prediction provider|timeline contradicts|promotes a forecast|partial outcome sum/i,
);
assert.match(
  suppliedReportOneRejected.validationIssues.join('\n'),
  /partial outcome sum/i,
);
assert.doesNotMatch(suppliedReportOneRejected.markdown, /achmarket|France currently/i);
assert.match(suppliedReportOneRejected.markdown, /generated ranking was withheld/i);

const suppliedReportTwoRejected = finalizeReportMarkdown({
  task: postSemifinalWorldCupTask,
  writerMarkdown: `# Who Will Win the FIFA World Cup 2026?

The semifinals are occurring around July 14-16. Current prediction market data from achmarket favors France. Argentina advanced against England and is expected to face the winner of France vs Spain. The Analyst indicates a 34% France win probability based on post-semifinal performance data.

## Takeaway

France is both the market favorite and projected strongly by AI.

## Sources

- [The Analyst](https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer)`,
  research: null,
  analysis: null,
  liveData: suppliedWorldCupCurrentState,
});
assert.match(
  suppliedReportTwoRejected.validationIssues.join('\n'),
  /internal prediction provider|timeline contradicts|promotes a forecast/i,
);
assert.doesNotMatch(
  suppliedReportTwoRejected.markdown,
  /achmarket|semifinals are occurring|winner of France vs Spain/i,
);
assert.match(suppliedReportTwoRejected.markdown, /generated ranking was withheld/i);

const staleWorldCupEvidenceFailsClosed = finalizeReportMarkdown({
  task: postSemifinalWorldCupTask,
  writerMarkdown: 'France remains the favorite based on the pre-semifinal model.',
  research: null,
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-16T20:07:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'World Cup semi-final predictions',
          publisher: 'The Analyst',
          url: 'https://theanalyst.com/articles/world-cup-2026-semi-final-predictions-opta-supercomputer',
          summary: 'France won 34.0% of simulations before the semi-finals.',
          seen_at: '2026-07-12T00:00:00.000Z',
        },
        {
          title: 'World Cup winner odds before the semi-finals',
          publisher: 'Fox Sports',
          url: 'https://www.foxsports.com/stories/soccer/world-cup-2026-champion-odds',
          summary: 'Pre-match outright winner odds for the four semi-finalists.',
          seen_at: '2026-07-12T06:00:00.000Z',
        },
        {
          title: 'Who will win the World Cup? The view from the semi-finalists',
          publisher: 'BBC News',
          url: 'https://www.bbc.com/sport/football/articles/cjrgew3wv4xo',
          summary: 'Background from the four teams before the semi-finals.',
          seen_at: '2026-07-12T12:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  staleWorldCupEvidenceFailsClosed.markdown,
  /current competition stage and latest results could not be verified/i,
);
assert.doesNotMatch(staleWorldCupEvidenceFailsClosed.markdown, /France remains the favorite/i);

const structuredResearchSourceSurvivesGrounding = finalizeReportMarkdown({
  task: 'OpenAI latest model research',
  writerMarkdown: `## Summary

OpenAI introduced new voice models.

## Sources

1. Reuters
2. OpenAI`,
  research: {
    facts: [
      {
        claim: 'OpenAI introduced new voice models in the API.',
        value: 'Voice model release',
        status: 'confirmed',
        date_or_period: '2026-05-07',
        confidence: 'high',
        support: 'OpenAI product announcement',
        source_name: 'OpenAI',
        source_url:
          'https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api',
      },
      {
        claim: 'Reuters contextualized the latest OpenAI model research coverage.',
        value: 'External coverage',
        status: 'reported',
        date_or_period: '2026-05-21',
        confidence: 'medium',
        support: 'Reuters coverage',
        source_name: 'Reuters',
        source_url:
          'https://www.reuters.com/world/openai-latest-model-research-example-2026-05-21/',
      },
    ],
    sources: [
      {
        name: 'OpenAI',
        url: 'https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api',
        used_for: 'Voice model announcement',
      },
      {
        name: 'Reuters',
        url: 'https://www.reuters.com/world/openai-latest-model-research-example-2026-05-21/',
        used_for: 'Independent coverage',
      },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-05-23T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'OpenAI voice models announcement',
          publisher: 'OpenAI',
          url: 'https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api',
          summary: 'Official announcement.',
          seen_at: '2026-05-23T00:00:00.000Z',
        },
      ],
    },
  },
  trustedResearchSources: true,
});
assert.match(structuredResearchSourceSurvivesGrounding.markdown, /reuters\.com\/world\/openai-latest-model-research-example/i);
assert.ok(
  !structuredResearchSourceSurvivesGrounding.validationIssues.some((issue) =>
    /Unsupported source omitted from final source list: Reuters/i.test(issue),
  ),
);

const broadAiIndiaReportKeepsFreshLiveSources = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

India is expanding AI investment.

## Sources

- Old policy source`,
  research: {
    topic: 'Future of AI in India',
    scope: {
      entities: ['India'],
    },
    facts: [
      {
        claim: 'India has an active national AI policy push.',
        value: 'Policy push',
        status: 'reported',
        date_or_period: '2024-03-01',
        confidence: 'medium',
        support: 'Older policy background',
        source_name: 'Archived policy source',
        source_url: 'https://example.com/india-ai-background-2024',
      },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'IndiaAI Mission expands compute capacity for startups',
          publisher: 'Ministry of Electronics and IT',
          url: 'https://www.meity.gov.in/indiaai-mission-compute-capacity-2026',
          summary: 'India expanded public AI compute access for startups and researchers.',
          seen_at: '2026-07-13T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  broadAiIndiaReportKeepsFreshLiveSources.markdown,
  /meity\.gov\.in\/indiaai-mission-compute-capacity-2026/i,
);
assert.doesNotMatch(
  broadAiIndiaReportKeepsFreshLiveSources.markdown,
  /example\.com\/india-ai-background-2024/i,
);
assert.doesNotMatch(
  broadAiIndiaReportKeepsFreshLiveSources.markdown,
  /Source URLs were not available/i,
);

const broadAiIndiaReportDropsSocialPageFallback = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

India is expanding AI investment.

## Sources

- Policy source`,
  research: {
    topic: 'Future of AI in India',
    sources: [
      {
        name: 'IndiaAI',
        url: 'https://indiaai.gov.in/article/national-ai-strategy',
        used_for: 'National AI programme overview',
      },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Future. 9,970,013 likes · 9,032 talking about this. OFFICIAL PAGE FOR FUTURE',
          publisher: 'facebook.com',
          url: 'https://www.facebook.com/Future',
          summary: 'Future. 9,970,013 likes · 9,032 talking about this. OFFICIAL PAGE FOR FUTURE',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
        {
          title: 'AI India Instagram profile',
          publisher: 'instagram.com',
          url: 'https://www.instagram.com/indiaai/',
          summary: 'Social profile metadata',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
        {
          title: 'IndiaAI Mission expands compute capacity for startups',
          publisher: 'Ministry of Electronics and IT',
          url: 'https://www.meity.gov.in/indiaai-mission-compute-capacity-2026',
          summary: 'India expanded public AI compute access for startups and researchers.',
          seen_at: '2026-07-13T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  broadAiIndiaReportDropsSocialPageFallback.markdown,
  /indiaai\.gov\.in\/article\/national-ai-strategy/i,
);
assert.match(
  broadAiIndiaReportDropsSocialPageFallback.markdown,
  /meity\.gov\.in\/indiaai-mission-compute-capacity-2026/i,
);
assert.doesNotMatch(broadAiIndiaReportDropsSocialPageFallback.markdown, /facebook\.com/i);
assert.doesNotMatch(broadAiIndiaReportDropsSocialPageFallback.markdown, /instagram\.com/i);
assert.doesNotMatch(
  broadAiIndiaReportDropsSocialPageFallback.markdown,
  /Source URLs were not available/i,
);

const broadAiIndiaReportKeepsFreshSourcesOverModelFallbacks = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

India is expanding AI investment.

## Sources

- Model fallback sources`,
  research: {
    topic: 'Future of AI in India',
    sources: [
      {
        name: 'indiaai.gov.in',
        url: 'https://indiaai.gov.in/article/future-of-ai-in-india',
        used_for: 'LIVE DATA article IndiaAI.gov.in summary',
        publishedAt: '2026-07-14',
      },
      {
        name: 'en.wikipedia.org',
        url: 'https://en.wikipedia.org/wiki/Artificial_intelligence_in_India',
        used_for: 'Wikipedia article on AI in India',
        publishedAt: '2023-01-01',
      },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    current_events: {
      articles: [
        {
          title: 'India’s TCS chair says AI agents may equal headcount, dampen hiring',
          publisher: 'Reuters',
          domain: 'reuters.com',
          url: 'https://www.reuters.com/world/india/indias-tcs-chairman-expects-ai-agents-equal-employee-count-2026-06-09/',
          seen_at: '2026-06-09T07:00:00.000Z',
        },
        {
          title: 'Brookfield: AI and energy security driving India’s renewable future',
          publisher: 'CNBC',
          domain: 'cnbc.com',
          url: 'https://www.cnbc.com/video/2026/07/02/why-brookfield-is-betting-big-on-indiaas-green-energy.html',
          seen_at: '2026-07-02T07:00:00.000Z',
        },
      ],
    },
    dynamic_sources: {
      articles: [
        {
          title: 'Empowering India’s next generation of innovators with ATL Saathi',
          publisher: 'Google DeepMind',
          url: 'https://deepmind.google/blog/empowering-indias-next-generation-of-innovators-with-atl-saathi/',
          summary:
            'Google and AIM launched ATL Saathi, a Gemini-powered AI tool empowering Indian educators in robotics labs.',
          seen_at: '2026-07-13T12:37:28.000Z',
        },
      ],
    },
  },
});
assert.match(
  broadAiIndiaReportKeepsFreshSourcesOverModelFallbacks.markdown,
  /reuters\.com\/world\/india\/indias-tcs-chairman-expects-ai-agents-equal-employee-count-2026-06-09/i,
);
assert.match(
  broadAiIndiaReportKeepsFreshSourcesOverModelFallbacks.markdown,
  /cnbc\.com\/video\/2026\/07\/02\/why-brookfield-is-betting-big-on-indiaas-green-energy/i,
);
assert.match(
  broadAiIndiaReportKeepsFreshSourcesOverModelFallbacks.markdown,
  /deepmind\.google\/blog\/empowering-indias-next-generation-of-innovators-with-atl-saathi/i,
);
assert.doesNotMatch(
  broadAiIndiaReportKeepsFreshSourcesOverModelFallbacks.markdown,
  /indiaai\.gov\.in\/article\/future-of-ai-in-india/i,
);

const sourceOnlyResearchPayloadReportsRetrievalGap = finalizeReportMarkdown({
  task: 'research future of AI in India',
  writerMarkdown: `## Overview

Research payload has sources but sparse claims.`,
  research: {
    topic: 'Future of AI in India',
    sources: [
      {
        name: 'NITI Aayog',
        url: 'https://www.niti.gov.in/ai-india-report-2026',
        used_for: 'AI strategy background',
      },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
  },
});
assert.doesNotMatch(
  sourceOnlyResearchPayloadReportsRetrievalGap.markdown,
  /niti\.gov\.in\/ai-india-report-2026/i,
);
assert.match(
  sourceOnlyResearchPayloadReportsRetrievalGap.markdown,
  /Source URLs were not available/i,
);

const inventedFastResearchSources = [
  {
    name: 'Hindustan Times',
    url: 'https://www.hindustantimes.com/tech/google-ai-investment',
    used_for: 'LIVE DATA firecrawl article snapshot',
    publishedAt: '2026-03-17',
  },
  {
    name: 'Economic Times',
    url: 'https://economictimes.indiatimes.com/articleshow/wadhwani-ai-aws',
    used_for: 'LIVE DATA firecrawl article snapshot',
    publishedAt: '2026-03-17',
  },
  {
    name: 'WIPO',
    url: 'https://www.wipo.int/portal/en/index.html',
    used_for: 'AI patents data',
    accessedAt: '2026-07-14',
  },
];

const inventedFastResearchSourcesWithEmptyLiveData = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

Model invented sources.

## Sources

- Placeholder`,
  research: {
    topic: 'Future of AI in India',
    sources: inventedFastResearchSources,
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
  },
});
assert.doesNotMatch(inventedFastResearchSourcesWithEmptyLiveData.markdown, /hindustantimes\.com/i);
assert.doesNotMatch(inventedFastResearchSourcesWithEmptyLiveData.markdown, /economictimes\.indiatimes\.com/i);
assert.doesNotMatch(inventedFastResearchSourcesWithEmptyLiveData.markdown, /wipo\.int/i);
assert.match(
  inventedFastResearchSourcesWithEmptyLiveData.markdown,
  /Source URLs were not available/i,
);

const inventedFastResearchSourcesWithGroundedLiveData = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

Model invented sources.

## Sources

- Placeholder`,
  research: {
    topic: 'Future of AI in India',
    sources: inventedFastResearchSources,
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Empowering India’s next generation of innovators with ATL Saathi',
          publisher: 'Google DeepMind',
          url: 'https://deepmind.google/blog/empowering-indias-next-generation-of-innovators-with-atl-saathi/',
          summary: 'Google and AIM launched ATL Saathi, a Gemini-powered AI tool for Indian educators.',
          seen_at: '2026-07-13T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  inventedFastResearchSourcesWithGroundedLiveData.markdown,
  /deepmind\.google\/blog\/empowering-indias-next-generation-of-innovators-with-atl-saathi/i,
);
assert.doesNotMatch(inventedFastResearchSourcesWithGroundedLiveData.markdown, /hindustantimes\.com/i);
assert.doesNotMatch(inventedFastResearchSourcesWithGroundedLiveData.markdown, /economictimes\.indiatimes\.com/i);
assert.doesNotMatch(inventedFastResearchSourcesWithGroundedLiveData.markdown, /wipo\.int/i);

const duckDuckGoSearchContextIsNotFinalSource = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

Fast report with mixed source quality.`,
  research: {
    topic: 'Future of AI in India',
    facts: [
      {
        claim: 'DuckDuckGo supplied search context.',
        support: 'LIVE DATA duckduckgo context',
        source_name: 'DuckDuckGo',
        source_url: 'https://duckduckgo.com/?q=future+of+AI+in+India',
      },
      {
        claim: 'IndiaAI published an article about the future of AI in India.',
        support: 'IndiaAI article',
        source_name: 'IndiaAI',
        source_url: 'https://indiaai.gov.in/article/future-of-ai-in-india',
      },
      {
        claim: 'A search snippet mentioned AI startup funding.',
        support: 'LIVE_DATA DuckDuckGo context',
        source_name: 'Tracxn',
        source_url: 'https://tracxn.com/d/sectors/artificial-intelligence/__example',
      },
    ],
    sources: [
      {
        name: 'DuckDuckGo',
        url: 'https://duckduckgo.com/?q=future+of+AI+in+India',
        used_for: 'LIVE DATA duckduckgo context',
      },
      {
        name: 'Tracxn',
        url: 'https://tracxn.com/d/sectors/artificial-intelligence/__example',
        used_for: 'LIVE_DATA DuckDuckGo context',
      },
      {
        name: 'IndiaAI',
        url: 'https://indiaai.gov.in/article/future-of-ai-in-india',
        used_for: 'Article evidence',
      },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
  },
});
assert.doesNotMatch(duckDuckGoSearchContextIsNotFinalSource.markdown, /duckduckgo\.com/i);
assert.doesNotMatch(duckDuckGoSearchContextIsNotFinalSource.markdown, /\bDuckDuckGo\b/i);
assert.doesNotMatch(duckDuckGoSearchContextIsNotFinalSource.markdown, /tracxn\.com/i);
assert.doesNotMatch(duckDuckGoSearchContextIsNotFinalSource.markdown, /\bTracxn\b/i);
assert.doesNotMatch(
  duckDuckGoSearchContextIsNotFinalSource.markdown,
  /indiaai\.gov\.in\/article\/future-of-ai-in-india/i,
);
assert.match(
  duckDuckGoSearchContextIsNotFinalSource.markdown,
  /Source URLs were not available/i,
);

const broadAiIndiaReportDropsDictionaryAndOffTopicWikiLiveData = finalizeReportMarkdown({
  task: 'research on future of AI in India',
  writerMarkdown: `## Overview

Fast report with noisy live retrieval.

## Sources

- Placeholder`,
  research: {
    topic: 'Future of AI in India',
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T00:00:00.000Z',
    dynamic_sources: {
      articles: [
        {
          title: 'Future Definition & Meaning',
          publisher: 'Merriam-Webster',
          url: 'https://www.merriam-webster.com/dictionary/future',
          summary: 'Dictionary definition of future.',
          seen_at: '2026-07-14T00:00:00.000Z',
        },
      ],
    },
    wikipedia: {
      pages: [
        {
          title: 'Future (rapper)',
          url: 'https://en.wikipedia.org/wiki/Future_(rapper)',
          summary: 'American rapper.',
          last_updated_at: '2026-07-14T00:00:00.000Z',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  broadAiIndiaReportDropsDictionaryAndOffTopicWikiLiveData.markdown,
  /merriam-webster\.com\/dictionary\/future/i,
);
assert.doesNotMatch(
  broadAiIndiaReportDropsDictionaryAndOffTopicWikiLiveData.markdown,
  /wikipedia\.org\/wiki\/Future_\(rapper\)/i,
);
assert.match(
  broadAiIndiaReportDropsDictionaryAndOffTopicWikiLiveData.markdown,
  /Source URLs were not available/i,
);

const climateEuropeResolvedRssSources = finalizeReportMarkdown({
  task: 'research the climate outlook for Europe',
  writerMarkdown: `## Overview

Europe faces intensifying heat and flood risk.

## Key Evidence

Reuters and the EEA report record summer temperatures.

## Sources

- Reuters
- EEA`,
  research: {
    topic: 'Climate outlook for Europe',
    sources: [
      { name: 'Reuters', used_for: 'Invented without matching live URL' },
      { name: 'EEA', used_for: 'Invented without matching live URL' },
    ],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T12:00:00.000Z',
    research_domain: 'general',
    current_events: {
      articles: [
        {
          title: 'Europe braces for extreme heat as climate records tumble',
          publisher: 'The Guardian',
          domain: 'theguardian.com',
          url: 'https://www.theguardian.com/environment/2026/jul/10/europe-extreme-heat-climate',
          seen_at: '2026-07-10T08:00:00.000Z',
        },
        {
          title: 'WMO: Europe warming faster than global average',
          publisher: 'World Meteorological Organization',
          domain: 'wmo.int',
          url: 'https://wmo.int/news/media-centre/europe-warming-faster-global-average',
          seen_at: '2026-07-09T10:00:00.000Z',
        },
      ],
    },
    dynamic_sources: {
      source: 'Google News RSS (resolved publisher URLs)',
      articles: [
        {
          title: 'Europe braces for extreme heat as climate records tumble',
          publisher: 'The Guardian',
          url: 'https://www.theguardian.com/environment/2026/jul/10/europe-extreme-heat-climate',
          summary: 'Guardian coverage of European extreme heat linked to climate change.',
          seen_at: '2026-07-10T08:00:00.000Z',
        },
        {
          title: 'WMO: Europe warming faster than global average',
          publisher: 'World Meteorological Organization',
          url: 'https://wmo.int/news/media-centre/europe-warming-faster-global-average',
          summary: 'WMO statement on European warming trends.',
          seen_at: '2026-07-09T10:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  climateEuropeResolvedRssSources.markdown,
  /theguardian\.com\/environment\/2026\/jul\/10\/europe-extreme-heat-climate/i,
);
assert.match(
  climateEuropeResolvedRssSources.markdown,
  /wmo\.int\/news\/media-centre\/europe-warming-faster-global-average/i,
);
assert.doesNotMatch(
  climateEuropeResolvedRssSources.markdown,
  /Source URLs were not available/i,
);

const googleNewsAggregatorDroppedFromGrounding = finalizeReportMarkdown({
  task: 'research the climate outlook for Europe',
  writerMarkdown: `## Overview

Heat risk rising.

## Sources

- The Guardian`,
  research: {
    topic: 'Climate outlook for Europe',
    sources: [{ name: 'The Guardian', used_for: 'Model cited Google News URL' }],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T12:00:00.000Z',
    research_domain: 'general',
    current_events: {
      articles: [
        {
          title: 'Europe braces for extreme heat as climate records tumble',
          publisher: 'The Guardian',
          url: 'https://news.google.com/rss/articles/CBMiExampleGoogleOnly',
          seen_at: '2026-07-10T08:00:00.000Z',
        },
      ],
    },
  },
});
assert.doesNotMatch(
  googleNewsAggregatorDroppedFromGrounding.markdown,
  /news\.google\.com\/rss\/articles/i,
);
assert.match(
  googleNewsAggregatorDroppedFromGrounding.markdown,
  /Source URLs were not available/i,
);

const aiChinaKeepsPublisherSourcesDespiteFutureTopic = finalizeReportMarkdown({
  task: 'research on future of AI in china',
  writerMarkdown: `## Overview

China AI investment is rising.

## Sources

- Placeholder`,
  research: {
    topic: 'Future of AI in China',
    sources: [{ name: 'Invented Journal', used_for: 'Model fallback without live URL' }],
  },
  analysis: null,
  liveData: {
    snapshot_at: '2026-07-14T12:00:00.000Z',
    research_domain: 'general',
    current_events: {
      articles: [
        {
          title: 'China June exports growth set to cool, but AI demand underpins overall strength',
          publisher: 'Reuters',
          domain: 'reuters.com',
          url: 'https://www.reuters.com/world/china/china-june-exports-growth-set-cool-ai-demand-underpins-overall-strength-2026-07-13/',
          seen_at: '2026-07-13T07:00:00.000Z',
        },
      ],
    },
    dynamic_sources: {
      source: 'Google News RSS (resolved publisher URLs)',
      articles: [
        {
          title: 'China June exports growth set to cool, but AI demand underpins overall strength',
          publisher: 'Reuters',
          url: 'https://www.reuters.com/world/china/china-june-exports-growth-set-cool-ai-demand-underpins-overall-strength-2026-07-13/',
          summary: 'AI demand underpins China export strength.',
          seen_at: '2026-07-13T07:00:00.000Z',
        },
        {
          title: 'China exports in June rise as AI boom lifts trade',
          publisher: 'CNBC',
          url: 'https://www.cnbc.com/2026/07/14/china-june-trade-data-exports-imports.html',
          summary: 'AI boom lifts China trade.',
          seen_at: '2026-07-14T07:00:00.000Z',
        },
      ],
    },
  },
});
assert.match(
  aiChinaKeepsPublisherSourcesDespiteFutureTopic.markdown,
  /reuters\.com\/world\/china\/china-june-exports-growth-set-cool-ai-demand-underpins-overall-strength-2026-07-13/i,
);
assert.match(
  aiChinaKeepsPublisherSourcesDespiteFutureTopic.markdown,
  /cnbc\.com\/2026\/07\/14\/china-june-trade-data-exports-imports/i,
);
assert.doesNotMatch(
  aiChinaKeepsPublisherSourcesDespiteFutureTopic.markdown,
  /Source URLs were not available/i,
);
assert.doesNotMatch(
  aiChinaKeepsPublisherSourcesDespiteFutureTopic.markdown,
  /openai\.com\/index\/deutsche-telekom/i,
);

console.log('Before example:');
console.log(badWriterMarkdown.split('\n').slice(0, 12).join('\n'));
console.log('\nAfter example:');
console.log(finalized.markdown.split('\n').slice(0, 26).join('\n'));
console.log('\nReport pipeline regression checks passed.');
