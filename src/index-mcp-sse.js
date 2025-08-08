// ~/media-discovery-mcp/src/index-mcp-sse.js
// Standards-compliant MCP server with Streamable HTTP support for n8n

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

// Environment variables
const supabaseUrl = 'https://nlrbtjqwjpernhtvjwrl.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94';
const openaiApiKey = process.env.OPENAI_API_KEY;

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

class MediaDiscoveryServer {
  constructor() {
    console.error('🎯 MediaDiscoveryServer initialized for MCP');
  }

  // Cosine similarity calculation
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Generate embeddings using OpenAI
  async generateEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  // Semantic search for companies
  async semanticSearchCompanies(args) {
    const { query, limit = 5 } = args;

    try {
      console.error(`🔍 Semantic company search: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Get companies with embeddings
      const { data: companies, error } = await supabase
        .from('companies_searchable')
        .select('*')
        .not('embedding', 'is', null)
        .limit(1000);

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }

      console.error(`📊 Retrieved ${companies.length} companies with embeddings`);

      // Calculate similarity scores
      const companiesWithSimilarity = companies
        .map(company => {
          try {
            let companyEmbedding = company.embedding;
            if (typeof companyEmbedding === 'string') {
              companyEmbedding = JSON.parse(companyEmbedding);
            }

            if (!Array.isArray(companyEmbedding)) {
              console.error(`Invalid embedding for ${company.business_name}`);
              return null;
            }

            const similarity = this.cosineSimilarity(queryEmbedding, companyEmbedding);

            return {
              ...company,
              similarity: similarity
            };
          } catch (error) {
            console.error(`Error processing ${company.business_name}:`, error);
            return null;
          }
        })
        .filter(company => company !== null)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(company => ({
          id: company.id,
          business_name: company.business_name,
          description: company.description?.substring(0, 200) + '...',
          website: company.website,
          media_categories: company.media_categories?.slice(0, 3) || [],
          campaign_kpis: company.campaign_kpis?.slice(0, 3) || [],
          total_relationships: company.total_relationships || 0,
          similarity_score: parseFloat(company.similarity.toFixed(4)),
          match_strength: company.similarity > 0.6 ? 'high' : 
                         company.similarity > 0.4 ? 'medium' : 'low'
        }));

      return {
        query: query,
        search_type: "semantic_similarity",
        total_evaluated: companies.length,
        results: companiesWithSimilarity,
        top_similarity: companiesWithSimilarity.length > 0 ? companiesWithSimilarity[0].similarity_score : 0
      };

    } catch (error) {
      console.error('Semantic company search failed:', error);
      throw new Error(`Semantic company search failed: ${error.message}`);
    }
  }

  // Semantic search for ad formats
  async semanticSearchAdFormats(args) {
    const { query, limit = 5 } = args;

    try {
      console.error(`🎨 Semantic ad format search: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Get ad formats with embeddings
      const { data: formats, error } = await supabase
        .from('ad_formats_searchable')
        .select('*')
        .not('embedding', 'is', null)
        .limit(1000);

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }

      console.error(`📊 Retrieved ${formats.length} ad formats with embeddings`);

      // Calculate similarity scores
      const formatsWithSimilarity = formats
        .map(format => {
          try {
            let formatEmbedding = format.embedding;
            if (typeof formatEmbedding === 'string') {
              formatEmbedding = JSON.parse(formatEmbedding);
            }

            if (!Array.isArray(formatEmbedding)) {
              console.error(`Invalid embedding for ${format.format_name}`);
              return null;
            }

            const similarity = this.cosineSimilarity(queryEmbedding, formatEmbedding);

            return {
              ...format,
              similarity: similarity
            };
          } catch (error) {
            console.error(`Error processing ${format.format_name}:`, error);
            return null;
          }
        })
        .filter(format => format !== null)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(format => ({
          id: format.id,
          format_name: format.format_name,
          company_name: format.company_name,
          description: format.description?.substring(0, 200) + '...',
          media_categories: format.media_categories?.slice(0, 3) || [],
          campaign_kpis: format.campaign_kpis?.slice(0, 3) || [],
          total_relationships: format.total_relationships || 0,
          similarity_score: parseFloat(format.similarity.toFixed(4)),
          match_strength: format.similarity > 0.6 ? 'high' : 
                         format.similarity > 0.4 ? 'medium' : 'low'
        }));

      return {
        query: query,
        search_type: "semantic_similarity", 
        total_evaluated: formats.length,
        results: formatsWithSimilarity,
        top_similarity: formatsWithSimilarity.length > 0 ? formatsWithSimilarity[0].similarity_score : 0
      };

    } catch (error) {
      console.error('Semantic ad format search failed:', error);
      throw new Error(`Semantic ad format search failed: ${error.message}`);
    }
  }
}

