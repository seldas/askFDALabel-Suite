'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { session, loading, updateAiProvider, refreshSession } = useUser();
  const [isInternal, setIsInternal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | 'ai' | null>(null);
  const [activeFeature, setActiveFeature] = useState(0);

  const features = [
    {
      title: "AskFDALabel Suite",
      description: "The ultimate intelligence layer for FDA drug labeling research. Seamlessly navigate over 150,000 product labels with AI-driven insights and advanced safety analytics.",
      image: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1200"
    },
    {
      title: "Agentic Search",
      description: "Reason beyond keywords. Ask complex clinical and pharmacological questions directly of the FDA label corpus using large language models grounded in real text.",
      image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200"
    },
    {
      title: "Labeling Dashboard",
      description: "Visualize safety trends and manage clinical workspaces. Track metadata, monitor signal detection, and organize your labeling projects in one unified dashboard.",
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200"
    },
    {
      title: "Side-by-Side Analysis",
      description: "Pinpoint critical regulatory differences. Compare linguistic nuances and safety updates across multiple drug labels with high-precision highlighting.",
      image: "https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&q=80&w=1200"
    },
    {
      title: "DrugTox Intelligence",
      description: "Deep toxicological tracking. Monitor DILI, cardiac, and renal toxicity profiles across thousands of drugs using harmonized evidence-based data.",
      image: "https://images.unsplash.com/photo-1518152006812-edab29b069ac?auto=format&fit=crop&q=80&w=1200"
    },
    {
      title: "Snippet Store",
      description: "Power up your research workflow. Draggable browser bookmarklets that instantly extract metadata and highlight safety terms directly on any clinical webpage.",
      image: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=1200"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 15000);
    return () => clearInterval(timer);
  }, [features.length]);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Unified Header & Menu */}
      <header className="header-main" style={{ justifyContent: 'space-between', padding: '0.5rem 2rem' }}>
        {/* Left: Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '0 0 350px' }}>
          <Link href="/" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            textDecoration: 'none',
            color: 'white'
          }}>
             <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3b82f6' }}>
               <path d="M12 2l8.66 5V17L12 22l-8.66-5V7L12 2z" strokeOpacity="0.3" />
               <path d="M12 22V12" strokeOpacity="0.3" />
               <path d="M12 12L3.34 7" strokeOpacity="0.3" />
               <path d="M12 12l8.66-5" strokeOpacity="0.3" />
               <path d="M7 16l5-9 5 9" stroke="#ffffff" strokeWidth="2.5" />
               <path d="M9 12h6" stroke="#ffffff" strokeWidth="2.5" />
               <circle cx="12" cy="12" r="2" fill="#3b82f6" stroke="#3b82f6" />
             </svg>
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'white', letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            AskFDALabel <span style={{ fontWeight: 300, opacity: 0.7 }}>Suite</span>
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

          <Link href="/search" className="hp-nav-item" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>
            Agentic Search
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
          {loading ? (
            <span style={{ fontSize: '0.875rem', opacity: 0.8 }}>Loading...</span>
          ) : session?.is_authenticated ? (
            <>
              {/* AI Provider Dropdown */}
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="dropdown-trigger"
                  onClick={() => setActiveDropdown(activeDropdown === 'ai' ? null : 'ai')}
                  style={{ height: '36px', padding: '0 12px' }}
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
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', height: '36px', padding: '0 12px' }}
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
        </div>
      </header>

      {/* Hero / Immersive Mission Section */}
      <section className="mission-section" style={{ padding: '2rem 2rem 4rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <h1 className="suite-home-title-animated" style={{ fontSize: '7.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>
              AskFDALabel
            </h1>  
            <span className="suite-home-title-animated" style={{ 
              position: 'absolute', 
              top: '18px', 
              right: '-75px',
              fontSize: '1.1rem', 
              fontWeight: 800,
              textTransform: 'uppercase',
              background: 'linear-gradient(to right, #166534 20%, #4ade80 50%, #166534 80%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.05em'
            }}>[dev]</span>
          </div>
          <p className="hero-subtitle-animated" style={{ color: '#94a3b8', fontSize: '1.25rem', maxWidth: '800px', margin: '0 auto', fontWeight: 500 }}>
            Advancing Regulatory Science of Drug Labeling through AI
          </p>
        </div>

        <div className="mission-carousel-container" style={{ height: '420px' }}>
          {features.map((feature, idx) => (
            <div 
              key={idx} 
              className={`mission-carousel-card ${idx === activeFeature ? 'active' : ''}`}
            >
              <div 
                className="mission-card-bg animate-ken-burns" 
                style={{ backgroundImage: `url("${feature.image}")` }} 
              />
              <div className="mission-card-overlay" />
              <div className="mission-card-content">
                <h4>{feature.title}</h4>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mission-nav-dots" style={{ marginTop: '1rem' }}>
          {features.map((_, idx) => (
            <button
              key={idx}
              className={`mission-dot ${idx === activeFeature ? 'active' : ''}`}
              onClick={() => setActiveFeature(idx)}
              aria-label={`Go to feature ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Primary Service Grid */}
      <main className="card-grid">
        <div className="card-grid-inner">
          <div className="animate-fade-in-up delay-1">
            {isInternal ? (
              <ScientificCard 
                title="Official FDALabel" 
                description="Internal FDA interface for searching over 150,000 product labels and reference listed drugs."
                icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>}
              >
                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                  <a href="https://fdalabel.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '6px', backgroundColor: '#f1f5f9', color: '#002e5d', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', border: '1px solid #cbd5e1' }}>FDA Official</a>
                  <a href="https://fdalabel.fda.gov/fdalabel-r/ui/search" target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '6px', backgroundColor: '#f1f5f9', color: '#002e5d', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', border: '1px solid #cbd5e1' }}>CDER-CBER</a>
                </div>
              </ScientificCard>
            ) : (
              <ScientificCard 
                title="FDALabel Search" 
                description="Public interface for the official FDA drug label database and Structured Product Labeling (SPL)."
                href="https://nctr-crs.fda.gov/fdalabel/ui/search"
                icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>}
              />
            )}
          </div>
          <div className="animate-fade-in-up delay-2">
            <ScientificCard 
              title="Agentic Search" 
              description="Large language model powered reasoning across drug label datasets for complex clinical questions."
              href="/search"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>}
            />
          </div>
          <div className="animate-fade-in-up delay-3">
            <ScientificCard 
              title="Labeling Dashboard" 
              description="Integrated analysis dashboard for safety trends, metadata tracking, and project management."
              href="/dashboard"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>}
            />
          </div>
          <div className="animate-fade-in-up delay-4">
            <ScientificCard 
              title="Label Compare" 
              description="Detailed side-by-side linguistic and regulatory comparison of multiple drug labels."
              href="/labelcomp"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>}
            />
          </div>
          <div className="animate-fade-in-up delay-5">
            <ScientificCard 
              title="DrugTox Intelligence" 
              description="Advanced toxicological data and safety profiles for DILI, heart, and kidney risk tracking."
              href="/drugtox"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v8"></path><path d="M14 2v8"></path><path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path><path d="M6 18h12"></path><path d="M6 22h12"></path><circle cx="12" cy="13" r="10"></circle></svg>}
            />
          </div>
          <div className="animate-fade-in-up delay-6">
            <ScientificCard 
              title="Snippet Store" 
              description="Specialized browser tools and bookmarklets for automated label extraction and term highlighting."
              href="/snippet"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>}
            />
          </div>
        </div>
      </main>
      
      <footer style={{ 
        backgroundColor: '#002e5d', 
        color: 'white', 
        padding: '1rem 2rem', 
        marginTop: '0',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ maxWidth: '800px', opacity: 0.8, fontSize: '0.875rem' }}>
          <p style={{ marginBottom: '1.5rem', lineHeight: 1.6, color: 'white' }}>
            <strong>AskFDALabel Suite</strong> &copy; 2026. FDA/NCTR ** This is an on-going research effort that is not for official use yet.**.
          </p>
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
