// server.js — SSE-compatible MCP server for n8n (Render-ready)
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// ---- Clients ----
const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  process.env.SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Middleware ----
// IMPORTANT: Do NOT enable compression on /mcp; SSE must not be compressed.
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cache-Control'],
}));
app.use(express.json()); // keeps JSON POST simple for non-SSE mode

// ---- Utils ----
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---- Semantic search: Companies ----
async function semanticSearchCompanies(query, limit = 5) {
  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });
  const qv = emb.data[0].embedding;

  const { data: companies, error } = await supabase
    .from('companies_searchable')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1000);
  if (error) throw new Error(`Supabase error: ${error.message}`);

  const results = companies
    .map((c) => {
      let ev = typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding;
      if (!Array.isArray(ev) || ev.length !== 1536) return null;
      const sim = cosineSimilarity(qv, ev);
      return { ...c, similarity: sim };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      business_name: c.business_name,
      description: (c.description || '').substring(0, 200) + '...',
      website: c.website,
      media_categories: c.media_categories?.slice(0, 3) || [],
      similarity_score: Number(c.similarity.toFixed(4)),
      match_strength: c.similarity > 0.6 ? 'high' : c.similarity > 0.4 ? 'medium' : 'low',
    }));

  return {
    query,
    search_type: 'semantic_similarity',
    total_evaluated: companies.length,
    results,
    top_similarity: results[0]?.similarity_score || 0,
  };
}

// ---- Semantic search: Ad Formats ----
async function semanticSearchAdFormats(query, limit = 5) {
  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });
  const qv = emb.data[0].embedding;

  const { data: formats, error } = await supabase
    .from('ad_formats_searchable')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1000);
  if (error) throw new Error(`Supabase error: ${error.message}`);

  const results = formats
    .map((f) => {
      let ev = typeof f.embedding === 'string' ? JSON.parse(f.embedding) : f.embedding;
      if (!Array.isArray(ev) || ev.length !== 1536) return null;
      const sim = cosineSimilarity(qv, ev);
      return { ...f, similarity: sim };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((f) => ({
      id: f.id,
      format_name: f.format_name,
      company_name: f.company_name,
      description: (f.description || '').substring(0, 200) + '...',
      media_categories: f.media_categories?.slice(0, 3) || [],
      campaign_kpis: f.campaign_kpis?.slice(0, 3) || [],
      similarity_score: Number(f.similarity.toFixed(4)),
      match_strength: f.similarity > 0.6 ? 'high' : f.similarity > 0.4 ? 'medium' : 'low',
    }));

  return {
    query,
    search_type: 'semantic_similarity',
    total_evaluated: formats.length,
    results,
    top_similarity: results[0]?.similarity_score || 0,
  };
}

// ---- Health ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    tools: ['semantic_search_companies', 'semantic_search_ad_formats'],
    protocol: 'mcp',
  });
});

// ---- Optional plain JSON APIs ----
app.post('/api/search-companies', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    const out = await semanticSearchCompanies(query, limit);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});
app.post('/api/search-formats', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    const out = await semanticSearchAdFormats(query, limit);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ---- MCP endpoint (dual mode) ----
app.all('/mcp', async (req, res) => {
  console.log(`🌐 MCP ${req.method} /mcp`);
  const toolsArray = [
    {
      name: 'semantic_search_companies',
      description: 'Search for media companies and advertising agencies using semantic similarity',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query for companies' },
          limit: { type: 'number', description: 'Maximum number of results to return', default: 5 },
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
          limit: { type: 'number', description: 'Maximum number of results to return', default: 5 },
        },
        required: ['query'],
      },
    },
  ];

  // Preflight: return fast
  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Cache-Control',
      'Cache-Control': 'no-cache',
      'Vary': 'Accept',
    });
    return res.status(204).end();
  }

  const accept = (req.get('Accept') || '').toLowerCase();
  const wantsSSE = accept.includes('text/event-stream');

  // ---------- Non-SSE JSON mode (UI/probes & simple clients) ----------
  if (!wantsSSE) {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'Vary': 'Accept',
    });

    if (req.method === 'GET') {
      return res.status(200).json({ tools: toolsArray });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (!body || typeof body !== 'object') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { method, params, id } = body || {};

      if (method === 'tools/list') {
        return res.status(200).json({ id: id ?? null, tools: toolsArray });
      }

      if (method === 'tools/call' && params?.name) {
        const { name, arguments: args = {} } = params;
        const q = (args.query ?? '').trim();
        if (!q) {
          return res.status(400).json({ id: id ?? null, error: { code: 400, message: `Missing 'query' for tool '${name}'` } });
        }
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

  // ---------- SSE mode ----------
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-transform, no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'X-Accel-Buffering': 'no',
  'Vary': 'Accept',
});
if (typeof res.flushHeaders === 'function') res.flushHeaders();

let open = true;
const sendEvent = (type, data) => {
  if (!open) return;
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // optional: res.write(`retry: 30000\n\n`); // hint client reconnect delay
  console.log(`📡 SSE -> ${type}`);
};

// Handshake + tool discovery
sendEvent('server-info', {
  protocol: 'mcp',
  version: '2024-11-05',
  capabilities: { tools: {}, resources: {}, prompts: {} },
  serverInfo: { name: 'Media Discovery MCP Server', version: '1.0.0' },
});
sendEvent('tools', toolsArray);
sendEvent('tools-list', { tools: toolsArray });
// Also emit a "ready" hint (some clients like it)
sendEvent('ready', { ok: true });

// Do NOT end the stream for GET; keep it open.
// n8n MCP Client expects a persistent SSE connection.

let requestData = '';
if (req.method === 'POST') {
  req.on('data', (c) => (requestData += c.toString()));
  req.on('end', async () => {
    if (!requestData.trim()) return;
    try {
      const { method, params, id } = JSON.parse(requestData);
      if (method === 'tools/call') {
        const { name, arguments: args = {} } = params || {};
        const q = (args.query ?? '').trim();
        if (!q) {
          return sendEvent('tool-result', {
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
          return sendEvent('error', { error: { code: 404, message: `Unknown tool: ${name}` } });
        }
        return sendEvent('tool-result', {
          requestId: id ?? null,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        });
      }
    } catch (e) {
      sendEvent('error', { error: { code: 500, message: e.message || String(e) } });
    }
  });
}

// Keepalive for ALL SSE connections (GET and POST)
const keepalive = setInterval(() => {
  try { sendEvent('ping', { ts: Date.now() }); } catch {}
}, 25000);

req.on('close', () => { open = false; clearInterval(keepalive); });


  // Keepalive for long POST streams
  const keepalive = setInterval(() => {
    try { sendEvent('ping', { ts: Date.now() }); } catch {}
  }, 25000);
  req.on('close', () => clearInterval(keepalive));
});

// ---- Start ----
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MCP Server running on port ${port}`);
  console.log(`📡 SSE endpoint: http://localhost:${port}/mcp`);
});
