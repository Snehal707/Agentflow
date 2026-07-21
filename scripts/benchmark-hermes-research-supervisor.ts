import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSourceDiagnostics } from '../agents/research/deepPipeline';
import { extractClaimsFromSources } from '../agents/research/claimExtractor';
import { buildLiveFacts } from '../agents/research/liveFacts';
import { synthesizeResearchReport } from '../agents/research/synthesizer';
import type {
  LiveFacts,
  ResearchBrief,
  Source,
  SourceDiagnostics,
  VerifiedClaim,
} from '../agents/research/types';
import { verifyClaims } from '../agents/research/verifier';
import { callHermesDeep } from '../lib/hermes';
import { loadFixture } from './research-benchmark-utils';

/** Supervisor plan/review uses Hermes LLM JSON (callHermesDeep), not Hermes Agent /v1/runs. */

type SupervisorScorecard = {
  overall_score: number;
  verdict: 'pass' | 'revise' | 'fail';
  dimension_scores: {
    topicality: number;
    grounding: number;
    coverage: number;
    uncertainty: number;
    structure: number;
    usefulness: number;
  };
  strengths: string[];
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    title: string;
    explanation: string;
    fix: string;
  }>;
  recommended_changes: string[];
};

type SupervisorPlan = {
  report_shape: string;
  priority_questions: string[];
  mandatory_sections: string[];
  likely_failure_modes: string[];
  review_focus: string[];
};

type EvaluationMetrics = {
  chars: number;
  headings: number;
  source_bullets: number;
  has_summary: boolean;
  has_evidence: boolean;
  has_uncertainty: boolean;
  has_sources: boolean;
  coverage_limits_mentions: number;
};

type BenchmarkOutput = {
  fixture: string;
  run_at: string;
  runtime: {
    supervisor_backend: 'hermes_llm_deep';
    shared_session_id: string;
  };
  stages: {
    claim_extraction_latency_ms: number;
    verification_latency_ms: number;
    baseline_synthesis_latency_ms: number;
    supervisor_plan_latency_ms: number;
    baseline_review_latency_ms: number;
    revised_synthesis_latency_ms: number;
    revised_review_latency_ms: number;
  };
  baseline: {
    report: string;
    metrics: EvaluationMetrics;
    review: SupervisorScorecard;
  };
  supervised: {
    plan: SupervisorPlan;
    report: string;
    metrics: EvaluationMetrics;
    review: SupervisorScorecard;
  };
  comparison: {
    baseline_score: number;
    supervised_score: number;
    score_delta: number;
    baseline_issue_counts: Record<'high' | 'medium' | 'low', number>;
    supervised_issue_counts: Record<'high' | 'medium' | 'low', number>;
    recommendation: string;
  };
};

const OUTPUT_DIR = path.join('tmp', 'hermes-research-supervisor');

function parseFixtureArg(argv: string[]): string {
  const [fixtureName] = argv.slice(2);
  if (!fixtureName) {
    throw new Error(
      'Usage: npx tsx scripts/benchmark-hermes-research-supervisor.ts <fixture-name>',
    );
  }
  return fixtureName;
}

