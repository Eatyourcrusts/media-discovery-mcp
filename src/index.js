#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://nlrbtjqwjpernhtvjwrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// OpenAI configuration for embeddings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

class MediaDiscoveryServer {
  constructor() {
    this.server = new Server(
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

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "semantic_search_companies",
            description: "Search for media companies using natural language queries with semantic similarity",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural language search query (e.g., 'CTV platforms with gaming ads')"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return",
                  default: 5
                }
              },
              required: ["query"]
            }
          },
          {
            name: "semantic_search_ad_formats",
            description: "Search for advertising formats using natural language with semantic similarity",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural language search query (e.g., 'interactive gaming ad formats')"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return",
                  default: 5
                }
              },
              required: ["query"]
            }
          },
          {
            name: "hybrid_search",
            description: "Advanced search combining companies and ad formats",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query to process"
                },
                limit: {
                  type: "number",
                  description: "Max results per category",
                  default: 3
                }
              },
              required: ["query"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "semantic_search_companies":
            return await this.semanticSearchCompanies(args);
          case "semantic_search_ad_formats":
            return await this.semanticSearchAdFormats(args);
          case "hybrid_search":
            return await this.hybridSearch(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${error.message}`
            }
          ],
          isError: true,
        };
      }
    });
  }

  async generateEmbedding(text) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text
        })
      });

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async semanticSearchCompanies(args) {
    const { query, limit = 5 } = args;
    
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Use companies_searchable view (working) with correct column names
      const { data: companies, error } = await supabase
        .from('companies_searchable')
        .select(`
          id,
          business_name,
          business_bio_long,
          business_type,
          website_url,
          media_categories,
          audience_targeting,
          searchable_text,
          embedding
        `)
        .limit(limit * 2);

      if (error) throw error;

      const companiesWithSimilarity = companies
        .map(company => ({
          ...company,
          similarity: this.cosineSimilarity(queryEmbedding, company.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: query,
              results: companiesWithSimilarity.map(company => ({
                id: company.id,
                business_name: company.business_name,
                description: company.business_bio_long,
                business_type: company.business_type,
                website: company.website_url,
                media_categories: company.media_categories,
                audience_targeting: company.audience_targeting,
                similarity_score: company.similarity.toFixed(3),
                match_strength: company.similarity > 0.8 ? 'high' : 
                               company.similarity > 0.6 ? 'medium' : 'low'
              })),
              total_results: companiesWithSimilarity.length
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      throw new Error(`Semantic company search failed: ${error.message}`);
    }
  }

  async semanticSearchAdFormats(args) {
    const { query, limit = 5 } = args;

    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Use direct ad_formats table since searchable view is empty
      const { data: formats, error } = await supabase
        .from('ad_formats')
        .select(`
          id,
          name,
          description,
          company_id,
          inventory_scale,
          minimum_spend_usd,
          geographic_availability,
          searchable_text,
          embedding
        `)
        .limit(limit * 2);

      if (error) throw error;

      const formatsWithSimilarity = formats
        .map(format => ({
          ...format,
          similarity: this.cosineSimilarity(queryEmbedding, format.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: query,
              results: formatsWithSimilarity.map(format => ({
                id: format.id,
                format_name: format.name,
                description: format.description,
                inventory_scale: format.inventory_scale,
                minimum_spend_usd: format.minimum_spend_usd,
                geographic_availability: format.geographic_availability,
                similarity_score: format.similarity.toFixed(3),
                match_strength: format.similarity > 0.8 ? 'high' : 
                               format.similarity > 0.6 ? 'medium' : 'low'
              })),
              total_results: formatsWithSimilarity.length
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      throw new Error(`Semantic ad format search failed: ${error.message}`);
    }
  }

  async hybridSearch(args) {
    const { query, limit = 3 } = args;

    try {
      const results = {
        query: query,
        companies: [],
        ad_formats: []
      };

      // Search companies
      const companyResults = await this.semanticSearchCompanies({ query, limit });
      const companyData = JSON.parse(companyResults.content[0].text);
      results.companies = companyData.results;

      // Search ad formats  
      const formatResults = await this.semanticSearchAdFormats({ query, limit });
      const formatData = JSON.parse(formatResults.content[0].text);
      results.ad_formats = formatData.results;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };

    } catch (error) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Media Discovery MCP server running on stdio");
  }
}

const server = new MediaDiscoveryServer();
server.run().catch(console.error);
