import '../lib/loadEnv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listAllMarkets } from '../lib/predmarket/router';
import { buildPredictionTopicResearchPrompt } from '../lib/predmarket-research-context';
import type { MarketSummary } from '../lib/predmarket/types';
import { hasMojibakeMarkers } from '../lib/text-normalization';

const productionUrl = (process.env.SOAK_PRODUCTION_URL || 'http://178.104.240.191:4000/run').trim();
const userAddress = (
  process.env.SOAK_USER_ADDRESS || '0xb82AE74138acdcd2045b66984990EED0559Ec769'
).trim();
const repeats = Math.max(1, Number(process.env.SOAK_REPEATS || 2));
const timeoutMs = Math.max(60_000, Number(process.env.SOAK_RUN_TIMEOUT_MS || 300_000));
const outputDir = path.resolve(process.env.SOAK_OUTPUT_DIR || 'tmp/prediction-report-soak');

type SseEvent = Record<string, unknown> & { type?: string };

type RunResult = {
  title: string;
  category: string;
  iteration: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  httpStatus: number | null;
  completedSteps: string[];
  total: string | null;
  markdown: string;
  errors: string[];
  warnings: string[];
  passed: boolean;
};

function marketAssertions(market: MarketSummary, markdown: string): string[] {
  const failures: string[] = [];
  const normalized = markdown.toLowerCase();
  const sources = markdown.split(/^##\s+Sources\s*$/im)[1] || '';
  if (/gta\s*6|grand theft auto\s*(?:vi|6)/i.test(market.title)) {
    if (!/gta\s*6|grand theft auto\s*(?:vi|6)/i.test(markdown)) {
      failures.push('GTA 6 subject is missing from the report.');
    }
    if (/fifa\.com|world cup/i.test(sources)) failures.push('World Cup evidence leaked into the GTA report.');
  }
  if (/bitcoin/i.test(market.title)) {
    if (!/bitcoin|\bbtc\b/i.test(markdown) || !/market cap|market capitalization|\$?2\s*trillion/i.test(markdown)) {
      failures.push('Bitcoin $2T market-cap subject is not preserved.');
    }
    if (/fifa\.com|world cup/i.test(sources)) failures.push('World Cup evidence leaked into the Bitcoin report.');
  }
  if (/world cup|fifa/i.test(market.title)) {
    if (!/world cup|fifa/i.test(markdown) || !/spain/i.test(markdown) || !/argentina/i.test(markdown)) {
      failures.push('Current World Cup finalists are not both established.');
    }
    if (/france\s+(?:is|remains|currently)\s+(?:the\s+)?(?:favorite|favourite|most likely)/i.test(normalized)) {
      failures.push('Eliminated France is presented as the current favorite.');
    }
    if (/france\s+(?:vs\.?|versus|against|faces?)\s+spain[^.\n]{0,80}\bfinal\b/i.test(normalized)) {
      failures.push('France-Spain is incorrectly presented as the final.');
    }
  }
  if (/xaut|tether gold/i.test(market.title)) {
    if (!/xaut|tether gold/i.test(markdown) || !/4,?750|gold/i.test(markdown)) {
      failures.push('XAUT $4,750 underlying subject is not preserved.');
    }
    if (/\bXAUTH\b/.test(markdown)) failures.push('XAUT symbol was misspelled as XAUTH.');
    if (/fifa\.com|world cup/i.test(sources)) failures.push('World Cup evidence leaked into the XAUT report.');
  }
  return failures;
}

function validateReport(market: MarketSummary, markdown: string, completedSteps: string[]): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const step of ['research', 'analyst', 'writer']) {
    if (!completedSteps.includes(step)) errors.push(`Missing completed ${step} stage.`);
  }
  if (markdown.trim().length < 300) errors.push('Final report is missing or too short.');
  if (!/^##\s+Sources\s*$/im.test(markdown)) errors.push('Sources section is missing.');
  const sourceUrls = markdown.match(/https?:\/\/[^)\s]+/g) || [];
  if (new Set(sourceUrls).size < 2) errors.push('Fewer than two source URLs survived.');
  if (
    /Prediction market category in AgentFlow|Use the market category to disambiguate|Research the real-world topic only|internal prediction provider|routing metadata|market address reference/i.test(
      markdown,
    )
  ) {
    errors.push('Internal prompt or routing metadata leaked into the report.');
  }
  if (/\bAchMarket\b|\bachmarket\b/i.test(markdown)) {
    errors.push('Internal prediction provider leaked into report evidence.');
  }
  if (/portfolio impact|portfolio context|your holdings|your positions/i.test(markdown)) {
    errors.push('Portfolio-oriented prose appeared while portfolio impact was disabled.');
  }
  if (hasMojibakeMarkers(markdown)) errors.push('Mojibake markers survived finalization.');
  if (/[\u3400-\u9fff]/u.test(markdown)) errors.push('Unexpected CJK localization text leaked.');
  if (/generated ranking was withheld|no current winner ranking is published/i.test(markdown)) {
    warnings.push('Report fell back to a withheld-ranking template.');
  }
  errors.push(...marketAssertions(market, markdown));
  return { errors, warnings };
}

