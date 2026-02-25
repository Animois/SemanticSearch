import { createServer } from 'http';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = normalize(join(__filename, '..'));
const root = process.cwd();
const port = Number(process.env.PORT || 4173);

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

loadEnv();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

async function handleEmbedding(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
    return;
  }

  const summary = String(parsed.summary || '').trim();
  if (!summary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'summary is required.' }));
    return;
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing GITHUB_TOKEN in .env.' }));
    return;
  }

  const model = process.env.EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const endpoint = process.env.GITHUB_EMBEDDINGS_URL?.trim() || 'https://models.inference.ai.azure.com/embeddings';

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        input: summary,
        model
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: data?.error?.message || 'Embedding generation failed.' }));
      return;
    }

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid embedding response from model endpoint.' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ embedding, model }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Embedding request failed: ${error.message}` }));
  }
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = normalize(join(root, urlPath));
  if (!safePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(safePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = extname(safePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
  createReadStream(safePath).pipe(res);
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/embeddings') {
    handleEmbedding(req, res);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed.' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`DocuSphere running at http://0.0.0.0:${port}`);
});
