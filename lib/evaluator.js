/**
 * lib/evaluator.js
 * RAG evaluation pipeline inspired by RAGAS metrics.
 *
 * Metrics computed:
 *   - Faithfulness: Does the answer contain only claims from the context?
 *   - Answer Relevance: How relevant is the answer to the question?
 *   - Context Precision: Are the retrieved documents relevant to the question?
 *   - Context Recall: Does the context cover all information needed to answer?
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import config from './config.js';
import { createLLM } from './generator.js';
import { runRAGPipeline } from './rag.js';
import fs from 'fs';

/**
 * Use the LLM to evaluate a specific metric.
 *
 * @param {string} systemPrompt
 * @param {string} userContent
 * @returns {Promise<number>} score between 0 and 1
 */
async function llmScore(systemPrompt, userContent) {
  const llm = createLLM({ maxTokens: 256 });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userContent),
  ]);

  // Extract numeric score from response (0.0 – 1.0)
  const text = response.content;
  const match = text.match(/\b(0\.\d+|1\.0|0|1)\b/);
  if (match) return parseFloat(match[1]);

  // Fallback: check for positive/negative language
  if (/\b(high|good|excellent|faithful|relevant)\b/i.test(text)) return 0.85;
  if (/\b(low|poor|bad|unfaithful|irrelevant)\b/i.test(text)) return 0.25;
  return 0.5;
}

/**
 * Faithfulness: Does the answer only contain information from the context?
 * Score 1.0 = fully grounded, 0.0 = hallucinated
 */
async function evaluateFaithfulness(answer, contexts) {
  const systemPrompt = `You evaluate whether an AI answer is faithful to the provided context.
Score between 0.0 (completely hallucinated) and 1.0 (fully grounded in context).
Respond with ONLY a numeric score like: 0.85`;

  const content = `CONTEXT:\n${contexts.join('\n\n---\n\n')}\n\nANSWER:\n${answer}\n\nFaithfulness score:`;
  return llmScore(systemPrompt, content);
}

/**
 * Answer Relevance: How well does the answer address the question?
 * Score 1.0 = perfectly relevant, 0.0 = completely off-topic
 */
async function evaluateAnswerRelevance(question, answer) {
  const systemPrompt = `You evaluate how relevant an AI answer is to the given question.
Score between 0.0 (completely irrelevant) and 1.0 (perfectly answers the question).
Respond with ONLY a numeric score like: 0.90`;

  const content = `QUESTION: ${question}\n\nANSWER: ${answer}\n\nAnswer relevance score:`;
  return llmScore(systemPrompt, content);
}

/**
 * Context Precision: Are the retrieved documents actually relevant to the question?
 * Score 1.0 = all docs are relevant, 0.0 = all docs are irrelevant
 */
async function evaluateContextPrecision(question, contexts) {
  const systemPrompt = `You evaluate whether retrieved documents are relevant to answering a question.
Score between 0.0 (no documents are relevant) and 1.0 (all documents are highly relevant).
Respond with ONLY a numeric score like: 0.75`;

  const content = `QUESTION: ${question}\n\nRETRIEVED CONTEXT:\n${contexts.slice(0, 3).join('\n\n---\n\n')}\n\nContext precision score:`;
  return llmScore(systemPrompt, content);
}

/**
 * Context Recall: Does the context contain all the information needed to answer?
 * Requires a ground truth answer for comparison.
 */
async function evaluateContextRecall(contexts, groundTruth) {
  if (!groundTruth) return null;

  const systemPrompt = `You evaluate whether the retrieved context contains all information needed to produce the ground truth answer.
Score between 0.0 (context is missing all key info) and 1.0 (context contains all necessary information).
Respond with ONLY a numeric score like: 0.80`;

  const content = `GROUND TRUTH ANSWER: ${groundTruth}\n\nRETRIEVED CONTEXT:\n${contexts.slice(0, 3).join('\n\n---\n\n')}\n\nContext recall score:`;
  return llmScore(systemPrompt, content);
}

