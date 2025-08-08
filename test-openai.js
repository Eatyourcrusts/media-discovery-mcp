const OPENAI_API_KEY = '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';

console.log('🧪 Testing OpenAI embeddings...');

try {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: 'test query'
    })
  });

  if (!response.ok) {
    console.log('❌ OpenAI API failed:', response.status, response.statusText);
    const errorText = await response.text();
    console.log('Error details:', errorText);
  } else {
    const data = await response.json();
    console.log('✅ OpenAI API works! Embedding dimensions:', data.data[0].embedding.length);
  }
} catch (error) {
  console.log('❌ Network error:', error.message);
}
