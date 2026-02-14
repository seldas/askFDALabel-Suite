'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { session, loading, updateAiProvider, refreshSession } = useUser();
  const [isInternal, setIsInternal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkInternalStatus = async () => {
      try {
        const response = await fetch("/api/check-fdalabel", {
          method: 'POST'
        });
        const data = await response.json();
        setIsInternal(data.isInternal);
      } catch (error) {
        setIsInternal(false);
      }
    };
    checkInternalStatus();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Main Header */}
      <header className="header-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link href="/" style={{ 
            backgroundColor: 'white', 
            padding: '5px', 
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none'
          }}>
             <img src="/askfdalabel_icon.svg" alt="Logo" style={{ height: '24px' }} />
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em' }}>
            askFDALabel <span style={{ fontWeight: 300, opacity: 0.8 }}>Suite</span>
          </h1>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {loading ? (
            <span style={{ fontSize: '0.875rem', opacity: 0.8 }}>Loading...</span>
          ) : session?.is_authenticated ? (
            <>
              {/* AI Provider Dropdown */}
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="dropdown-trigger"
                  onClick={() => setActiveDropdown(activeDropdown === 'ai' ? null : 'ai')}
                >
                  <span style={{ opacity: 0.7, fontWeight: 400 }}>AI:</span> 
                  {session.ai_provider?.toUpperCase()}
                  <span style={{ fontSize: '0.6rem' }}>▼</span>
                </button>
                
                {activeDropdown === 'ai' && (
                  <div className="dropdown-menu">
                    {!session.is_internal && (
                      <button className={`dropdown-item ${session.ai_provider === 'gemini' ? 'active' : ''}`} onClick={() => { updateAiProvider('gemini'); setActiveDropdown(null); }}>Gemini</button>
                    )}
                    {session.is_internal && (
                      <>
                        <button className={`dropdown-item ${session.ai_provider === 'openai' ? 'active' : ''}`} onClick={() => { updateAiProvider('openai'); setActiveDropdown(null); }}>LLAMA</button>
                        <button className={`dropdown-item ${session.ai_provider === 'elsa' ? 'active' : ''}`} onClick={() => { updateAiProvider('elsa'); setActiveDropdown(null); }}>ELSA</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* User Settings Dropdown */}
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="dropdown-trigger"
                  onClick={() => setActiveDropdown(activeDropdown === 'user' ? null : 'user')}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none' }}
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
                    fontWeight: 800
                  }}>
                    {session.username?.[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.875rem' }}>{session.username}</span>
                </button>

                {activeDropdown === 'user' && (
                  <div className="dropdown-menu">
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ACCOUNT</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{session.username}</div>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                      <a href="/api/dashboard/auth/change_password" className="dropdown-item">Change Password</a>
                      <a href="/api/dashboard/auth/logout" className="dropdown-item" style={{ color: '#ef4444' }}>Sign Out</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '12px' }}>
              <a href="/api/dashboard/auth/login" style={{ color: 'white', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>Login</a>
              <a href="/api/dashboard/auth/register" style={{ 
                color: 'white', 
                textDecoration: 'none', 
                fontSize: '0.875rem', 
                fontWeight: 600,
                background: 'var(--fda-blue)',
                padding: '4px 12px',
                borderRadius: '4px'
              }}>Register</a>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero-section" style={{ padding: '6rem 2rem' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <h1 className="suite-home-title-animated" style={{ fontSize: '4.5rem', fontWeight: 900, marginBottom: '1.5rem' }}>
            AskFDALabel
          </h1>  
          <span className="suite-home-title-animated" style={{ 
            position: 'absolute', 
            top: '10px', 
            right: '-75px',
            fontSize: '1.3rem', 
            fontWeight: 800,
            textTransform: 'uppercase',
            background: 'linear-gradient(to right, #166534 20%, #4ade80 50%, #166534 80%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.05em'
          }}>dev</span>
        </div>
        
        <p className="hero-subtitle-animated" style={{ maxWidth: '800px', margin: '0 auto', fontSize: '1.25rem', color: '#475569', lineHeight: 1.6, fontWeight: 500 }}>
          A specialized research suite providing semantic search, toxicological analysis, and advanced safety screening for FDA drug labeling information.
        </p>
      </section>

      {/* Main Grid */}
      <main className="card-grid">
        <div className="animate-fade-in-up delay-2">
                  {isInternal ? (
                    <ScientificCard 
                      title="Official FDALabel" 
                      description=""
                      icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>}
                    >
          
              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                <a 
                  href="https://fdalabel.fda.gov/fdalabel/ui/search" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '6px',
                    backgroundColor: '#f1f5f9',
                    color: '#002e5d',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  FDA
                </a>
                <a 
                  href="https://fdalabel.fda.gov/fdalabel-r/ui/search" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '6px',
                    backgroundColor: '#f1f5f9',
                    color: '#002e5d',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  CDER-CBER
                </a>
              </div>
            </ScientificCard>
          ) : (
            <ScientificCard 
              title="FDALabel Search" 
              description="Public interface for the official FDA drug label database."
              href="https://nctr-crs.fda.gov/fdalabel/ui/search"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>}
            />
          )}
        </div>
        <div className="animate-fade-in-up delay-3">
          <ScientificCard 
            title="Agentic Search" 
            description="Large language model powered reasoning across drug label datasets."
            href="/search"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>}
          />
        </div>
        <div className="animate-fade-in-up delay-4">
          <ScientificCard 
            title="Labeling Dashboard" 
            description="Integrated analysis dashboard for safety trends and label metadata."
            href="/dashboard"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>}
          />
        </div>
        <div className="animate-fade-in-up delay-5">
          <ScientificCard 
            title="Label Compare" 
            description="Detailed side-by-side linguistic and regulatory comparison of labels."
            href="/labelcomp"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>}
          />
        </div>
        <div className="animate-fade-in-up delay-6">
          <ScientificCard 
            title="DrugTox Intelligence" 
            description="Advanced toxicological data for DILI, DICT and DIRI."
            href="/drugtox"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v8"></path><path d="M14 2v8"></path><path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path><path d="M6 18h12"></path><path d="M6 22h12"></path><circle cx="12" cy="13" r="10"></circle></svg>}
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
          <ScientificCard 
            title="Snippet Store" 
            description="Browser bookmarklets and code utilities for automated label analysis."
            href="/snippet"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>}
          />
        </div>
      </main>

      {/* Research Focus / Mission Section */}
      <section style={{ 
        backgroundColor: '#f1f5f9', 
        padding: '4rem 2rem', 
        borderTop: '1px solid #e2e8f0',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h3 style={{ color: '#002e5d', fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>
            Advancing Regulatory Science through AI
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
            <div>
              <h4 style={{ color: '#0071bc', fontWeight: 700, marginBottom: '0.5rem' }}>Agentic Reasoning</h4>
              <p style={{ color: '#475569', lineHeight: 1.6, fontSize: '0.95rem' }}>
                We leverage large language models to move beyond keyword search, enabling researchers to ask complex clinical and pharmacological questions directly of the FDA label corpus.
              </p>
            </div>
            <div>
              <h4 style={{ color: '#0071bc', fontWeight: 700, marginBottom: '0.5rem' }}>Safety Surveillance</h4>
              <p style={{ color: '#475569', lineHeight: 1.6, fontSize: '0.95rem' }}>
                By integrating FAERS data trends with label comparison tools, we provide a unified dashboard for signal detection and regulatory history analysis.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      <footer style={{ 
        backgroundColor: '#002e5d', 
        color: 'white', 
        padding: '3rem 2rem', 
        marginTop: '4rem',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', opacity: 0.8, fontSize: '0.875rem' }}>
          <p style={{ marginBottom: '1rem' }}>
            <strong>askFDALabel Suite</strong> &copy; 2026. This is an on-going research effort that is not intended for production use.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <a href="https://www.fda.gov" target="_blank" style={{ color: 'white' }}>FDA.gov</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ScientificCard({ title, description, href, icon, children }: { title: string, description: string, href?: string, icon: React.ReactNode, children?: React.ReactNode }) {
  const content = (
    <div className="scientific-card">
      <div className="icon" style={{ color: 'var(--fda-blue)', marginBottom: '1.25rem', display: 'flex' }}>{icon}</div>
      <h2>{title}</h2>
      <p style={{ fontSize: '0.9375rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.5rem', flex: 1 }}>{description}</p>
      {children}
    </div>
  );

  if (href) {
    const isExternal = href.startsWith('http');
    if (isExternal) {
      return (
        <a href={href} style={{ textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    );
  }

  return content;
}
