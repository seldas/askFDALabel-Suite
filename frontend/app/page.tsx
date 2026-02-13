'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { session, loading, updateAiProvider, refreshSession } = useUser();
  const [showAiModal, setShowAiModal] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
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

  const handleConfigSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setConfigLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/dashboard/preferences', {
        method: 'POST',
        body: new URLSearchParams(formData as any),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const data = await res.json();
      if (data.success) {
        alert("Configuration saved!");
        await refreshSession();
        setShowAiModal(false);
      }
    } catch (e) {
      alert("Failed to save configuration");
    } finally {
      setConfigLoading(false);
    }
  };

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
                      <>
                        <button className={`dropdown-item ${session.ai_provider === 'gemini' ? 'active' : ''}`} onClick={() => { updateAiProvider('gemini'); setActiveDropdown(null); }}>Gemini 1.5 Pro</button>
                        <button className={`dropdown-item ${session.ai_provider === 'gemma' ? 'active' : ''}`} onClick={() => { updateAiProvider('gemma'); setActiveDropdown(null); }}>Gemma 3 27B</button>
                      </>
                    )}
                    <button className={`dropdown-item ${session.ai_provider === 'openai' ? 'active' : ''}`} onClick={() => { updateAiProvider('openai'); setActiveDropdown(null); }}>OpenAI / Custom</button>
                    {session.is_internal && (
                      <button className={`dropdown-item ${session.ai_provider === 'elsa' ? 'active' : ''}`} onClick={() => { updateAiProvider('elsa'); setActiveDropdown(null); }}>ELSA Internal</button>
                    )}
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                      <button className="dropdown-item" style={{ color: '#64748b' }} onClick={() => { setShowAiModal(true); setActiveDropdown(null); }}>
                        ⚙ Configure Keys...
                      </button>
                    </div>
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
                    <button className="dropdown-item" onClick={() => { setShowAiModal(true); setActiveDropdown(null); }}>
                      AI Configuration
                    </button>
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
            href="/labelcomp/"
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

      {/* AI Config Modal - keeping original logic but updated styles */}
      {showAiModal && (
        <div 
          className="animate-fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="animate-modal-enter"
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '100%',
              padding: '30px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, color: '#002e5d', fontSize: '1.5rem' }}>AI System Configuration</h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', fontSize: '2rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            
            <form onSubmit={handleConfigSubmit}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', fontSize: '0.875rem', color: '#334155' }}>PRIMARY PROVIDER</label>
                <select name="ai_provider" defaultValue={session?.ai_provider} style={{ width: '100%', padding: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '1rem' }}>
                  {!session?.is_internal && (
                    <>
                      <option value="gemini">Gemini (Default)</option>
                      <option value="gemma">Gemma 3 27B</option>
                    </>
                  )}
                  <option value="openai">OpenAI-Compatible</option>
                  {session?.is_internal && <option value="elsa">ELSA (Internal)</option>}
                </select>
              </div>
              
              <div style={{ border: '1px solid #e2e8f0', padding: '20px', borderRadius: '4px', marginBottom: '20px', background: '#f8fafc' }}>
                 <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>GEMINI API KEY</label>
                    <input type="password" name="custom_gemini_key" defaultValue={session?.custom_gemini_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                 </div>
                 <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>OPENAI API KEY</label>
                    <input type="password" name="openai_api_key" defaultValue={session?.openai_api_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                 </div>
                 <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>BASE URL</label>
                    <input type="text" name="openai_base_url" defaultValue={session?.openai_base_url} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', border: '1px solid #cbd5e1' }} placeholder="https://api.openai.com/v1" />
                 </div>
                 <div>
                    <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>MODEL NAME</label>
                    <input type="text" name="openai_model_name" defaultValue={session?.openai_model_name} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', border: '1px solid #cbd5e1' }} placeholder="gpt-4-turbo" />
                 </div>
              </div>

              <div style={{ textAlign: 'right', marginTop: '24px' }}>
                <button type="submit" disabled={configLoading} style={{ background: '#002e5d', color: 'white', border: 'none', padding: '12px 30px', borderRadius: '4px', fontWeight: '700', cursor: 'pointer', fontSize: '0.875rem' }}>
                  {configLoading ? 'PROCESSING...' : 'SAVE SETTINGS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
    const isExternal = href.startsWith('http') || href.startsWith('/labelcomp');
    if (isExternal) {
      return (
        <a href={href} style={{ textDecoration: 'none' }} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
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
