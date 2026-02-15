import React, { useState, useEffect, useRef } from 'react';
import { useSearchContext } from '../context/SearchContext';
import { useUser } from '../../context/UserContext';
import Link from 'next/link';

const Header: React.FC = () => {
  const { searchMode, setSearchMode } = useSearchContext();
  const { session, loading, updateAiProvider } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'ai' | 'user' | 'nav' | 'more' | null>(null);
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

  return (
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
        }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}>
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
             <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
             <polyline points="9 22 9 12 15 12 15 22"></polyline>
           </svg>
           Home
        </Link>
        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
          Agentic Search
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
          <a href="https://nctr-crs.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" className="hp-nav-item" style={{ fontSize: '1.15rem', padding: '8px 12px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
            FDALabel
          </a>
        )}

        <Link href="/search" className="hp-nav-item" style={{ fontSize: '1.35rem', padding: '8px 12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>
          Agentic Search
        </Link>

        <Link href="/dashboard" className="hp-nav-item" style={{ fontSize: '1.15rem', padding: '8px 12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          Dashboard
        </Link>

        <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('more')} onMouseLeave={() => setActiveDropdown(null)}>
          <button className="hp-nav-item" style={{ fontSize: '1.15rem', padding: '8px 12px' }}>
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
      <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: '0 0 250px', justifyContent: 'flex-end' }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {loading ? (
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
                  <span style={{ fontSize: '0.875rem', color: 'white' }}>{session.username}</span>
                </button>

                {activeDropdown === 'user' && (
                  <div className="dropdown-menu">
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ACCOUNT</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{session.username}</div>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                      <Link href="/dashboard" className="dropdown-item">My Dashboard</Link>
                      <a href="/api/dashboard/auth/change_password" className="dropdown-item">Change Password</a>
                      <a href="/api/dashboard/auth/logout" className="dropdown-item" style={{ color: '#ef4444' }}>Sign Out</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
};

export default Header;
