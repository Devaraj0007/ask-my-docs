/**
 * tests/test_rag.js
 * Jest test suite for the RAG pipeline components.
 *
 * Covers:
 *   - BM25 retrieval
 *   - Hybrid retrieval (mocked)
 *   - Reranker (local fallback)
 *   - Answer generation (mocked)
 *   - API response shape
 *   - Config validation
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mock external dependencies ─────────────────────────────────────────────

// Mock OpenAI to avoid real API calls in tests
jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    embedDocuments: jest.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
  })),
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'The refund policy allows returns within 30 days [1]. Customers must show original receipt [1].\n\n---\nSources:\n[1] policy.pdf',
    }),
  })),
}));

// Mock FAISS to avoid native module issues in test env
jest.mock('@langchain/community/vectorstores/faiss', () => ({
  FaissStore: {
    load: jest.fn().mockRejectedValue(new Error('No index')),
    fromTexts: jest.fn().mockResolvedValue({
      addDocuments: jest.fn().mockResolvedValue(undefined),
      similaritySearch: jest.fn().mockResolvedValue([
        { pageContent: 'Returns are accepted within 30 days of purchase.', metadata: { source: 'policy.pdf' } },
        { pageContent: 'Original receipt required for all returns.', metadata: { source: 'policy.pdf' } },
      ]),
      save: jest.fn().mockResolvedValue(undefined),
      index: { ntotal: 2 },
    }),
  },
}));

jest.mock('langchain/vectorstores/memory', () => ({
  MemoryVectorStore: {
    fromTexts: jest.fn().mockResolvedValue({
      addDocuments: jest.fn(),
      similaritySearch: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    }),
  },
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('[]'),
}));

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const MOCK_DOCS = [
  {
    pageContent: 'The company refund policy allows returns within 30 days of purchase with original receipt.',
    metadata: { source: 'policy.pdf', page: 1 },
  },
  {
    pageContent: 'All digital purchases are non-refundable and cannot be exchanged.',
    metadata: { source: 'policy.pdf', page: 2 },
  },
  {
    pageContent: 'Manager approval is required for refunds exceeding $500.',
    metadata: { source: 'policy.pdf', page: 3 },
  },
  {
    pageContent: 'Customer service team handles refund requests Monday through Friday.',
    metadata: { source: 'support.txt' },
  },
  {
    pageContent: 'Shipping costs are non-refundable in all circumstances.',
    metadata: { source: 'shipping.txt' },
  },
];

// ─── BM25 Retrieval Tests ──────────────────────────────────────────────────

describe('BM25 Retrieval', () => {
  it('should return documents sorted by relevance score', async () => {
    const { bm25Retrieve } = await import('../lib/retriever.js');
    const results = bm25Retrieve('refund policy', MOCK_DOCS, 3);
    expect(results).toHaveLength(3);
    expect(results[0].pageContent).toMatch(/refund/i);
  });

  it('should return empty array for empty corpus', async () => {
    const { bm25Retrieve } = await import('../lib/retriever.js');
    const results = bm25Retrieve('refund policy', [], 5);
    expect(results).toEqual([]);
  });

  it('should respect the top-k limit', async () => {
    const { bm25Retrieve } = await import('../lib/retriever.js');
    const results = bm25Retrieve('refund', MOCK_DOCS, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should handle empty query gracefully', async () => {
    const { bm25Retrieve } = await import('../lib/retriever.js');
    const results = bm25Retrieve('', MOCK_DOCS, 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should prioritize documents with higher term frequency', async () => {
    const { bm25Retrieve } = await import('../lib/retriever.js');
    const results = bm25Retrieve('digital non-refundable', MOCK_DOCS, 5);
    expect(results.length).toBeGreaterThan(0);
    // Doc about digital purchases should score high
    const hasDigital = results.some((d) => d.pageContent.includes('digital'));
    expect(hasDigital).toBe(true);
  });
});

// ─── Reranker Tests ────────────────────────────────────────────────────────

describe('Reranker', () => {
  it('should return top-k documents', async () => {
    const { rerank } = await import('../lib/reranker.js');
    const results = await rerank('refund policy', MOCK_DOCS, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should return empty array for empty input', async () => {
    const { rerank } = await import('../lib/reranker.js');
    const results = await rerank('refund policy', [], 3);
    expect(results).toEqual([]);
  });

  it('should attach rerankScore metadata', async () => {
    const { rerank } = await import('../lib/reranker.js');
    const results = await rerank('refund policy', MOCK_DOCS, 3);
    expect(results[0].metadata).toHaveProperty('rerankScore');
    expect(typeof results[0].metadata.rerankScore).toBe('number');
  });

  it('should return all docs when fewer than top-k', async () => {
    const { rerank } = await import('../lib/reranker.js');
    const smallSet = MOCK_DOCS.slice(0, 2);
    const results = await rerank('refund', smallSet, 5);
    expect(results.length).toBe(2);
  });

  it('should place most relevant docs first', async () => {
    const { rerank } = await import('../lib/reranker.js');
    const results = await rerank('digital non-refundable purchase', MOCK_DOCS, 5);
    // Scores should be in descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].metadata.rerankScore).toBeGreaterThanOrEqual(
        results[i].metadata.rerankScore
      );
    }
  });
});

// ─── Answer Generation Tests ───────────────────────────────────────────────

describe('Answer Generation', () => {
  it('should return answer and sources', async () => {
    const { generateAnswer } = await import('../lib/generator.js');
    const result = await generateAnswer('What is the refund policy?', MOCK_DOCS.slice(0, 3));
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('sources');
    expect(typeof result.answer).toBe('string');
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('should return a message when no documents are provided', async () => {
    const { generateAnswer } = await import('../lib/generator.js');
    const result = await generateAnswer('What is the policy?', []);
    expect(result.answer).toMatch(/no relevant documents/i);
    expect(result.sources).toEqual([]);
  });

  it('should structure sources correctly', async () => {
    const { generateAnswer } = await import('../lib/generator.js');
    const result = await generateAnswer('What is the refund policy?', MOCK_DOCS.slice(0, 2));
    expect(result.sources[0]).toHaveProperty('index');
    expect(result.sources[0]).toHaveProperty('source');
    expect(result.sources[0]).toHaveProperty('excerpt');
  });

  it('should include citations in the answer', async () => {
    const { generateAnswer } = await import('../lib/generator.js');
    const result = await generateAnswer('What is the refund policy?', MOCK_DOCS.slice(0, 3));
    // The mocked LLM returns text with [1] citations
    expect(result.answer).toMatch(/\[\d+\]/);
  });
});

// ─── RAG Pipeline Tests ────────────────────────────────────────────────────

describe('RAG Pipeline', () => {
  it('should throw on empty query', async () => {
    const { runRAGPipeline } = await import('../lib/rag.js');
    await expect(runRAGPipeline('')).rejects.toThrow('Query cannot be empty');
  });

  it('should return answer, sources and metadata', async () => {
    const { runRAGPipeline, updateCorpus } = await import('../lib/rag.js');
    updateCorpus(MOCK_DOCS);
    const result = await runRAGPipeline('What is the refund policy?');
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('sources');
    expect(result).toHaveProperty('metadata');
  });

  it('should include pipeline metadata', async () => {
    const { runRAGPipeline, updateCorpus } = await import('../lib/rag.js');
    updateCorpus(MOCK_DOCS);
    const result = await runRAGPipeline('What is the policy?');
    expect(result.metadata).toHaveProperty('responseTimeMs');
    expect(result.metadata).toHaveProperty('retrievedCount');
    expect(result.metadata).toHaveProperty('rerankedCount');
    expect(result.metadata).toHaveProperty('pipeline');
    expect(Array.isArray(result.metadata.pipeline)).toBe(true);
  });

  it('should handle whitespace-only query', async () => {
    const { runRAGPipeline } = await import('../lib/rag.js');
    await expect(runRAGPipeline('   ')).rejects.toThrow();
  });
});

// ─── Config Tests ──────────────────────────────────────────────────────────

describe('Config Validation', () => {
  it('should have default embedding model', async () => {
    const { default: config } = await import('../lib/config.js');
    expect(config.embeddingModel).toBeDefined();
    expect(typeof config.embeddingModel).toBe('string');
  });

  it('should have numeric chunk settings', async () => {
    const { default: config } = await import('../lib/config.js');
    expect(typeof config.chunkSize).toBe('number');
    expect(typeof config.chunkOverlap).toBe('number');
    expect(config.chunkSize).toBeGreaterThan(0);
    expect(config.chunkOverlap).toBeLessThan(config.chunkSize);
  });

  it('should have valid allowed file extensions', async () => {
    const { default: config } = await import('../lib/config.js');
    expect(config.allowedExtensions).toContain('.pdf');
    expect(config.allowedExtensions).toContain('.txt');
    expect(config.allowedExtensions).toContain('.docx');
  });

  it('should have positive retrieval limits', async () => {
    const { default: config } = await import('../lib/config.js');
    expect(config.bm25TopK).toBeGreaterThan(0);
    expect(config.vectorTopK).toBeGreaterThan(0);
    expect(config.hybridTopK).toBeGreaterThanOrEqual(config.vectorTopK);
    expect(config.rerankTopK).toBeLessThanOrEqual(config.hybridTopK);
  });
});

// ─── API Shape Tests ───────────────────────────────────────────────────────

describe('API Response Shape', () => {
  it('chat response should match expected schema', async () => {
    const { runRAGPipeline, updateCorpus } = await import('../lib/rag.js');
    updateCorpus(MOCK_DOCS);
    const result = await runRAGPipeline('test query');

    // answer
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);

    // sources array
    expect(Array.isArray(result.sources)).toBe(true);

    // metadata
    expect(typeof result.metadata.responseTimeMs).toBe('number');
    expect(result.metadata.responseTimeMs).toBeGreaterThan(0);
  });

  it('sources should have required fields', async () => {
    const { runRAGPipeline, updateCorpus } = await import('../lib/rag.js');
    updateCorpus(MOCK_DOCS);
    const result = await runRAGPipeline('What is the policy?');

    if (result.sources.length > 0) {
      const src = result.sources[0];
      expect(src).toHaveProperty('index');
      expect(src).toHaveProperty('source');
      expect(src).toHaveProperty('excerpt');
      expect(typeof src.index).toBe('number');
    }
  });
});
