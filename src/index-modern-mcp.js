// ~/media-discovery-mcp/src/index-modern-mcp.js
// Modern MCP server using McpServer class with proper transports

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { z } = require('zod');

// Environment variables
const supabaseUrl = 'https://nlrbtjqwjpernhtvjwrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94';
const openaiApiKey = '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';

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

class MediaDiscoveryService {
  constructor() {
    console.error('🎯 MediaDiscoveryService initialized');
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
  async semanticSearchCompanies(query, limit = 5) {
    try {
      console.error(`🔍 Semantic company search: "${query}"`);

      const queryEmbedding = await this.generateEmbedding(query);

      const { data: companies, error } = await supabase
        .from('companies_searchable')
        .select('*')
        .not('embedding', 'is', null)
        .limit(1000);

      if (error) throw new Error(`Supabase error: ${error.message}`);

      console.error(`📊 Retrieved ${companies.length} companies with embeddings`);

      const companiesWithSimilarity = companies
        .map(company => {
          try {
            let companyEmbedding = company.embedding;
            if (typeof companyEmbedding === 'string') {
              companyEmbedding = JSON.parse(companyEmbedding);
            }

            if (!Array.isArray(companyEmbedding)) return null;

            const similarity = this.cosineSimilarity(queryEmbedding, companyEmbedding);
            return { ...company, similarity };
          } catch (error) {
            console.error(`Error processing ${company.business_name}:`, error);
            return null;
          }
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
          campaign_kpis: company.campaign_kpis?.slice(0, 3) || [],
          total_relationships: company.total_relationships || 0,
          similarity_score: parseFloat(company.similarity.toFixed(4)),
          match_strength: company.similarity > 0.6 ? 'high' : 
                         company.similarity > 0.4 ? 'medium' : 'low'
        }));

      return {
        query,
        search_type: "semantic_similarity",
        total_evaluated: companies.length,
        results: companiesWithSimilarity,
        top_similarity: companiesWithSimilarity.length > 0 ? companiesWithSimilarity[0].similarity_score : 0
      };
    } catch (error) {
      console.error('Semantic company search failed:', error);
      throw error;
    }
  }

  // Semantic search for ad formats
  async semanticSearchAdFormats(query, limit = 5) {
    try {
      console.error(`🎨 Semantic ad format search: "${query}"`);

      const queryEmbedding = await this.generateEmbedding(query);

      const { data: formats, error } = await supabase
        .from('ad_formats_searchable')
        .select('*')
        .not('embedding', 'is', null)
        .limit(1000);

      if (error) throw new Error(`Supabase error: ${error.message}`);

      console.error(`📊 Retrieved ${formats.length} ad formats with embeddings`);

      const formatsWithSimilarity = formats
        .map(format => {
          try {
            let formatEmbedding = format.embedding;
            if (typeof formatEmbedding === 'string') {
              formatEmbedding = JSON.parse(formatEmbedding);
            }

            if (!Array.isArray(formatEmbedding)) return null;

            const similarity = this.cosineSimilarity(queryEmbedding, formatEmbedding);
            return { ...format, similarity };
          } catch (error) {
            console.error(`Error processing ${format.format_name}:`, error);
            return null;
          }
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
          total_relationships: format.total_relationships || 0,
          similarity_score: parseFloat(format.similarity.toFixed(4)),
          match_strength: format.similarity > 0.6 ? 'high' : 
                         format.similarity > 0.4 ? 'medium' : 'low'
        }));

      return {
        query,
        search_type: "semantic_similarity",
        total_evaluated: formats.length,
        results: formatsWithSimilarity,
        top_similarity: formatsWithSimilarity.length > 0 ? formatsWithSimilarity[0].similarity_score : 0
      };
    } catch (error) {
      console.error('Semantic ad format search failed:', error);
      throw error;
    }
  }
}

// Create the modern MCP server
async function createMCPServer() {
  const server = new McpServer({
    name: "media-discovery-server",
    version: "1.0.0"
  });

  const discoveryService = new MediaDiscoveryService();

  // Register semantic search tools using modern API
  server.tool("semantic_search_companies", {
    query: z.string().describe("Natural language search query for companies"),
    limit: z.number().default(5).describe("Maximum number of results to return")
  }, async ({ query, limit }) => {
    const result = await discoveryService.semanticSearchCompanies(query, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  });

  server.tool("semantic_search_ad_formats", {
    query: z.string().describe("Natural language search query for ad formats"),
    limit: z.number().default(5).describe("Maximum number of results to return")
  }, async ({ query, limit }) => {
    const result = await discoveryService.semanticSearchAdFormats(query, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  });

  return server;
}

// Main execution
async function main() {
  const server = await createMCPServer();
  const transportMode = process.env.MCP_TRANSPORT || 'stdio';
  
  if (transportMode === 'http') {
    console.error('🌐 Starting HTTP bridge for n8n integration');
    
    const discoveryService = new MediaDiscoveryService();
    const app = express();
    app.use(express.json());
    
    // Enable CORS
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
    
    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'Modern MCP Bridge Running',
        timestamp: new Date().toISOString(),
        tools: ['semantic_search_companies', 'semantic_search_ad_formats']
      });
    });

    // HTTP endpoints for n8n
    app.post('/search/companies', async (req, res) => {
      try {
        const { query, limit = 5 } = req.body;
        const result = await discoveryService.semanticSearchCompanies(query, limit);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/search/formats', async (req, res) => {
      try {
        const { query, limit = 5 } = req.body;
        const result = await discoveryService.semanticSearchAdFormats(query, limit);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.error(`🔗 HTTP Bridge running on http://localhost:${PORT}`);
      console.error(`❤️ Health check: http://localhost:${PORT}/health`);
    });
    
  } else {
    console.error('🚀 Starting MCP Server in stdio mode');
    
    // Use stdio transport for testing
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Export for Vercel
module.exports = async (req, res) => {
  const discoveryService = new MediaDiscoveryService();
  
  // Health check
  if (req.url === '/health') {
    return res.json({ 
      status: 'MCP Server Running on Vercel',
      timestamp: new Date().toISOString(),
      tools: ['semantic_search_companies', 'semantic_search_ad_formats']
    });
  }
  
  // Search companies
  if (req.url === '/search/companies' && req.method === 'POST') {
    try {
      const { query, limit = 5 } = req.body;
      const result = await discoveryService.semanticSearchCompanies(query, limit);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Search formats
  if (req.url === '/search/formats' && req.method === 'POST') {
    try {
      const { query, limit = 5 } = req.body;
      const result = await discoveryService.semanticSearchAdFormats(query, limit);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  res.status(404).json({ error: 'Endpoint not found' });
};

// For local development
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { MediaDiscoveryService };
