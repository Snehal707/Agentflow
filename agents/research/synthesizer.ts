import { callHermesDeep } from '../../lib/hermes';
import type { LiveFacts, ResearchBrief, Source, SourceDiagnostics, VerifiedClaim } from './types';

export async function synthesizeResearchReport(input: {
  brief: ResearchBrief;
  claims: VerifiedClaim[];
  liveFacts: LiveFacts;
  sources: Source[];
  sourceDiagnostics: SourceDiagnostics;
  priorResearchMemory?: string;
}): Promise<string> {
  const systemPrompt = `Write a markdown research report using only the provided verified claims and live facts.

Rules:
- Treat brief as a topic contract. The report must answer brief.query, brief.must_answer, and brief.scope.
- Search/retrieval results may support the brief, but they must not narrow or redefine the user topic.
- If sourceDiagnostics.drift_risk is medium or high, explicitly say retrieval was narrow and avoid making that narrow subtopic the whole report.
- If brief.scope is broad, do not anchor the report around one article, one company, one vendor, one demographic, or one side issue unless brief.query asks for that.
- If source diversity is insufficient, produce a compact partial report with a "Coverage Limits" section instead of a confident full report.
- NEVER introduce raw URLs in the body except the Sources section.
- NEVER cite or rely on unverified claims.
- Preserve disputes instead of flattening them.
- Use topic-appropriate section titles instead of one fixed universal outline.
- Match the output shape to the user's actual ask.
- If the user asked for a simple answer or latest developments, use a concise markdown brief instead of a formal report shell.
- Do not force the literal title "Research Report" or "Executive Summary" on every topic.
- Always include:
  - a short summary section near the top
  - an evidence section
  - an uncertainty or risks section
  - a sources section
- Choose the rest of the structure based on the subject.
- This is the deep-report synthesizer, so the output should be materially more complete than a fast report when evidence is available.
- Prefer a fuller report over a terse brief unless source coverage is genuinely thin.
- Aim for roughly 900 to 1600 words when evidence coverage is sufficient.
- Cover multiple dimensions from brief.must_answer instead of collapsing everything into 3 short bullets.
- Use more section depth than fast mode: normally 6 to 9 substantive sections, not just 4 or 5.
- Include concrete source-backed detail in each major section, not just in one evidence block.
- If evidence is strong enough, include sections such as:
  ## Summary
  ## Current State or Market Context
  ## Key Evidence
  ## Drivers or Catalysts
  ## Constraints, Risks, and Open Questions
  ## Strategic or Practical Implications
  ## Sources
- If evidence is thin, say so clearly, but still make the report as complete as the evidence allows.
- For geopolitics or current events, prefer sections like:
  ## Summary
  ## Current Situation
  ## Key Evidence
  ## Risks and Unknowns
  ## Sources
- For ecosystems, protocols, or products, prefer sections like:
  ## Summary
  ## Ecosystem or Product Overview
  ## Key Evidence
  ## Catalysts and Constraints
  ## Sources
- For broad topics, prefer sections that cover the user's required dimensions rather than the most common subtopic in retrieved articles.
- If priorResearchMemory is present, use it only as historical context or query-shaping memory. Never treat it as current evidence unless the current claims or live facts independently support it.
- Before finalizing, ask: "Would this answer still be on-topic if the user saw only the title and section headings?" If not, rewrite around the brief.
- Keep the report specific and evidence-led, but do not over-compress deep mode into a short memo.`;

  const userMessage = JSON.stringify(input, null, 2);
  const synthesized = await callHermesDeep(systemPrompt, userMessage);
  return enforceRetrievedSourceUrls(synthesized, input.sources);
}

/**
 * The model writes the narrative, but the retrieved source objects are the
 * authority for the final bibliography. Rebuilding this section
 * deterministically prevents a valid retrieval set from becoming an
 * uncited publisher-name list during synthesis.
 */
export function enforceRetrievedSourceUrls(markdown: string, sources: Source[]): string {
  const uniqueSources = [...new Map(
    sources
      .filter((source) => /^https?:\/\//i.test(source.url.trim()))
      .map((source) => [source.url.trim(), source] as const),
  ).values()];
  const sourceSection = uniqueSources.length > 0
    ? [
        '## Sources',
        '',
        ...uniqueSources.map((source, index) => {
          const label = escapeMarkdownLabel(source.title.trim() || source.domain.trim() || source.url);
          const url = source.url.trim().replace(/</g, '%3C').replace(/>/g, '%3E');
          const date = source.date.trim() ? ` — ${source.date.trim()}` : '';
          return `${index + 1}. [${label}](<${url}>)${date}`;
        }),
      ].join('\n')
    : [
        '## Sources',
        '',
        '- No retrievable public source URLs were available for this report.',
      ].join('\n');

  const lines = markdown.trim().split(/\r?\n/);
  const sourceHeaderIndex = lines.findIndex((line) => /^#{1,6}\s+sources\s*$/i.test(line.trim()));
  if (sourceHeaderIndex < 0) {
    return `${markdown.trim()}\n\n${sourceSection}`;
  }

  const sourceDepth = lines[sourceHeaderIndex].trim().match(/^#+/)?.[0].length ?? 2;
  let nextSectionIndex = lines.length;
  for (let index = sourceHeaderIndex + 1; index < lines.length; index += 1) {
    const heading = lines[index].trim().match(/^(#+)\s+/);
    if (heading && heading[1].length <= sourceDepth) {
      nextSectionIndex = index;
      break;
    }
  }

  const before = lines.slice(0, sourceHeaderIndex).join('\n').trimEnd();
  const after = lines.slice(nextSectionIndex).join('\n').trimStart();
  return [before, sourceSection, after].filter(Boolean).join('\n\n');
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([\[\]])/g, '\\$1');
}
