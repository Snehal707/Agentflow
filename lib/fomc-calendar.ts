/**
 * Deterministic Federal Reserve FOMC calendar grounding.
 * Search/Firecrawl often miss federalreserve.gov/monetarypolicy/fomccalendars.htm,
 * which then lets the writer claim the next meeting is "unconfirmed".
 */

export const FOMC_CALENDAR_URL =
  'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  // Fed pages sometimes use Apr/May, Jan/Feb, Oct/Nov spanning months.
  'apr/may': 4,
  'jan/feb': 1,
  'oct/nov': 10,
};

export type FomcMeeting = {
  year: number;
  month: number;
  monthLabel: string;
  startDay: number;
  endDay: number;
  startDate: string;
  endDate: string;
  label: string;
};

export type FomcCalendarSnapshot = {
  source_url: string;
  source_name: string;
  as_of: string;
  next_meeting: FomcMeeting | null;
  upcoming_meetings: FomcMeeting[];
  summary: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function meetingLabel(year: number, monthLabel: string, startDay: number, endDay: number): string {
  return `${monthLabel} ${startDay}-${endDay}, ${year}`;
}

/** Parse FOMC calendar HTML or Firecrawl markdown into meeting rows. */
export function parseFomcCalendarText(text: string, asOf = new Date()): FomcMeeting[] {
  if (!text?.trim()) return [];

  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '\n');

  const meetings: FomcMeeting[] = [];
  const yearBlocks = [
    ...normalized.matchAll(
      /(?:#{1,6}\s*)?(\d{4})\s+FOMC\s+Meetings?\b([\s\S]*?)(?=(?:#{1,6}\s*)?\d{4}\s+FOMC\s+Meetings?\b|$)/gi,
    ),
  ];

  for (const block of yearBlocks) {
    const year = Number(block[1]);
    if (!Number.isFinite(year) || year < 2020 || year > 2040) continue;
    const body = block[2] || '';
    const rowPattern =
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\/Feb|Apr\/May|Oct\/Nov)\b\s*\n+\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\*?/gi;
    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(body)) !== null) {
      const monthLabel = match[1];
      const monthKey = monthLabel.toLowerCase();
      const month = MONTH_INDEX[monthKey];
      const startDay = Number(match[2]);
      const endDay = Number(match[3]);
      if (!month || !Number.isFinite(startDay) || !Number.isFinite(endDay)) continue;
      const endMonth = endDay < startDay ? Math.min(12, month + 1) : month;
      const endYear = endDay < startDay && endMonth === 1 ? year + 1 : year;
      meetings.push({
        year,
        month,
        monthLabel,
        startDay,
        endDay,
        startDate: isoDate(year, month, startDay),
        endDate: isoDate(endYear, endMonth, endDay),
        label: meetingLabel(year, monthLabel, startDay, endDay),
      });
    }
  }

  // Dedupe by startDate
  const byStart = new Map<string, FomcMeeting>();
  for (const meeting of meetings) {
    byStart.set(meeting.startDate, meeting);
  }
  return [...byStart.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function selectNextFomcMeeting(
  meetings: FomcMeeting[],
  asOf = new Date(),
): { next: FomcMeeting | null; upcoming: FomcMeeting[] } {
  const today = isoDate(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, asOf.getUTCDate());
  const upcoming = meetings.filter((meeting) => meeting.endDate >= today);
  return { next: upcoming[0] ?? null, upcoming: upcoming.slice(0, 6) };
}

export function buildFomcCalendarSummary(
  next: FomcMeeting | null,
  upcoming: FomcMeeting[],
): string {
  if (!next) {
    return 'Official Federal Reserve FOMC meeting calendar was retrieved, but no upcoming meeting date was parsed from the page.';
  }
  const more =
    upcoming.length > 1
      ? ` Later 2026 meetings on the same calendar include ${upcoming
          .slice(1, 4)
          .map((m) => m.label)
          .join('; ')}.`
      : '';
  return `Official Federal Reserve FOMC calendar lists the next regularly scheduled meeting as ${next.label} (decision day typically the second day). Source: ${FOMC_CALENDAR_URL}.${more}`;
}

export async function fetchFomcCalendarSnapshot(
  asOf = new Date(),
): Promise<FomcCalendarSnapshot | null> {
  const response = await fetch(FOMC_CALENDAR_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'AgentFlowResearchBot/1.0 (+https://agentflow.local)',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`FOMC calendar HTTP ${response.status}`);
  }
  const text = await response.text();
  const meetings = parseFomcCalendarText(text, asOf);
  if (meetings.length === 0) return null;
  const { next, upcoming } = selectNextFomcMeeting(meetings, asOf);
  const asOfIso = asOf.toISOString();
  return {
    source_url: FOMC_CALENDAR_URL,
    source_name: 'Federal Reserve Board',
    as_of: asOfIso,
    next_meeting: next,
    upcoming_meetings: upcoming,
    summary: buildFomcCalendarSummary(next, upcoming),
  };
}

/** Rewrite false "schedule unpublished" claims using liveData.fomc_calendar. */
export function ensureFomcNextMeetingInReport(
  markdown: string,
  liveData: Record<string, unknown> | null | undefined,
  task: string,
): string {
  if (!markdown || !/\b(?:fed|fomc|federal\s+reserve)\b/i.test(task)) {
    return markdown;
  }
  const calendar =
    liveData?.fomc_calendar && typeof liveData.fomc_calendar === 'object'
      ? (liveData.fomc_calendar as FomcCalendarSnapshot)
      : null;
  const next = calendar?.next_meeting;
  if (!next?.label) return markdown;

  let out = markdown.replace(/\r\n/g, '\n');
  const falseSchedule =
    /[^\n.!?]{0,220}(?:specific dates?|detailed policy schedule|exact (?:timing|date)|next FOMC meeting(?: date)?)[^\n.!?]{0,160}(?:not\s+(?:yet\s+)?(?:been\s+)?(?:officially\s+)?(?:announced|published|confirmed|provided)|have\s+not\s+(?:yet\s+)?been\s+published|unconfirmed|not\s+explicitly\s+provided)[^\n.!?]*[.!?]/gi;
  const replacement = `The official Federal Reserve FOMC calendar lists the next regularly scheduled meeting as ${next.label}.`;
  out = out.replace(falseSchedule, replacement);

  if (!new RegExp(next.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(out)) {
    // Inject after Overview/Executive Summary heading body start.
    const overview = out.match(/^##\s+(?:Overview|Executive Summary)\s*$/im);
    if (overview && overview.index !== undefined) {
      const insertAt = overview.index + overview[0].length;
      const rest = out.slice(insertAt);
      const firstPara = rest.match(/^\n+([^\n]+)/);
      if (firstPara && !/next (?:FOMC|Fed) meeting/i.test(firstPara[1])) {
        out = `${out.slice(0, insertAt)}\n\n${replacement}${rest}`;
      } else if (!firstPara) {
        out = `${out.slice(0, insertAt)}\n\n${replacement}${rest}`;
      }
    }
  }

  // Ensure official calendar appears in Sources if missing.
  if (
    /^##\s+Sources\b/im.test(out) &&
    !/federalreserve\.gov\/monetarypolicy\/fomccalendars\.htm/i.test(out)
  ) {
    out = out.replace(
      /(^##\s+Sources\s*$)/im,
      `$1\n\n1. Federal Reserve Board — FOMC meeting calendars (${FOMC_CALENDAR_URL})`,
    );
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}
