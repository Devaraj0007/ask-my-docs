/**
 * lib/retriever.js
 * Hybrid retrieval combining BM25 keyword search and vector similarity search.
 * Results are merged, deduplicated, and returned ranked by combined score.
 */

import config from './config.js';
import { similaritySearch } from './vectorstore.js';

// --- Simple BM25 Implementation ---
// A lightweight BM25 implementation that runs on the in-memory document corpus.

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Tokenize text into lowercase terms.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Compute BM25 scores for a query against a document corpus.
 *
 * @param {string} query
 * @param {import('@langchain/core/documents').Document[]} corpus
 * @returns {{ doc: Document, score: number }[]}
 */
function bm25Search(query, corpus) {
  if (!corpus || corpus.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Build term frequency maps for each document
  const docTermFreqs = corpus.map((doc) => {
    const terms = tokenize(doc.pageContent);
    const freq = {};
    for (const term of terms) {
      freq[term] = (freq[term] || 0) + 1;
    }
    return { doc, freq, length: terms.length };
  });

  // Compute average document length
  const avgDocLen = docTermFreqs.reduce((sum, d) => sum + d.length, 0) / docTermFreqs.length;
  const N = corpus.length;

  // Build inverted document frequency map
  const idf = {};
  for (const term of queryTerms) {
    const docsWithTerm = docTermFreqs.filter((d) => d.freq[term] > 0).length;
    idf[term] = Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
  }

  // Score each document
  const scored = docTermFreqs.map(({ doc, freq, length }) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = freq[term] || 0;
      if (tf === 0) continue;
      const numerator = tf * (BM25_K1 + 1);
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (length / avgDocLen));
      score += idf[term] * (numerator / denominator);
    }
    return { doc, score };
  });

  // Sort by descending score and return
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * BM25 retrieval over a document corpus.
 *
 * @param {string} query - The user query
 * @param {import('@langchain/core/documents').Document[]} corpus - All known documents
 * @param {number} k - Number of top results to return
 * @returns {import('@langchain/core/documents').Document[]}
 */
export function bm25Retrieve(query, corpus, k = config.bm25TopK) {
  console.log(`[Retriever] BM25 search over ${corpus.length} docs, k=${k}`);
  const results = bm25Search(query, corpus).slice(0, k);
  console.log(`[Retriever] BM25 returned ${results.length} results`);
  return results.map((r) => r.doc);
}

/**
 * Hybrid retrieval: combines BM25 + vector search results.
 * Deduplicates by content hash and returns top-k merged results.
 *
 * @param {string} query - The user query
 * @param {import('@langchain/core/documents').Document[]} corpus - BM25 corpus
 * @param {number} vectorK - Number of vector search results
 * @param {number} bm25K - Number of BM25 results
 * @param {number} topK - Final merged result count
 * @returns {Promise<import('@langchain/core/documents').Document[]>}
 */
export async function hybridRetrieve(
  query,
  corpus,
  vectorK = config.vectorTopK,
  bm25K = config.bm25TopK,
  topK = config.hybridTopK
) {
  console.log(`[Retriever] Starting hybrid retrieval for query: "${query.slice(0, 80)}..."`);

  // Run both retrieval methods in parallel
  const [vectorResults, bm25Results] = await Promise.all([
    similaritySearch(query, vectorK).catch((err) => {
      console.warn('[Retriever] Vector search failed:', err.message);
      return [];
    }),
    Promise.resolve(corpus.length > 0 ? bm25Retrieve(query, corpus, bm25K) : []),
  ]);

  console.log(
    `[Retriever] Vector: ${vectorResults.length} results | BM25: ${bm25Results.length} results`
  );

  // Merge and deduplicate using content fingerprint
  const seen = new Set();
  const merged = [];

  // Interleave results: vector first (typically higher precision), then BM25
  const interleaved = [];
  const maxLen = Math.max(vectorResults.length, bm25Results.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < vectorResults.length) interleaved.push(vectorResults[i]);
    if (i < bm25Results.length) interleaved.push(bm25Results[i]);
  }

  for (const doc of interleaved) {
    // Fingerprint: first 150 chars of content (avoid exact-content dedup overhead)
    const fingerprint = doc.pageContent.slice(0, 150).trim();
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      merged.push(doc);
    }
    if (merged.length >= topK) break;
  }

  // Filter out placeholder system documents
  const filtered = merged.filter(
    (doc) => doc.metadata?.type !== 'placeholder' && doc.pageContent.length > 50
  );

  console.log(`[Retriever] ✅ Hybrid retrieval: ${filtered.length} unique docs after dedup`);
  return filtered;
}

export default hybridRetrieve;
