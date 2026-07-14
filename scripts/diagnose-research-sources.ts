import '../lib/loadEnv';
import { writeFile } from 'node:fs/promises';
import {
  getSearchBackendDiagnostics,
  searchFirecrawlNews,
  searchSearxng,
  type FirecrawlSearchResult,
} from '../lib/firecrawl';
import { fetchLiveData } from '../lib/live-data';

const DEFAULT_TASKS = [
  'future of AI in China latest report',
  'China semiconductor export controls and AI chips latest developments',
  'China open-source AI models outlook',
];

const tasks = (process.env.RESEARCH_DIAG_TASKS?.trim()
  ? process.env.RESEARCH_DIAG_TASKS.split('|').map((task) => task.trim()).filter(Boolean)
  : DEFAULT_TASKS
).slice(0, Math.max(1, Number(process.env.RESEARCH_DIAG_LIMIT || DEFAULT_TASKS.length)));

type ProviderResult = {
  ok: boolean;
  latencyMs: number;
  count: number;
  distinctDomains: number;
  results: Array<{
    title: string | null;
    url: string;
    domain: string | null;
    date: string | null;
    hasBody: boolean;
  }>;
  error?: string;
};

type UrlEntry = {
  path: string;
  url: string;
  domain: string | null;
};

function domainForUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function summarizeProviderResults(
  results: FirecrawlSearchResult[],
  startedAt: number,
): ProviderResult {
  const normalized = results
    .map((result) => {
      const url = result.url?.trim() || '';
      if (!url) return null;
      return {
        title: result.title?.trim() || null,
        url,
        domain: domainForUrl(url),
        date: result.date?.trim() || null,
        hasBody: Boolean(result.markdown?.trim() || result.description?.trim() || result.snippet?.trim()),
      };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    count: normalized.length,
    distinctDomains: new Set(normalized.map((result) => result.domain).filter(Boolean)).size,
    results: normalized,
  };
}

async function runProvider(
  provider: 'firecrawl' | 'searxng-general' | 'searxng-news',
  task: string,
): Promise<ProviderResult> {
  const startedAt = Date.now();
  try {
    const results = provider === 'firecrawl'
      ? await searchFirecrawlNews(task, 8, { recency: 'month' })
      : await searchSearxng(task, 8, {
          timeoutMs: 20_000,
          ...(provider === 'searxng-news' ? { categories: ['news'] } : {}),
        });
    return summarizeProviderResults(results, startedAt);
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      count: 0,
      distinctDomains: 0,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectUrls(value: unknown, path = '$', output: UrlEntry[] = []): UrlEntry[] {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value.trim())) {
      const url = value.trim();
      output.push({ path, url, domain: domainForUrl(url) });
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectUrls(entry, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    collectUrls(entry, `${path}.${key}`, output);
  }
  return output;
}

function sectionCounts(payload: Record<string, unknown>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) counts[key] = value.length;
    else if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      const articleCount = Array.isArray(nested.articles) ? nested.articles.length : 0;
      const snapshotCount = Array.isArray(nested.article_snapshots)
        ? nested.article_snapshots.length
        : 0;
      if (articleCount || snapshotCount) counts[key] = articleCount + snapshotCount;
    }
  }
  return counts;
}

async function diagnoseTask(task: string): Promise<Record<string, unknown>> {
  const [firecrawl, searxngGeneral, searxngNews] = await Promise.all([
    runProvider('firecrawl', task),
    runProvider('searxng-general', task),
    runProvider('searxng-news', task),
  ]);

  const liveDataStartedAt = Date.now();
  let liveData: Record<string, unknown> | null = null;
  let liveDataError: string | null = null;
  try {
    liveData = JSON.parse(await fetchLiveData(task, { originalTask: task })) as Record<string, unknown>;
  } catch (error) {
    liveDataError = error instanceof Error ? error.message : String(error);
  }
  const urls = liveData ? collectUrls(liveData) : [];
  const uniqueUrls = [...new Map(urls.map((entry) => [entry.url, entry])).values()];

  return {
    task,
    providers: { firecrawl, searxngGeneral, searxngNews },
    liveData: {
      ok: Boolean(liveData),
      latencyMs: Date.now() - liveDataStartedAt,
      error: liveDataError,
      sectionCounts: liveData ? sectionCounts(liveData) : {},
      urlCount: uniqueUrls.length,
      distinctDomains: new Set(uniqueUrls.map((entry) => entry.domain).filter(Boolean)).size,
      urls: uniqueUrls,
      searchBackends: getSearchBackendDiagnostics(),
    },
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const results: Record<string, unknown>[] = [];
  for (const task of tasks) {
    console.error(`[research-diag] start: ${task}`);
    results.push(await diagnoseTask(task));
  }
  const output = {
    startedAt,
    completedAt: new Date().toISOString(),
    taskCount: results.length,
    results,
  };
  const rendered = `${JSON.stringify(output, null, 2)}\n`;
  if (process.env.RESEARCH_DIAG_OUTPUT?.trim()) {
    await writeFile(process.env.RESEARCH_DIAG_OUTPUT.trim(), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
