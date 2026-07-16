export function buildPredictionTopicResearchPrompt(
  title: string,
  category?: string | null,
): string {
  const safeTitle = title.trim() || 'this prediction question';
  const safeCategory = typeof category === 'string' && category.trim()
    ? category.trim()
    : null;

  return [
    `research the prediction market topic: ${safeTitle}`,
    safeCategory ? `Prediction market category in AgentFlow: ${safeCategory}.` : null,
    'Use the market category to disambiguate the subject before searching. For example: crypto markets should be researched as crypto/blockchain topics, sports markets as teams/tournaments, and macro/commodity markets by their real-world underlying drivers.',
    'Research the real-world topic only. Do not mention or use the internal prediction provider, platform, contract address, listed prices, liquidity, or routing metadata as report evidence.',
    'Establish the latest real-world event state and completed results before analyzing forecasts. Keep publication time, event time, and retrieval time distinct; an access date is not a forecast date.',
    'Focus on current facts, relevant statistics, dated public forecasts, and decision-relevant uncertainty. Clearly label historical forecasts that were superseded by later results.',
  ]
    .filter(Boolean)
    .join('\n');
}
