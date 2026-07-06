import { callHermesFast } from './hermes';
import type { SourceDiagnostics } from '../agents/research/types';

type JsonObject = Record<string, unknown>;

type FastReportReviewIssue = {
  severity: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  fix: string;
};

type FastReportReview = {
  overall_score: number;
  verdict: 'pass' | 'revise' | 'fail';
  issues: FastReportReviewIssue[];
  recommended_changes: string[];
};

type FastReportSupervisorInput = {
  task: string;
  writerPrompt: string;
  writerInput: string;
  draftReport: string;
  research?: JsonObject | null;
  analysis?: JsonObject | null;
  liveData?: JsonObject | null;
};

type FastReportSupervisorResult = {
  report: string;
  review?: FastReportReview;
  reviewApplied: boolean;
  rewriteApplied: boolean;
};

type HermesRunStartResponse = {
  run_id?: string;
};

type HermesRunStatusResponse = {
  status?: string;
  output?: string;
  error?: string;
};

const LOCAL_HERMES_API_URL = (
  process.env.AGENTFLOW_HERMES_URL ||
  process.env.HERMES_AGENT_URL ||
  ''
).trim().replace(/\/+$/, '');

const LOCAL_HERMES_API_KEY = (
  process.env.HERMES_API_SERVER_KEY ||
  process.env.AGENTFLOW_BRAIN_INTERNAL_KEY ||
  ''
).trim();

const FAST_REPORT_SUPERVISOR_ENABLED =
  String(process.env.FAST_REPORT_SUPERVISOR_ENABLED ?? 'true').toLowerCase() !== 'false';

const FAST_REPORT_REVIEW_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.FAST_REPORT_REVIEW_TIMEOUT_MS || '30000', 10) || 30000,
);

const FAST_REPORT_REWRITE_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.FAST_REPORT_REWRITE_TIMEOUT_MS || '35000', 10) || 35000,
);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (LOCAL_HERMES_API_KEY) {
    headers.Authorization = `Bearer ${LOCAL_HERMES_API_KEY}`;
  }
  return headers;
}

function safeParseObject(value: string): JsonObject | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
}

function cleanJsonText(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function cleanMarkdownOutput(value: string): string {
  return value
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractBalancedObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }
  return null;
}

function parseJsonObject<T>(value: string): T {
  const cleaned = cleanJsonText(value).replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const extracted = extractBalancedObject(cleaned);
    if (!extracted) {
      throw new Error('Unable to parse supervisor JSON.');
    }
    return JSON.parse(extracted.replace(/,\s*([}\]])/g, '$1')) as T;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeReview(value: FastReportReview | null): FastReportReview {
  const issues = Array.isArray(value?.issues) ? value.issues : [];
  return {
    overall_score: typeof value?.overall_score === 'number' ? value.overall_score : 0,
    verdict:
      value?.verdict === 'pass' || value?.verdict === 'revise' || value?.verdict === 'fail'
        ? value.verdict
        : 'revise',
    issues: issues.map((issue) => ({
      severity:
        issue?.severity === 'high' || issue?.severity === 'medium' || issue?.severity === 'low'
          ? issue.severity
          : 'medium',
      title: typeof issue?.title === 'string' ? issue.title : 'Review issue',
      explanation: typeof issue?.explanation === 'string' ? issue.explanation : '',
      fix: typeof issue?.fix === 'string' ? issue.fix : '',
    })),
    recommended_changes: asStringArray(value?.recommended_changes),
  };
}

function getSourceDiagnostics(liveData?: JsonObject | null): SourceDiagnostics | null {
  const diagnostics = liveData?.source_diagnostics;
  return diagnostics && typeof diagnostics === 'object'
    ? (diagnostics as SourceDiagnostics)
    : null;
}

function shouldRewrite(review: FastReportReview, liveData?: JsonObject | null): boolean {
  const highSeverityCount = review.issues.filter((issue) => issue.severity === 'high').length;
  const sourceDiagnostics = getSourceDiagnostics(liveData);
  const hasHighDriftRisk = sourceDiagnostics?.drift_risk === 'high';

  if (highSeverityCount > 0) return true;
  if (review.verdict === 'fail') return true;
  if (review.overall_score <= 4 && !hasHighDriftRisk) return true;
  return false;
}

