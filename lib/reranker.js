/**
 * lib/reranker.js
 * Cross-encoder reranking using Cohere Rerank API.
 * Falls back to a simple TF-IDF-inspired local scorer if Cohere is unavailable.
 */

import config from './config.js';

/**
 * Rerank documents using the Cohere Rerank API.
 *
 * @param {string} query - The user query
 * @param {import('@langchain/core/documents').Document[]} documents - Candidate documents
 * @param {number} topK - Number of top documents to return
 * @returns {Promise<import('@langchain/core/documents').Document[]>}
 */
async function cohereRerank(query, documents, topK) {
  const { CohereClient } = await import('cohere-ai');
  const cohere = new CohereClient({ token: config.cohereApiKey });

  const texts = documents.map((d) => d.pageContent);

  console.log(`[Reranker] Cohere reranking ${texts.length} documents...`);

  const response = await cohere.rerank({
    query,
    documents: texts,
    topN: topK,
    model: 'rerank-english-v3.0',
    returnDocuments: false,
  });

  // Map indices back to original documents, preserving Cohere relevance scores
  const reranked = response.results.map((result) => ({
    ...documents[result.index],
    metadata: {
      ...documents[result.index].metadata,
      rerankScore: result.relevanceScore,
      rerankRank: result.index,
    },
  }));

  console.log(
    `[Reranker] ✅ Cohere reranking complete. Top score: ${reranked[0]?.metadata?.rerankScore?.toFixed(3)}`
  );
  return reranked;
}

/**
 * Local fallback reranker using term overlap scoring.
 * Used when Cohere API is not available or configured.
 *
 * @param {string} query
 * @param {import('@langchain/core/documents').Document[]} documents
 * @param {number} topK
 * @returns {import('@langchain/core/documents').Document[]}
 */
function localRerank(query, documents, topK) {
  console.log('[Reranker] Using local fallback reranker (no Cohere key configured)');

  const queryTerms = new Set(
    query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

  const scored = documents.map((doc) => {
    const content = doc.pageContent.toLowerCase();
    const contentTerms = content.split(/\s+/);
    const docTermSet = new Set(contentTerms);

    // Term overlap score
    let overlap = 0;
    for (const term of queryTerms) {
      if (docTermSet.has(term)) overlap++;
    }

    // Exact phrase bonus
    const queryLower = query.toLowerCase();
    const phraseBonus = content.includes(queryLower) ? 0.5 : 0;

    // Length penalty for very short or very long documents
    const lengthScore = Math.min(1, doc.pageContent.length / 500);

    const score = (overlap / (queryTerms.size || 1)) + phraseBonus + lengthScore * 0.1;

    return {
      ...doc,
      metadata: {
        ...doc.metadata,
        rerankScore: score,
        rerankMethod: 'local',
      },
    };
  });

  const sorted = scored
    .sort((a, b) => b.metadata.rerankScore - a.metadata.rerankScore)
    .slice(0, topK);

  console.log(`[Reranker] ✅ Local reranking complete. Top score: ${sorted[0]?.metadata?.rerankScore?.toFixed(3)}`);
  return sorted;
}

/**
 * Main reranker — uses Cohere if key is available, falls back to local scorer.
 *
 * @param {string} query - The user query
 * @param {import('@langchain/core/documents').Document[]} documents - Candidate docs
 * @param {number} topK - Number of results to return
 * @returns {Promise<import('@langchain/core/documents').Document[]>}
 */
export async function rerank(query, documents, topK = config.rerankTopK) {
  if (!documents || documents.length === 0) {
    console.warn('[Reranker] No documents to rerank');
    return [];
  }

  // Don't rerank if fewer docs than topK
  if (documents.length <= topK) {
    console.log(`[Reranker] Only ${documents.length} docs — skipping rerank, returning all`);
    return documents;
  }

  if (config.cohereApiKey && config.cohereApiKey !== 'your_cohere_api_key_here') {
    try {
      return await cohereRerank(query, documents, topK);
    } catch (err) {
      console.warn('[Reranker] Cohere rerank failed, falling back to local:', err.message);
      return localRerank(query, documents, topK);
    }
  }

  return localRerank(query, documents, topK);
}

export default rerank;
