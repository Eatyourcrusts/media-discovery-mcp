// api/mcp.js - Proper MCP Protocol Endpoint for Vercel
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Initialize clients
const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  process.env.SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cosine similarity function
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

// Media Discovery Service
class MediaDiscoveryService {
  async semanticSearchCompanies(query, limit = 5) {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536
    });
    const queryEmbedding = response.data[0].embedding;

    const { data: companies, error } = await supabase
      .from('companies_searchable')
      .select('*')
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const results = companies
      .map(company => {
        let companyEmbedding = company.embedding;
        if (typeof companyEmbedding === 'string') {
          companyEmbedding = JSON.parse(companyEmbedding);
        }
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

  async semanticSearchAdFormats(query, limit = 5) {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536
    });
    const queryEmbedding = response.data[0].embedding;

    const { data: formats, error } = await supabase
      .from('ad_formats_searchable')
      .select('*')
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const results = formats
      .map(format => {
        let formatEmbedding = format.embedding;
        if (typeof formatEmbedding === 'string') {
          formatEmbedding = JSON.parse(formatEmbedding);
        }
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
}

// MCP Protocol Handler
module.exports = async (req, res) => {
  // Enable CORS for n8n
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle SSE connection request
  if (req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initialization message
    res.write('data: {"jsonrpc": "2.0", "id": null, "method": "notifications/initialized", "params": {}}\n\n');

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write('data: {"type": "ping"}\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });

    return;
  }

  // Handle MCP JSON-RPC requests
  if (req.method === 'POST') {
    try {
      const request = req.body;
      const discoveryService = new MediaDiscoveryService();

      // Handle initialize request
      if (request.method === 'initialize') {
        return res.json({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "media-discovery-server",
              version: "1.0.0"
            }
          }
        });
      }

      // Handle tools/list request
      if (request.method === 'tools/list') {
        return res.json({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [
              {
                name: "semantic_search_companies",
                description: "Search for media companies and advertising agencies using semantic similarity",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Natural language search query for companies" },
                    limit: { type: "number", description: "Maximum number of results to return", default: 5 }
                  },
                  required: ["query"]
                }
              },
              {
                name: "semantic_search_ad_formats", 
                description: "Search for advertising formats and products using semantic similarity",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Natural language search query for ad formats" },
                    limit: { type: "number", description: "Maximum number of results to return", default: 5 }
                  },
                  required: ["query"]
                }
              }
            ]
          }
        });
      }

      // Handle tools/call request
      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        let result;

        switch (name) {
          case "semantic_search_companies":
            result = await discoveryService.semanticSearchCompanies(args.query, args.limit);
            break;
          case "semantic_search_ad_formats":
            result = await discoveryService.semanticSearchAdFormats(args.query, args.limit);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return res.json({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              { 
                type: "text", 
                text: JSON.stringify(result, null, 2) 
              }
            ]
          }
        });
      }

      // Handle notifications/initialized
      if (request.method === 'notifications/initialized') {
        return res.json({
          jsonrpc: "2.0",
          id: request.id,
          result: {}
        });
      }

      // Unknown method
      return res.status(400).json({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`
        }
      });

    } catch (error) {
      console.error('MCP request error:', error);
      return res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: error.message
        }
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
