'use client';

import React, { useEffect, useRef } from 'react';

export default function SnippetPage() {
  const drugBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const highlightBookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (drugBookmarkletRef.current) {
      // Fetch + Eval approach to bypass CSP blocking of script.src
      const code =
        "javascript:(async function(){try{const r=await fetch('https://ncshpcgpu01:8848/snippets/drug-snippet/drug_snippet.js?t='+Date.now());const t=await r.text();const s=document.createElement('script');s.textContent=t;document.body.appendChild(s);}catch(e){alert('Failed to load: '+e)}})();";
      drugBookmarkletRef.current.setAttribute('href', code);
    }
    if (highlightBookmarkletRef.current) {
      const code =
        "javascript:(async function(){try{const r=await fetch('https://ncshpcgpu01:8848/snippets/highlights/index.js?t='+Date.now());const t=await r.text();const s=document.createElement('script');s.textContent=t;document.body.appendChild(s);}catch(e){alert('Failed to load: '+e)}})();";
      highlightBookmarkletRef.current.setAttribute('href', code);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Main Header */}
      <header className="header-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <a
            href="/"
            style={{
              backgroundColor: 'white',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            <img src="/askfdalabel_icon.svg" alt="Logo" style={{ height: '24px' }} />
          </a>
          <h1
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-0.025em',
            }}
          >
            Snippet Store
          </h1>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <a
            href="/"
            style={{ color: 'white', fontSize: '0.875rem', textDecoration: 'none', opacity: 0.9 }}
          >
            Suite Home
          </a>
        </nav>
      </header>

      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '4rem 20px',
        }}
      >
        <h2
          style={{
            color: '#1e293b',
            fontSize: '2.5rem',
            fontWeight: 800,
            marginBottom: '2.5rem',
            textAlign: 'center',
          }}
        >
          Scientific Research Tools
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '2rem',
            width: '100%',
            maxWidth: '600px',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '16px',
              boxShadow:
                '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
              borderTop: '6px solid #10b981',
            }}
          >
            <h2
              style={{
                color: '#1e293b',
                marginBottom: '1.5rem',
                fontSize: '1.5rem',
                textAlign: 'center',
              }}
            >
              Available Snippets
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
              {/* Drug Snippet Bookmarklet */}
              <div className="bookmarklet-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <a
                  ref={drugBookmarkletRef}
                  href="#"
                  className="bookmarklet-button"
                  style={{
                    backgroundColor: '#eab308',
                    color: '#fff',
                    padding: '16px 32px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    cursor: 'grab',
                    border: '2px solid #ca8a04',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    display: 'inline-block',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    width: '240px',
                    textAlign: 'center',
                  }}
                  onClick={(e) => {
                    if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
                  }}
                >
                  💊 Drug Snippet
                </a>
                <div className="bookmarklet-tooltip">Drag me!</div>
              </div>

              {/* Highlighter Snippet Bookmarklet */}
              <div className="bookmarklet-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <a
                  ref={highlightBookmarkletRef}
                  href="#"
                  className="bookmarklet-button"
                  style={{
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    padding: '16px 32px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    cursor: 'grab',
                    border: '2px solid #2563eb',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    display: 'inline-block',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    width: '240px',
                    textAlign: 'center',
                  }}
                  onClick={(e) => {
                    if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
                  }}
                >
                  ✨ Highlighter
                </a>
                <div className="bookmarklet-tooltip">Drag me!</div>
              </div>

              <style jsx>{`
                .bookmarklet-button:hover {
                  transform: scale(1.05);
                  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
                }
                .bookmarklet-tooltip {
                  visibility: hidden;
                  position: absolute;
                  top: 100%;
                  left: 50%;
                  transform: translateX(-50%);
                  background-color: #1e293b;
                  color: #fff;
                  padding: 8px 12px;
                  border-radius: 8px;
                  font-size: 0.75rem;
                  white-space: nowrap;
                  z-index: 100;
                  opacity: 0;
                  transition: opacity 0.2s;
                  margin-top: 8px;
                }
                .bookmarklet-container:hover .bookmarklet-tooltip {
                  visibility: visible;
                  opacity: 1;
                }
              `}</style>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem', width: '100%', textAlign: 'center' }}>
          <video
            src="/snippets/Animated_Tutorial_Medical_Snippet_Tool.mp4"
            controls
            style={{
              width: '100%',
              maxWidth: '600px',
              borderRadius: '8px',
              boxShadow:
                '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            }}
          />
        </div>
      </main>
    </div>
  );
}
