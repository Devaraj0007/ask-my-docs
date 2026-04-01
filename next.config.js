/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: [
      'faiss-node',
      'pdf-parse',
      'mammoth',
      '@langchain/community',
      '@xenova/transformers',
      'chromadb',
      'chromadb-default-embed',
      'onnxruntime-node',
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
    };
    config.module = {
      ...config.module,
      exprContextCritical: false,
    };
    return config;
  },
};

module.exports = nextConfig;
