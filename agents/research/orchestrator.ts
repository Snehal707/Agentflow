import { callHermesFast } from '../../lib/hermes';
import { hasNamedEntityAndStrongNarrowingSignal } from './entityDetection';
import type { ResearchBrief } from './types';

const DEFAULT_BRIEF: Omit<ResearchBrief, 'query'> = {
  intent: 'research',
  scope: 'broad',
  query_strategy: 'light',
  time_sensitivity: 'recent',
  required_freshness_days: 30,
  geography: [],
  domains_priority: [],
  domains_avoid: ['rss', 'news.google.com'],
  preferred_source_types: ['primary', 'official', 'reputable news', 'reference'],
  must_answer: [],
  avoid_drift: [
    'Do not let one retrieved article or narrow subtopic redefine the user topic.',
    'Use narrow sources only as supporting evidence, not as the whole frame.',
  ],
  minimum_source_diversity: 3,
  max_query_variants: 8,
  target_source_count: 8,
  sub_questions: [],
  evaluation_rubric: 'Prefer fresh, source-grounded, non-duplicative evidence.',
};

export async function buildResearchBrief(input: {
  query: string;
  walletContext?: object;
}): Promise<ResearchBrief> {
  const prompt = `Return valid JSON only.

Build a research brief for AgentFlow's default fast-report research pipeline.
You must return this exact JSON shape:
{
  "query": string,
  "intent": string,
  "scope": "broad" | "narrow",
  "query_strategy": "direct" | "light" | "standard",
  "time_sensitivity": "live" | "recent" | "historical",
  "required_freshness_days": number,
  "geography": string[],
  "domains_priority": string[],
  "domains_avoid": string[],
  "preferred_source_types": string[],
  "must_answer": string[],
  "avoid_drift": string[],
  "minimum_source_diversity": number,
  "max_query_variants": number,
  "target_source_count": number,
  "sub_questions": string[],
  "evaluation_rubric": string
}

Rules:
- Preserve the user's topic. Search results may support the topic, but must not redefine it.
- Optimize for fast reports by default. Do not over-plan simple queries.
- Classify scope as "broad" for open-ended topics like "forex market", "AI agents", "climate change", "pgvector indexing", "Argentina economy", or "x402 payments".
- Classify scope as "narrow" only when the user names a specific angle, entity, comparison, event, or question.
- Set query_strategy to:
  - "direct" for simple factual or tightly scoped queries that can likely succeed with minimal expansion.
  - "light" for the default path when some decomposition helps but should stay fast.
  - "standard" only when the topic is broad, ambiguous, multi-entity, or likely to become thin without fuller coverage.
- For broad topics, must_answer should cover the major dimensions a good general report should answer, not a single subtopic.
- For narrow topics, must_answer should stay tightly aligned to the named angle.
- Add avoid_drift items that would prevent retrieval from overfocusing on one article, vendor, marketing page, or side issue.
- Set minimum_source_diversity to 3 for broad topics and at least 2 for narrow topics.
- Set max_query_variants based on strategy:
  - direct: 3-5
  - light: 5-8
  - standard: 8-12
- Set target_source_count based on strategy:
  - direct: 4-6
  - light: 6-10
  - standard: 8-14
- Generate only as many sub_questions as the strategy needs:
  - direct: 0-2
  - light: 2-4
  - standard: 4-6
- Each sub_question must be focused, self-contained, and search-ready.
- Prefer fresh primary sources when relevant.
- Use preferred_source_types to describe the kinds of sources to seek, e.g. official, primary, reputable news, academic, technical docs, regulatory, market data, reference.
- Keep domains_priority and domains_avoid concise.
- Use only JSON, no markdown fences.`;

  const userMessage = JSON.stringify(
    {
      query: input.query,
      walletContext: input.walletContext ?? null,
      nowIso: new Date().toISOString(),
    },
    null,
    2,
  );

  const first = await callHermesFast(prompt, userMessage);
  const parsed = parseBrief(first, input.query);
  if (parsed) {
    return parsed;
  }

  const retry = await callHermesFast(
    `${prompt}\n\nYour previous answer was invalid JSON. Return JSON only.`,
    userMessage,
  );
  return parseBrief(retry, input.query) ?? fallbackBrief(input.query);
}

