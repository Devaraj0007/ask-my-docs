'use client';

import { useState, useRef } from 'react';

const ACCEPTED_TYPES = '.pdf,.txt,.docx';
const MAX_SIZE_MB = 10;

export default function FileUploader({ onUploadSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message: string }
  const inputRef = useRef(null);

  const uploadFile = async (file) => {
    if (!file) return;

    // Client-side validation
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'txt', 'docx'].includes(ext)) {
      setStatus({ type: 'error', message: `Unsupported file type: .${ext}. Use PDF, TXT, or DOCX.` });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setStatus({ type: 'error', message: `File too large. Maximum size: ${MAX_SIZE_MB}MB` });
      return;
    }

    setUploading(true);
    setStatus(null);
    setProgress(10);

    // Simulate progress during upload
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 8, 85));
    }, 300);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setStatus({
        type: 'success',
        message: `✓ "${data.filename}" processed into ${data.chunks} chunks`,
      });

      if (onUploadSuccess) {
        onUploadSuccess(data);
      }
    } catch (err) {
      clearInterval(progressInterval);
      setProgress(0);
      setStatus({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
    e.target.value = ''; // Reset so same file can be re-uploaded
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: '10px',
          padding: '18px 12px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          background: dragging ? 'var(--accent-dim)' : 'var(--surface)',
          transition: 'all 0.15s',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: '20px', marginBottom: '6px' }}>
          {uploading ? '⚙️' : '📂'}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.4 }}>
          {uploading
            ? 'Processing…'
            : dragging
            ? 'Drop to upload'
            : 'Click or drag a file here'}
        </p>
        <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
          PDF · TXT · DOCX · max {MAX_SIZE_MB}MB
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Progress bar */}
      {uploading && progress > 0 && (
        <div style={{
          marginTop: '8px', height: '3px',
          background: 'var(--border)', borderRadius: '2px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
            borderRadius: '2px', transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* Status message */}
      {status && (
        <div style={{
          marginTop: '8px', padding: '8px 10px', borderRadius: '8px', fontSize: '11px',
          background: status.type === 'success' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${status.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: status.type === 'success' ? 'var(--green)' : 'var(--red)',
          lineHeight: 1.4, fontFamily: 'var(--font-body)',
        }}>
          {status.message}
        </div>
      )}
    </div>
  );
}
