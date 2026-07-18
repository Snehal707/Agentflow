const PORTFOLIO_TERMS =
  '(?:portfolio|holdings|positions|money|funds|savings|investments?|crypto|coins?|assets?|tokens?|wallet)';
const OPTIONAL_MODIFIERS = '(?:[a-z0-9-]+\\s+){0,2}';
const OWNERSHIP_TARGET = `my\\s+${OPTIONAL_MODIFIERS}${PORTFOLIO_TERMS}`;
const IMPACT_PREFIX = '(?:affect|affects|affected|affecting|impact|impacts|impacted|impacting|mean\\s+for|do\\s+to)';
const IMPACT_NOUN = '(?:impact|effect|implications?)';
const ANALYTIC_PREFIX = '(?:analy[sz]e|research|assess|evaluate|review|check)';
const ANALYTIC_NOUNS = '(?:risk|exposure|concentration|diversification)';

const DIRECT_PATTERNS = [
  new RegExp(`\\b${IMPACT_PREFIX}\\s+${OWNERSHIP_TARGET}\\b`, 'i'),
  new RegExp(`\\b${IMPACT_NOUN}\\s+(?:of\\s+)?[\\s\\S]{0,120}?\\b(?:for|on)\\s+${OWNERSHIP_TARGET}\\b`, 'i'),
  // "… and its/their impact on my portfolio"
  new RegExp(
    `\\b(?:its|their|the)\\s+${IMPACT_NOUN}\\s+(?:for|on)\\s+${OWNERSHIP_TARGET}\\b`,
    'i',
  ),
  new RegExp(`\\b(?:what|how)\\s+(?:does|will)\\b[\\s\\S]{0,120}?\\b${IMPACT_PREFIX}\\s+${OWNERSHIP_TARGET}\\b`, 'i'),
  new RegExp(`\\b${ANALYTIC_PREFIX}\\b[\\s\\S]{0,80}?\\b${OWNERSHIP_TARGET}\\b[\\s\\S]{0,80}?\\b${ANALYTIC_NOUNS}\\b`, 'i'),
  new RegExp(`\\b${OWNERSHIP_TARGET}\\b[\\s\\S]{0,80}?\\b${ANALYTIC_NOUNS}\\b`, 'i'),
  new RegExp(`\\bis\\s+${OWNERSHIP_TARGET}\\b[\\s\\S]{0,40}?\\b(?:diversified|overexposed)\\b`, 'i'),
  new RegExp(`\\b(?:with|using|include|including|add)\\s+(?:my\\s+)?${PORTFOLIO_TERMS}\\s+context\\b`, 'i'),
  new RegExp(`\\b(?:with|using|include|including|add)\\s+context\\s+(?:of|from|for)\\s+(?:my\\s+)?${PORTFOLIO_TERMS}\\b`, 'i'),
  new RegExp(`\\b(?:personalize|personalise|tailor|customize|customise)\\b[\\s\\S]{0,80}?\\b(?:my\\s+)?${PORTFOLIO_TERMS}\\b`, 'i'),
  new RegExp(`\\b(?:based\\s+on|according\\s+to|relative\\s+to|on\\s+the\\s+basis\\s+of)\\s+${OWNERSHIP_TARGET}\\b`, 'i'),
  new RegExp(`\\b${IMPACT_PREFIX}\\b[\\s\\S]{0,100}?\\bmy\\s+[a-z0-9.,/&+ -]{1,80}\\s+${PORTFOLIO_TERMS}\\b`, 'i'),
];

export function detectPortfolioImpactIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return DIRECT_PATTERNS.some((pattern) => pattern.test(text));
}

