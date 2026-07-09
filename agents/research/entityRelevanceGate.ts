import { SOURCE_REGISTRY, type SourceConfig } from '../../lib/source-registry';
import type { ResearchBrief, Source } from './types';
import {
  deriveAllowedEntities,
  detectComparisonIntent,
  ENTITY_STOP_WORDS,
} from './entityDetection';

const ENTITY_MENTION_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.ENTITY_MENTION_THRESHOLD || '3', 10) || 3,
);

const KNOWN_ENTITY_DOMAIN_ALIASES: Record<string, string[]> = {
  base: ['base.org', 'basescan.org', 'base.app', 'coinbase.com'],
  arbitrum: ['arbitrum.io', 'arbiscan.io', 'arbitrum.foundation'],
  'arc network': ['arc.network', 'arc.io', 'circle.com'],
  arc: ['arc.network', 'arc.io', 'circle.com'],
  'tether gold (xaut)': ['tether.to', 'kitco.com', 'lbma.org.uk', 'goldprice.org'],
  xaut: ['tether.to', 'kitco.com', 'lbma.org.uk', 'goldprice.org'],
};

const KNOWN_ENTITY_AVOID_TERMS: Record<string, string[]> = {
  base: ['bridgebase', 'bielefeld', 'merriam-webster', 'dictionary'],
  arc: ['arc browser', 'arc.net', 'webbrowser', 'chip.de'],
  'arc network': ['arc browser', 'arc.net', 'webbrowser', 'chip.de'],
};

type GateReason =
  | 'domain_match'
  | 'title_match'
  | `content_mentions>=${number}`
  | 'ambiguous_context_match'
  | 'filtered_no_entity_match';

export type EntityGateDecision = {
  source: Source;
  kept: boolean;
  reason: GateReason;
  matchedEntity?: string;
  mentionCount?: number;
};

export type EntityGateMetadata = {
  applied: boolean;
  scope: ResearchBrief['scope'];
  derivedEntities: string[];
  comparisonMode: boolean;
  mentionThreshold: number;
  entityDomainMapSize: number;
  contextTerms: string[];
};

export function buildEntityDomainMap(registry: SourceConfig[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const source of registry) {
    if (!source.enabled) continue;
    const entity = source.name.trim();
    if (!looksLikeEntityName(entity)) continue;

    let hostname = '';
    try {
      hostname = new URL(source.baseUrl).hostname.toLowerCase();
    } catch {
      continue;
    }

    const key = entity.toLowerCase();
    const existing = map.get(key) ?? [];
    if (!existing.includes(hostname)) {
      existing.push(hostname);
    }
    map.set(key, existing);
  }

  for (const [entity, domains] of Object.entries(KNOWN_ENTITY_DOMAIN_ALIASES)) {
    const existing = map.get(entity.toLowerCase()) ?? [];
    for (const domain of domains) {
      const normalized = domain.trim().toLowerCase();
      if (normalized && !existing.includes(normalized)) {
        existing.push(normalized);
      }
    }
    map.set(entity.toLowerCase(), existing);
  }

  return map;
}

export function applyEntityRelevanceGate(
  sources: Source[],
  brief: ResearchBrief,
  registry: SourceConfig[] = SOURCE_REGISTRY,
): {
  keptSources: Source[];
  filteredSources: EntityGateDecision[];
  gateMetadata: EntityGateMetadata;
  decisions: EntityGateDecision[];
} {
  const derivedEntities = deriveAllowedEntities(brief);
  const comparisonMode = detectComparisonIntent(brief);
  const entityDomainMap = buildEntityDomainMap(registry);
  const contextTerms = deriveContextTerms(brief, derivedEntities);

  const gateMetadata: EntityGateMetadata = {
    applied: false,
    scope: brief.scope,
    derivedEntities,
    comparisonMode,
    mentionThreshold: ENTITY_MENTION_THRESHOLD,
    entityDomainMapSize: entityDomainMap.size,
    contextTerms,
  };

  if (brief.scope !== 'narrow' || derivedEntities.length === 0 || derivedEntities.length > 3) {
    return {
      keptSources: sources,
      filteredSources: [],
      gateMetadata,
      decisions: sources.map((source) => ({
        source,
        kept: true,
        reason: `content_mentions>=${ENTITY_MENTION_THRESHOLD}`,
      })),
    };
  }

  gateMetadata.applied = true;
  const decisions: EntityGateDecision[] = sources.map((source) =>
    evaluateSource(source, derivedEntities, entityDomainMap, contextTerms),
  );

  return {
    keptSources: decisions.filter((decision) => decision.kept).map((decision) => decision.source),
    filteredSources: decisions.filter((decision) => !decision.kept),
    gateMetadata,
    decisions,
  };
}

