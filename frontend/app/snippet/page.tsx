'use client';

import Link from 'next/link';
import React, { useEffect, useRef } from 'react';

export default function SnippetPage() {
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (bookmarkletRef.current) {
      // Fetch + Eval approach to bypass CSP blocking of script.src
      const code = "javascript:(async function(){try{const r=await fetch('https://ncshpcgpu01:8848/snippets/drug-snippet/drug_snippet.js?t='+Date.now());const t=await r.text();const s=document.createElement('script');s.textContent=t;document.body.appendChild(s);}catch(e){alert('Failed to load: '+e)}})();";
      bookmarkletRef.current.setAttribute('href', code);
    }
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f8fafc',
      padding: '20px',
      position: 'relative'
    }}>
      <h1 style={{ color: '#1e293b', fontSize: '3rem', marginBottom: '2rem' }}>Snippet Store</h1>

<div style={{ 
  display: 'grid', 
  gridTemplateColumns: '1fr',
  gap: '2rem',
  width: '100%',
  maxWidth: '600px'
}}>
  <div style={{
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    borderTop: '6px solid #10b981'
  }}>
    <h2 style={{ color: '#1e293b', marginBottom: '1rem', fontSize: '1.5rem', textAlign: 'center' }}>Available Snippets</h2>
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {/* Bookmarklet link */}
      <div className="bookmarklet-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <a 
              ref={bookmarkletRef}
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
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onClick={(e) => {
                if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
              }}
            >
              💊 Drug Snippet
            </a>
            <style jsx>{`
              .bookmarklet-button:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 12px rgba(0,0,0,0.3);
              }
            `}</style>
            <div className="bookmarklet-tooltip" style={{
              visibility: 'hidden',
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#1e293b',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
              zIndex: 100,
              opacity: 0,
              transition: 'opacity 0.2s'
            }}>
              Drag me!
            </div>
            <style jsx>{`
              .bookmarklet-container:hover .bookmarklet-tooltip {
                visibility: visible !important;
                opacity: 1 !important;
              }
            `}</style>
            </div>
          </div>
        </div>
      </div>
    

      <div style={{ marginTop: '2rem', width: '100%', textAlign: 'center'}}>
        <video 
          src="/snippets/SNIPPET_DEMO.mp4" 
          controls 
          style={{ 
            width: '100%', 
            maxWidth: '600px', 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' 
          }}
        />
      </div>
    </div>
  );
}
