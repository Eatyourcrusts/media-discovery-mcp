// server.js - Complete SSE-Compliant MCP Server for Render with 524 Fix
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Initialize clients
const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  process.env.SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cache-Control'],
  credentials: false
}));

app.use(express.json());

// Cosine similarity
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --- Semantic search functions ---
async function semanticSearchCompanies(query, limit = 5) {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
    dimensions: 1536
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: companies, error } = await supabase
    .from('companies_searchable')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1000);
  if (error) throw new Error(`Supabase error: ${error.message}`);

  const results = companies
    .map(company => {
      let companyEmbedding = typeof company.embedding === 'string'
        ? JSON.parse(company.embedding)
        : company.embedding;
      if (!Array.isArray(companyEmbedding)) return null;
      const similarity = cosineSimilarity(queryEmbedding, companyEmbedding);
      return { ...company, similarity };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(company => ({
      id: company.id,
      business_name: company.business_name,
      description: company.description?.substring(0, 200) + '...',
      website: company.website,
      media_categories: company.media_categories?.slice(0, 3) || [],
      similarity_score: parseFloat(company.similarity.toFixed(4)),
      match_strength: company.similarity > 0.6 ? 'high' :
        company.similarity > 0.4 ? 'medium' : 'low'
    }));

  return {
    query,
    search_type: "semantic_similarity",
    total_evaluated: companies.length,
    results,
    top_similarity: results.length > 0 ? results[0].similarity_score : 0
  };
}

async function semanticSearchAdFormats(query, limit = 5) {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
    dimensions: 1536
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: formats, error } = await supabase
    .from('ad_formats_searchable')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1000);
  if (error) throw new Error(`Supabase error: ${error.message}`);

  const results = formats
    .map(format => {
      let formatEmbedding = typeof format.embedding === 'string'
        ? JSON.parse(format.embedding)
        : format.embedding;
      if (!Array.isArray(formatEmbedding)) return null;
      const similarity = cosineSimilarity(queryEmbedding, formatEmbedding);
      return { ...format, similarity };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(format => ({
      id: format.id,
      format_name: format.format_name,
      company_name: format.company_name,
      description: format.description?.substring(0, 200) + '...',
      media_categories: format.media_categories?.slice(0, 3) || [],
      campaign_kpis: format.campaign_kpis?.slice(0, 3) || [],
      similarity_score: parseFloat(format.similarity.toFixed(4)),
      match_strength: format.similarity > 0.6 ? 'high' :
        format.similarity > 0.4 ? 'medium' : 'low'
    }));

  return {
    query,
    search_type: "semantic_similarity",
    total_evaluated: formats.length,
    results,
    top_similarity: results.length > 0 ? results[0].similarity_score : 0
  };
}

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'MCP Server Running on Render',
    timestamp: new Date().toISOString(),
    tools: ['semantic_search_companies', 'semantic_search_ad_formats'],
    protocol: 'SSE MCP Compliant'
  });
});

// --- API endpoints ---
app.post('/api/search-formats', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    const result = await semanticSearchAdFormats(query, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search-companies', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    const result = await semanticSearchCompanies(query, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main MCP endpoint — JSON for UI/probes, short SSE for discovery, long for POST
app.all('/mcp', async (req, res) => {
  console.log(`🌐 MCP Request: ${req.method} ${req.url}`);
  console.log(`📝 Accept: ${req.get('Accept')}`);

  // Shared tool definitions
  const toolsArray = [
    {
      name: 'semantic_search_companies',
      description: 'Search for media companies and advertising agencies using semantic similarity',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query for companies' },
          limit: { type: 'number', description: 'Maximum number of results to return', default: 5 }
        },
        required: ['query']
      }
    },
    {
      name: 'semantic_search_ad_formats',
      description: 'Search for advertising formats and products using semantic similarity',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query for ad formats' },
          limit: { type: 'number', description: 'Maximum number of results to return', default: 5 }
        },
        required: ['query']
      }
    }
  ];

  // Preflight/HEAD: return fast (prevents 524s)
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

  // ---------- Non-SSE JSON mode (UI config & non-stream clients) ----------
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
            result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
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
    // 👇 Important: tell proxies NOT to compress/transform SSE
    'Cache-Control': 'no-transform, no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',   // nginx no buffering
    'Vary': 'Accept',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    console.log(`📡 Sending SSE event: ${type}`);
  };

  // Handshake + tools
  sendEvent('server-info', {
    protocol: 'mcp',
    version: '2024-11-05',
    capabilities: { tools: {}, resources: {}, prompts: {} },
    serverInfo: { name: 'Media Discovery MCP Server', version: '1.0.0' }
  });
  sendEvent('tools', toolsArray);
  sendEvent('tools-list', { tools: toolsArray });

  // For GET discovery, CLOSE after sending (lets n8n proceed)
  if (req.method === 'GET') {
    setTimeout(() => { try { res.end(); } catch {} }, 50);
    return;
  }

  // POST over SSE (long-lived tool session)
  let requestData = '';
  req.on('data', c => { requestData += c.toString(); });
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
            result: { content: [{ type: 'text', text: JSON.stringify({ error: `Missing 'query' for tool '${name}'` }, null, 2) }] }
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
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        });
      }
    } catch (e) {
      sendEvent('error', { error: { code: 500, message: e.message || String(e) } });
    }
  });

  // Keepalive only needed for long POST sessions
  const keepalive = setInterval(() => {
    try { sendEvent('ping', { ts: Date.now() }); } catch {}
  }, 25000);
  req.on('close', () => clearInterval(keepalive));
});


// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MCP Server running on port ${port}`);
  console.log(`📡 SSE endpoint: http://localhost:${port}/mcp`);
});
