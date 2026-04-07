import { createServer } from 'http';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { extname, join, normalize } from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const DATASET_PATH = join(root, 'data', 'stackoverflow_3000.json');
let qaDatasetCache = null;

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return null; }
}

function db(action, payload = {}) {
  const result = spawnSync('python3', [join(root, 'db.py'), action], {
    input: JSON.stringify(payload),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'DB command failed');
  }
  return JSON.parse(result.stdout || '{}');
}

function cosine(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function getQaDataset() {
  if (qaDatasetCache) return qaDatasetCache;
  if (!existsSync(DATASET_PATH)) {
    throw new Error('Dataset file missing. Run: python3 tools/build_stackoverflow_dataset.py');
  }

  const raw = JSON.parse(readFileSync(DATASET_PATH, 'utf8'));
  qaDatasetCache = raw
    .filter((r) => Array.isArray(r.embedding))
    .map((r) => ({
      id: r.id,
      question: r.question || '',
      answer: r.answer || '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      embedding: r.embedding.map((n) => Number(n) || 0)
    }));
  return qaDatasetCache;
}

async function generateEmbedding(text) {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('Missing GITHUB_TOKEN in .env.');
  const model = process.env.EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const endpoint = process.env.GITHUB_EMBEDDINGS_URL?.trim() || 'https://models.inference.ai.azure.com/embeddings';

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ input: text, model })
  });

  const data = await upstream.json();
  if (!upstream.ok) throw new Error(data?.error?.message || 'Embedding generation failed');
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('Invalid embedding response from model endpoint.');
  return { embedding, model };
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = normalize(join(root, urlPath));
  if (!safePath.startsWith(root)) return json(res, 403, { error: 'Forbidden' });
  if (!existsSync(safePath)) return json(res, 404, { error: 'Not found' });
  const map = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png'
  };
  res.writeHead(200, { 'Content-Type': map[extname(safePath).toLowerCase()] || 'application/octet-stream' });
  createReadStream(safePath).pipe(res);
}

async function handleApi(req, res) {
  try {

    if (req.method === 'GET' && req.url === '/api/meta') {
      return json(res, 200, { database: join(root, 'app.db') });
    }

    if (req.method === 'POST' && req.url === '/api/login') {
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: 'Invalid JSON body.' });
      return json(res, 200, db('login', body));
    }

    if (req.method === 'GET' && req.url.startsWith('/api/users')) {
      return json(res, 200, db('list_users'));
    }

    if (req.method === 'POST' && req.url === '/api/users') {
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: 'Invalid JSON body.' });
      return json(res, 200, db('create_user', body));
    }

    if (req.method === 'PUT' && req.url.startsWith('/api/users/')) {
      const id = req.url.split('/').pop();
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: 'Invalid JSON body.' });
      return json(res, 200, db('update_user', { ...body, id }));
    }

    if (req.method === 'DELETE' && req.url.startsWith('/api/users/')) {
      const id = req.url.split('/').pop();
      return json(res, 200, db('delete_user', { id }));
    }

    if (req.method === 'GET' && req.url.startsWith('/api/documents')) {
      const u = new URL(req.url, `http://localhost:${port}`);
      const ownerId = u.searchParams.get('ownerId');
      return json(res, 200, db('list_documents', { ownerId }));
    }

    if (req.method === 'POST' && req.url === '/api/documents') {
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: 'Invalid JSON body.' });
      return json(res, 200, db('create_document', body));
    }

    if (req.method === 'PUT' && req.url.startsWith('/api/documents/')) {
      const id = req.url.split('/').pop();
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: 'Invalid JSON body.' });
      return json(res, 200, db('update_document', { ...body, id }));
    }

    if (req.method === 'DELETE' && req.url.startsWith('/api/documents/')) {
      const id = req.url.split('/').pop();
      return json(res, 200, db('delete_document', { id }));
    }

    if (req.method === 'POST' && req.url === '/api/embeddings') {
      const body = await readBody(req);
      if (!body || !String(body.summary || '').trim()) return json(res, 400, { error: 'summary is required.' });
      const { embedding, model } = await generateEmbedding(String(body.summary));
      return json(res, 200, { embedding, model });
    }

    if (req.method === 'POST' && req.url === '/api/programming-search') {
      const body = await readBody(req);
      const query = String(body?.query || '').trim();
      if (!query) return json(res, 400, { error: 'query is required.' });

      const { embedding } = await generateEmbedding(query);
      const dataset = getQaDataset();
      if (!dataset.length) return json(res, 400, { error: 'Dataset is empty. Populate data/stackoverflow_3000.json.' });

      const results = dataset
        .map((row) => ({
          ...row,
          score: cosine(embedding, row.embedding)
        }))
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((row) => ({
          id: row.id,
          question: row.question,
          answer: row.answer,
          tags: row.tags,
          score: row.score
        }));

      return json(res, 200, { results, datasetSize: dataset.length });
    }

    if (req.method === 'POST' && req.url === '/api/search') {
      const body = await readBody(req);
      if (!body || !String(body.query || '').trim()) return json(res, 400, { error: 'query is required.' });
      const query = String(body.query);
      const role = body.role;
      const ownerId = body.ownerId;

      const { embedding } = await generateEmbedding(query);
      const docs = db('list_documents', role === 'admin' ? {} : { ownerId }).documents || [];

      const scored = docs
        .map((d) => ({ ...d, score: cosine(embedding, d.summaryEmbedding?.vector || []) }))
        .filter((d) => d.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      return json(res, 200, { documents: scored });
    }

    return json(res, 404, { error: 'API route not found.' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Server error' });
  }
}

try { db('init'); } catch (e) { console.error('DB init failed', e); }
loadEnv();

const server = createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) return void handleApi(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  json(res, 405, { error: 'Method not allowed.' });
});

server.listen(port, '0.0.0.0', () => console.log(`DocuSphere running at http://0.0.0.0:${port}`));
