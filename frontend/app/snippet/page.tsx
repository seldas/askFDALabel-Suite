'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '../context/UserContext';
import Link from 'next/link';
import Header from "../components/Header";
import { withAppBase } from '../utils/appPaths';

export default function SnippetPage() {
  const drugBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const highlightBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const { session, loading: userLoading, openAuthModal } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const origin = window.location.origin;
    const appBase = APP_BASE;
    const apiBase = API_BASE;
    const globals = `window.ASKFDALABEL_ORIGIN='${origin}'; window.ASKFDALABEL_APP_BASE='${appBase}'; window.ASKFDALABEL_API_BASE='${apiBase}';`;

    if (drugBookmarkletRef.current) {
      // Fetch + Eval approach to bypass CSP blocking of script.src
      const jsPath = withAppBase('/snippets/drug-snippet/drug_snippet.js');
      const code =
        `javascript:(async function(){ try { ${globals} const r=await fetch('${origin}${jsPath}?t='+Date.now()); const t=await r.text(); const s=document.createElement('script'); s.textContent=t; document.body.appendChild(s); } catch(e) { alert('Failed to load: '+e) } })();`;
      drugBookmarkletRef.current.setAttribute('href', code);
    }
    if (highlightBookmarkletRef.current) {
      const jsPath = withAppBase('/snippets/highlights/index.js');
      const code =
        `javascript:(async function(){ try { ${globals} const r=await fetch('${origin}${jsPath}?t='+Date.now()); const t=await r.text(); const s=document.createElement('script'); s.textContent=t; document.body.appendChild(s); } catch(e) { alert('Failed to load: '+e) } })();`;
      highlightBookmarkletRef.current.setAttribute('href', code);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Unified Header & Menu */}
      <Header/>

      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'clamp(2rem, 5vh, 4rem) 20px',
          textAlign: 'center',
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >
        <div style={{ marginBottom: 'clamp(2rem, 5vh, 4rem)' }}>
          <h1 className="hero-title-animated" style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.025em' }}>
            ELSA Widget
          </h1>
          <p className="hero-subtitle-animated" style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', color: '#64748b', fontWeight: '500' }}>
            Specialized research tools for your clinical workflow
          </p>
        </div>

        {/* Instructions Section */}
        <section style={{ 
          width: '100%', 
          maxWidth: '900px', 
          backgroundColor: '#ffffff', 
          padding: 'clamp(1.5rem, 5vw, 2.5rem)', 
          borderRadius: '24px', 
          border: '1px solid #e2e8f0', 
          marginBottom: 'clamp(2rem, 5vh, 4rem)',
          textAlign: 'left',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            How to use these widgets
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase' }}>1. Show Bookmarks Bar</div>
              <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>Ensure your browser's bookmarks bar is visible (Ctrl+Shift+B or Cmd+Shift+B).</p>
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase' }}>2. Drag and Drop</div>
              <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>Simply click and drag the widget button below directly onto your bookmarks bar.</p>
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase' }}>3. Launch with Elsa</div>
              <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>Click the bookmark while viewing Elsa website to activate the widget.</p>
            </div>
          </div>
        </section>

        {/* Snippets Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2.5rem',
            width: '100%',
            marginBottom: '4rem'
          }}
        >
          {/* Drug Snippet Card */}
          <div
            style={{
              backgroundColor: 'white',
              padding: 'clamp(1.5rem, 5vw, 2.5rem)',
              borderRadius: '28px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              position: 'relative'
            }}
            className="snippet-card"
          >
            {/* Bookmarklet Overlay */}
            <a
              ref={drugBookmarkletRef}
              href="#"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                color: 'transparent',
                textDecoration: 'none',
                cursor: 'grab',
                userSelect: 'none',
                borderRadius: '28px'
              }}
              onClick={(e) => {
                if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
              }}
            >
              Label Insights Widget
            </a>

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
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Label Insights</h3>
            <p style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6, marginBottom: '2rem', flex: 1 }}>
              Instantly extract and summarize drug information from any clinical webpage or FDA label. Provides a quick-view panel with key metadata and clinical highlights.
            </p>
            
            <div className="bookmarklet-container" style={{ position: 'relative', width: '100%' }}>
              <div
                className="bookmarklet-button"
                style={{
                  backgroundColor: '#002e5d',
                  color: '#fff',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0, 46, 93, 0.15)',
                  display: 'inline-block',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                Label Insights Widget
              </div>
              <div className="bookmarklet-tooltip">Drag card to Bookmarks Bar</div>
            </div>
          </div>

          {/* Highlighter Card */}
          <div
            style={{
              backgroundColor: 'white',
              padding: 'clamp(1.5rem, 5vw, 2.5rem)',
              borderRadius: '28px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              position: 'relative'
            }}
            className="snippet-card"
          >
            {/* Bookmarklet Overlay */}
            <a
              ref={highlightBookmarkletRef}
              href="#"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                color: 'transparent',
                textDecoration: 'none',
                cursor: 'grab',
                userSelect: 'none',
                borderRadius: '28px'
              }}
              onClick={(e) => {
                if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
              }}
            >
              Smart Highlighter Widget
            </a>

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
              <div
                className="bookmarklet-button"
                style={{
                  backgroundColor: '#002e5d',
                  color: '#fff',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0, 46, 93, 0.15)',
                  display: 'inline-block',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                Smart Highlighter Widget
              </div>
              <div className="bookmarklet-tooltip">Drag card to Bookmarks Bar</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem', width: '100%', textAlign: 'center', maxWidth: '800px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.5rem' }}>See it in action</h3>
          <video
            src={withAppBase("/snippets/Animated_Tutorial_Medical_Snippet_Tool.mp4")}
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
          .snippet-card:hover .bookmarklet-button {
            filter: brightness(1.1);
            transform: scale(1.02);
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
          .snippet-card:hover .bookmarklet-tooltip {
            visibility: visible;
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        `}</style>
      </main>
    </div>
  );
}
