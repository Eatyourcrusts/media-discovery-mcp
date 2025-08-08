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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, limit = 5 } = req.body;
    
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

    res.json({
      query,
      search_type: "semantic_similarity",
      total_evaluated: formats.length,
      results,
      top_similarity: results.length > 0 ? results[0].similarity_score : 0
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
