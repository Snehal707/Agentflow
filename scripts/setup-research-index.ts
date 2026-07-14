import dotenv from 'dotenv';

dotenv.config();

const baseUrl = (process.env.RESEARCH_INDEX_URL || process.env.MEILISEARCH_URL || '')
  .trim()
  .replace(/\/+$/, '');
const indexUid = (process.env.RESEARCH_INDEX_UID || 'research_evidence').trim();
const key = (process.env.RESEARCH_INDEX_KEY || process.env.MEILI_MASTER_KEY || '').trim();
const localEmbeddings = /^(?:1|true|yes|on)$/i.test(
  String(process.env.RESEARCH_INDEX_LOCAL_EMBEDDINGS || '').trim(),
);
const embedderName = process.env.RESEARCH_INDEX_EMBEDDER_NAME || 'local';
const embedderModel = process.env.RESEARCH_INDEX_EMBEDDER_MODEL || 'BAAI/bge-small-en-v1.5';

if (!baseUrl) {
  throw new Error('RESEARCH_INDEX_URL is required (for example http://127.0.0.1:7700)');
}

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(key ? { Authorization: `Bearer ${key}` } : {}),
};

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method || 'GET'} ${path} failed (${response.status}): ${body.slice(0, 400)}`);
  }
  return response;
}

async function waitForTask(taskUid: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await request(`/tasks/${taskUid}`, { method: 'GET' });
    const task = (await response.json()) as { status?: string; error?: { message?: string } };
    if (task.status === 'succeeded') return;
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new Error(`Meilisearch task ${taskUid} ${task.status}: ${task.error?.message || 'unknown error'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Meilisearch task ${taskUid} did not finish within 30 seconds`);
}

async function main(): Promise<void> {
  const health = await request('/health', { method: 'GET' });
  const healthBody = (await health.json()) as { status?: string };
  console.log(`research index health=${healthBody.status || 'available'}`);

  const indexResponse = await fetch(`${baseUrl}/indexes/${encodeURIComponent(indexUid)}`, {
    headers,
  });
  if (indexResponse.status === 404) {
    const createResponse = await request('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: indexUid, primaryKey: 'id' }),
    });
    const createTask = (await createResponse.json()) as { taskUid?: number };
    if (typeof createTask.taskUid === 'number') await waitForTask(createTask.taskUid);
    console.log(`created index=${indexUid}`);
  } else if (!indexResponse.ok) {
    throw new Error(`index lookup failed (${indexResponse.status}): ${(await indexResponse.text()).slice(0, 400)}`);
  } else {
    console.log(`index exists=${indexUid}`);
  }

  const settingsResponse = await request(`/indexes/${encodeURIComponent(indexUid)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      searchableAttributes: [
        'title',
        'content',
        'supported_claims',
        'entities',
        'topics',
        'publisher',
        'domain',
      ],
      filterableAttributes: [
        'domain',
        'source_type',
        'reliability',
        'published_at',
        'fetched_at',
        'expires_at',
        'entities',
        'topics',
      ],
      sortableAttributes: ['authority', 'published_at', 'fetched_at', 'expires_at'],
      displayedAttributes: ['*'],
      typoTolerance: {
        enabled: true,
        disableOnAttributes: ['domain', 'canonical_url', 'url'],
      },
      ...(localEmbeddings
        ? {
            embedders: {
              [embedderName]: {
                source: 'huggingFace',
                model: embedderModel,
                documentTemplate:
                  'A research source titled {{doc.title}} from {{doc.publisher}}. {{doc.content}} Claims: {{doc.supported_claims}} Topics: {{doc.topics}}',
              },
            },
          }
        : {}),
    }),
  });
  const settingsTask = (await settingsResponse.json()) as { taskUid?: number };
  if (typeof settingsTask.taskUid === 'number') await waitForTask(settingsTask.taskUid);

  console.log(
    `configured index=${indexUid} local_embeddings=${localEmbeddings} model=${localEmbeddings ? embedderModel : 'disabled'}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
