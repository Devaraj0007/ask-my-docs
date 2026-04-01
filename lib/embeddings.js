/**
 * lib/embeddings.js
 * HuggingFace embeddings using @xenova/transformers (runs locally).
 * Model: all-MiniLM-L6-v2 (384 dimensions, fast, great quality).
 *
 * Stack: HuggingFace → LangChain
 */

import config from './config.js';

// ─── In-memory cache ──────────────────────────────────────────
const embeddingCache = new Map();

// ─── HuggingFace Transformers Embeddings (Local) ─────────────
let pipelineInstance = null;

/**
 * Load the HuggingFace feature-extraction pipeline (lazy singleton).
 * Downloads the model on first use (~30MB), then cached locally.
 */
async function getPipeline() {
  if (pipelineInstance) return pipelineInstance;

  console.log(`[Embeddings] Loading HuggingFace model: ${config.embeddingModel}...`);
  const { pipeline } = await import('@xenova/transformers');
  pipelineInstance = await pipeline('feature-extraction', config.embeddingModel, {
    quantized: true, // Use quantized model for speed
  });
  console.log(`[Embeddings] ✅ Model loaded: ${config.embeddingModel}`);
  return pipelineInstance;
}

/**
 * HuggingFace Embeddings class compatible with LangChain's Embeddings interface.
 * Uses @xenova/transformers to run all-MiniLM-L6-v2 locally.
 */
class HuggingFaceLocalEmbeddings {
  constructor() {
    this.modelName = config.embeddingModel;
  }

  /**
   * Embed a single query string.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedQuery(text) {
    const pipe = await getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Embed multiple documents.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedDocuments(texts) {
    const pipe = await getPipeline();
    const results = [];
    // Process in batches of 32 to avoid memory issues
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      for (const text of batch) {
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        results.push(Array.from(output.data));
      }
      if (i + batchSize < texts.length) {
        console.log(`[Embeddings] Embedded ${Math.min(i + batchSize, texts.length)}/${texts.length} chunks...`);
      }
    }
    return results;
  }
}

/**
 * Create and return an embeddings instance.
 * Uses HuggingFace local embeddings by default.
 */
export function createEmbeddings() {
  if (config.embeddingProvider === 'huggingface') {
    console.log('[Embeddings] Using HuggingFace local embeddings (all-MiniLM-L6-v2)');
    return new HuggingFaceLocalEmbeddings();
  }

  // Fallback to OpenAI embeddings
  throw new Error(
    `Unsupported embedding provider: ${config.embeddingProvider}. Use "huggingface".`
  );
}

/**
 * Cached embedding function for single texts.
 *
 * @param {string} text
 * @param {object} embeddings - Embeddings instance
 * @returns {Promise<number[]>}
 */
export async function embedWithCache(text, embeddings) {
  const cacheKey = text.slice(0, 200);

  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }

  const vector = await embeddings.embedQuery(text);
  embeddingCache.set(cacheKey, vector);

  // Keep cache bounded
  if (embeddingCache.size > 1000) {
    const firstKey = embeddingCache.keys().next().value;
    embeddingCache.delete(firstKey);
  }

  return vector;
}

/**
 * Clear the embedding cache.
 */
export function clearEmbeddingCache() {
  embeddingCache.clear();
  console.log('[Embeddings] Cache cleared');
}

export default createEmbeddings;
