import type { ResearchBrief } from './types';
import { classifyTopic, selectSources } from '../../lib/source-registry';

export function buildResearchQueries(brief: ResearchBrief): string[] {
  const currentYear = new Date().getFullYear();
  const queries = new Set<string>();
  const cleanedQuery = cleanResearchQuery(brief.query) || brief.query.trim();
  const maxQueryVariants = Math.max(3, Math.min(12, brief.max_query_variants || 8));
  const limitedSubQuestions = brief.sub_questions.slice(
    0,
    brief.query_strategy === 'standard' ? 4 : brief.query_strategy === 'light' ? 3 : 1,
  );
  const isPaymentsAdoptionQuery =
    /\bx402\b/i.test(cleanedQuery) ||
    (/\bpayments?\b/i.test(cleanedQuery) && /\badoption\b/i.test(cleanedQuery));
  const isCreatorAudienceMetricQuery =
    /\b(subscribers?|followers?|views?|audience|reach)\b/i.test(cleanedQuery) &&
    /\b(youtube|channel|creator|streamer|influencer|tiktok|instagram|x|twitter|mrbeast)\b/i.test(cleanedQuery);
  const comparisonParts = extractComparisonParts(cleanedQuery);

  const pushQuery = (value: string) => {
    const normalized = value.trim();
    if (!normalized || queries.size >= maxQueryVariants) return;
    queries.add(normalized);
  };

  if (cleanedQuery) pushQuery(cleanedQuery);

  if (comparisonParts) {
    for (const entity of comparisonParts.entities) {
      pushQuery(`${entity} ${comparisonParts.context}`.trim());
      pushQuery(`${entity} ${comparisonParts.context} ${currentYear}`.trim());
      pushQuery(`${entity} ${comparisonParts.context} official`.trim());
    }
    if (comparisonParts.context) {
      pushQuery(`${comparisonParts.entities.join(' vs ')} ${comparisonParts.context}`);
    }
  }

  if (brief.query_strategy === 'direct') {
    pushQuery(`${cleanedQuery} ${currentYear}`);
    pushQuery(`${cleanedQuery} latest official update`);
    if (limitedSubQuestions[0]) {
      pushQuery(cleanResearchQuery(limitedSubQuestions[0]));
    }
  } else if (brief.query_strategy === 'light') {
    pushQuery(`${cleanedQuery} ${currentYear}`);
    pushQuery(`${cleanedQuery} latest developments ${currentYear}`);
    pushQuery(`${cleanedQuery} official update`);
    pushQuery(`${cleanedQuery} data statistics`);
  } else if (brief.scope === 'broad') {
    pushQuery(`${cleanedQuery} overview ${currentYear}`);
    pushQuery(`${cleanedQuery} latest developments ${currentYear}`);
    pushQuery(`${cleanedQuery} statistics data report`);
    pushQuery(`${cleanedQuery} official data report`);
  } else {
    pushQuery(`${cleanedQuery} ${currentYear}`);
    pushQuery(`${cleanedQuery} evidence analysis`);
    pushQuery(`${cleanedQuery} primary source ${currentYear}`);
    pushQuery(`${cleanedQuery} latest official update`);
  }

  if (isPaymentsAdoptionQuery) {
    pushQuery(`${cleanedQuery} merchant adoption`);
    pushQuery(`${cleanedQuery} enterprise adoption`);
    pushQuery(`${cleanedQuery} checkout integration`);
    pushQuery(`${cleanedQuery} payment processors merchant usage`);
    pushQuery(`${cleanedQuery} stablecoin payments adoption`);
    pushQuery(`${cleanedQuery} business models regulation`);
    pushQuery(`${cleanedQuery} developers API integration commerce`);
    pushQuery(`x402 payments merchant adoption ${currentYear}`);
  }

  if (isCreatorAudienceMetricQuery) {
    pushQuery(`${cleanedQuery} official channel current subscribers`);
    pushQuery(`${cleanedQuery} live subscriber count official youtube channel`);
    pushQuery(`${cleanedQuery} socialblade current subscribers`);
    pushQuery(`${cleanedQuery} official creator channel statistics ${currentYear}`);
  }

  for (const mustAnswer of brief.must_answer.slice(0, brief.query_strategy === 'standard' ? 3 : 2)) {
    const base = cleanResearchQuery(mustAnswer);
    if (!base) continue;
    pushQuery(`${cleanedQuery} ${base}`);
    pushQuery(`${base} ${currentYear}`);
  }

  for (const question of limitedSubQuestions) {
    const base = cleanResearchQuery(question);
    if (!base) continue;

    pushQuery(base);
    pushQuery(`latest ${base} ${currentYear}`);
    pushQuery(`official ${base} report site:.gov OR site:.org`);
    if (brief.query_strategy !== 'direct') {
      pushQuery(`${base} statistics data numbers`);
      pushQuery(`${base} source documents`);
    }
    if (brief.query_strategy === 'standard') {
      pushQuery(`${base} expert commentary ${currentYear}`);
      pushQuery(`criticism concerns ${base}`);
    }
  }

  if (brief.scope === 'broad' && brief.query_strategy === 'standard') {
    pushQuery(`${cleanedQuery} risks challenges analysis`);
    pushQuery(`${cleanedQuery} expert analysis ${currentYear}`);
    pushQuery(`${cleanedQuery} industry outlook ${currentYear}`);
    pushQuery(`${cleanedQuery} regulatory update ${currentYear}`);
    pushQuery(`${cleanedQuery} adoption trends ${currentYear}`);
    pushQuery(`${cleanedQuery} Reuters ${currentYear}`);
    pushQuery(`${cleanedQuery} BBC ${currentYear}`);
    pushQuery(`${cleanedQuery} Wikipedia background`);
    pushQuery(`${cleanedQuery} academic research overview`);
  }

  if (!queries.size) {
    pushQuery(brief.query);
  }

  // Add source-aware query variants for high-trust sources that match the topic
  const { labels, intent } = classifyTopic(brief.query);
  const topSources = selectSources(brief.query, 5);
  console.log(
    `[research] deep-pipeline sources (intent=${intent} labels=${labels.join(',')}):`,
    topSources.map((s) => s.name).join(', '),
  );

  for (const s of topSources.slice(0, 5)) {
    let hostname: string;
    try {
      hostname = new URL(s.baseUrl).hostname;
    } catch {
      continue;
    }
    for (const q of limitedSubQuestions) {
      const base = q.trim();
      if (base) {
        pushQuery(`${base} site:${hostname}`);
      }
    }
  }

  return Array.from(queries);
}

