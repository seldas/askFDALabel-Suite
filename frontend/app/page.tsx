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
          <div style={{ 
            backgroundColor: 'white', 
            padding: '5px', 
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
             <img src="/askfdalabel_icon.svg" alt="Logo" style={{ height: '32px' }} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
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
      <section className="hero-section">
        <h2 className="animate-fade-in-up" style={{ fontSize: '2.5rem', fontWeight: 800, color: '#002e5d', marginBottom: '1rem' }}>
          Scientific Drug Label Intelligence
        </h2>
        <p className="animate-fade-in-up delay-1" style={{ maxWidth: '800px', margin: '0 auto', fontSize: '1.25rem', color: '#475569', lineHeight: 1.6 }}>
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
                      icon="🏛️"
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
              icon="🏛️"
            />
          )}
        </div>
        <div className="animate-fade-in-up delay-3">
          <ScientificCard 
            title="Agentic Search" 
            description="Large language model powered reasoning across drug label datasets."
            href="/search"
            icon="🔍"
          />
        </div>
        <div className="animate-fade-in-up delay-4">
          <ScientificCard 
            title="Labeling Dashboard" 
            description="Integrated analysis dashboard for safety trends and label metadata."
            href="/dashboard"
            icon="📊"
          />
        </div>
        <div className="animate-fade-in-up delay-5">
          <ScientificCard 
            title="Label Compare" 
            description="Detailed side-by-side linguistic and regulatory comparison of labels."
            href="/labelcomp"
            icon="⚖️"
          />
        </div>
        <div className="animate-fade-in-up delay-6">
          <ScientificCard 
            title="DrugTox Intelligence" 
            description="Advanced toxicological data for hepatotoxicity, cardiotoxicity, and nephrotoxicity."
            href="/drugtox"
            icon="🧪"
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
          <ScientificCard 
            title="Scientific Snippets" 
            description="Developer tools, bookmarklets, and code utilities for label data extraction."
            href="/snippet"
            icon="📋"
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
            <strong>askFDALabel Suite</strong> &copy; 2026. This platform is intended for research and professional use.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <Link href="/" style={{ color: 'white' }}>Home</Link>
            <a href="https://www.fda.gov" target="_blank" style={{ color: 'white' }}>FDA.gov</a>
            <Link href="/dashboard" style={{ color: 'white' }}>Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ScientificCard({ title, description, href, icon, children }: { title: string, description: string, href?: string, icon: string, children?: React.ReactNode }) {
  const content = (
    <div className="scientific-card">
      <div className="icon">{icon}</div>
      <h2>{title}</h2>
      <p style={{ fontSize: '0.9375rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.5rem', flex: 1 }}>{description}</p>
      {children}
    </div>
  );

  if (href) {
    const isExternal = href.startsWith('http');
    if (isExternal) {
      return (
        <a href={href} style={{ textDecoration: 'none' }}>
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
