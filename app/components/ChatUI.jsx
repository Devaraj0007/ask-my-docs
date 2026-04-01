'use client';

import { useState, useRef, useEffect } from 'react';
import FileUploader from './FileUploader.jsx';

// ─── Citation Renderer ────────────────────────────────────────────────────────
function renderWithCitations(text) {
  if (!text) return null;
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    if (/^\[\d+\]$/.test(part)) {
      return (
        <sup key={i} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent)', color: '#fff', borderRadius: '3px',
          fontSize: '9px', fontWeight: 700, padding: '1px 4px',
          margin: '0 1px', fontFamily: 'var(--font-mono)', letterSpacing: 0,
          verticalAlign: 'super', lineHeight: 1,
        }}>
          {part.slice(1, -1)}
        </sup>
      );
    }
    return part;
  });
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '20px', animation: 'fadeUp 0.25s ease',
    }}>
      {/* Role label */}
      <div style={{
        fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase',
        color: isUser ? 'var(--accent2)' : 'var(--text3)',
        fontFamily: 'var(--font-mono)', marginBottom: '6px',
        paddingLeft: isUser ? 0 : '2px', paddingRight: isUser ? '2px' : 0,
      }}>
        {isUser ? 'You' : 'Ask My Docs'}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '82%', padding: isUser ? '12px 16px' : '16px 20px',
        background: isUser
          ? 'linear-gradient(135deg, var(--accent), #5b49e0)'
          : 'var(--surface2)',
        border: isUser ? 'none' : '1px solid var(--border)',
        borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
        color: isUser ? '#fff' : 'var(--text)',
        fontSize: '14px', lineHeight: '1.65', letterSpacing: '0.01em',
        fontFamily: 'var(--font-body)',
        boxShadow: isUser ? '0 4px 20px rgba(124,107,255,0.25)' : '0 2px 12px rgba(0,0,0,0.3)',
        whiteSpace: 'pre-wrap',
      }}>
        {isUser ? msg.content : renderWithCitations(msg.content)}
      </div>

      {/* Sources accordion */}
      {!isUser && msg.sources && msg.sources.length > 0 && (
        <SourcesPanel sources={msg.sources} />
      )}

      {/* Metadata */}
      {!isUser && msg.metadata && (
        <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
          {msg.metadata.rerankedCount} docs · {msg.metadata.responseTimeMs}ms
        </div>
      )}
    </div>
  );
}