function evaluateSource(
  source: Source,
  entities: string[],
  entityDomainMap: Map<string, string[]>,
  contextTerms: string[],
): EntityGateDecision {
  const title = source.title || '';
  const content = `${source.title}\n${source.snippet}\n${source.url}`;

  for (const entity of entities) {
    const knownDomains = entityDomainMap.get(entity.toLowerCase()) ?? [];
    const ambiguousEntity = isAmbiguousEntity(entity);
    const hasContextSignal =
      !ambiguousEntity ||
      contextTerms.length === 0 ||
      containsAnyContextTerm(content, contextTerms);
    const hasAvoidTerm = containsKnownAvoidTerm(content, entity);

    if (hasAvoidTerm) {
      continue;
    }

    if (knownDomains.some((domain) => domainMatches(source.domain, domain))) {
      return { source, kept: true, reason: 'domain_match', matchedEntity: entity };
    }
    if (containsEntity(title, entity) && hasContextSignal) {
      return {
        source,
        kept: true,
        reason: ambiguousEntity ? 'ambiguous_context_match' : 'title_match',
        matchedEntity: entity,
      };
    }
    if (containsEntity(title, entity) && !hasContextSignal) {
      continue;
    }
    const mentionCount = countEntityMentions(content, entity);
    if (mentionCount >= ENTITY_MENTION_THRESHOLD && hasContextSignal) {
      return {
        source,
        kept: true,
        reason: ambiguousEntity ? 'ambiguous_context_match' : `content_mentions>=${ENTITY_MENTION_THRESHOLD}`,
        matchedEntity: entity,
        mentionCount,
      };
    }
    if (mentionCount >= ENTITY_MENTION_THRESHOLD && !hasContextSignal) {
      continue;
    }
    if (mentionCount >= ENTITY_MENTION_THRESHOLD) {
      return {
        source,
        kept: true,
        reason: `content_mentions>=${ENTITY_MENTION_THRESHOLD}`,
        matchedEntity: entity,
        mentionCount,
      };
    }
  }

  return { source, kept: false, reason: 'filtered_no_entity_match' };
}

function looksLikeEntityName(value: string): boolean {
  if (!value) return false;
  if (value.length < 3) return false;
  const normalized = value.trim().toLowerCase();
  if (ENTITY_STOP_WORDS.has(normalized)) return false;
  return /[A-Z]/.test(value[0]);
}

function domainMatches(sourceDomain: string, knownDomain: string): boolean {
  const normalizedSource = sourceDomain.toLowerCase();
  const normalizedKnown = knownDomain.toLowerCase();
  return normalizedSource === normalizedKnown || normalizedSource.endsWith(`.${normalizedKnown}`);
}

function containsEntity(text: string, entity: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(entity)}\\b`, 'i');
  return pattern.test(text);
}

function countEntityMentions(text: string, entity: string): number {
  const pattern = new RegExp(`\\b${escapeRegExp(entity)}\\b`, 'gi');
  return [...text.matchAll(pattern)].length;
}

function deriveContextTerms(
  brief: Pick<ResearchBrief, 'query' | 'must_answer' | 'sub_questions'>,
  entities: string[],
): string[] {
  const haystack = [brief.query, ...brief.must_answer, ...brief.sub_questions].join(' ').toLowerCase();
  const stripped = entities.reduce((acc, entity) => {
    const pattern = new RegExp(`\\b${escapeRegExp(entity.toLowerCase())}\\b`, 'g');
    return acc.replace(pattern, ' ');
  }, haystack);

  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'what',
    'when',
    'where',
    'which',
    'into',
    'about',
    'report',
    'research',
    'current',
    'latest',
    'today',
    'official',
    'data',
    'statistics',
    'analysis',
    'compare',
    'versus',
    'cost',
    'costs',
  ]);

  const weightedTerms = new Set<string>();
  for (const match of stripped.matchAll(/\b[a-z][a-z0-9-]{2,}\b/g)) {
    const term = match[0];
    if (stopWords.has(term)) continue;
    weightedTerms.add(term);
  }

  const preferred = [
    'bridge',
    'fees',
    'gas',
    'network',
    'mainnet',
    'launch',
    'price',
    'prediction',
    'market',
    'yield',
    'vault',
    'adoption',
    'regulation',
  ].filter((term) => weightedTerms.has(term));

  const combined = [...preferred, ...weightedTerms];
  return [...new Set(combined)].slice(0, 8);
}

function containsAnyContextTerm(text: string, contextTerms: string[]): boolean {
  const lower = text.toLowerCase();
  return contextTerms.some((term) => lower.includes(term.toLowerCase()));
}

function isAmbiguousEntity(entity: string): boolean {
  const tokens = entity.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  const token = tokens[0];
  if (token.length <= 4) return true;
  if (/^[A-Z][a-z]+$/.test(token) && token.length <= 6) return true;
  return false;
}

function containsKnownAvoidTerm(text: string, entity: string): boolean {
  const terms = KNOWN_ENTITY_AVOID_TERMS[entity.toLowerCase()] ?? [];
  if (terms.length === 0) return false;
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
