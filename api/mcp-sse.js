// api/mcp-sse.js - SSE-compatible MCP endpoint for n8n
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

// Semantic search for companies
async function semanticSearchCompanies(query, limit = 5) {
  try {
    // Generate query embedding
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536
    });
    const queryEmbedding = response.data[0].embedding;

    // Get companies with embeddings
    const { data: companies, error } = await supabase
      .from('companies_searchable')
      .select('*')
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    // Calculate similarity scores
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

  } catch (error) {
    throw new Error(`Companies search failed: ${error.message}`);
  }
}

// Semantic search for ad formats
async function semanticSearchAdFormats(query, limit = 5) {
  try {
    // Generate query embedding
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536
    });
    const queryEmbedding = response.data[0].embedding;

    // Get ad formats with embeddings
    const { data: formats, error } = await supabase
      .from('ad_formats_searchable')
      .select('*')
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    // Calculate similarity scores
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

  } catch (error) {
    throw new Error(`Ad formats search failed: ${error.message}`);
  }
}

module.exports = async (req, res) => {
  // Handle initial GET request for tool discovery
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.json([
      {
        name: "semantic_search_companies",
        description: "Use this tool to find media companies and advertising agencies using semantic search.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find companies."
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return.",
              default: 5
            }
          },
          required: ["query"]
        }
      },
      {
        name: "semantic_search_ad_formats",
        description: "Use this tool to find specific advertising formats using semantic search.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string", 
              description: "The search query to find ad formats."
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return.",
              default: 5
            }
          },
          required: ["query"]
        }
      }
    ]);
    return;
  }

  // Set SSE headers for POST requests
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  console.log('SSE MCP Connection established');

  // Helper to send SSE events
  const sendEvent = (data) => {
    const eventData = `data: ${JSON.stringify(data)}\n\n`;
    res.write(eventData);
  };

  // Send initial tool list via SSE
  sendEvent([
    {
      name: "semantic_search_companies",
      description: "Use this tool to find media companies and advertising agencies using semantic search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query to find companies." },
          limit: { type: "number", description: "Maximum number of results.", default: 5 }
        },
        required: ["query"]
      }
    },
    {
      name: "semantic_search_ad_formats", 
      description: "Use this tool to find specific advertising formats using semantic search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query to find ad formats." },
          limit: { type: "number", description: "Maximum number of results.", default: 5 }
        },
        required: ["query"]
      }
    }
  ]);

  // Handle incoming messages from request body
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        console.log('Received tool call:', request);

        // Handle tool execution
        if (request.tool && request.input) {
          let result;
          
          if (request.tool === 'semantic_search_companies') {
            result = await semanticSearchCompanies(request.input.query, request.input.limit || 5);
          } else if (request.tool === 'semantic_search_ad_formats') {
            result = await semanticSearchAdFormats(request.input.query, request.input.limit || 5);
          } else {
            throw new Error(`Unknown tool: ${request.tool}`);
          }

          // Send result via SSE
          sendEvent({
            result: JSON.stringify(result, null, 2)
          });
        }
      } catch (error) {
        console.error('MCP Tool Execution Error:', error);
        sendEvent({
          error: error.message
        });
      }
    });
  }

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // Cleanup on connection close
  req.on('close', () => {
    console.log('SSE MCP Connection closed');
    clearInterval(keepAlive);
  });
};
