/**
 * app/api/chat/route.js
 * POST /api/chat
 *
 * Accepts a question and returns an AI-generated answer with citations.
 *
 * Request:  { "question": "What is the refund policy?" }
 * Response: { "answer": "...", "sources": [...], "metadata": {...} }
 */

import { NextResponse } from 'next/server';
import { runRAGPipeline } from '../../../lib/rag.js';
import { validateConfig } from '../../../lib/config.js';

// Validate config on first request
let configValidated = false;

/**
 * Validate the incoming request body.
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (!body.question || typeof body.question !== 'string') {
    return 'Field "question" is required and must be a string';
  }
  if (body.question.trim().length === 0) {
    return 'Question cannot be empty';
  }
  if (body.question.length > 2000) {
    return 'Question exceeds maximum length of 2000 characters';
  }
  return null;
}

export async function POST(request) {
  const requestStart = Date.now();

  try {
    // Validate API configuration
    if (!configValidated) {
      try {
        validateConfig();
        configValidated = true;
      } catch (configErr) {
        console.error('[Chat API] Configuration error:', configErr.message);
        return NextResponse.json(
          { error: 'Server configuration error. Please check your API keys.' },
          { status: 503 }
        );
      }
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate input
    const validationError = validateRequest(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { question } = body;
    console.log(`\n[Chat API] ← Question: "${question.slice(0, 100)}"`);

    // Run the RAG pipeline
    const result = await runRAGPipeline(question);

    const responseTime = Date.now() - requestStart;
    console.log(`[Chat API] → Response sent in ${responseTime}ms`);

    return NextResponse.json(
      {
        answer: result.answer,
        sources: result.sources,
        metadata: {
          ...result.metadata,
          totalResponseTimeMs: responseTime,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Response-Time': `${responseTime}ms`,
        },
      }
    );
  } catch (err) {
    const responseTime = Date.now() - requestStart;
    console.error('[Chat API] ❌ Error:', err.message);

    // Determine appropriate error code
    const isApiKeyError = err.message?.toLowerCase().includes('api key');
    const isRateLimitError = err.message?.toLowerCase().includes('rate limit');
    const statusCode = isApiKeyError ? 503 : isRateLimitError ? 429 : 500;

    return NextResponse.json(
      {
        error: isApiKeyError
          ? 'AI service not configured. Please check your API keys.'
          : isRateLimitError
          ? 'Rate limit exceeded. Please try again in a moment.'
          : 'An error occurred while processing your question. Please try again.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        responseTimeMs: responseTime,
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      service: 'Ask My Docs — RAG API',
      version: '1.0.0',
      endpoints: {
        'POST /api/chat': 'Ask a question',
        'POST /api/upload': 'Upload a document',
      },
      status: 'operational',
    },
    { status: 200 }
  );
}
