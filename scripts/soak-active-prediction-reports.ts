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
const marketFilter = (process.env.SOAK_MARKET_FILTER || '').trim().toLowerCase();

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
    if (/contractual deadline[^.\n]{0,180}March\s+31,?\s+2025/i.test(markdown)) {
      failures.push('Malformed historical fiscal deadline appeared in the GTA report.');
    }
    if (/official\s+Rockstar/i.test(markdown) && /has not been officially confirmed|lack of[^.\n]{0,40}official confirmation/i.test(markdown)) {
      failures.push('GTA report contradicts its own official-release evidence.');
    }
    if (/\b(?:hacker|hacking)\b[^.\n]{0,100}\b(?:prison|sentenced|hospital|custody|jail)\b/i.test(markdown)) {
      failures.push('Hacker custody news leaked into the GTA launch report.');
    }
    const gtaBody = markdown.replace(/^#\s+.*$/m, '');
    if (/\b(?:release|launch)(?:d|es|ing)?(?:\s+date)?\s+(?:(?:is|was|set|scheduled|planned)\s+)?(?:for\s+|on\s+)?November\s+30,?\s+2026\b/i.test(gtaBody) && !/does not satisfy a strict [“"]before November 30, 2026[”"] condition/i.test(gtaBody)) {
      failures.push('GTA report does not apply strict before-deadline semantics to a cutoff-day launch.');
    }
    const deadlineSemanticsLines = gtaBody.match(/^The stated .+? (?:launch date|cutoff)[^.]*\.$/gim) || [];
    if (deadlineSemanticsLines.length > 1) failures.push('GTA deadline semantics sentence was duplicated.');
  }
  if (/bitcoin/i.test(market.title)) {
    if (!/bitcoin|\bbtc\b/i.test(markdown) || !/market cap|market capitalization|\$?2\s*trillion/i.test(markdown)) {
      failures.push('Bitcoin $2T market-cap subject is not preserved.');
    }
    if (/fifa\.com|world cup/i.test(sources)) failures.push('World Cup evidence leaked into the Bitcoin report.');
    if (/\$\s*12\.7\s*trillion|100\.97\s*b(?:illion)?[^.\n]{0,30}(?:fixed|circulating)?\s*supply/i.test(markdown)) {
      failures.push('Bitcoin report contains the previously observed order-of-magnitude baseline or supply error.');
    }
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
    if (/\b(?:bts|k-?pop|concert (?:schedule|tour)|world music tour)\b/i.test(sources)) {
      failures.push('Music or concert evidence leaked into the World Cup report.');
    }
    if (/\b(?:mlb|baseball|mets|padres)\b/i.test(sources)) {
      failures.push('Unrelated baseball evidence leaked into the World Cup report.');
    }
    if (/\bJuly\s+17(?:,\s*2026)?\s+semi[- ]?final/i.test(markdown)) {
      failures.push('World Cup report attached the retrieval/publication date to a semifinal result.');
    }
    if (/semi[- ]?final match result[^.\n]{0,100}\(July\s+1[67](?:,\s*2026)?\)/i.test(markdown)) {
      failures.push('World Cup report attached an unsupported parenthetical date to a semifinal result.');
    }
    if (/Argentina[^.\n]{0,100}\b(?:front[- ]?runner|favou?rite)\b/i.test(markdown) && /Spain[^.\n]{0,100}\bfavou?red over Argentina/i.test(markdown)) {
      failures.push('World Cup report contradicts the current Spain-favored evidence.');
    }
  }
  if (/xaut|tether gold/i.test(market.title)) {
    if (!/xaut|tether gold/i.test(markdown) || !/4,?750|gold/i.test(markdown)) {
      failures.push('XAUT $4,750 underlying subject is not preserved.');
    }
    if (/\bXAUTH\b/.test(markdown)) failures.push('XAUT symbol was misspelled as XAUTH.');
    if (/\b2\.15\s*%|100-point-\$|approximately\s+\$?100\b/i.test(markdown)) {
      failures.push('XAUT target math contains the previously observed contradictory increase.');
    }
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
  const nonemptyLines = markdown.split(/\r?\n/).filter((line) => line.trim());
  const h1Count = nonemptyLines.filter((line) => /^#\s+/.test(line)).length;
  if (!/^#\s+/.test(nonemptyLines[0] || '') || h1Count !== 1) {
    errors.push(`Report must start with exactly one H1 title; found ${h1Count}.`);
  }
  if (!/^##\s+Sources\s*$/im.test(markdown)) errors.push('Sources section is missing.');
  if (/^#{1,6}\s+Key Sources\s*$/im.test(markdown)) errors.push('Duplicate pre-final source section survived.');
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
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#{2,6}\s+\S/.test(lines[index].trim()) && !/^\*\*[^*]+\*\*\s*$/.test(lines[index].trim())) continue;
    let next = index + 1;
    while (next < lines.length && !lines[next].trim()) next += 1;
    if (next >= lines.length || /^#{1,6}\s+\S/.test(lines[next].trim())) {
      errors.push(`Empty report section survived: ${lines[index].trim()}`);
    }
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
  const allMarkets = await listAllMarkets({ stage: 'active' });
  const markets = marketFilter
    ? allMarkets.filter((market) =>
        `${market.title} ${market.category}`.toLowerCase().includes(marketFilter),
      )
    : allMarkets;
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
