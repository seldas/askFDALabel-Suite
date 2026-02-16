'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect } from 'react';
import Modal from './components/Modal';

export default function HomePage() {
  const { session, loading, updateAiProvider, refreshSession } = useUser();
  const [isInternal, setIsInternal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | 'ai' | null>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modal states
  const [activeModal, setActiveModal] = useState<'login' | 'register' | 'change_password' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const features = [
    {
      title: "AskFDALabel Suite",
      description: "The ultimate intelligence layer for FDA drug labeling research. Seamlessly navigate over 150,000 product labels with AI-driven insights and advanced safety analytics.",
      image: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1200"
    },
    {
      title: "AFL Agent",
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

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    let endpoint = '/api/dashboard/auth/login';
    let body: any = { username, password };

    if (activeModal === 'register') {
      endpoint = '/api/dashboard/auth/register';
    } else if (activeModal === 'change_password') {
      endpoint = '/api/dashboard/auth/change_password';
      body = { password };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        await refreshSession();
        setActiveModal(null);
        setUsername('');
        setPassword('');
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('An unexpected error occurred');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/dashboard/auth/logout', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        await refreshSession();
      }
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Unified Header & Menu */}
      <header className="header-main">
        {/* Left: Branding */}
        <div className="header-branding">
          <Link href="/" className="header-logo-link">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3b82f6' }}>
               <path d="M12 2l8.66 5V17L12 22l-8.66-5V7L12 2z" strokeOpacity="0.3" />
               <path d="M12 22V12" strokeOpacity="0.3" />
               <path d="M12 12L3.34 7" strokeOpacity="0.3" />
               <path d="M12 12l8.66-5" strokeOpacity="0.3" />
               <path d="M7 16l5-9 5 9" stroke="#ffffff" strokeWidth="2.5" />
               <path d="M9 12h6" stroke="#ffffff" strokeWidth="2.5" />
               <circle cx="12" cy="12" r="2" fill="#3b82f6" stroke="#3b82f6" />
             </svg>
          </Link>
          <h1 className="header-title">
            AskFDALabel <span className="header-title-suffix">Suite</span>
          </h1>
        </div>

        {/* Mobile Toggle Button */}
        <button 
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          )}
        </button>

        {/* Center: Main Navigation */}
        <nav className={`header-nav ${mobileMenuOpen ? 'open' : ''}`}>
          {isInternal ? (
            <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('nav')} onMouseLeave={() => setActiveDropdown(null)}>
              <button className="hp-nav-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
                FDALabel <span className="dropdown-caret">▼</span>
              </button>
              <div className={`hp-dropdown-content ${activeDropdown === 'nav' ? 'visible' : ''}`}>
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
            <a href="https://nctr-crs.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" className="hp-nav-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
              FDALabel
            </a>
          )}

          <Link href="/search" className="hp-nav-item hp-nav-item-flagship">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>
            AFL Agent
          </Link>

          <Link href="/dashboard" className="hp-nav-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            Dashboard
          </Link>

          <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('more')} onMouseLeave={() => setActiveDropdown(null)}>
            <button className="hp-nav-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
              More <span className="dropdown-caret">▼</span>
            </button>
            <div className={`hp-dropdown-content ${activeDropdown === 'more' ? 'visible' : ''}`}>
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
        <div className={`header-controls ${mobileMenuOpen ? 'open' : ''}`}>
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
                        <button className={`dropdown-item ${session.elsa === 'elsa' ? 'active' : ''}`} onClick={() => { updateAiProvider('elsa'); setActiveDropdown(null); }}>ELSA</button>
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
                  <span className="username-text">{session.username}</span>
                </button>

                {activeDropdown === 'user' && (
                  <div className="dropdown-menu">
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ACCOUNT</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{session.username}</div>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                      <button 
                        onClick={() => { setActiveModal('change_password'); setActiveDropdown(null); }} 
                        className="dropdown-item"
                        style={{ width: '100%', cursor: 'pointer' }}
                      >
                        Change Password
                      </button>
                      <button 
                        onClick={handleLogout}
                        className="dropdown-item" 
                        style={{ color: '#ef4444', width: '100%', cursor: 'pointer' }}
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="header-auth-buttons">
              <button 
                onClick={() => setActiveModal('login')}
                className="btn-login"
              >
                Login
              </button>
              <button 
                onClick={() => setActiveModal('register')}
                className="btn-register"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero / Immersive Mission Section */}
      <section className="mission-section" style={{ padding: '4rem 2rem 6rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <h1 className="suite-home-title-animated" style={{ 
              fontSize: 'clamp(3.5rem, 10vw, 7.5rem)', 
              fontWeight: 900, 
              marginBottom: '0',
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              flexWrap: 'wrap'
            }}>
              <span>AskFDALabel</span>
              <span className="suite-home-title-animated no-reveal" style={{ 
                fontSize: 'clamp(0.8rem, 2vw, 1.1rem)', 
                fontWeight: 800,
                textTransform: 'uppercase',
                background: 'linear-gradient(to right, #166534 20%, #4ade80 50%, #166534 80%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '0.1em',
                padding: '4px 12px',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: '12px',
                alignSelf: 'center',
                marginTop: '0.5rem'
              }}>[dev]</span>
            </h1>
            <div className="suite-home-title-animated" style={{ 
              fontSize: 'clamp(1.2rem, 3.5vw, 2.5rem)', 
              fontWeight: 300, 
              opacity: 0.6,
              marginTop: '0.25rem',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              animationDelay: '0.2s'
            }}>
              Suite
            </div>
          </div>
          <p className="hero-subtitle-animated" style={{ color: '#94a3b8', fontSize: 'clamp(1rem, 2vw, 1.25rem)', maxWidth: '800px', margin: '2rem auto 0 auto', fontWeight: 500, lineHeight: 1.6 }}>
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
              title="AFL Agent" 
              description="Large language model powered reasoning across drug label datasets for complex clinical questions."
              href="/search"
              className="scientific-card-flagship"
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

      <Modal 
        isOpen={activeModal === 'login'} 
        onClose={() => { setActiveModal(null); setAuthError(null); setShowPassword(false); }}
        title="Sign In"
      >
        <form onSubmit={handleAuthAction} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {authError && <div style={{ color: '#ef4444', background: '#fef2f2', padding: '12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #fee2e2' }}>{authError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
              placeholder="Enter your username"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 48px 12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                placeholder="••••••••"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={authLoading}
            style={{ 
              marginTop: '8px',
              padding: '14px', 
              borderRadius: '12px', 
              border: 'none', 
              backgroundColor: '#002e5d', 
              color: 'white', 
              fontWeight: 800, 
              fontSize: '1rem',
              cursor: authLoading ? 'not-allowed' : 'pointer',
              opacity: authLoading ? 0.7 : 1,
              boxShadow: '0 4px 6px -1px rgba(0, 46, 93, 0.2)'
            }}
          >
            {authLoading ? 'Signing in...' : 'Sign In'}
          </button>
          <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
            Don't have an account? <button type="button" onClick={() => { setActiveModal('register'); setAuthError(null); setShowPassword(false); }} style={{ color: '#3b82f6', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Create one</button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={activeModal === 'register'} 
        onClose={() => { setActiveModal(null); setAuthError(null); setShowPassword(false); }}
        title="Create Account"
      >
        <form onSubmit={handleAuthAction} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {authError && <div style={{ color: '#ef4444', background: '#fef2f2', padding: '12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #fee2e2' }}>{authError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
              placeholder="Choose a username"
            />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Use only letters, numbers, and . @ _ - +</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 48px 12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                placeholder="••••••••"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={authLoading}
            style={{ 
              marginTop: '8px',
              padding: '14px', 
              borderRadius: '12px', 
              border: 'none', 
              backgroundColor: '#002e5d', 
              color: 'white', 
              fontWeight: 800, 
              fontSize: '1rem',
              cursor: authLoading ? 'not-allowed' : 'pointer',
              opacity: authLoading ? 0.7 : 1
            }}
          >
            {authLoading ? 'Creating account...' : 'Create Account'}
          </button>
          <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
            Already have an account? <button type="button" onClick={() => { setActiveModal('login'); setAuthError(null); setShowPassword(false); }} style={{ color: '#3b82f6', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Sign in</button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={activeModal === 'change_password'} 
        onClose={() => { setActiveModal(null); setAuthError(null); setShowPassword(false); }}
        title="Update Password"
      >
        <form onSubmit={handleAuthAction} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {authError && <div style={{ color: '#ef4444', background: '#fef2f2', padding: '12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #fee2e2' }}>{authError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 48px 12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                placeholder="••••••••"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>Confirm New Password</label>
            <input 
              type={showPassword ? "text" : "password"} 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={authLoading || (password !== confirmPassword && password !== '')}
            style={{ 
              marginTop: '8px',
              padding: '14px', 
              borderRadius: '12px', 
              border: 'none', 
              backgroundColor: '#002e5d', 
              color: 'white', 
              fontWeight: 800, 
              fontSize: '1rem',
              cursor: (authLoading || (password !== confirmPassword && password !== '')) ? 'not-allowed' : 'pointer',
              opacity: (authLoading || (password !== confirmPassword && password !== '')) ? 0.7 : 1
            }}
          >
            {authLoading ? 'Updating...' : 'Update Password'}
          </button>
          {password !== confirmPassword && confirmPassword !== '' && (
            <div style={{ color: '#ef4444', fontSize: '0.75rem', textAlign: 'center', fontWeight: 600 }}>Passwords do not match</div>
          )}
        </form>
      </Modal>
    </div>
  );
}

function ScientificCard({ title, description, href, icon, children, className }: { title: string, description: string, href?: string, icon: React.ReactNode, children?: React.ReactNode, className?: string }) {
  const content = (
    <div className={`scientific-card ${className || ''}`}>
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
