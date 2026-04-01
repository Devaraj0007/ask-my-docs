/**
 * lib/rag.js
 * Main RAG pipeline orchestrator.
 *
 * Flow:
 *   User Query
 *     → Hybrid Retrieval (BM25 + Vector Search)
 *     → Cross-Encoder Reranking
 *     → LLM Answer Generation with Citations
 *     → Return { answer, sources, metadata }
 */

import { hybridRetrieve } from './retriever.js';
import { rerank } from './reranker.js';
import { generateAnswer } from './generator.js';
import { getVectorStore } from './vectorstore.js';
import config from './config.js';

// In-memory document corpus for BM25 (updated when docs are uploaded)
let documentCorpus = [];

/**
 * Update the BM25 corpus with newly ingested documents.
 * Called after document upload and chunking.
 *
 * @param {import('@langchain/core/documents').Document[]} docs
 */
export function updateCorpus(docs) {
  documentCorpus = [...documentCorpus, ...docs];
  console.log(`[RAG] Corpus updated: ${documentCorpus.length} total document chunks`);
}

/**
 * Get the current BM25 corpus.
 */
export function getCorpus() {
  return documentCorpus;
}

/**
 * Main RAG pipeline entry point.
 *
 * @param {string} query - The user's question
 * @returns {Promise<{
 *   answer: string,
 *   sources: object[],
 *   metadata: {
 *     retrievedCount: number,
 *     rerankedCount: number,
 *     responseTimeMs: number,
 *     pipeline: string[]
 *   }
 * }>}
 */
export async function runRAGPipeline(query) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty');
  }

  const pipelineStart = Date.now();
  const pipelineSteps = [];

  console.log('\n' + '='.repeat(60));
  console.log(`[RAG] 🚀 Pipeline started`);
  console.log(`[RAG] Query: "${query.slice(0, 100)}${query.length > 100 ? '...' : ''}"`);
  console.log('='.repeat(60));

  // ─── STEP 1: Hybrid Retrieval ───────────────────────────────
  const retrievalStart = Date.now();
  console.log('\n[RAG] Step 1: Hybrid Retrieval');

  const retrievedDocs = await hybridRetrieve(
    query,
    documentCorpus,
    config.vectorTopK,
    config.bm25TopK,
    config.hybridTopK
  );

  const retrievalTime = Date.now() - retrievalStart;
  pipelineSteps.push(`Hybrid Retrieval: ${retrievedDocs.length} docs (${retrievalTime}ms)`);
  console.log(`[RAG] Retrieved ${retrievedDocs.length} docs in ${retrievalTime}ms`);

  // ─── STEP 2: Cross-Encoder Reranking ───────────────────────
  const rerankStart = Date.now();
  console.log('\n[RAG] Step 2: Reranking');

  const rerankedDocs = await rerank(query, retrievedDocs, config.rerankTopK);

  const rerankTime = Date.now() - rerankStart;
  pipelineSteps.push(`Reranking: ${rerankedDocs.length} docs (${rerankTime}ms)`);
  console.log(`[RAG] Reranked to top ${rerankedDocs.length} docs in ${rerankTime}ms`);

  // Log reranked documents for debugging
  rerankedDocs.forEach((doc, i) => {
    const score = doc.metadata?.rerankScore?.toFixed(3) || 'N/A';
    const src = doc.metadata?.source || 'unknown';
    console.log(`  [${i + 1}] score=${score} source=${src}`);
  });

  // ─── STEP 3: Answer Generation ─────────────────────────────
  const genStart = Date.now();
  console.log('\n[RAG] Step 3: Answer Generation');

  const { answer, sources } = await generateAnswer(query, rerankedDocs);

  const genTime = Date.now() - genStart;
  pipelineSteps.push(`Generation (${genTime}ms)`);

  const totalTime = Date.now() - pipelineStart;
  console.log(`\n[RAG] ✅ Pipeline complete in ${totalTime}ms`);
  console.log('='.repeat(60) + '\n');

  return {
    answer,
    sources,
    metadata: {
      retrievedCount: retrievedDocs.length,
      rerankedCount: rerankedDocs.length,
      responseTimeMs: totalTime,
      pipeline: pipelineSteps,
    },
  };
}

export default runRAGPipeline;