async function createHermesRun(message: string, instructions: string, sessionId: string): Promise<string> {
  const response = await fetch(`${LOCAL_HERMES_API_URL}/v1/runs`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      input: message,
      instructions,
      session_id: sessionId,
      enabled_toolsets: ['clarify'],
    }),
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    const errorText = (await response.text()).trim();
    throw new Error(errorText || `Hermes run creation failed with status ${response.status}`);
  }

  const payload = (await response.json()) as HermesRunStartResponse;
  if (!payload.run_id) {
    throw new Error('Hermes review run did not return a run_id.');
  }
  return payload.run_id;
}

async function waitForHermesRun(runId: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${LOCAL_HERMES_API_URL}/v1/runs/${runId}`, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Hermes run status failed with status ${response.status}`);
    }

    const payload = (await response.json()) as HermesRunStatusResponse;
    const status = String(payload.status || '').toLowerCase();

    if (status === 'completed') {
      return payload.output || '';
    }
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(payload.error || `Hermes run ${status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  throw new Error('Hermes fast-report review timed out.');
}

function buildReviewInstructions(): string {
  return [
    'You are a fast quality gate for AgentFlow reports.',
    'Return JSON only.',
    'Do not use tools.',
    'Be strict about real problems only: topic drift, unsupported claims, missing core sections, misleading confidence, bad source handling.',
    'Do not nitpick style unless it harms usefulness.',
    'Schema:',
    '{',
    '  "overall_score": 0,',
    '  "verdict": "pass|revise|fail",',
    '  "issues": [',
    '    {',
    '      "severity": "high|medium|low",',
    '      "title": "string",',
    '      "explanation": "string",',
    '      "fix": "string"',
    '    }',
    '  ],',
    '  "recommended_changes": ["string"]',
    '}',
    'Use as few issues as necessary.',
  ].join('\n');
}

function buildReviewPrompt(input: FastReportSupervisorInput): string {
  return JSON.stringify(
    {
      task: input.task,
      sourceDiagnostics: getSourceDiagnostics(input.liveData),
      research: input.research ?? safeParseObject(input.writerInput),
      analysis: input.analysis ?? null,
      report: input.draftReport,
    },
    null,
    2,
  );
}

function buildRewriteInstructions(): string {
  return [
    'Revise this AgentFlow fast report using the review guidance.',
    'Keep it fast and compact.',
    'Fix only substantive issues: topic drift, unsupported claims, uncertainty framing, missing key sections, weak sources.',
    'Do not invent any new evidence.',
    'Keep markdown clean and human.',
    'Return markdown only.',
  ].join('\n');
}

function buildRewritePrompt(input: FastReportSupervisorInput, review: FastReportReview): string {
  return JSON.stringify(
    {
      task: input.task,
      review,
      original_writer_prompt: input.writerPrompt,
      original_writer_input: safeParseObject(input.writerInput) ?? input.writerInput,
      current_report: input.draftReport,
    },
    null,
    2,
  );
}

async function runLocalReview(input: FastReportSupervisorInput): Promise<FastReportReview> {
  const runId = await createHermesRun(
    buildReviewPrompt(input),
    buildReviewInstructions(),
    `agentflow-fast-report-${Date.now()}`,
  );
  const output = await waitForHermesRun(runId, FAST_REPORT_REVIEW_TIMEOUT_MS);
  return normalizeReview(parseJsonObject<FastReportReview>(output));
}

export async function maybeImproveFastReport(
  input: FastReportSupervisorInput,
): Promise<FastReportSupervisorResult> {
  if (!FAST_REPORT_SUPERVISOR_ENABLED || !LOCAL_HERMES_API_URL) {
    return {
      report: input.draftReport,
      reviewApplied: false,
      rewriteApplied: false,
    };
  }

  try {
    const review = await withTimeout(
      runLocalReview(input),
      FAST_REPORT_REVIEW_TIMEOUT_MS + 2000,
      'Fast report review timed out.',
    );

    if (!shouldRewrite(review, input.liveData)) {
      return {
        report: input.draftReport,
        review,
        reviewApplied: true,
        rewriteApplied: false,
      };
    }

    const rewritten = await withTimeout(
      callHermesFast(
        buildRewriteInstructions(),
        buildRewritePrompt(input, review),
      ),
      FAST_REPORT_REWRITE_TIMEOUT_MS,
      'Fast report rewrite timed out.',
    );

    return {
      report: cleanMarkdownOutput(rewritten || '') || input.draftReport,
      review,
      reviewApplied: true,
      rewriteApplied: true,
    };
  } catch (error) {
    console.warn('[fast-report-supervisor] fallback to original draft', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return {
      report: input.draftReport,
      reviewApplied: false,
      rewriteApplied: false,
    };
  }
}