export function stripPortfolioImpactPhrasing(task: string): string {
  const original = task.replace(/\s+/g, ' ').trim();
  if (!original) return original;

  // Convert direct questions to the event/topic itself instead of deleting individual
  // words from the sentence. Word-by-word stripping previously turned valid queries
  // such as "how would regulation affect my holdings" into broken search strings.
  const directImpactQuestion = original.match(
    /^\s*how\s+(?:does|do|will|would|can|could|might)\s+(.+?)\s+(?:affect(?:s|ed|ing)?|impact(?:s|ed|ing)?|mean\s+for|change)\s+my\s+(?:[a-z0-9-]+\s+){0,5}(?:portfolio|holdings|positions|assets?|investments?|wallet)\b[\s\S]*$/i,
  );
  if (directImpactQuestion?.[1]?.trim()) {
    return directImpactQuestion[1].trim();
  }

  const impactOfQuestion = original.match(
    /^\s*(?:what\s+is\s+)?(?:the\s+)?(?:impact|effect|implications?)\s+of\s+(.+?)\s+(?:for|on)\s+my\s+(?:[a-z0-9-]+\s+){0,5}(?:portfolio|holdings|positions|assets?|investments?|wallet)\b[\s\S]*$/i,
  );
  if (impactOfQuestion?.[1]?.trim()) {
    return impactOfQuestion[1].trim();
  }

  const ownershipTail =
    'my\\s+(?:[a-z0-9-]+\\s+){0,5}(?:portfolio|holdings|positions|assets?|investments?|wallet)';

  let stripped = original
    // "… and its/their impact on my portfolio"
    .replace(
      new RegExp(
        `\\s*(?:,|;)?\\s+(?:and\\s+)?(?:its|their|the)\\s+(?:impact|effect|implications?)(?:\\s+(?:for|on)\\s+${ownershipTail})\\b[\\s\\S]*$`,
        'i',
      ),
      '',
    )
    .replace(
      /\s*(?:,|;)?\s+(?:and\s+)?(?:how|what)\s+(?:does|do|will|would|can|could|might)\s+(?:this|that|it|the\s+(?:event|development|change|news))\s+(?:affect(?:s|ed|ing)?|impact(?:s|ed|ing)?|mean\s+for|change)\s+my\s+(?:[a-z0-9-]+\s+){0,5}(?:portfolio|holdings|positions|assets?|investments?|wallet)\b[\s\S]*$/i,
      '',
    )
    .replace(
      /\s*(?:,|;)?\s+(?:and\s+)?(?:explain|analy[sz]e|assess|show|tell\s+me)\s+(?:how\s+)?(?:this|that|it|the\s+(?:event|development|change|news))?\s*(?:could|can|will|would|might)?\s*(?:affect(?:s|ed|ing)?|impact(?:s|ed|ing)?|mean\s+for|change)\s+my\s+(?:[a-z0-9-]+\s+){0,5}(?:portfolio|holdings|positions|assets?|investments?|wallet)\b[\s\S]*$/i,
      '',
    )
    .replace(
      /\s*(?:,|;)?\s+(?:and\s+)?(?:personalize|personalise|tailor|customize|customise)(?:\s+(?:this|the))?(?:\s+report)?\s+(?:using|with|for|based\s+on)\s+my\s+(?:[a-z0-9-]+\s+){0,5}(?:portfolio|holdings|positions|assets?|investments?|wallet)\b[\s\S]*$/i,
      '',
    )
    // "… on the basis of / based on my portfolio"
    .replace(
      new RegExp(
        `\\s*(?:,|;)?\\s+(?:and\\s+)?(?:on\\s+the\\s+basis\\s+of|based\\s+on|according\\s+to|relative\\s+to)\\s+${ownershipTail}\\b[\\s\\S]*$`,
        'i',
      ),
      '',
    )
    .replace(
      new RegExp(
        `\\s*(?:,|;)?\\s+(?:and\\s+)?(?:with|using|including|based\\s+on|according\\s+to|relative\\s+to)\\s+(?:my\\s+)?${PORTFOLIO_TERMS}(?:\\s+context)?\\s*$`,
        'i',
      ),
      '',
    )
    .replace(/\s+/g, ' ')
    .replace(/[,:;\-]+\s*$/, '')
    .trim();

  // A portfolio-only request has no independent public research topic. Preserve it so
  // the caller can route it to the private portfolio path instead of searching the web
  // for an empty or generic query.
  return stripped || original;
}

export type ParsedResearchRequest = {
  originalTask: string;
  researchTask: string;
  portfolioImpact: boolean;
};

export function parseResearchRequest(
  task: string,
  options: { portfolioImpact?: boolean } = {},
): ParsedResearchRequest {
  const originalTask = task.replace(/\s+/g, ' ').trim();
  const portfolioImpact = options.portfolioImpact === true || detectPortfolioImpactIntent(originalTask);
  return {
    originalTask,
    researchTask: portfolioImpact ? stripPortfolioImpactPhrasing(originalTask) : originalTask,
    portfolioImpact,
  };
}
