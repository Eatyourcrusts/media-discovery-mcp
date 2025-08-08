#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nlrbtjqwjpernhtvjwrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

class MediaDiscoveryServer {
  constructor() {
    this.server = new Server(
      {
        name: "media-discovery-semantic",
        version: "2.0.0",
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
            description: "Search media companies using AI semantic similarity",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural language search query"
                },
                limit: {
                  type: "number",
                  description: "Maximum results",
                  default: 5
                }
              },
              required: ["query"]
            }
          },
          {
            name: "semantic_search_ad_formats",
            description: "Search ad formats using AI semantic similarity",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural language search query"
                },
                limit: {
                  type: "number",
                  description: "Maximum results",
                  default: 5
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
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}\n\nStack: ${error.stack}`
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

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

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
      console.error(`🔍 Semantic company search: "${query}"`);
         
      const queryEmbedding = await this.generateEmbedding(query);
 
      const { data: companies, error } = await supabase
        .from('companies_searchable')
        .select(`
          id,
          business_name,
          business_bio_long,
          business_type,
          website_url,
          media_categories,
          campaign_kpis,
          total_relationships,
          embedding
        `)
        .not('embedding', 'is', null)
        .limit(2000);

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }

      console.error(`📊 Retrieved ${companies.length} companies with embeddings`);

      const companiesWithSimilarity = companies
        .map(company => {
          let similarity = 0;
          
          // Try to parse embedding if it's a string
          let companyEmbedding = company.embedding;
          if (typeof companyEmbedding === 'string') {
            try {
              companyEmbedding = JSON.parse(companyEmbedding);
            } catch (e) {
              console.error(`❌ Failed to parse embedding for ${company.business_name}:`, e.message);
            }
          }
          
          similarity = this.cosineSimilarity(queryEmbedding, companyEmbedding);

          return {
            ...company,
            similarity: similarity
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.error(`🏆 Top result: ${companiesWithSimilarity[0]?.business_name} (${companiesWithSimilarity[0]?.similarity.toFixed(3)})`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: query,
              search_type: "semantic_similarity",
              total_evaluated: companies.length,
              results: companiesWithSimilarity.map(company => ({
                id: company.id,
                business_name: company.business_name,
                description: company.business_bio_long?.substring(0, 200) + '...',
                business_type: company.business_type,
                website: company.website_url,
                media_categories: company.media_categories,
                campaign_kpis: company.campaign_kpis?.slice(0, 3),
                total_relationships: company.total_relationships,
                similarity_score: parseFloat(company.similarity.toFixed(4)),
                match_strength: company.similarity > 0.8 ? 'high' : 
                               company.similarity > 0.6 ? 'medium' : 'low'
              })),
              top_similarity: companiesWithSimilarity[0]?.similarity || 0
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
      console.error(`🎨 Semantic ad format search: "${query}"`);
    const queryEmbedding = await this.generateEmbedding(query);
      const { data: testData, error: testError } = await supabase
      .from('ad_formats_searchable')
      .select('format_name, company_name')
      .limit(5);
     

const { count } = await supabase

  .from('ad_formats_searchable')
      const { data: formats, error } = await supabase
        .from('ad_formats_searchable')
        .select(`
          id,
          format_name,
          company_name,
          description,
          media_categories,
          campaign_kpis,
          total_relationships,
          embedding
        `)
        .not('embedding', 'is', null)
        .limit(5000);

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }

      console.error(`📊 Retrieved ${formats.length} ad formats with embeddings`);

      const formatsWithSimilarity = formats
        .map(format => {
          let similarity = 0;
          let formatEmbedding = format.embedding;
          
          if (typeof formatEmbedding === 'string') {
            try {
              formatEmbedding = JSON.parse(formatEmbedding);
            } catch (e) {
              console.error(`❌ Failed to parse embedding for ${format.format_name}`);
            }
          }
          
          similarity = this.cosineSimilarity(queryEmbedding, formatEmbedding);
          
          return {
            ...format,
            similarity: similarity
          };
        })

        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: query,
              search_type: "semantic_similarity",
              total_evaluated: formats.length,
              results: formatsWithSimilarity.map(format => ({
                id: format.id,
                format_name: format.format_name,
                company_name: format.company_name,
                description: format.description?.substring(0, 200) + '...',
                media_categories: format.media_categories,
                campaign_kpis: format.campaign_kpis?.slice(0, 3),
                total_relationships: format.total_relationships,
                similarity_score: parseFloat(format.similarity.toFixed(4)),
                match_strength: format.similarity > 0.8 ? 'high' : 
                               format.similarity > 0.6 ? 'medium' : 'low'
              })),
              top_similarity: formatsWithSimilarity[0]?.similarity || 0
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      throw new Error(`Semantic ad format search failed: ${error.message}`);
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 Media Discovery Semantic MCP server running");
  }
}

const server = new MediaDiscoveryServer();
server.run().catch(console.error);