function cleanJsonText(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function extractBalancedJson(input: string): string | null {
  const starts = ['{', '['];

  for (const startChar of starts) {
    const start = input.indexOf(startChar);
    if (start < 0) continue;

    const endChar = startChar === '{' ? '}' : ']';
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

      if (char === startChar) depth += 1;
      if (char === endChar) {
        depth -= 1;
        if (depth === 0) {
          return input.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

function parseJsonObject<T>(value: string, label: string): T {
  const cleaned = cleanJsonText(value).replace(/,\s*([}\]])/g, '$1');
  const candidates = [cleaned, extractBalancedJson(cleaned)].filter(
    (entry): entry is string => Boolean(entry),
  );

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as T;
    } catch (error) {
      lastError = error;
    }
  }

  const preview = cleaned.slice(0, 240).replace(/\s+/g, ' ');
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError || 'unknown parse error');
  throw new Error(`Unable to parse ${label} as JSON (${detail}). Preview: ${preview}`);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizePlan(value: SupervisorPlan): SupervisorPlan {
  return {
    report_shape:
      typeof value?.report_shape === 'string' ? value.report_shape : 'report',
    priority_questions: asStringArray(value?.priority_questions),
    mandatory_sections: asStringArray(value?.mandatory_sections),
    likely_failure_modes: asStringArray(value?.likely_failure_modes),
    review_focus: asStringArray(value?.review_focus),
  };
}

function normalizeScorecard(value: SupervisorScorecard): SupervisorScorecard {
  const dimensionScores = value?.dimension_scores || ({} as SupervisorScorecard['dimension_scores']);
  const issues = Array.isArray(value?.issues) ? value.issues : [];

  return {
    overall_score:
      typeof value?.overall_score === 'number' ? value.overall_score : 0,
    verdict:
      value?.verdict === 'pass' || value?.verdict === 'revise' || value?.verdict === 'fail'
        ? value.verdict
        : 'revise',
    dimension_scores: {
      topicality: Number(dimensionScores.topicality || 0),
      grounding: Number(dimensionScores.grounding || 0),
      coverage: Number(dimensionScores.coverage || 0),
      uncertainty: Number(dimensionScores.uncertainty || 0),
      structure: Number(dimensionScores.structure || 0),
      usefulness: Number(dimensionScores.usefulness || 0),
    },
    strengths: asStringArray(value?.strengths),
    issues: issues.map((issue) => ({
      severity:
        issue?.severity === 'high' || issue?.severity === 'medium' || issue?.severity === 'low'
          ? issue.severity
          : 'medium',
      title: typeof issue?.title === 'string' ? issue.title : 'Review issue',
      explanation:
        typeof issue?.explanation === 'string' ? issue.explanation : '',
      fix: typeof issue?.fix === 'string' ? issue.fix : '',
    })),
    recommended_changes: asStringArray(value?.recommended_changes),
  };
}

async function ensureOutputDir(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function runSupervisorJson<T>(input: {
  sessionId: string;
  instructions: string;
  message: string;
  label: string;
}): Promise<T> {
  // Use Hermes LLM directly. Hermes Agent /v1/runs enables tools and often returns
  // non-JSON / hangs, which is useless for deterministic scorecard parsing.
  const output = await callHermesDeep(
    input.instructions,
    `${input.message}\n\nSession: ${input.sessionId}\nLabel: ${input.label}`,
  );
  return parseJsonObject<T>(output, input.label);
}

function computeMetrics(report: string): EvaluationMetrics {
  const headings = (report.match(/^###+\s+/gm) || []).length;
  const sourcesSection =
    report.match(/###+\s+Sources\s+([\s\S]*?)(?:\n###+\s+|\n#\s+|$)/i)?.[1] || '';
  const sourceBullets = (sourcesSection.match(/^\s*[-*]\s+/gm) || []).length;

  return {
    chars: report.length,
    headings,
    source_bullets: sourceBullets,
    has_summary: /^###+\s+Summary\b/im.test(report),
    has_evidence: /^###+\s+.*Evidence\b/im.test(report),
    has_uncertainty: /^###+\s+.*?(Uncertainty|Risk)/im.test(report),
    has_sources: /^###+\s+Sources\b/im.test(report),
    coverage_limits_mentions: (report.match(/Coverage Limits/gi) || []).length,
  };
}

function issueCounts(review: SupervisorScorecard): Record<'high' | 'medium' | 'low', number> {
  return review.issues.reduce<Record<'high' | 'medium' | 'low', number>>(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
}

function compareOutcome(
  baseline: SupervisorScorecard,
  supervised: SupervisorScorecard,
): BenchmarkOutput['comparison'] {
  const baselineCounts = issueCounts(baseline);
  const supervisedCounts = issueCounts(supervised);
  const delta = supervised.overall_score - baseline.overall_score;

  let recommendation = 'neutral';
  if (
    delta >= 0.5 &&
    supervisedCounts.high <= baselineCounts.high &&
    supervisedCounts.medium <= baselineCounts.medium
  ) {
    recommendation = 'promising: local supervisor loop improved report quality enough to justify a deeper spike';
  } else if (delta <= -0.5 || supervisedCounts.high > baselineCounts.high) {
    recommendation = 'not ready: supervisor loop hurt quality or introduced more serious review issues';
  } else {
    recommendation = 'mixed: the loop is plausible, but needs prompt tuning before production use';
  }

  return {
    baseline_score: baseline.overall_score,
    supervised_score: supervised.overall_score,
    score_delta: delta,
    baseline_issue_counts: baselineCounts,
    supervised_issue_counts: supervisedCounts,
    recommendation,
  };
}

function buildPlanPrompt(args: {
  task: string;
  brief: ResearchBrief;
  sourceDiagnostics: SourceDiagnostics;
  sources: Source[];
}): string {
  return JSON.stringify(
    {
      task: args.task,
      brief: args.brief,
      sourceDiagnostics: args.sourceDiagnostics,
      sourceSample: args.sources.slice(0, 8).map((source) => ({
        title: source.title,
        domain: source.domain,
        reliability: source.reliability,
        date: source.date,
      })),
    },
    null,
    2,
  );
}

function buildPlanInstructions(): string {
  return [
    'You are supervising an AgentFlow research report before drafting.',
    'Return JSON only.',
    'Do not use tools.',
    'Decide the best report shape for this brief and retrieval set.',
    'Focus on staying on-topic, covering the must-answer dimensions, and avoiding drift into narrow subtopics.',
    'Schema:',
    '{',
    '  "report_shape": "string",',
    '  "priority_questions": ["string"],',
    '  "mandatory_sections": ["string"],',
    '  "likely_failure_modes": ["string"],',
    '  "review_focus": ["string"]',
    '}',
  ].join('\n');
}

function buildReviewInstructions(): string {
  return [
    'You are a strict AgentFlow research quality reviewer.',
    'Return JSON only.',
    'Do not use tools.',
    'Judge the report only against the provided brief, verified claims, live facts, and source diagnostics.',
    'Penalize topic drift, unsupported assertions, weak uncertainty handling, shallow structure, and missing source-backed detail.',
    'Schema:',
    '{',
    '  "overall_score": 0,',
    '  "verdict": "pass|revise|fail",',
    '  "dimension_scores": {',
    '    "topicality": 0,',
    '    "grounding": 0,',
    '    "coverage": 0,',
    '    "uncertainty": 0,',
    '    "structure": 0,',
    '    "usefulness": 0',
    '  },',
    '  "strengths": ["string"],',
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
    'Use 1-10 scores.',
  ].join('\n');
}

function buildReviewPrompt(args: {
  task: string;
  brief: ResearchBrief;
  sourceDiagnostics: SourceDiagnostics;
  liveFacts: LiveFacts;
  claims: VerifiedClaim[];
  report: string;
}): string {
  return JSON.stringify(
    {
      task: args.task,
      brief: args.brief,
      sourceDiagnostics: args.sourceDiagnostics,
      liveFacts: args.liveFacts,
      verifiedClaims: args.claims,
      report: args.report,
    },
    null,
    2,
  );
}

function buildRewritePrompt(args: {
  brief: ResearchBrief;
  claims: VerifiedClaim[];
  liveFacts: LiveFacts;
  sources: Source[];
  sourceDiagnostics: SourceDiagnostics;
  baselineReport: string;
  plan: SupervisorPlan;
  review: SupervisorScorecard;
}): string {
  return JSON.stringify(
    {
      brief: args.brief,
      claims: args.claims,
      liveFacts: args.liveFacts,
      sourceDiagnostics: args.sourceDiagnostics,
      sources: args.sources,
      baselineReport: args.baselineReport,
      supervisorPlan: args.plan,
      supervisorReview: args.review,
    },
    null,
    2,
  );
}

function buildRewriteInstructions(): string {
  return [
    'Revise the markdown report using only the provided verified claims, live facts, and sources.',
    'Treat the supervisor plan and review as editorial guidance, not new evidence.',
    'Fix real issues from the review, but do not invent facts, quotes, dates, or URLs.',
    'Stay tightly on the user brief.',
    'Keep the report human and readable, not robotic.',
    'Always keep: a short summary, an evidence section, an uncertainty or risks section, and a sources section.',
    'Return markdown only.',
  ].join('\n');
}

async function writeArtifacts(
  fixtureName: string,
  timestamp: string,
  output: BenchmarkOutput,
): Promise<{ jsonPath: string; baselinePath: string; supervisedPath: string }> {
  await ensureOutputDir();
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `${fixtureName}-${safeTimestamp}.json`);
  const baselinePath = path.join(
    OUTPUT_DIR,
    `${fixtureName}-${safeTimestamp}.baseline.md`,
  );
  const supervisedPath = path.join(
    OUTPUT_DIR,
    `${fixtureName}-${safeTimestamp}.supervised.md`,
  );

  await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(baselinePath, output.baseline.report, 'utf8');
  await writeFile(supervisedPath, output.supervised.report, 'utf8');

  return { jsonPath, baselinePath, supervisedPath };
}

async function main(): Promise<void> {
  const fixtureName = parseFixtureArg(process.argv);

  const fixture = await loadFixture(fixtureName);
  const sourceDiagnostics = buildSourceDiagnostics(fixture.brief, fixture.sources);
  const liveFacts = buildLiveFacts(fixture.sources);
  const runAt = new Date().toISOString();
  const sessionId = `agentflow-research-supervisor-${fixtureName}-${Date.now()}`;

  const claimStartedAt = Date.now();
  const claims = await extractClaimsFromSources(fixture.sources);
  const claimLatency = Date.now() - claimStartedAt;

  const verificationStartedAt = Date.now();
  const verifiedClaims = await verifyClaims(fixture.brief, claims);
  const verificationLatency = Date.now() - verificationStartedAt;

  const baselineStartedAt = Date.now();
  const baselineReport = await synthesizeResearchReport({
    brief: fixture.brief,
    claims: verifiedClaims,
    liveFacts,
    sources: fixture.sources,
    sourceDiagnostics,
  });
  const baselineLatency = Date.now() - baselineStartedAt;

  const planStartedAt = Date.now();
  const plan = await runSupervisorJson<SupervisorPlan>({
    sessionId,
    instructions: buildPlanInstructions(),
    message: buildPlanPrompt({
      task: fixture.task,
      brief: fixture.brief,
      sourceDiagnostics,
      sources: fixture.sources,
    }),
    label: 'supervisor plan',
  });
  const normalizedPlan = normalizePlan(plan);
  const planLatency = Date.now() - planStartedAt;

  const baselineReviewStartedAt = Date.now();
  const baselineReview = await runSupervisorJson<SupervisorScorecard>({
    sessionId,
    instructions: buildReviewInstructions(),
    message: buildReviewPrompt({
      task: fixture.task,
      brief: fixture.brief,
      sourceDiagnostics,
      liveFacts,
      claims: verifiedClaims,
      report: baselineReport,
    }),
    label: 'baseline review',
  });
  const normalizedBaselineReview = normalizeScorecard(baselineReview);
  const baselineReviewLatency = Date.now() - baselineReviewStartedAt;

  const revisedStartedAt = Date.now();
  const supervisedReport = await callHermesDeep(
    buildRewriteInstructions(),
    buildRewritePrompt({
      brief: fixture.brief,
      claims: verifiedClaims,
      liveFacts,
      sources: fixture.sources,
      sourceDiagnostics,
      baselineReport,
      plan: normalizedPlan,
      review: normalizedBaselineReview,
    }),
  );
  const revisedLatency = Date.now() - revisedStartedAt;

  const revisedReviewStartedAt = Date.now();
  const supervisedReview = await runSupervisorJson<SupervisorScorecard>({
    sessionId,
    instructions: buildReviewInstructions(),
    message: buildReviewPrompt({
      task: fixture.task,
      brief: fixture.brief,
      sourceDiagnostics,
      liveFacts,
      claims: verifiedClaims,
      report: supervisedReport,
    }),
    label: 'supervised review',
  });
  const normalizedSupervisedReview = normalizeScorecard(supervisedReview);
  const revisedReviewLatency = Date.now() - revisedReviewStartedAt;

  const output: BenchmarkOutput = {
    fixture: fixture.name,
    run_at: runAt,
    runtime: {
      supervisor_backend: 'hermes_llm_deep',
      shared_session_id: sessionId,
    },
    stages: {
      claim_extraction_latency_ms: claimLatency,
      verification_latency_ms: verificationLatency,
      baseline_synthesis_latency_ms: baselineLatency,
      supervisor_plan_latency_ms: planLatency,
      baseline_review_latency_ms: baselineReviewLatency,
      revised_synthesis_latency_ms: revisedLatency,
      revised_review_latency_ms: revisedReviewLatency,
    },
    baseline: {
      report: baselineReport,
      metrics: computeMetrics(baselineReport),
      review: normalizedBaselineReview,
    },
    supervised: {
      plan: normalizedPlan,
      report: supervisedReport,
      metrics: computeMetrics(supervisedReport),
      review: normalizedSupervisedReview,
    },
    comparison: compareOutcome(normalizedBaselineReview, normalizedSupervisedReview),
  };

  const artifactPaths = await writeArtifacts(fixture.name, runAt, output);

  console.log(
    JSON.stringify(
      {
        fixture: output.fixture,
        run_at: output.run_at,
        comparison: output.comparison,
        artifacts: artifactPaths,
      },
      null,
      2,
    ),
  );
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
