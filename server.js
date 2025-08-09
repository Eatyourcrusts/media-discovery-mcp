// server.js — n8n-friendly MCP server (Render/Cloudflare safe)
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

/* ========= Dependencies (lazy) ========= */
const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  process.env.SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ========= Middleware ========= */
// DO NOT enable compression on /mcp (SSE must be uncompressed)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cache-Control', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

/* ========= Helpers ========= */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedding(text) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return r.data[0].embedding;
}

/* ========= Business tools ========= */
async function semanticSearchCompanies(query, limit = 5) {
  const qv = await embedding(query);
  const { data, error } = await supabase
    .from('companies_searchable')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1000);
  if (error) throw new Error(error.message);

  const results = (data || [])
    .map((c) => {
      let v = typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding;
      if (!Array.isArray(v) || v.length !== 1536) return null;
      return { ...c, similarity: cosineSimilarity(qv, v) };
    })
    .filter(Boolean)
    .sort((a,b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      business_name: c.business_name,
      description: (c.description || '').slice(0, 200) + '...',
      website: c.website,
      media_categories: c.media_categories?.slice(0, 3) || [],
      similarity_score: Number(c.similarity.toFixed(4)),
      match_strength: c.similarity > 0.6 ? 'high' : c.similarity > 0.4 ? 'medium' : 'low',
    }));

  return {
    query,
    search_type: 'semantic_similarity',
    total_evaluated: data?.length || 0,
    results,
    top_similarity: results[0]?.similarity_score || 0,
  };
}

async function semanticSearchAdFormats(query, limit = 5) {
  const qv = await embedding(query);
  const { data, error } = await supabase
    .from('ad_formats_searchable')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1000);
  if (error) throw new Error(error.message);

  const results = (data || [])
    .map((f) => {
      let v = typeof f.embedding === 'string' ? JSON.parse(f.embedding) : f.embedding;
      if (!Array.isArray(v) || v.length !== 1536) return null;
      return { ...f, similarity: cosineSimilarity(qv, v) };
    })
    .filter(Boolean)
    .sort((a,b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((f) => ({
      id: f.id,
      format_name: f.format_name,
      company_name: f.company_name,
      description: (f.description || '').slice(0, 200) + '...',
      media_categories: f.media_categories?.slice(0, 3) || [],
      campaign_kpis: f.campaign_kpis?.slice(0, 3) || [],
      similarity_score: Number(f.similarity.toFixed(4)),
      match_strength: f.similarity > 0.6 ? 'high' : f.similarity > 0.4 ? 'medium' : 'low',
    }));

  return {
    query,
    search_type: 'semantic_similarity',
    total_evaluated: data?.length || 0,
    results,
    top_similarity: results[0]?.similarity_score || 0,
  };
}

/* ========= Tool descriptors (MCP) ========= */
const TOOLS = [
  {
    name: 'semantic_search_companies',
    description: 'Search for media companies and advertising agencies using semantic similarity',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query for companies' },
        limit: { type: 'number', description: 'Max number of results', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'semantic_search_ad_formats',
    description: 'Search for advertising formats and products using semantic similarity',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query for ad formats' },
        limit: { type: 'number', description: 'Max number of results', default: 5 },
      },
      required: ['query'],
    },
  },
];

/* ========= Health & plain JSON APIs (optional) ========= */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), tools: TOOLS.map(t => t.name) });
});
app.post('/api/search-companies', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    res.json(await semanticSearchCompanies(query, limit));
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
});
app.post('/api/search-formats', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    res.json(await semanticSearchAdFormats(query, limit));
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
});

/* ========= MCP endpoint (persistent SSE + JSON fallback) ========= */
app.all('/mcp', async (req, res) => {
  console.log(`🌐 MCP ${req.method} /mcp | Accept=${req.get('Accept')}`);

  // Preflight/HEAD
  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Cache-Control, Authorization',
      'Cache-Control': 'no-cache',
      'Vary': 'Accept',
    });
    return res.status(204).end();
  }

  const accept = (req.get('Accept') || '').toLowerCase();
  const wantsSSE = accept.includes('text/event-stream');

  // ---------- JSON mode (used by n8n UI & some agents) ----------
  if (!wantsSSE) {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'Vary': 'Accept',
    });

    if (req.method === 'GET') {
      return res.status(200).json({ tools: TOOLS });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (!body || typeof body !== 'object') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { method, params, id } = body || {};

      if (method === 'tools/list') {
        return res.status(200).json({ id: id ?? null, tools: TOOLS });
      }

      if (method === 'tools/call' && params?.name) {
        const { name, arguments: args = {} } = params;
        const q = (args.query ?? '').trim();
        if (!q) return res.status(400).json({ id: id ?? null, error: { code: 400, message: `Missing 'query' for tool '${name}'` } });

        try {
          let result;
          if (name === 'semantic_search_companies') {
            result = await semanticSearchCompanies(q, args.limit || 5);
          } else if (name === 'semantic_search_ad_formats') {
            result = await semanticSearchAdFormats(q, args.limit || 5);
          } else {
            return res.status(404).json({ error: `Unknown tool: ${name}` });
          }
          return res.status(200).json({
            id: id ?? null,
            result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
          });
        } catch (e) {
          return res.status(500).json({ error: e.message || String(e) });
        }
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---------- SSE mode (persistent) ----------
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-transform, no-cache', // stop proxies from mangling SSE
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
    'Vary': 'Accept',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let open = true;
  const send = (type, data) => {
    if (!open) return;
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    // res.write(`retry: 30000\n\n`); // optional reconnection hint
    // console.log(`📡 SSE -> ${type}`);
  };

  // Handshake + tool discovery
  send('server-info', {
    protocol: 'mcp',
    version: '2024-11-05',
    capabilities: { tools: {}, resources: {}, prompts: {} },
    serverInfo: { name: 'Media Discovery MCP Server', version: '1.0.0' },
  });
  send('tools', TOOLS);             // array form (what n8n expects)
  send('tools-list', { tools: TOOLS }); // object form (for other clients)
  send('ready', { ok: true });

  // Accept tool calls over same SSE connection if client POSTs bodies here
  if (req.method === 'POST') {
    let buf = '';
    req.on('data', (c) => (buf += c.toString()));
    req.on('end', async () => {
      if (!buf.trim()) return;
      try {
        const { method, params, id } = JSON.parse(buf);
        if (method === 'tools/call') {
          const { name, arguments: args = {} } = params || {};
          const q = (args.query ?? '').trim();
          if (!q) {
            return send('tool-result', {
              requestId: id ?? null,
              result: { content: [{ type: 'text', text: JSON.stringify({ error: `Missing 'query' for tool '${name}'` }, null, 2) }] },
            });
          }
          let result;
          if (name === 'semantic_search_companies') {
            result = await semanticSearchCompanies(q, args.limit || 5);
          } else if (name === 'semantic_search_ad_formats') {
            result = await semanticSearchAdFormats(q, args.limit || 5);
          } else {
            return send('error', { error: { code: 404, message: `Unknown tool: ${name}` } });
          }
          return send('tool-result', {
            requestId: id ?? null,
            result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
          });
        }
      } catch (e) {
        send('error', { error: { code: 500, message: e.message || String(e) } });
      }
    });
  }

  // Keep the stream alive (n8n expects persistence)
  const ping = setInterval(() => { try { send('ping', { ts: Date.now() }); } catch {} }, 25000);
  req.on('close', () => { open = false; clearInterval(ping); });
});

/* ========= Start ========= */
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MCP Server on ${port}`);
  console.log(`📡 SSE endpoint: http://localhost:${port}/mcp`);
});
