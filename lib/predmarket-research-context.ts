export type PredictionMarketProbabilityOutcome = {
  label: string;
  probabilityPercent?: number;
};

export function formatProviderProbabilitySnapshot(
  outcomes: PredictionMarketProbabilityOutcome[],
  observedAt: string,
): string | null {
  const values = outcomes
    .filter((outcome) => Number.isFinite(outcome.probabilityPercent))
    .map((outcome) => `${outcome.label.trim()}=${outcome.probabilityPercent}%`)
    .filter((value) => !value.startsWith('='));
  if (values.length === 0) return null;
  return `AgentFlow provider-implied probability snapshot (observed ${observedAt}): ${values.join(' | ')}.`;
}
