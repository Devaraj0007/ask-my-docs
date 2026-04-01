/**
 * lib/vectorstore.js
 * ChromaDB vector store with local persistent fallback.
 * 
 * - Tries to connect to a ChromaDB server first
 * - Falls back to local in-memory + disk persistence if unavailable
 *
 * Stack: Chroma → HuggingFace Embeddings → LangChain
 */

import { ChromaClient } from 'chromadb';
import { createEmbeddings } from './embeddings.js';
import config from './config.js';
import fs from 'fs';
import path from 'path';

let storeInstance = null;  // { type: 'chroma' | 'local', ... }
let embeddingsInstance = null;

function getEmbeddings() {
  if (!embeddingsInstance) embeddingsInstance = createEmbeddings();
  return embeddingsInstance;
}

// ═══════════════════════════════════════════════════════════════
//  LOCAL PERSISTENT FALLBACK STORE
// ═══════════════════════════════════════════════════════════════

class LocalVectorStore {
  constructor(embeddings, storePath) {
    this.embeddings = embeddings;
    this.storePath = storePath;
    this.documents = [];
    this._load();
  }

  _load() {
    const fp = path.join(this.storePath, 'vectors.json');
    if (fs.existsSync(fp)) {
      try {
        this.documents = JSON.parse(fs.readFileSync(fp, 'utf8')).documents || [];
        console.log(`[VectorStore] Loaded ${this.documents.length} vectors from disk`);
      } catch { this.documents = []; }
    }
  }

  _save() {
    fs.mkdirSync(this.storePath, { recursive: true });
    fs.writeFileSync(path.join(this.storePath, 'vectors.json'), JSON.stringify({
      documents: this.documents,
      savedAt: new Date().toISOString(),
    }));
  }

  async addDocuments(docs) {
    const texts = docs.map(d => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    for (let i = 0; i < docs.length; i++) {
      this.documents.push({
        pageContent: docs[i].pageContent,
        metadata: docs[i].metadata || {},
        embedding: vectors[i],
      });
    }
    this._save();
  }

  _cosine(a, b) {
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; nA += a[i]*a[i]; nB += b[i]*b[i]; }
    return dot / (Math.sqrt(nA) * Math.sqrt(nB) || 1);
  }

  async similaritySearch(query, k = 10) {
    if (!this.documents.length) return [];
    const qv = await this.embeddings.embedQuery(query);
    return this.documents
      .map(d => ({ ...d, score: this._cosine(qv, d.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(d => ({ pageContent: d.pageContent, metadata: { ...d.metadata, similarityScore: d.score } }));
  }
}

// ═══════════════════════════════════════════════════════════════
//  CHROMA SERVER STORE
// ═══════════════════════════════════════════════════════════════

class ChromaServerStore {
  constructor(collection, embeddings) {
    this.collection = collection;
    this.embeddings = embeddings;
  }

  async addDocuments(docs) {
    const texts = docs.map(d => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    const ids = docs.map((_, i) => `doc_${Date.now()}_${i}`);
    const metadatas = docs.map(d => {
      const m = {};
      if (d.metadata?.source) m.source = String(d.metadata.source);
      if (d.metadata?.filename) m.filename = String(d.metadata.filename);
      if (d.metadata?.page) m.page = Number(d.metadata.page);
      if (d.metadata?.uploadedAt) m.uploadedAt = String(d.metadata.uploadedAt);
      return m;
    });
    await this.collection.add({ ids, embeddings: vectors, documents: texts, metadatas });
  }

  async similaritySearch(query, k = 10) {
    const qv = await this.embeddings.embedQuery(query);
    const results = await this.collection.query({ queryEmbeddings: [qv], nResults: k });
    if (!results?.documents?.[0]) return [];
    return results.documents[0]
      .map((content, i) => ({
        pageContent: content || '',
        metadata: { ...(results.metadatas?.[0]?.[i] || {}), similarityScore: results.distances?.[0]?.[i] },
      }))
      .filter(d => d.pageContent.length > 10);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════

async function initStore() {
  if (storeInstance) return storeInstance;

  const embeddings = getEmbeddings();

  // Try Chroma server
  try {
    const host = config.chromaUrl.replace(/^https?:\/\//, '').split(':')[0];
    const port = parseInt(config.chromaUrl.split(':').pop()) || 8000;
    const client = new ChromaClient({ host, port });
    await client.heartbeat();
    const col = await client.getOrCreateCollection({
      name: config.chromaCollection,
      metadata: { 'hnsw:space': 'cosine' },
    });
    const count = await col.count();
    console.log(`[VectorStore] ✅ ChromaDB connected — "${config.chromaCollection}" (${count} vectors)`);
    storeInstance = new ChromaServerStore(col, embeddings);
    return storeInstance;
  } catch (err) {
    console.log(`[VectorStore] Chroma unavailable (${err.message}), using local store`);
  }

  // Local fallback
  const storePath = path.resolve(config.vectorDbPath);
  storeInstance = new LocalVectorStore(embeddings, storePath);
  console.log(`[VectorStore] ✅ Local persistent store at: ${storePath}`);
  return storeInstance;
}

export async function getVectorStore() { return initStore(); }

export async function addDocumentsToStore(documents) {
  if (!documents?.length) return;
  const store = await initStore();
  console.log(`[VectorStore] Adding ${documents.length} chunks...`);
  const bs = 40;
  for (let i = 0; i < documents.length; i += bs) {
    await store.addDocuments(documents.slice(i, i + bs));
    console.log(`[VectorStore] Stored ${Math.min(i + bs, documents.length)}/${documents.length}`);
  }
  console.log(`[VectorStore] ✅ All ${documents.length} chunks stored`);
}

export async function similaritySearch(query, k = config.vectorTopK) {
  const store = await initStore();
  try {
    const results = await store.similaritySearch(query, k);
    console.log(`[VectorStore] Search returned ${results.length} results`);
    return results;
  } catch (err) {
    console.warn(`[VectorStore] Search failed: ${err.message}`);
    return [];
  }
}

export function resetVectorStore() { storeInstance = null; embeddingsInstance = null; }
export default getVectorStore;
