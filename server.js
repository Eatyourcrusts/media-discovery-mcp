// server.js - Complete SSE-Compliant MCP Server for Render
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

// CORS configuration for SSE
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cache-Control'],
  credentials: false
}));

app.use(express.json());

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
    
    // Generate query embedding with debug logging
    console.log('🤖 Generating company embedding...');
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log(`✅ Company embedding generated, dimensions: ${queryEmbedding.length}`);

    // Get companies with embeddings
    console.log('🗄️ Querying companies database...');
    const { data: companies, error } = await supabase
      .from('companies_searchable')
      .select('*')
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) {
      console.error('❌ Companies Supabase error:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    console.log(`📊 Companies database returned ${companies.length} companies`);

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
    
    // Generate query embedding with debug logging
    console.log('🤖 Generating ad formats embedding...');
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log(`✅ Ad formats embedding generated, dimensions: ${queryEmbedding.length}`);

    // Get ad formats with embeddings
    console.log('🗄️ Querying ad formats database...');
    const { data: formats, error } = await supabase
      .from('ad_formats_searchable')
      .select('*')
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) {
      console.error('❌ Ad formats Supabase error:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    console.log(`📊 Ad formats database returned ${formats.length} formats`);

    // Calculate similarity scores with debug
    let processedCount = 0;
    let validEmbeddingCount = 0;
    
    const results = formats
      .map(format => {
        processedCount++;
        let formatEmbedding = format.embedding;
        
        if (typeof formatEmbedding === 'string') {
          try {
            formatEmbedding = JSON.parse(formatEmbedding);
          } catch (parseError) {
            console.log(`⚠️ Failed to parse embedding for format ${format.format_name}`);
            return null;
          }
        }
        
        if (!Array.isArray(formatEmbedding)) {
          console.log(`⚠️ Invalid embedding format for ${format.format_name}: ${typeof formatEmbedding}`);
          return null;
        }
        
        if (formatEmbedding.length !== 1536) {
          console.log(`⚠️ Wrong embedding dimensions for ${format.format_name}: ${formatEmbedding.length}`);
          return null;
        }

        validEmbeddingCount++;
// Debug the first format's embedding
if (processedCount === 1) {
  console.log(`🔍 Query embedding sample: [${queryEmbedding.slice(0, 5).join(', ')}...]`);
  console.log(`🔍 Format embedding sample: [${formatEmbedding.slice(0, 5).join(', ')}...]`);
  console.log(`🔍 Query embedding type: ${typeof queryEmbedding[0]}`);
  console.log(`🔍 Format embedding type: ${typeof formatEmbedding[0]}`);
}

const similarity = cosineSimilarity(queryEmbedding, formatEmbedding);

// Debug first similarity calculation
if (processedCount === 1) {
  console.log(`🔍 First similarity: ${similarity}`);
}
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

    console.log(`📊 Processed ${processedCount} formats, ${validEmbeddingCount} had valid embeddings`);
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'MCP Server Running on Render',
    timestamp: new Date().toISOString(),
    tools: ['semantic_search_companies', 'semantic_search_ad_formats'],
    protocol: 'SSE MCP Compliant'
  });
});

// Simple API endpoints for n8n HTTP requests
app.post('/api/search-formats', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    console.log(`🔍 API call: searching formats for "${query}"`);
    const result = await semanticSearchAdFormats(query, limit);
    res.json(result);
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search-companies', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    console.log(`🔍 API call: searching companies for "${query}"`);
    const result = await semanticSearchCompanies(query, limit);
    res.json(result);
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint
app.post('/api/debug', (req, res) => {
  console.log('🔍 Debug - Headers:', req.headers);
  console.log('🔍 Debug - Body:', req.body);
  console.log('🔍 Debug - Query type:', typeof req.body.query);
  console.log('🔍 Debug - Limit type:', typeof req.body.limit);
  res.json({ 
    headers: req.headers,
    body: req.body,
    received: 'debug endpoint hit'
  });
});

// Main SSE MCP endpoint
app.all('/mcp', (req, res) => {
  console.log(`🌐 MCP SSE Request: ${req.method} ${req.url}`);
  console.log(`📝 User-Agent: ${req.get('User-Agent')}`);
  console.log(`📝 Accept: ${req.get('Accept')}`);

  // Set STRICT SSE headers - exactly what n8n expects
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Cache-Control',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });

  let connectionActive = true;
  let requestData = '';

  // Helper to send SSE events with proper format
  const sendEvent = (eventType, data) => {
    if (!connectionActive) return false;
    
    try {
      const eventMessage = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      console.log(`📡 Sending SSE event: ${eventType}`);
      res.write(eventMessage);
      return true;
    } catch (error) {
      console.error('❌ Failed to send SSE event:', error);
      connectionActive = false;
      return false;
    }
  };

  // Immediate server handshake - this is what n8n looks for first
  sendEvent('server-info', {
    protocol: 'mcp',
    version: '2024-11-05',
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
    serverInfo: {
      name: 'Media Discovery MCP Server',
      version: '1.0.0'
    }
  });

  // Send tools list immediately - n8n needs this for discovery
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

  // Handle incoming POST data for tool calls
  if (req.method === 'POST') {
    req.on('data', chunk => {
      requestData += chunk.toString();
    });

    req.on('end', async () => {
      if (!requestData.trim()) return;
      
      try {
        console.log(`📨 Received tool call data: ${requestData}`);
        const request = JSON.parse(requestData);
        
        if (request.method === 'tools/call') {
          const { name, arguments: args } = request.params;
          console.log(`🔧 Executing tool: ${name} with args:`, args);
          
          let result;
          
          if (name === 'semantic_search_companies') {
            result = await semanticSearchCompanies(args.query, args.limit || 5);
          } else if (name === 'semantic_search_ad_formats') {
            result = await semanticSearchAdFormats(args.query, args.limit || 5);
          } else {
            throw new Error(`Unknown tool: ${name}`);
          }
          
          // Send tool result
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
          sendEvent('tools-list-response', {
            requestId: request.id,
            tools: [
              {
                name: 'semantic_search_companies',
                description: 'Search for media companies and advertising agencies using semantic similarity'
              },
              {
                name: 'semantic_search_ad_formats',
                description: 'Search for advertising formats and products using semantic similarity'
              }
            ]
          });
        }
        
      } catch (error) {
        console.error('❌ Tool execution error:', error);
        sendEvent('error', {
          error: {
            code: -1,
            message: error.message
          }
        });
      }
    });
  }

  // Heartbeat to keep connection alive - every 15 seconds
  const heartbeat = setInterval(() => {
    if (!connectionActive) {
      clearInterval(heartbeat);
      return;
    }
    
    if (!sendEvent('heartbeat', { timestamp: new Date().toISOString() })) {
      clearInterval(heartbeat);
    }
  }, 15000);

  // Handle connection close
  req.on('close', () => {
    console.log('🔌 MCP SSE connection closed by client');
    connectionActive = false;
    clearInterval(heartbeat);
  });

  req.on('error', (error) => {
    console.error('❌ MCP SSE connection error:', error);
    connectionActive = false;
    clearInterval(heartbeat);
  });

  // Handle server shutdown
  req.on('aborted', () => {
    console.log('⚠️ MCP SSE connection aborted');
    connectionActive = false;
    clearInterval(heartbeat);
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MCP Server running on port ${port}`);
  console.log(`📡 SSE endpoint: http://localhost:${port}/mcp`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});
