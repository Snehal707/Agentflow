function cleanRemarkCandidate(candidate: string, maxLength: number): string | undefined {
  const cleaned = candidate
    .trim()
    .replace(/^[:=-]\s*/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!cleaned || cleaned.length > maxLength) return undefined;
  if (/^\d+(?:\.\d+)?(?:\s*(?:usdc|eurc|usd|dollars?))?$/i.test(cleaned)) return undefined;
  // Whole candidate is (or starts as) a payee handle/address — not a remark.
  if (/^(?:[a-z0-9][a-z0-9_-]*\.arc|0x[a-f0-9]{40})\b/i.test(cleaned)) return undefined;
  if (/\b(?:[a-z0-9][a-z0-9_-]*\.arc|0x[a-f0-9]{40})\b/i.test(cleaned)) return undefined;
  return cleaned;
}

function isRecipientToken(token: string): boolean {
  return /^(?:[a-z0-9][a-z0-9_-]*\.arc|0x[a-f0-9]{40})$/i.test(token.trim());
}

/**
 * Extract an optional AgentPay remark/note from free text.
 * Prefers explicit `remark:` / `note:` / `memo:` tags, then trailing text after a
 * payee handle, then a trailing `for <note>` clause that is not itself a payee.
 */
export function extractAgentpayRemark(
  message: string,
  options: { maxLength?: number } = {},
): string | undefined {
  const maxLength = options.maxLength ?? 100;
  const normalized = message.trim();
  if (!normalized) return undefined;

  const explicitMatches = [
    ...normalized.matchAll(
      /\b(?:and\s+)?(?:note|remark|reference|memo)\s*(?::|=|-)?\s+([^\n,]+?)\s*$/gi,
    ),
  ];
  const explicitCandidate = explicitMatches[explicitMatches.length - 1]?.[1];
  if (explicitCandidate) {
    const cleaned = cleanRemarkCandidate(explicitCandidate, maxLength);
    if (cleaned) return cleaned;
  }

  // "... jack2.arc, work" / "... jack2.arc - work" (require separator so amounts aren't remarks)
  const afterPayee = normalized.match(
    /(?:[a-z0-9][a-z0-9_-]*\.arc|0x[a-fA-F0-9]{40})\s*[,:\-]\s+([a-z0-9][\w\s'-]{0,80}?)\s*$/i,
  );
  if (afterPayee?.[1]) {
    const tail = afterPayee[1]
      .trim()
      .replace(/^(?:for|note|remark|memo|reference)\s*(?::|=|-)?\s+/i, '')
      .trim();
    // Don't treat schedule words as remarks when they trail the payee.
    if (
      tail &&
      !/\b(?:daily|weekly|monthly|every|each|monday|tuesday|wednesday|thursday|friday|saturday|sunday|usdc|eurc)\b/i.test(
        tail,
      )
    ) {
      const cleaned = cleanRemarkCandidate(tail, maxLength);
      if (cleaned) return cleaned;
    }
  }

  const forMatches = [...normalized.matchAll(/\bfor\s+(.+?)(?=\s+\bfor\s+|$)/gi)];
  for (let index = forMatches.length - 1; index >= 0; index -= 1) {
    const raw = forMatches[index][1].trim();
    // "for alice.arc" / "for alice.arc, work" — payee clause, not the remark alone.
    const payeePrefix = raw.match(
      /^((?:[a-z0-9][a-z0-9_-]*\.arc|0x[a-fA-F0-9]{40}))\s*(?:,|-|:)?\s*(.*)$/i,
    );
    if (payeePrefix) {
      const trailing = payeePrefix[2]?.trim();
      if (trailing) {
        const cleaned = cleanRemarkCandidate(trailing, maxLength);
        if (cleaned) return cleaned;
      }
      continue;
    }
    if (isRecipientToken(raw)) continue;
    const candidate = cleanRemarkCandidate(raw, maxLength);
    if (candidate) return candidate;
  }

  return undefined;
}

export const AGENTPAY_SELF_RECIPIENT_HANDLE = '__agentflow_wallet__';

export function isOwnAgentpayAddressRequest(message: string): boolean {
  return /\b(?:my|own)\s+(?:wallet(?:\s+address)?|address)\b/i.test(message);
}
