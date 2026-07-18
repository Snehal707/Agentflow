const BROWSE_VERBS = /\b(?:show|list|browse|explore|open|view|see)\b/i;
const USER_MARKET_CUES =
  /\b(?:my\s+(?:prediction\s+markets?|markets?|bets?|positions?)|markets?\s+i(?:'ve| have)\s+bet\s+on)\b/i;
const BETTING_DISCOVERY_CUES =
  /\b(?:what\s+can\s+i\s+(?:bet|wager)\s+on|what\s+markets?\s+are\s+(?:open|live|available)|markets?\s+available)\b/i;
const STRATEGIC_RESEARCH_CUES =
  /\b(?:current\s+state|status|landscape|outlook|trends?|trend|compare|comparison)\b/i;

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j]!;
  }
  return previous[right.length]!;
}

function isPredictionSpellingVariant(token: string): boolean {
  const normalized = token.toLowerCase();
  if (normalized === 'prediction' || normalized === 'predictions') return true;
  if (normalized === 'predmarket' || normalized === 'predmarkets') return true;
  // Common fat-finger / transposition forms ("predcition", "predicition", …).
  if (!/^pred[a-z]{4,12}$/i.test(normalized)) return false;
  const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
  return editDistance(singular, 'prediction') <= 2 || editDistance(singular, 'predmarket') <= 2;
}

/** Normalize common "prediction market" misspellings before routing. */
export function normalizePredictionMarketSpelling(message: string): string {
  return message.replace(/\b[A-Za-z]{6,16}\b/g, (token) => {
    if (!isPredictionSpellingVariant(token)) return token;
    const lower = token.toLowerCase();
    if (lower.startsWith('predm')) {
      return lower.endsWith('s') ? 'predmarkets' : 'predmarket';
    }
    return lower.endsWith('s') ? 'predictions' : 'prediction';
  });
}

function hasPredictionMarketTerms(message: string): boolean {
  const normalized = normalizePredictionMarketSpelling(message);
  return /\b(?:prediction\s+markets?|prediction\s+market|predmarket|polymarket)\b/i.test(normalized);
}

export function isAmbiguousPredictionMarketIntent(message: string): boolean {
  const normalized = normalizePredictionMarketSpelling(message).trim();
  if (!normalized) return false;

  return /^(?:prediction\s+markets?|predmarket)$/i.test(normalized);
}

export function isPredictionMarketBrowseIntent(message: string): boolean {
  const normalized = normalizePredictionMarketSpelling(message).trim();
  if (!normalized) return false;

  if (BETTING_DISCOVERY_CUES.test(normalized)) {
    return true;
  }

  if (hasPredictionMarketTerms(normalized) && (BROWSE_VERBS.test(normalized) || USER_MARKET_CUES.test(normalized))) {
    return true;
  }

  return false;
}

export function looksLikePredictionMarketResearch(message: string): boolean {
  const normalized = normalizePredictionMarketSpelling(message).trim();
  if (!normalized) return false;
  if (isPredictionMarketBrowseIntent(normalized)) return false;

  return hasPredictionMarketTerms(normalized) && STRATEGIC_RESEARCH_CUES.test(normalized);
}