/**
 * Evaluate a single RAG sample.
 *
 * @param {{ question: string, ground_truth?: string }} sample
 * @returns {Promise<object>}
 */
export async function evaluateSample(sample) {
  const { question, ground_truth } = sample;

  console.log(`[Evaluator] Evaluating: "${question.slice(0, 60)}..."`);

  // Run the RAG pipeline
  const { answer, sources } = await runRAGPipeline(question);
  const contexts = sources.map((s) => s.excerpt || '');

  // Compute all metrics in parallel
  const [faithfulness, answerRelevance, contextPrecision, contextRecall] = await Promise.all([
    evaluateFaithfulness(answer, contexts),
    evaluateAnswerRelevance(question, answer),
    evaluateContextPrecision(question, contexts),
    evaluateContextRecall(contexts, ground_truth),
  ]);

  const result = {
    question,
    answer: answer.slice(0, 300) + '...',
    metrics: {
      faithfulness,
      answer_relevance: answerRelevance,
      context_precision: contextPrecision,
      ...(contextRecall !== null && { context_recall: contextRecall }),
    },
    overall_score:
      (faithfulness + answerRelevance + contextPrecision + (contextRecall ?? contextPrecision)) / 4,
  };

  console.log(`[Evaluator] Scores — F:${faithfulness.toFixed(2)} AR:${answerRelevance.toFixed(2)} CP:${contextPrecision.toFixed(2)} Overall:${result.overall_score.toFixed(2)}`);

  return result;
}

/**
 * Run the full evaluation suite from a dataset file.
 *
 * @param {string} datasetPath - Path to eval/dataset.json
 * @returns {Promise<{ results: object[], averages: object, passed: boolean }>}
 */
export async function runEvaluation(datasetPath = 'eval/dataset.json') {
  console.log(`\n${'='.repeat(60)}`);
  console.log('[Evaluator] 🧪 Starting RAG Evaluation Suite');
  console.log('='.repeat(60));

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Evaluation dataset not found at: ${datasetPath}`);
  }

  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  console.log(`[Evaluator] Loaded ${dataset.length} evaluation samples`);

  const results = [];
  for (const sample of dataset) {
    try {
      const result = await evaluateSample(sample);
      results.push(result);
    } catch (err) {
      console.error(`[Evaluator] Failed to evaluate sample: ${err.message}`);
      results.push({
        question: sample.question,
        error: err.message,
        metrics: { faithfulness: 0, answer_relevance: 0, context_precision: 0 },
        overall_score: 0,
      });
    }
  }

  // Compute averages
  const validResults = results.filter((r) => !r.error);
  const avg = (key) =>
    validResults.length > 0
      ? validResults.reduce((sum, r) => sum + (r.metrics[key] || 0), 0) / validResults.length
      : 0;

  const averages = {
    faithfulness: avg('faithfulness'),
    answer_relevance: avg('answer_relevance'),
    context_precision: avg('context_precision'),
    overall: validResults.reduce((sum, r) => sum + r.overall_score, 0) / (validResults.length || 1),
  };

  const PASS_THRESHOLD = 0.8;
  const passed = averages.overall >= PASS_THRESHOLD;

  console.log('\n' + '─'.repeat(40));
  console.log('[Evaluator] 📊 EVALUATION RESULTS');
  console.log('─'.repeat(40));
  console.log(`  Faithfulness:       ${(averages.faithfulness * 100).toFixed(1)}%`);
  console.log(`  Answer Relevance:   ${(averages.answer_relevance * 100).toFixed(1)}%`);
  console.log(`  Context Precision:  ${(averages.context_precision * 100).toFixed(1)}%`);
  console.log(`  Overall Score:      ${(averages.overall * 100).toFixed(1)}%`);
  console.log(`  Threshold:          ${PASS_THRESHOLD * 100}%`);
  console.log(`  Status:             ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('─'.repeat(40) + '\n');

  return { results, averages, passed };
}

export default runEvaluation;