// Create MCP Server with proper protocol compliance
async function createMCPServer() {
  const server = new Server(
    {
      name: "media-discovery-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const discoveryService = new MediaDiscoveryServer();

  // Register available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "semantic_search_companies",
          description: "Search for media companies and advertising agencies using semantic similarity. Returns companies ranked by relevance to the search query.",
          inputSchema: {
            type: "object",
            properties: {
              query: { 
                type: "string", 
                description: "Natural language search query for companies (e.g., 'CTV streaming platforms', 'performance marketing agencies')" 
              },
              limit: { 
                type: "number", 
                description: "Maximum number of results to return",
                minimum: 1,
                maximum: 20,
                default: 5 
              }
            },
            required: ["query"]
          }
        },
        {
          name: "semantic_search_ad_formats",
          description: "Search for advertising formats and products using semantic similarity. Returns ad formats ranked by relevance to the search query.",
          inputSchema: {
            type: "object", 
            properties: {
              query: { 
                type: "string", 
                description: "Natural language search query for ad formats (e.g., 'interactive gaming ads', 'native video formats')" 
              },
              limit: { 
                type: "number", 
                description: "Maximum number of results to return",
                minimum: 1,
                maximum: 20, 
                default: 5 
              }
            },
            required: ["query"]
          }
        }
      ]
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      let result;
      switch (name) {
        case "semantic_search_companies":
          result = await discoveryService.semanticSearchCompanies(args);
          break;
        case "semantic_search_ad_formats":
          result = await discoveryService.semanticSearchAdFormats(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error(`Tool execution failed: ${error.message}`);
      return {
        content: [
          {
            type: "text", 
            text: JSON.stringify({
              error: true,
              message: error.message,
              query: args.query || "unknown"
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

// Main execution function
async function main() {
  const server = await createMCPServer();
  
  // Determine transport mode
  const transportMode = process.env.MCP_TRANSPORT || 'stdio';
  
  if (transportMode === 'http') {
    console.error('🌐 Starting MCP Server in Streamable HTTP mode for n8n integration');
    
    // Create Express app for Streamable HTTP transport
    const app = express();
    app.use(express.json());
    
    // Enable CORS for n8n
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Store transports by session ID
    const transports = {};
    
    // Handle MCP requests
    app.post('/mcp', async (req, res) => {
      try {
        let transport;
        const sessionId = req.headers['mcp-session-id'];
        
        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else {
          // Create new transport
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          });
          
          // Store transport
          transports[transport.sessionId] = transport;
          
          // Connect server to transport
          await server.connect(transport);
        }
        
        // Handle the request
        await transport.handleMessage(req, res);
        
      } catch (error) {
        console.error('Error handling MCP request:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'MCP Server Running',
        mode: 'Streamable HTTP',
        timestamp: new Date().toISOString(),
        tools: ['semantic_search_companies', 'semantic_search_ad_formats'],
        endpoint: '/mcp'
      });
    });
    
    const PORT = process.env.PORT || 3001;
    
    app.listen(PORT, () => {
      console.error(`🔗 MCP Server running on http://localhost:${PORT}`);
      console.error(`📡 Streamable HTTP endpoint: http://localhost:${PORT}/mcp`);
      console.error(`❤️ Health check: http://localhost:${PORT}/health`);
    });
    
  } else {
    console.error('🚀 Starting MCP Server in stdio mode for testing');
    
    // Default stdio transport for command line testing
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}

module.exports = { MediaDiscoveryServer, createMCPServer };
