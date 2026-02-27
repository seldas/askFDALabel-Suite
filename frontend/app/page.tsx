'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect } from 'react';
import Header from "./components/Header";
import Footer from './components/Footer';

export default function HomePage() {
  const { session, loading, updateAiProvider, refreshSession, openAuthModal } = useUser();
  const [isInternal, setIsInternal] = useState(false);
  const [simpleView, setSimpleView] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | 'ai' | null>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSimpleViewChange = (simple: boolean) => {
    setSimpleView(simple);
  };

  const features = [
    {
      title: "AskFDALabel Suite",
      description: "The ultimate intelligence layer for FDA drug labeling research. Seamlessly navigate over 150,000 product labels with AI-driven insights and advanced safety analytics.",
      image: "/carousel_bg/askfdalbel_bg.png"
    },
    {
      title: "AFL Agent",
      description: "Reason beyond keywords. Ask complex clinical and pharmacological questions directly of the FDA label corpus using large language models grounded in real text.",
      image: "/carousel_bg/afl_agent_bg.png"
    },
    {
      title: "Labeling Dashboard",
      description: "Visualize safety trends and manage clinical workspaces. Track metadata, monitor signal detection, and organize your labeling projects in one unified dashboard.",
      image: "/carousel_bg/dashboard_bg.png"
    },
    {
      title: "Side-by-Side Analysis",
      description: "Pinpoint critical regulatory differences. Compare linguistic nuances and safety updates across multiple drug labels with high-precision highlighting.",
      image: "/carousel_bg/labelcomp_bg.png"
    },
    {
      title: "DrugTox Intelligence",
      description: "Deep toxicological tracking. Monitor DILI, cardiac, and renal toxicity profiles across thousands of drugs using harmonized evidence-based data.",
      image: "/carousel_bg/drugtox_bg.png"
    },
    {
      title: "Snippet Store",
      description: "Power up your research workflow. Draggable browser bookmarklets that instantly extract metadata and highlight safety terms directly on any clinical webpage.",
      image: "/carousel_bg/snippetstore_bg_2.png"
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'true') {
      openAuthModal('login');
    }
  }, [openAuthModal]);

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
      <Header 
        simpleView={simpleView} 
        onSimpleViewChange={handleSimpleViewChange} 
      />

      {!simpleView && (
        <>
          {/* Hero / Immersive Mission Section */}
          <section className="mission-section" style={{ padding: '0rem 2rem 3rem 2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem', marginTop: '-2rem' }}>
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
              <p className="hero-subtitle-animated" style={{ color: '#94a3b8', fontSize: 'clamp(1rem, 2vw, 1.25rem)', maxWidth: '800px', margin: '2rem auto 0 auto', fontWeight: 500, lineHeight: 1.6, textAlign: 'center' }}>
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
        </>
      )}

      {/* Primary Service Grid */}
      <main className="card-grid">
        <div className="card-grid-inner">
          <div className="animate-fade-in-up delay-3">
            <ScientificCard 
              title="Project Dashboard" 
              description="Integrated analysis dashboard for safety trends, metadata tracking, and project management."
              href="/dashboard"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>}
            />
          </div>
          <div className="animate-fade-in-up delay-1">
            {isInternal ? (
              <ScientificCard 
                title="Access FDALabel" 
                description="Internal FDALabel interface for searching over 150,000 product labeling and 3,000 reference listed drug labeling. "
                icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>}
              >
                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                  <a href="https://fdalabel.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '6px', backgroundColor: '#f1f5f9', color: '#002e5d', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', border: '1px solid #cbd5e1' }}>FDA version</a>
                  <a href="https://fdalabel.fda.gov/fdalabel-r/ui/search" target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '6px', backgroundColor: '#f1f5f9', color: '#002e5d', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', border: '1px solid #cbd5e1' }}>CDER-CBER version</a>
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
              title="AI Assistant@FDALabel" 
              description="Large language model powered reasoning across drug label datasets for complex clinical questions."
              href="/search"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>}
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
              title="askDrugTox" 
              description="Advanced toxicological data and safety profiles for DILI, heart, and kidney risk tracking."
              href="/drugtox"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v8"></path><path d="M14 2v8"></path><path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path><path d="M6 18h12"></path><path d="M6 22h12"></path><circle cx="12" cy="13" r="10"></circle></svg>}
            />
          </div>
          <div className="animate-fade-in-up delay-6">
            <ScientificCard 
              title="Elsa Addons " 
              description="Specialized browser bookmarklets for assisting label analysis within Elsa."
              href="/snippet"
              icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>}
            />
          </div>
        </div>
      </main>
      
      <Footer />
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
