'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '../context/UserContext';
import Link from 'next/link';

export default function SnippetPage() {
  const drugBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const highlightBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const { session, loading: userLoading } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | null>(null);
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkInternalStatus = async () => {
      try {
        const response = await fetch("/api/check-fdalabel", { method: 'POST' });
        const data = await response.json();
        setIsInternal(data.isInternal);
      } catch (error) {
        setIsInternal(false);
      }
    };
    checkInternalStatus();
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
      {/* Unified Header & Menu */}
      <header className="header-main" style={{ justifyContent: 'space-between', padding: '0.5rem 2rem' }}>
        {/* Left: Home Button & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: '0 0 250px' }}>
          <Link href="/" style={{ 
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
          }}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
               <polyline points="9 22 9 12 15 12 15 22"></polyline>
             </svg>
             Home
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            Snippet Store
          </h1>
        </div>

        {/* Center: Main Navigation */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isInternal ? (
            <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('nav')} onMouseLeave={() => setActiveDropdown(null)}>
              <button className="hp-nav-item" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
                FDALabel <span style={{ fontSize: '0.5rem', marginLeft: '2px', opacity: 0.5 }}>▼</span>
              </button>
              <div className={`hp-dropdown-content ${activeDropdown === 'nav' ? 'visible' : ''}`} style={{ marginTop: '0', opacity: activeDropdown === 'nav' ? 1 : 0, visibility: activeDropdown === 'nav' ? 'visible' : 'hidden' }}>
                <a href="https://fdalabel.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" className="hp-dropdown-item">
                  <span className="hp-dropdown-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
                  </span>
                  <div>
                    <div style={{ fontWeight: 800 }}>FDA Official</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Global Public Interface</div>
                  </div>
                </a>
                <a href="https://fdalabel.fda.gov/fdalabel-r/ui/search" target="_blank" rel="noopener noreferrer" className="hp-dropdown-item">
                  <span className="hp-dropdown-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  </span>
                  <div>
                    <div style={{ fontWeight: 800 }}>CDER-CBER</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Internal Review Interface</div>
                  </div>
                </a>
              </div>
            </div>
          ) : (
            <a href="https://nctr-crs.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" className="hp-nav-item" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
              FDALabel
            </a>
          )}

                  <Link href="/search" className="hp-nav-item hp-nav-item-flagship" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>
                    AFL Agent
                  </Link>
          <Link href="/dashboard" className="hp-nav-item" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            Dashboard
          </Link>

          <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('more')} onMouseLeave={() => setActiveDropdown(null)}>
            <button className="hp-nav-item" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
              More <span style={{ fontSize: '0.5rem', marginLeft: '2px', opacity: 0.5 }}>▼</span>
            </button>
            <div className={`hp-dropdown-content ${activeDropdown === 'more' ? 'visible' : ''}`} style={{ marginTop: '0', opacity: activeDropdown === 'more' ? 1 : 0, visibility: activeDropdown === 'more' ? 'visible' : 'hidden' }}>
              <Link href="/labelcomp" className="hp-dropdown-item">
                <span className="hp-dropdown-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>
                </span>
                <div>
                  <div style={{ fontWeight: 800 }}>Label Compare</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Side-by-side analysis</div>
                </div>
              </Link>
              <Link href="/drugtox" className="hp-dropdown-item">
                <span className="hp-dropdown-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v8"></path><path d="M14 2v8"></path><path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path><path d="M6 18h12"></path><path d="M6 22h12"></path><circle cx="12" cy="13" r="10"></circle></svg>
                </span>
                <div>
                  <div style={{ fontWeight: 800 }}>DrugTox Intelligence</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Toxicity profile tracking</div>
                </div>
              </Link>
              <Link href="/snippet" className="hp-dropdown-item">
                <span className="hp-dropdown-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>
                </span>
                <div>
                  <div style={{ fontWeight: 800 }}>Snippet Store</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Browser research tools</div>
                </div>
              </Link>
            </div>
          </div>
        </nav>

        {/* Right: User Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '0 0 250px', justifyContent: 'flex-end' }}>
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
        </div>
      </header>

      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '4rem 20px',
          textAlign: 'center',
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >
        <div style={{ marginBottom: '4rem' }}>
          <h1 className="hero-title-animated" style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.025em' }}>
            Snippet Store
          </h1>
          <p className="hero-subtitle-animated" style={{ fontSize: '1.25rem', color: '#64748b', fontWeight: '500' }}>
            Specialized research tools for your browser
          </p>
        </div>

        {/* Instructions Section */}
        <section style={{ 
          width: '100%', 
          maxWidth: '900px', 
          backgroundColor: '#ffffff', 
          padding: '2rem', 
          borderRadius: '24px', 
          border: '1px solid #e2e8f0', 
          marginBottom: '4rem',
          textAlign: 'left',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            How to use these snippets
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase' }}>1. Show Bookmarks Bar</div>
              <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>Ensure your browser's bookmarks bar is visible (Ctrl+Shift+B or Cmd+Shift+B).</p>
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase' }}>2. Drag and Drop</div>
              <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>Simply click and drag the tool button below directly onto your bookmarks bar.</p>
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase' }}>3. Launch with Elsa</div>
              <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>Click the bookmark while viewing Elsa website to activate the tool.</p>
            </div>
          </div>
        </section>

        {/* Snippets Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: '2.5rem',
            width: '100%',
            marginBottom: '4rem'
          }}
        >
          {/* Drug Snippet Card */}
          <div
            style={{
              backgroundColor: 'white',
              padding: '2.5rem',
              borderRadius: '28px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              transition: 'all 0.3s ease'
            }}
            className="snippet-card"
          >
            <div style={{ 
              width: '80px', 
              height: '80px', 
              background: 'linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              boxShadow: '0 4px 12px rgba(234, 179, 8, 0.1)',
              border: '1px solid #fef3c7'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path>
                <path d="m8.5 8.5 7 7"></path>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Drug Snippet</h3>
            <p style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6, marginBottom: '2rem', flex: 1 }}>
              Instantly extract and summarize drug information from any clinical webpage or FDA label. Provides a quick-view panel with key metadata and clinical highlights.
            </p>
            
            <div className="bookmarklet-container" style={{ position: 'relative', width: '100%' }}>
              <a
                ref={drugBookmarkletRef}
                href="#"
                className="bookmarklet-button"
                style={{
                  backgroundColor: '#002e5d',
                  color: '#fff',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  cursor: 'grab',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0, 46, 93, 0.15)',
                  display: 'inline-block',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
                onClick={(e) => {
                  if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
                }}
              >
                Drag to Bookmarks
              </a>
              <div className="bookmarklet-tooltip">Ready to drag!</div>
            </div>
          </div>

          {/* Highlighter Card */}
          <div
            style={{
              backgroundColor: 'white',
              padding: '2.5rem',
              borderRadius: '28px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              transition: 'all 0.3s ease'
            }}
            className="snippet-card"
          >
            <div style={{ 
              width: '80px', 
              height: '80px', 
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.1)',
              border: '1px solid #dbeafe'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
                <path d="M5 3v4"></path>
                <path d="M19 17v4"></path>
                <path d="M3 5h4"></path>
                <path d="M17 19h4"></path>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Smart Highlighter</h3>
            <p style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6, marginBottom: '2rem', flex: 1 }}>
              Automatically identify and highlight critical safety terms, MedDRA codes, and regulatory keywords across any Structured Product Labeling (SPL) document.
            </p>
            
            <div className="bookmarklet-container" style={{ position: 'relative', width: '100%' }}>
              <a
                ref={highlightBookmarkletRef}
                href="#"
                className="bookmarklet-button"
                style={{
                  backgroundColor: '#002e5d',
                  color: '#fff',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  cursor: 'grab',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0, 46, 93, 0.15)',
                  display: 'inline-block',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
                onClick={(e) => {
                  if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
                }}
              >
                Drag to Bookmarks
              </a>
              <div className="bookmarklet-tooltip">Ready to drag!</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem', width: '100%', textAlign: 'center', maxWidth: '800px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.5rem' }}>See it in action</h3>
          <video
            src="/snippets/Animated_Tutorial_Medical_Snippet_Tool.mp4"
            controls
            style={{
              width: '100%',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
              border: '1px solid #e2e8f0'
            }}
          />
        </div>

        <style jsx>{`
          .snippet-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1) !important;
            border-color: #3b82f6 !important;
          }
          .bookmarklet-button:hover {
            filter: brightness(1.1);
            transform: scale(1.02);
          }
          .bookmarklet-button:active {
            transform: scale(0.98);
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
            transition: all 0.2s ease;
            margin-top: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .bookmarklet-tooltip::after {
            content: "";
            position: absolute;
            bottom: 100%;
            left: 50%;
            margin-left: -6px;
            border-width: 6px;
            border-style: solid;
            border-color: transparent transparent #1e293b transparent;
          }
          .bookmarklet-container:hover .bookmarklet-tooltip {
            visibility: visible;
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        `}</style>
      </main>
    </div>
  );
}