// ─── Sources Panel ────────────────────────────────────────────────────────────
function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ maxWidth: '82%', marginTop: '8px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '5px 12px',
          color: 'var(--text2)', fontSize: '11px',
          fontFamily: 'var(--font-mono)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)'; }}
      >
        <span style={{ opacity: 0.7 }}>{open ? '▼' : '▶'}</span>
        {sources.length} source{sources.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{
          marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          {sources.map((src) => (
            <div key={src.index} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: '3px solid var(--accent)', borderRadius: '0 8px 8px 0',
              padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <span style={{
                  background: 'var(--accent)', color: '#fff', borderRadius: '4px',
                  fontSize: '9px', fontWeight: 700, padding: '1px 6px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  [{src.index}]
                </span>
                <span style={{ fontSize: '11px', color: 'var(--accent2)', fontFamily: 'var(--font-mono)' }}>
                  {src.source}
                </span>
                {src.rerankScore !== null && (
                  <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                    score: {src.rerankScore?.toFixed(3)}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                {src.excerpt}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '20px', gap: '0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
          Ask My Docs
        </div>
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '4px 16px 16px 16px', padding: '14px 18px',
          display: 'flex', gap: '5px', alignItems: 'center',
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: 'var(--accent)', opacity: 0.6,
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onSuggestion }) {
  const suggestions = [
    'What is the main topic of the uploaded document?',
    'Summarize the key points from the documents.',
    'What are the important dates or deadlines mentioned?',
    'Explain the process or steps described in the doc.',
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
      {/* Logo mark */}
      <div style={{
        width: '64px', height: '64px', borderRadius: '18px',
        background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px', marginBottom: '24px',
        boxShadow: '0 8px 32px var(--accent-glow)',
      }}>
        ◈
      </div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px', color: 'var(--text)', marginBottom: '8px' }}>
        Ask Your Documents
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '380px', lineHeight: 1.6, marginBottom: '32px' }}>
        Upload a PDF, TXT, or DOCX file, then ask questions. Every answer is grounded in your documents with precise citations.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '400px' }}>
        <p style={{ fontSize: '10px', color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
          Try asking
        </p>
        {suggestions.map((s) => (
          <button key={s} onClick={() => onSuggestion(s)} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '10px 14px', textAlign: 'left',
            color: 'var(--text2)', fontSize: '12px', cursor: 'pointer',
            fontFamily: 'var(--font-body)', transition: 'all 0.15s',
            lineHeight: 1.4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)'; }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main ChatUI ──────────────────────────────────────────────────────────────
export default function ChatUI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (questionText) => {
    const question = (questionText || input).trim();
    if (!question || loading) return;

    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: question, id: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setMessages((m) => [...m, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        metadata: data.metadata,
        id: Date.now(),
      }]);
    } catch (err) {
      setError(err.message);
      setMessages((m) => [...m, {
        role: 'assistant',
        content: `⚠️ ${err.message}`,
        id: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,80%,100% { transform:scale(0.7); opacity:0.4; } 40% { transform:scale(1); opacity:1; } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
        textarea:focus { outline: none; }
        textarea::placeholder { color: var(--text3); }
      `}</style>

      <div style={{
        display: 'flex', height: '100vh', background: 'var(--bg)',
        fontFamily: 'var(--font-body)',
      }}>
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside style={{
          width: '260px', flexShrink: 0,
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '0',
          position: 'relative',
        }}>
          {/* Sidebar header */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{
                width: '32px', height: '32px', borderRadius: '9px',
                background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', flexShrink: 0,
              }}>◈</span>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text)', lineHeight: 1 }}>Ask My Docs</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>Production RAG</div>
              </div>
            </div>
          </div>

          {/* Upload button */}
          <div style={{ padding: '16px' }}>
            <button
              onClick={() => setShowUploader((s) => !s)}
              style={{
                width: '100%', padding: '10px', borderRadius: '10px',
                background: showUploader ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${showUploader ? 'var(--accent)' : 'var(--border2)'}`,
                color: showUploader ? 'var(--accent2)' : 'var(--text2)',
                fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '14px' }}>⬆</span>
              Upload Documents
            </button>
          </div>

          {/* Uploader panel */}
          {showUploader && (
            <div style={{ padding: '0 16px 16px' }}>
              <FileUploader
                onUploadSuccess={(info) => {
                  setUploadedFiles((f) => [...f, info]);
                  setShowUploader(false);
                }}
              />
            </div>
          )}

          {/* Uploaded files list */}
          {uploadedFiles.length > 0 && (
            <div style={{ padding: '0 16px', flex: 1, overflowY: 'auto' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                Indexed ({uploadedFiles.length})
              </p>
              {uploadedFiles.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', borderRadius: '8px',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  marginBottom: '6px',
                }}>
                  <span style={{ fontSize: '14px' }}>
                    {f.filename?.endsWith('.pdf') ? '📄' : f.filename?.endsWith('.docx') ? '📝' : '📃'}
                  </span>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.filename}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                      {f.chunks} chunks
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: '10px' }}>✓</span>
                </div>
              ))}
            </div>
          )}

          {/* Pipeline info */}
          <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '10px', color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '10px' }}>
              Pipeline
            </p>
            {['BM25 + Vector Search', 'Cross-Encoder Rerank', 'Citation Enforcement', 'RAGAS Evaluation'].map((step) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{step}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main chat area ───────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar */}
          <div style={{
            padding: '14px 24px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface)',
          }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                Document Intelligence
              </h1>
              <p style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                Hybrid retrieval · Reranked · Cited
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                {uploadedFiles.length} doc{uploadedFiles.length !== 1 ? 's' : ''} indexed
              </span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 && !loading ? (
              <EmptyState onSuggestion={(s) => handleSend(s)} />
            ) : (
              <>
                {messages.map((msg) => <Message key={msg.id} msg={msg} />)}
                {loading && <TypingIndicator />}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{
              display: 'flex', gap: '10px', alignItems: 'flex-end',
              background: 'var(--surface2)', border: `1px solid ${loading ? 'var(--border)' : 'var(--border2)'}`,
              borderRadius: '14px', padding: '10px 12px 10px 16px',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxShadow: loading ? 'none' : '0 0 0 0 transparent',
            }}
            onFocusCapture={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlurCapture={(e) => e.currentTarget.style.borderColor = 'var(--border2)'}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your documents…"
                disabled={loading}
                rows={1}
                style={{
                  flex: 1, resize: 'none', background: 'transparent',
                  border: 'none', color: 'var(--text)', fontSize: '14px',
                  fontFamily: 'var(--font-body)', lineHeight: '1.5',
                  maxHeight: '120px', overflowY: 'auto',
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                style={{
                  width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0,
                  background: input.trim() && !loading ? 'var(--accent)' : 'var(--border)',
                  border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', transition: 'background 0.15s, transform 0.1s',
                  color: '#fff',
                }}
                onMouseDown={(e) => { if (input.trim() && !loading) e.currentTarget.style.transform = 'scale(0.93)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {loading ? '⏳' : '↑'}
              </button>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
              Press Enter to send · Shift+Enter for newline
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