function parseBrief(value: string, query: string): ResearchBrief | null {
  try {
    const parsed = JSON.parse(value) as Partial<ResearchBrief>;
    return normalizeBrief(parsed, query);
  } catch {
    return null;
  }
}

function normalizeBrief(parsed: Partial<ResearchBrief>, query: string): ResearchBrief {
  const inferredScope = inferScope(query);
  const inferredStrategy = inferQueryStrategy(query, inferredScope);
  const normalizedSubQuestions = Array.isArray(parsed.sub_questions)
    ? parsed.sub_questions.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];
  const normalizedMustAnswer = normalizeStringArray(parsed.must_answer);
  const originalScope =
    parsed.scope === 'broad' || parsed.scope === 'narrow'
      ? parsed.scope
      : inferredScope;
  const mustAnswer = normalizedMustAnswer.length
    ? normalizedMustAnswer.slice(0, 8)
    : buildFallbackMustAnswer(query, inferredScope);
  const scopeOverride = hasNamedEntityAndStrongNarrowingSignal(query, {
    query,
    must_answer: mustAnswer,
    sub_questions: normalizedSubQuestions,
  });
  const scope = scopeOverride.matched ? 'narrow' : originalScope;
  const strategy =
    maxQueryStrategy(
      parsed.query_strategy === 'direct' ||
        parsed.query_strategy === 'light' ||
        parsed.query_strategy === 'standard'
        ? parsed.query_strategy
        : inferredStrategy,
      inferQueryStrategy(query, scope),
    );
  const subQuestions = normalizeSubQuestions(
    normalizedSubQuestions,
    buildFallbackQuestions(query),
    strategy,
  );

  if (scopeOverride.matched && originalScope !== 'narrow') {
    console.log(
      `[brief] scope override applied: original=${originalScope} forced=narrow reason=named_entity+narrowing_signal entities=[${scopeOverride.entities.join(',')}] signals=[${scopeOverride.signals.join(',')}]`,
    );
  }

  return {
    query,
    intent: typeof parsed.intent === 'string' && parsed.intent.trim() ? parsed.intent : DEFAULT_BRIEF.intent,
    scope,
    query_strategy: strategy,
    time_sensitivity:
      parsed.time_sensitivity === 'live' ||
      parsed.time_sensitivity === 'recent' ||
      parsed.time_sensitivity === 'historical'
        ? parsed.time_sensitivity
        : DEFAULT_BRIEF.time_sensitivity,
    required_freshness_days:
      typeof parsed.required_freshness_days === 'number' && parsed.required_freshness_days > 0
        ? Math.round(parsed.required_freshness_days)
        : DEFAULT_BRIEF.required_freshness_days,
    geography: normalizeStringArray(parsed.geography),
    domains_priority: normalizeStringArray(parsed.domains_priority),
    domains_avoid: [
      ...new Set([...DEFAULT_BRIEF.domains_avoid, ...normalizeStringArray(parsed.domains_avoid)]),
    ],
    preferred_source_types: normalizeStringArray(parsed.preferred_source_types).length
      ? normalizeStringArray(parsed.preferred_source_types).slice(0, 6)
      : DEFAULT_BRIEF.preferred_source_types,
    must_answer: mustAnswer,
    avoid_drift: normalizeStringArray(parsed.avoid_drift).length
      ? normalizeStringArray(parsed.avoid_drift).slice(0, 6)
      : DEFAULT_BRIEF.avoid_drift,
    minimum_source_diversity:
      typeof parsed.minimum_source_diversity === 'number' && parsed.minimum_source_diversity > 0
        ? Math.max(1, Math.min(6, Math.round(parsed.minimum_source_diversity)))
        : inferredScope === 'broad'
          ? 3
          : 2,
    max_query_variants: normalizeBoundedNumber(
      parsed.max_query_variants,
      defaultMaxQueryVariants(strategy),
      3,
      12,
    ),
    target_source_count: normalizeBoundedNumber(
      parsed.target_source_count,
      defaultTargetSourceCount(strategy),
      4,
      14,
    ),
    sub_questions: subQuestions,
    evaluation_rubric:
      typeof parsed.evaluation_rubric === 'string' && parsed.evaluation_rubric.trim()
        ? parsed.evaluation_rubric
        : DEFAULT_BRIEF.evaluation_rubric,
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function fallbackBrief(query: string): ResearchBrief {
  const scope = inferScope(query);
  const strategy = inferQueryStrategy(query, scope);
  return {
    query,
    ...DEFAULT_BRIEF,
    scope,
    query_strategy: strategy,
    must_answer: buildFallbackMustAnswer(query, scope),
    minimum_source_diversity: scope === 'broad' ? 3 : 2,
    max_query_variants: defaultMaxQueryVariants(strategy),
    target_source_count: defaultTargetSourceCount(strategy),
    sub_questions: normalizeSubQuestions([], buildFallbackQuestions(query), strategy),
  };
}

function inferScope(query: string): 'broad' | 'narrow' {
  const cleaned = query.trim();
  if (
    /\b(compare|versus|vs\.?|impact of|effect of|how does|why did|specific|case study|for retail|for developers|in \d{4}|this week|today|latest|current|now)\b/i.test(
      cleaned,
    )
  ) {
    return 'narrow';
  }
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return wordCount <= 8 ? 'broad' : 'narrow';
}

function inferQueryStrategy(
  query: string,
  scope: 'broad' | 'narrow',
): 'direct' | 'light' | 'standard' {
  const cleaned = query.trim();
  if (
    /\b(price today|today|current price|latest price|market cap|what is|who is|when is|date|launch date|release date)\b/i.test(
      cleaned,
    ) &&
    scope === 'narrow'
  ) {
    return 'direct';
  }
  if (
    scope === 'broad' ||
    /\b(compare|versus|vs\.?|impact|affect|outlook|forecast|prediction market|portfolio|adoption|regulation|drivers|risks|thesis)\b/i.test(
      cleaned,
    )
  ) {
    return 'standard';
  }
  return 'light';
}

function defaultMaxQueryVariants(strategy: ResearchBrief['query_strategy']): number {
  switch (strategy) {
    case 'direct':
      return 4;
    case 'standard':
      return 10;
    default:
      return 7;
  }
}

function defaultTargetSourceCount(strategy: ResearchBrief['query_strategy']): number {
  switch (strategy) {
    case 'direct':
      return 5;
    case 'standard':
      return 10;
    default:
      return 7;
  }
}

function maxQueryStrategy(
  left: ResearchBrief['query_strategy'],
  right: ResearchBrief['query_strategy'],
): ResearchBrief['query_strategy'] {
  const rank = { direct: 0, light: 1, standard: 2 } as const;
  return rank[left] >= rank[right] ? left : right;
}

function normalizeBoundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function expectedSubQuestionRange(
  strategy: ResearchBrief['query_strategy'],
): { min: number; max: number } {
  switch (strategy) {
    case 'direct':
      return { min: 0, max: 2 };
    case 'standard':
      return { min: 4, max: 6 };
    default:
      return { min: 2, max: 4 };
  }
}

function normalizeSubQuestions(
  parsed: string[],
  fallback: string[],
  strategy: ResearchBrief['query_strategy'],
): string[] {
  const { min, max } = expectedSubQuestionRange(strategy);
  const cleanedParsed = parsed.filter((item) => item.trim()).slice(0, max);
  if (cleanedParsed.length >= min) {
    return cleanedParsed;
  }
  return fallback.slice(0, Math.max(min, Math.min(max, fallback.length)));
}

function buildFallbackMustAnswer(query: string, scope: 'broad' | 'narrow'): string[] {
  if (scope === 'narrow') {
    return [
      `Directly answer the user's specific angle on ${query}.`,
      `Identify the strongest source-backed evidence about ${query}.`,
      `Explain important caveats, disagreement, or missing evidence.`,
    ];
  }
  return [
    `Define the topic and its overall scope: ${query}.`,
    `Summarize the current or most relevant status of ${query}.`,
    `Identify major actors, components, or mechanisms involved in ${query}.`,
    `Include important metrics, dates, or examples when sources provide them.`,
    `Explain risks, constraints, disagreements, or unknowns.`,
  ];
}

function buildFallbackQuestions(query: string): string[] {
  return [
    `What is the current status of ${query}?`,
    `What are the most important recent developments related to ${query}?`,
    `Which official or primary sources describe ${query}?`,
    `What quantitative evidence or statistics are available for ${query}?`,
    `What are the strongest counterarguments or risks around ${query}?`,
    `What is still unknown or weakly supported about ${query}?`,
  ];
}