function cleanResearchQuery(value: string): string {
  return value
    .replace(/\bExecution context:[\s\S]*$/i, '')
    .replace(/\bMarket address for AgentFlow trade routing only:[^\n]*/gi, ' ')
    .replace(/\bDo not research the contract address itself[^\n]*/gi, ' ')
    .replace(/\bFocus on the real-world event[^\n]*/gi, ' ')
    .replace(/\b0x[a-fA-F0-9]{40}\b/g, ' ')
    .replace(/\brsearch\b/gi, 'research')
    .replace(/^\s*(make|write|create|generate|prepare|give)(?:\s+(?:me|us))?(?:\s+a)?\s+/i, '')
    .replace(/^\s*(deep|full|detailed|comprehensive|fast)\s+/i, '')
    .replace(/^\s*research\s+(?:the\s+)?(?:prediction\s+)?market(?:\s+topic)?[:\s-]*/i, '')
    .replace(/^\s*research\s+(?:on|about|into|for)\s+/i, '')
    .replace(/^\s*research\s+/i, '')
    .replace(/\bresearch report\b/gi, ' ')
    .replace(/\breport\b/gi, ' ')
    .replace(/\banalysis\b/gi, ' ')
    .replace(/\bsmoke\s+\d+\b/gi, ' ')
    .replace(/\b(?:summarize|summary|briefly|in one short paragraph|one short paragraph)\b/gi, ' ')
    .replace(/[?.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractComparisonParts(
  query: string,
): { entities: string[]; context: string } | null {
  if (!/\b(?:compare|vs\.?|versus)\b/i.test(query)) return null;

  const normalized = query
    .replace(/^\s*compare\s+/i, '')
    .replace(/\bversus\b/gi, ' vs ')
    .replace(/\bvs\.\b/gi, ' vs ')
    .replace(/\bcosts\b/gi, ' fees')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = normalized.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const trailingContextMatch = parts[1].match(
    /\b(bridge fees?|bridge costs?|fees?|costs?|yield|yields|adoption|market share|latency|speed|throughput)\b[\s\S]*$/i,
  );
  const trailingContext = trailingContextMatch?.[0]?.trim() || '';
  const left = parts[0].replace(/\b(bridge fees?|bridge costs?|fees?|costs?)\b[\s\S]*$/i, '').trim();
  const right = trailingContext
    ? parts[1].replace(trailingContext, '').trim()
    : parts[1].trim();
  const entities = [left, right].filter(Boolean);
  if (entities.length !== 2) return null;

  const context = trailingContext || 'comparison';
  return { entities, context };
}
