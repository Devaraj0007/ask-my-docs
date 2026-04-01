# ─────────────────────────────────────────────────────────────
# Ask My Docs — Production RAG System
# Stack: Groq + HuggingFace + Chroma + LangChain
# Deploy: Render.com (free tier)
# ─────────────────────────────────────────────────────────────

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Build Next.js
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy lib and eval
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/eval ./eval

# Copy node_modules for runtime (HuggingFace transformers, chromadb, etc.)
COPY --from=deps /app/node_modules ./node_modules

# Writable dirs for data, vector store, and HF model cache
RUN mkdir -p data/documents vector_store /home/nextjs/.cache && \
    chown -R nextjs:nodejs data vector_store /home/nextjs/.cache

USER nextjs

# HuggingFace model cache dir
ENV TRANSFORMERS_CACHE=/home/nextjs/.cache
ENV HF_HOME=/home/nextjs/.cache

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/chat || exit 1

CMD ["node", "server.js"]
