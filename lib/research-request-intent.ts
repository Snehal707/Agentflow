const EXPLICIT_RESEARCH_REQUEST: RegExp[] = [
  /^\s*research\b/i,
  /\bresearch\s+report\b/i,
  /\b(?:make|do|run|write|create|give\s+me|prepare|generate)\s+(?:a\s+)?research\b/i,
  /\b(?:make|write|create|prepare|generate)\s+(?:a\s+)?report\s+(?:on|about)\s+\S/i,
];

/**
 * "make report on my portfolio" is a paid Portfolio Agent snapshot request.
 * Keep that off the web research pipeline. External-topic reports that also
 * mention portfolio impact ("report on the Fed and how it affects my portfolio")
 * still match explicit research because the subject is not "my portfolio".
 */
export function isOwnPortfolioReportRequest(message: string): boolean {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/\bresearch\b/i.test(normalized)) return false;
  if (
    /\b(?:affect|affects|impact|impacts|implications?|mean\s+for)\b[\s\S]{0,80}\bmy\s+(?:[a-z0-9-]+\s+){0,3}(?:portfolio|holdings|positions|wallet)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return (
    /\b(?:make|write|create|prepare|generate|run|do|give\s+me)\s+(?:a\s+)?report\s+(?:on|about|for|of)\s+my\s+(?:[a-z0-9-]+\s+){0,3}(?:portfolio|holdings|positions|wallet|balances?)\b/i.test(
      normalized,
    ) ||
    /^(?:a\s+)?report\s+(?:on|about|for|of)\s+my\s+(?:[a-z0-9-]+\s+){0,3}(?:portfolio|holdings|positions|wallet|balances?)\b/i.test(
      normalized,
    )
  );
}

export function isExplicitResearchRequest(message: string): boolean {
  if (isOwnPortfolioReportRequest(message)) {
    return false;
  }
  return EXPLICIT_RESEARCH_REQUEST.some((pattern) => pattern.test(message));
}
