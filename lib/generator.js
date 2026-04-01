/**
 * lib/generator.js
 * LLM answer generation with strict citation enforcement.
 * Supports both OpenAI and Groq (OpenAI-compatible) backends.
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import config from './config.js';

/**
 * Build the system prompt that enforces citation behavior.
 * @returns {string}
 */
function buildSystemPrompt() {
  return `You are a precise, citation-driven document assistant for the "Ask My Docs" system.

STRICT RULES — YOU MUST FOLLOW EVERY RULE:

1. ANSWER ONLY FROM CONTEXT: Base your answer EXCLUSIVELY on the provided document excerpts. Do NOT use any outside knowledge or make assumptions beyond what is in the context.

2. MANDATORY CITATIONS: Every factual claim MUST have an inline citation in the format [n], where n is the document number from the context. If a claim comes from document 2, write [2]. If it comes from documents 1 and 3, write [1][3].

3. NO HALLUCINATION: If the context does not contain enough information to answer the question, say: "The provided documents do not contain sufficient information to answer this question." Do NOT guess or infer beyond the context.

4. CITATION FORMAT EXAMPLE:
   "The refund policy allows returns within 30 days [1]. Customers must include the original receipt [1][2]. Digital purchases are non-refundable [3]."

5. RESPONSE STRUCTURE:
   - Start directly with the answer
   - Use clear paragraphs
   - End with a brief note on any gaps in the context if relevant
   - Keep responses factual and concise

6. DOCUMENT REFERENCES: At the end of your response, list each cited document in this format:
   ---
   Sources:
   [1] <document title or filename>
   [2] <document title or filename>`;
}

/**
 * Build the user prompt with retrieved context.
 *
 * @param {string} query - The user question
 * @param {import('@langchain/core/documents').Document[]} documents - Reranked documents
 * @returns {string}
 */
function buildUserPrompt(query, documents) {
  const contextBlocks = documents
    .map((doc, idx) => {
      const source = doc.metadata?.source || doc.metadata?.filename || `Document ${idx + 1}`;
      const page = doc.metadata?.page ? ` (page ${doc.metadata.page})` : '';
      return `[${idx + 1}] SOURCE: ${source}${page}\n${doc.pageContent.trim()}`;
    })
    .join('\n\n---\n\n');

  return `CONTEXT DOCUMENTS:
${contextBlocks}

---

QUESTION: ${query}

Answer the question using ONLY the context above. Every claim must be cited with [n] notation.`;
}

/**
 * Create an LLM instance configured for the current backend (OpenAI or Groq).
 */
function createLLM(overrides = {}) {
  const llmConfig = {
    openAIApiKey: config.openaiApiKey,
    modelName: overrides.model || config.llmModel,
    temperature: overrides.temperature ?? 0,
    maxTokens: overrides.maxTokens ?? 2048,
  };

  // If using Groq, point to their OpenAI-compatible endpoint
  if (config.llmBaseUrl) {
    llmConfig.configuration = {
      baseURL: config.llmBaseUrl,
    };
  }

  return new ChatOpenAI(llmConfig);
}

/**
 * Generate an answer using the LLM with citation enforcement.
 *
 * @param {string} query - The user question
 * @param {import('@langchain/core/documents').Document[]} documents - Retrieved & reranked docs
 * @returns {Promise<{ answer: string, sources: object[] }>}
 */
export async function generateAnswer(query, documents) {
  if (!config.openaiApiKey) {
    throw new Error('No API key configured. Set GROQ_API_KEY or OPENAI_API_KEY.');
  }

  if (!documents || documents.length === 0) {
    return {
      answer: 'No relevant documents were found to answer your question. Please upload documents first.',
      sources: [],
    };
  }

  const llm = createLLM();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, documents);

  const backend = config.useGroq ? 'Groq' : 'OpenAI';
  console.log(`[Generator] Sending ${documents.length} context docs to ${config.llmModel} via ${backend}`);
  const startTime = Date.now();

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Generator] ✅ Answer generated in ${elapsed}s`);

  const answer = response.content;

  // Build structured sources list
  const sources = documents.map((doc, idx) => ({
    index: idx + 1,
    source: doc.metadata?.source || doc.metadata?.filename || `Document ${idx + 1}`,
    page: doc.metadata?.page || null,
    excerpt: doc.pageContent.slice(0, 200) + (doc.pageContent.length > 200 ? '...' : ''),
    rerankScore: doc.metadata?.rerankScore || null,
  }));

  return { answer, sources };
}

// Export createLLM for use by the evaluator
export { createLLM };
export default generateAnswer;
