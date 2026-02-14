'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '../context/UserContext';

export default function SnippetPage() {
  const drugBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const highlightBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const { session, loading: userLoading } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'user' | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
              color: 'white', 
              textDecoration: 'none', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              opacity: 0.9,
              background: 'rgba(255,255,255,0.15)',
              padding: '5px 14px',
              borderRadius: '20px',
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Suite Home
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
          {userLoading ? (
            <span style={{ fontSize: '0.875rem', opacity: 0.8, color: 'white' }}>Loading...</span>
          ) : session?.is_authenticated ? (
            <>
              {/* AI Provider Indicator (Static) */}
              <div style={{ 
                fontSize: '0.85rem', 
                color: 'white', 
                background: 'rgba(255,255,255,0.1)', 
                padding: '4px 12px', 
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }} title="AI model is set on the Suite Home page">
                <span style={{ opacity: 0.7 }}>AI:</span>
                <span style={{ fontWeight: 700 }}>{session.ai_provider?.toUpperCase()}</span>
              </div>

              {/* User Settings Dropdown */}
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                <button 
                  className="dropdown-trigger"
                  onClick={() => setActiveDropdown(activeDropdown === 'user' ? null : 'user')}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'white' }}
                >
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    background: '#3b82f6', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: 'white'
                  }}>
                    {session.username?.[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.875rem', color: 'white' }}>{session.username}</span>
                </button>

                {activeDropdown === 'user' && (
                  <div className="dropdown-menu" style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #f1f5f9',
                    minWidth: '200px',
                    zIndex: 1001,
                    overflow: 'hidden',
                    textAlign: 'left'
                  }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ACCOUNT</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{session.username}</div>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      <a href="/dashboard" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>My Dashboard</a>
                      <a href="/api/dashboard/auth/change_password" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Change Password</a>
                      <a href="/api/dashboard/auth/logout" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#ef4444', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Sign Out</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <a href="/api/dashboard/auth/login?next=/snippet" style={{ color: 'white', fontSize: '0.875rem', textDecoration: 'none', background: 'rgba(255,255,255,0.1)', padding: '6px 16px', borderRadius: '20px' }}>Sign In</a>
          )}
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
