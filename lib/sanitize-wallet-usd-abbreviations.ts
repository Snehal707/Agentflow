/**
 * Hermes often appends finance-style K/M suffixes to wallet usd_value fields
 * (e.g. usd_value: 284 → "$284K"). Those fields are already USD dollars.
 */

type UsdBearing = { usd_value?: unknown };

function collectWalletUsdAmounts(walletContext: unknown): number[] {
  if (!walletContext || typeof walletContext !== 'object') return [];
  const ctx = walletContext as {
    total_value_usd?: unknown;
    holdings?: UsdBearing[];
    positions?: UsdBearing[];
  };
  const amounts: number[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      amounts.push(value);
    }
  };
  push(ctx.total_value_usd);
  for (const holding of Array.isArray(ctx.holdings) ? ctx.holdings : []) {
    push(holding?.usd_value);
  }
  for (const position of Array.isArray(ctx.positions) ? ctx.positions : []) {
    push(position?.usd_value);
  }
  return amounts;
}

function matchesWalletUsd(abbreviatedNumber: number, walletAmounts: number[]): boolean {
  return walletAmounts.some((amount) => {
    const tolerance = Math.max(5, amount * 0.2);
    return Math.abs(amount - abbreviatedNumber) <= tolerance;
  });
}

function formatExactUsd(value: number): string {
  if (value < 1) return 'under $1';
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.05) {
    return `$${Math.round(value)}`;
  }
  return `$${value.toFixed(2).replace(/\.?0+$/, '')}`;
}

/**
 * When markdown uses $NNNK / $NNNM that match wallet usd_value dollars (not thousands/millions),
 * rewrite to the exact dollar magnitude from the snapshot.
 */
export function sanitizeWalletUsdAbbreviations(
  markdown: string,
  walletContext: unknown,
): string {
  const walletAmounts = collectWalletUsdAmounts(walletContext);
  if (!markdown || walletAmounts.length === 0) return markdown;

  return markdown.replace(
    /\$\s*(\d{1,3}(?:\.\d+)?)\s*([KM])\b/gi,
    (match, rawNumber: string, _suffix: string) => {
      const n = Number(rawNumber);
      if (!Number.isFinite(n) || n <= 0) return match;
      if (!matchesWalletUsd(n, walletAmounts)) return match;
      // Writer treated dollar amount N as N thousand/million.
      return formatExactUsd(n);
    },
  );
}