async function runReport(market: MarketSummary, iteration: number): Promise<RunResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const completedSteps: string[] = [];
  let markdown = '';
  let total: string | null = null;
  let httpStatus: number | null = null;
  const transportErrors: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(productionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: buildPredictionTopicResearchPrompt(market.title, market.category),
        userAddress,
        reasoningMode: 'fast',
        portfolioImpact: false,
      }),
      signal: controller.signal,
    });
    httpStatus = response.status;
    if (!response.ok || !response.body) {
      transportErrors.push(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as SseEvent;
              if (event.type === 'step_complete' && typeof event.step === 'string') {
                completedSteps.push(event.step);
                process.stdout.write(`[soak] ${market.title} #${iteration} completed ${event.step}\n`);
              }
              if (event.type === 'receipt' && typeof event.total === 'string') total = event.total;
              if (event.type === 'report' && typeof event.markdown === 'string') markdown = event.markdown;
              if (event.type === 'error') {
                transportErrors.push(String(event.message || event.error || 'Unknown SSE error'));
              }
            } catch (error) {
              transportErrors.push(`Invalid SSE JSON: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
        if (done) break;
      }
    }
  } catch (error) {
    transportErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
  const validation = validateReport(market, markdown, completedSteps);
  const completedAt = new Date().toISOString();
  const result: RunResult = {
    title: market.title,
    category: market.category,
    iteration,
    startedAt,
    completedAt,
    durationMs: Date.now() - started,
    httpStatus,
    completedSteps: [...new Set(completedSteps)],
    total,
    markdown,
    errors: [...transportErrors, ...validation.errors],
    warnings: validation.warnings,
    passed: transportErrors.length === 0 && validation.errors.length === 0,
  };
  process.stdout.write(
    `[soak] ${result.passed ? 'PASS' : 'FAIL'} ${market.title} #${iteration} (${Math.round(result.durationMs / 1000)}s)${
      result.errors.length ? ` :: ${result.errors.join(' | ')}` : ''
    }\n`,
  );
  return result;
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const markets = await listAllMarkets({ stage: 'active' });
  if (markets.length === 0) throw new Error('No active prediction markets were returned.');
  process.stdout.write(`[soak] active markets=${markets.length} repeats=${repeats} planned runs=${markets.length * repeats}\n`);
  const results: RunResult[] = [];
  for (let iteration = 1; iteration <= repeats; iteration += 1) {
    for (const market of markets) {
      results.push(await runReport(market, iteration));
    }
  }
  const summary = {
    startedAt: results[0]?.startedAt,
    completedAt: new Date().toISOString(),
    productionUrl,
    activeMarketCount: markets.length,
    repeats,
    plannedRuns: markets.length * repeats,
    completedRuns: results.length,
    passedRuns: results.filter((result) => result.passed).length,
    failedRuns: results.filter((result) => !result.passed).length,
    warningRuns: results.filter((result) => result.warnings.length > 0).length,
    simulatedTotal: results.reduce((sum, result) => sum + Number(result.total || 0), 0).toFixed(3),
    results,
  };
  const fileName = `soak-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const outputPath = path.join(outputDir, fileName);
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `[soak] summary pass=${summary.passedRuns}/${summary.completedRuns} warnings=${summary.warningRuns} simulatedTotal=${summary.simulatedTotal} output=${outputPath}\n`,
  );
  if (summary.failedRuns > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[soak] fatal:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
