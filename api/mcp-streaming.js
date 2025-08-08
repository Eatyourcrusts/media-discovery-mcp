// api/mcp-streaming.js - True SSE MCP Server for n8n LangChain
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
    console.log(`🔍 Searching companies for: "${query}"`);
    
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

    console.log(`✅ Found ${results.length} company matches, top similarity: ${results[0]?.similarity_score || 0}`);

    return {
      query,
      search_type: "semantic_similarity",
      total_evaluated: companies.length,
      results,
      top_similarity: results.length > 0 ? results[0].similarity_score : 0
    };

  } catch (error) {
    console.error('❌ Companies search failed:', error);
    throw new Error(`Companies search failed: ${error.message}`);
  }
}

// Semantic search for ad formats
async function semanticSearchAdFormats(query, limit = 5) {
  try {
    console.log(`🔍 Searching ad formats for: "${query}"`);
    
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

    console.log(`✅ Found ${results.length} format matches, top similarity: ${results[0]?.similarity_score || 0}`);

    return {
      query,
      search_type: "semantic_similarity",
      total_evaluated: formats.length,
      results,
      top_similarity: results.length > 0 ? results[0].similarity_score : 0
    };

  } catch (error) {
    console.error('❌ Ad formats search failed:', error);
    throw new Error(`Ad formats search failed: ${error.message}`);
  }
}

module.exports = async (req, res) => {
  console.log(`🌐 MCP SSE Request: ${req.method} ${req.url}`);
  console.log(`📝 Headers:`, req.headers);

  // Set proper SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let connectionActive = true;
  
  // Helper to send SSE events
  const sendEvent = (eventType, data) => {
    if (!connectionActive) return;
    
    const event = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    console.log(`📡 Sending SSE event: ${eventType}`);
    res.write(event);
  };

  // Send server initialization
  sendEvent('server-info', {
    protocol: 'mcp',
    version: '2024-11-05',
    capabilities: {
      tools: {},
      resources: {}
    },
    serverInfo: {
      name: 'Media Discovery MCP Server',
      version: '1.0.0'
    }
  });

  // Send available tools immediately
  sendEvent('tools-list', {
    tools: [
      {
        name: 'semantic_search_companies',
        description: 'Search for media companies and advertising agencies using semantic similarity',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query for companies'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 5
            }
          },
          required: ['query']
        }
      },
      {
        name: 'semantic_search_ad_formats',
        description: 'Search for advertising formats and products using semantic similarity',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query for ad formats'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 5
            }
          },
          required: ['query']
        }
      }
    ]
  });

  // Handle incoming data for tool calls
  let requestBody = '';
  
  req.on('data', chunk => {
    requestBody += chunk.toString();
  });

  req.on('end', async () => {
    if (!requestBody.trim()) return;
    
    try {
      console.log(`📨 Received request body: ${requestBody}`);
      const request = JSON.parse(requestBody);
      
      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        console.log(`🔧 Tool call: ${name} with args:`, args);
        
        let result;
        
        if (name === 'semantic_search_companies') {
          result = await semanticSearchCompanies(args.query, args.limit || 5);
        } else if (name === 'semantic_search_ad_formats') {
          result = await semanticSearchAdFormats(args.query, args.limit || 5);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        
        // Send tool result via SSE
        sendEvent('tool-result', {
          requestId: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        });
        
      } else if (request.method === 'tools/list') {
        // Already sent tools list on connection, but send again if requested
        sendEvent('tools-list-response', {
          requestId: request.id,
          tools: [
            {
              name: 'semantic_search_companies',
              description: 'Search for media companies and advertising agencies using semantic similarity',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query for companies' },
                  limit: { type: 'number', description: 'Max results', default: 5 }
                },
                required: ['query']
              }
            },
            {
              name: 'semantic_search_ad_formats',
              description: 'Search for advertising formats and products using semantic similarity',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query for ad formats' },
                  limit: { type: 'number', description: 'Max results', default: 5 }
                },
                required: ['query']
              }
            }
          ]
        });
      }
      
    } catch (error) {
      console.error('❌ MCP Processing Error:', error);
      sendEvent('error', {
        error: {
          code: -1,
          message: error.message
        }
      });
    }
  });

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    if (!connectionActive) {
      clearInterval(heartbeat);
      return;
    }
    sendEvent('heartbeat', { timestamp: new Date().toISOString() });
  }, 30000);

  // Handle connection close
  req.on('close', () => {
    console.log('🔌 MCP SSE connection closed');
    connectionActive = false;
    clearInterval(heartbeat);
  });

  req.on('error', (error) => {
    console.error('❌ MCP SSE connection error:', error);
    connectionActive = false;
    clearInterval(heartbeat);
  });
};
