# ◈ Ask My Docs — Production RAG System

> Enterprise-grade Retrieval-Augmented Generation with hybrid retrieval, cross-encoder reranking, citation enforcement, and CI-gated evaluation.

![Node.js](https://img.shields.io/badge/Node.js-20-green) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![LangChain](https://img.shields.io/badge/LangChain-JS-blue) ![Docker](https://img.shields.io/badge/Docker-ready-blue) ![CI](https://img.shields.io/badge/CI-GitHub_Actions-orange)

---

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                  Next.js App Router                      │
│              POST /api/chat  │  POST /api/upload         │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│              Hybrid Retrieval (lib/retriever.js)          │
│                                                           │
│   ┌─────────────────┐    ┌──────────────────────────┐    │
│   │  BM25 Retrieval │    │  Vector Search (FAISS)   │    │
│   │  top-10 docs    │    │  top-10 docs             │    │
│   └────────┬────────┘    └────────────┬─────────────┘    │
│            └──────────────────────────┘                   │
│                   Merge + Deduplicate                     │
│                   top-20 unique docs                      │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│           Cross-Encoder Reranker (lib/reranker.js)        │
│                                                           │
│   Cohere Rerank API  ──OR──  Local TF-IDF fallback       │
│                   top-5 docs                             │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│          LLM Generation with Citations (lib/generator.js) │
│                                                           │
│   System: "Only use context. Always cite [n]."           │
│   GPT-4o-mini / GPT-4o                                   │
│                                                           │
│   Output: "Returns allowed within 30 days [1]..."        │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
               { answer, sources, metadata }
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              RAGAS Evaluation (lib/evaluator.js)          │
│                                                           │
│   Faithfulness · Answer Relevance · Context Precision    │
│   CI gate: overall ≥ 0.80 required to merge              │
└──────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
production-rag-js/
├── app/
│   ├── api/
│   │   ├── chat/route.js          # POST /api/chat — main Q&A endpoint
│   │   └── upload/route.js        # POST /api/upload — document ingestion
│   ├── components/
│   │   ├── ChatUI.jsx             # Main chat interface with citation renderer
│   │   └── FileUploader.jsx       # Drag-and-drop file uploader
│   ├── globals.css
│   ├── layout.js
│   └── page.js
│
├── lib/
│   ├── config.js                  # Centralized config from env vars
│   ├── embeddings.js              # OpenAI embeddings with cache
│   ├── vectorstore.js             # FAISS persistent vector store
│   ├── retriever.js               # BM25 + hybrid retrieval
│   ├── reranker.js                # Cohere / local cross-encoder reranker
│   ├── generator.js               # LLM with citation enforcement
│   ├── rag.js                     # Pipeline orchestrator
│   └── evaluator.js               # RAGAS-inspired evaluation metrics
│
├── data/documents/                # Uploaded source documents
├── vector_store/                  # Persisted FAISS index (gitignored)
│
├── tests/test_rag.js              # Jest unit tests (20+ test cases)
├── eval/
│   ├── dataset.json               # Evaluation Q&A samples
│   └── run_eval.js                # Standalone eval runner for CI
│
├── .github/workflows/rag-eval.yml # CI: test → evaluate → build
├── Dockerfile                     # Multi-stage production Docker build
├── next.config.js
├── .env                           # Environment variables template
└── README.md
```

---

## Features

| Feature | Implementation |
|---------|---------------|
| Document ingestion | PDF, TXT, DOCX → chunked → embedded → FAISS |
| BM25 retrieval | Custom BM25 over in-memory corpus |
| Vector search | FAISS persistent index (OpenAI embeddings) |
| Hybrid retrieval | Interleaved merge + deduplication (top-20) |
| Reranking | Cohere Rerank API (fallback: local TF-IDF scorer) |
| Citation enforcement | System prompt + structured [n] citation format |
| RAG evaluation | Faithfulness, Answer Relevance, Context Precision |
| CI/CD gate | GitHub Actions: fails build if overall score < 80% |
| Docker | Multi-stage build, non-root user, health check |

---

## Setup

### Prerequisites

- Node.js 20+
- npm 9+
- OpenAI API key (required)
- Cohere API key (optional, for reranking)

### 1. Clone and Install

```bash
git clone <your-repo>
cd production-rag-js
npm install
```

### 2. Configure Environment

```bash
cp .env .env.local
```

Edit `.env.local`:

```env
OPENAI_API_KEY=sk-...          # Required
COHERE_API_KEY=...              # Optional (enables Cohere reranking)
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4o-mini
VECTOR_DB_PATH=vector_store
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## API Usage

### Ask a Question

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the refund policy?"}'
```

**Response:**

```json
{
  "answer": "The refund policy allows returns within 30 days of purchase [1]. All returns require the original receipt [1][2]. Digital purchases are non-refundable [3].\n\n---\nSources:\n[1] policy.pdf\n[2] terms.pdf\n[3] digital-policy.pdf",
  "sources": [
    {
      "index": 1,
      "source": "policy.pdf",
      "page": 2,
      "excerpt": "Returns are accepted within 30 days of purchase...",
      "rerankScore": 0.943
    }
  ],
  "metadata": {
    "retrievedCount": 12,
    "rerankedCount": 5,
    "responseTimeMs": 1842,
    "pipeline": [
      "Hybrid Retrieval: 12 docs (234ms)",
      "Reranking: 5 docs (612ms)",
      "Generation (996ms)"
    ]
  }
}
```

### Upload a Document

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@your-document.pdf"
```

**Response:**

```json
{
  "success": true,
  "filename": "policy.pdf",
  "chunks": 24,
  "characters": 18432,
  "processingTimeMs": 3210,
  "message": "Successfully processed \"policy.pdf\" into 24 searchable chunks."
}
```

---

## Testing

### Unit Tests (Jest)

```bash
npm test
```

Runs 20+ tests covering BM25 retrieval, reranker, generator, pipeline, config, and API shape — all with mocked external calls.

### RAG Evaluation

```bash
npm run test:eval
```

Runs the RAGAS-inspired evaluation suite against `eval/dataset.json`. Exits with code 1 if overall score < 0.80.

---

## Docker Deployment

### Build

```bash
docker build -t ask-my-docs .
```

### Run

```bash
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e COHERE_API_KEY=... \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/vector_store:/app/vector_store \
  ask-my-docs
```

### Docker Compose (recommended)

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - COHERE_API_KEY=${COHERE_API_KEY}
      - EMBEDDING_MODEL=text-embedding-3-small
      - LLM_MODEL=gpt-4o-mini
      - VECTOR_DB_PATH=/app/vector_store
    volumes:
      - ./data:/app/data
      - ./vector_store:/app/vector_store
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/chat"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/rag-eval.yml`) runs on every push:

```
push to main/develop
        │
        ▼
  ┌───────────┐
  │ Unit Tests │  npm test (Jest)
  └─────┬─────┘
        │ pass
        ▼
  ┌─────────────┐
  │ RAG Eval    │  npm run test:eval
  │ score ≥ 80% │  ← fails build if below threshold
  └─────┬───────┘
        │ pass (main only)
        ▼
  ┌─────────────┐
  │ Docker Build│  Multi-stage build
  └─────────────┘
```

Set repository secrets: `OPENAI_API_KEY`, `COHERE_API_KEY`

---

## Evaluation Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Faithfulness** | Answer grounded in context only | ≥ 0.85 |
| **Answer Relevance** | Answer addresses the question | ≥ 0.85 |
| **Context Precision** | Retrieved docs are relevant | ≥ 0.75 |
| **Overall** | Weighted average (CI gate) | ≥ **0.80** |

---

## Extending the System

**Swap vector store → Pinecone:**
```js
// lib/vectorstore.js
import { PineconeStore } from '@langchain/pinecone';
```

**Add Redis caching:**
```js
// lib/rag.js — wrap pipeline with Redis cache check
const cached = await redis.get(`rag:${hash(query)}`);
if (cached) return JSON.parse(cached);
```

**Use LangGraph for multi-step reasoning:**
```js
import { StateGraph } from '@langchain/langgraph';
// Build a graph: retrieve → grade → rewrite → generate
```

**Azure OpenAI:**
```env
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
```

---

## License

MIT — Built for AI Engineer / GenAI Engineer / LLM Engineer portfolios.
