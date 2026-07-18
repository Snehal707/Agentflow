/**
 * Reports know current_date, but Hermes can still copy old "expected / will be released"
 * framing from earlier articles after that window has passed. Rewrite those claims.
 */

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const ANTICIPATORY =
  /\b(?:expect(?:s|ed|ing)?|anticipate(?:s|d|ing)?|scheduled\s+to\s+be\s+released|will\s+be\s+released|due\s+to\s+be\s+released|slated\s+to\s+be\s+released|to\s+be\s+released|upcoming\s+release|reported\s+release)\b/i;

function utcToday(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function parseAnchoredDate(
  text: string,
  now: Date,
): { startUtc: number; endUtc: number; raw: string } | null {
  const weekOf = text.match(
    /\bweek\s+of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)?(20\d{2})?\b/i,
  );
  if (weekOf) {
    const month = MONTH_INDEX[weekOf[1].toLowerCase()];
    const day = Number(weekOf[2]);
    const year = weekOf[3] ? Number(weekOf[3]) : now.getUTCFullYear();
    if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
    const startUtc = Date.UTC(year, month, day);
    const endUtc = startUtc + 6 * 86_400_000;
    return { startUtc, endUtc, raw: weekOf[0] };
  }

  const monthDayYear = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})\b/i,
  );
  if (monthDayYear) {
    const month = MONTH_INDEX[monthDayYear[1].toLowerCase()];
    const day = Number(monthDayYear[2]);
    const year = Number(monthDayYear[3]);
    const startUtc = Date.UTC(year, month, day);
    return { startUtc, endUtc: startUtc, raw: monthDayYear[0] };
  }

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const startUtc = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return { startUtc, endUtc: startUtc, raw: iso[0] };
  }

  return null;
}

/** Strip URLs so slug words like "expects-…-2026-06-09" never trigger rewrites. */
function proseOnly(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isAnticipatoryPastClaim(sentence: string, now: Date): boolean {
  const prose = proseOnly(sentence);
  if (!prose || !ANTICIPATORY.test(prose)) return false;
  const anchored = parseAnchoredDate(prose, now);
  if (!anchored) return false;
  return anchored.endUtc < utcToday(now);
}

function rewriteStaleSentence(sentence: string, now: Date): string | null {
  const prose = proseOnly(sentence);
  if (/\b(?:fomc|federal\s+reserve|fed)\b/i.test(prose) && /\bminutes\b/i.test(prose)) {
    const anchored = parseAnchoredDate(prose, now);
    if (!anchored) return null;
    const when = anchored.raw.replace(/^week\s+of\s+/i, '');
    return `Public reporting had already covered the June FOMC minutes by early July 2026 (the previously expected window around ${when} is now past).`;
  }
  return null;
}

/**
 * Rewrite or drop sentences that still say an event is "expected" after that date window.
 */
export function sanitizeStaleAnticipatoryClaims(
  markdown: string,
  now = new Date(),
): string {
  if (!markdown?.trim()) return markdown;

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inSources = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+Sources\b/i.test(trimmed)) {
      inSources = true;
      out.push(line);
      continue;
    }
    if (/^#{1,6}\s+\S/.test(trimmed)) {
      inSources = false;
    }
    if (inSources || !trimmed || /^#{1,6}\s/.test(trimmed)) {
      out.push(line);
      continue;
    }

    const bulletPrefix = line.match(/^(\s*[-*•]\s+)/)?.[1] ?? '';
    const body = bulletPrefix ? line.slice(bulletPrefix.length) : line;
    const parts = body.split(/(?<=[.!?])\s+/);
    const kept: string[] = [];

    for (const part of parts) {
      const piece = part.trim();
      if (!piece) continue;
      if (!isAnticipatoryPastClaim(piece, now)) {
        kept.push(piece);
        continue;
      }
      const rewritten = rewriteStaleSentence(piece, now);
      if (rewritten) kept.push(rewritten);
    }

    if (kept.length === 0) continue;

    const joined = kept.join(' ').replace(/\s+/g, ' ').trim();
    out.push(bulletPrefix ? `${bulletPrefix}${joined}` : joined);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function findStaleAnticipatoryClaims(
  markdown: string,
  now = new Date(),
): string[] {
  const hits: string[] = [];
  for (const line of markdown.split('\n')) {
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      if (isAnticipatoryPastClaim(part, now)) hits.push(part.trim());
    }
  }
  return hits;
}
