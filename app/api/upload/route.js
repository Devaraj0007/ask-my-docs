/**
 * app/api/upload/route.js
 * POST /api/upload
 *
 * Accepts PDF, TXT, and DOCX file uploads.
 * Chunks, embeds, and stores documents in the vector database.
 */

import { NextResponse } from 'next/server';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { addDocumentsToStore } from '../../../lib/vectorstore.js';
import { updateCorpus } from '../../../lib/rag.js';
import config from '../../../lib/config.js';
import fs from 'fs';
import path from 'path';

const MAX_FILE_SIZE_BYTES = config.maxFileSizeMB * 1024 * 1024;

/**
 * Extract text content from various file types.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File MIME type
 * @param {string} filename - Original filename
 * @returns {Promise<string>}
 */
async function extractText(buffer, mimeType, filename) {
  const ext = path.extname(filename).toLowerCase();

  // Plain text
  if (mimeType === 'text/plain' || ext === '.txt') {
    return buffer.toString('utf8');
  }

  // PDF
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      if (!data.text || data.text.trim().length === 0) {
        throw new Error('PDF appears to be scanned or image-based. Please use a text-based PDF.');
      }
      return data.text;
    } catch (err) {
      throw new Error(`Failed to parse PDF: ${err.message}`);
    }
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    try {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (err) {
      throw new Error(`Failed to parse DOCX: ${err.message}`);
    }
  }

  throw new Error(`Unsupported file type: ${mimeType || ext}`);
}

/**
 * Validate uploaded file.
 */
function validateFile(filename, size, mimeType) {
  const ext = path.extname(filename).toLowerCase();

  if (!config.allowedExtensions.includes(ext)) {
    return `File type not allowed. Accepted: ${config.allowedExtensions.join(', ')}`;
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return `File too large. Maximum size: ${config.maxFileSizeMB}MB`;
  }

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return 'Invalid filename';
  }

  return null;
}

export async function POST(request) {
  const uploadStart = Date.now();

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided. Use form field name "file".' }, { status: 400 });
    }

    const filename = file.name;
    const mimeType = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());
    const size = buffer.length;

    console.log(`\n[Upload] File received: ${filename} (${(size / 1024).toFixed(1)}KB, ${mimeType})`);

    // Validate file
    const validationError = validateFile(filename, size, mimeType);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Save file to disk
    const docsDir = path.resolve(config.documentsPath);
    fs.mkdirSync(docsDir, { recursive: true });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const savedPath = path.join(docsDir, `${Date.now()}_${safeName}`);
    fs.writeFileSync(savedPath, buffer);
    console.log(`[Upload] Saved to: ${savedPath}`);

    // Extract text
    console.log('[Upload] Extracting text...');
    const rawText = await extractText(buffer, mimeType, filename);
    console.log(`[Upload] Extracted ${rawText.length.toLocaleString()} characters`);

    if (rawText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Document appears to be empty or could not be read.' },
        { status: 422 }
      );
    }

    // Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
    });

    const docs = await splitter.createDocuments(
      [rawText],
      [{ source: filename, filename, uploadedAt: new Date().toISOString() }]
    );

    console.log(`[Upload] Split into ${docs.length} chunks (size=${config.chunkSize}, overlap=${config.chunkOverlap})`);

    // Store in vector database
    console.log('[Upload] Generating embeddings and storing in vector DB...');
    await addDocumentsToStore(docs);

    // Update BM25 corpus
    updateCorpus(docs);

    const elapsed = Date.now() - uploadStart;
    console.log(`[Upload] ✅ Processing complete in ${elapsed}ms`);

    return NextResponse.json(
      {
        success: true,
        filename,
        chunks: docs.length,
        characters: rawText.length,
        processingTimeMs: elapsed,
        message: `Successfully processed "${filename}" into ${docs.length} searchable chunks.`,
      },
      { status: 200 }
    );
  } catch (err) {
    const elapsed = Date.now() - uploadStart;
    console.error('[Upload] ❌ Error:', err.message);

    return NextResponse.json(
      {
        error: err.message || 'Failed to process uploaded file.',
        processingTimeMs: elapsed,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/upload',
    accepts: 'multipart/form-data',
    field: 'file',
    supported: config.allowedExtensions,
    maxSize: `${config.maxFileSizeMB}MB`,
  });
}
