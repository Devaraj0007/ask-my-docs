/**
 * lib/config.js
 * Centralized configuration for the RAG system.
 * 
 * Stack:
 *   LLM:        Groq (OpenAI-compatible)
 *   Embeddings: HuggingFace (local via @xenova/transformers)
 *   Vector DB:  Chroma
 *   Framework:  LangChain
 */

import 'dotenv/config';

// ─── LLM Backend ─────────────────────────────────────────────
const groqApiKey = process.env.GROQ_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const useGroq = !!(groqApiKey && groqApiKey !== 'your_groq_api_key_here');

// ─── Embedding Backend ───────────────────────────────────────
const embeddingProvider = (process.env.EMBEDDING_PROVIDER || 'huggingface').toLowerCase();

// ─── Vector DB Backend ───────────────────────────────────────
const vectorDbProvider = (process.env.VECTOR_DB_PROVIDER || 'chroma').toLowerCase();

export const config = {
  // ── LLM ──
  useGroq,
  groqApiKey,
  openaiApiKey: useGroq ? groqApiKey : openaiApiKey,
  llmBaseUrl: useGroq ? 'https://api.groq.com/openai/v1' : undefined,
  llmModel: process.env.LLM_MODEL || (useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),

  // ── Embeddings ──
  embeddingProvider,   // 'huggingface' | 'openai'
  embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',

  // ── Vector DB ──
  vectorDbProvider,    // 'chroma' | 'faiss' | 'memory'
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  chromaCollection: process.env.CHROMA_COLLECTION || 'ask_my_docs',
  vectorDbPath: process.env.VECTOR_DB_PATH || 'vector_store',

  // ── Cohere (optional reranking) ──
  cohereApiKey: process.env.COHERE_API_KEY,

  // ── Chunking ──
  chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),

  // ── Retrieval ──
  bm25TopK: parseInt(process.env.BM25_TOP_K || '10'),
  vectorTopK: parseInt(process.env.VECTOR_TOP_K || '10'),
  hybridTopK: parseInt(process.env.HYBRID_TOP_K || '20'),
  rerankTopK: parseInt(process.env.RERANK_TOP_K || '5'),

  // ── Documents ──
  documentsPath: 'data/documents',
  maxFileSizeMB: 10,
  allowedFileTypes: [
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  allowedExtensions: ['.pdf', '.txt', '.docx'],
};

/**
 * Validate that required environment variables are present.
 */
export function validateConfig() {
  // Check LLM key
  const hasLLMKey = (config.useGroq && config.groqApiKey) ||
    (config.openaiApiKey && config.openaiApiKey !== 'your_openai_api_key_here');

  if (!hasLLMKey) {
    throw new Error(
      'Missing LLM API key. Set GROQ_API_KEY or OPENAI_API_KEY in .env.local'
    );
  }

  const backend = config.useGroq ? 'Groq' : 'OpenAI';
  console.log(`[Config] ✅ Validated — LLM: ${backend} (${config.llmModel}), Embeddings: ${config.embeddingProvider}, VectorDB: ${config.vectorDbProvider}`);
  return true;
}

export default config;
