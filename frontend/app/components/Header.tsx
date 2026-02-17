'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext'; // <-- adjust this path to your actual UserContext location

type DropdownKey = 'user' | 'nav' | 'more' | 'ai' | null;

export default function Header() {
  const { session, loading, updateAiProvider, refreshSession, openAuthModal } = useUser();
  const [isInternal, setIsInternal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/dashboard/auth/logout', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        await refreshSession();
      }
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <header className="header-main">
      {/* Left: Branding */}
      <div className="header-branding">
        <Link href="/" className="header-logo-link" onClick={() => setMobileMenuOpen(false)}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: '#3b82f6' }}
          >
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
        onClick={(e) => {
          e.stopPropagation();
          setMobileMenuOpen((v) => !v);
        }}
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        )}
      </button>

      {/* Center: Main Navigation */}
      <nav className={`header-nav ${mobileMenuOpen ? 'open' : ''}`}>
        {isInternal ? (
          <div
            className="hp-nav-dropdown"
            onMouseEnter={() => setActiveDropdown('nav')}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button className="hp-nav-item" onClick={(e) => e.preventDefault()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18"></path>
                <path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path>
                <path d="M5 21V10.85"></path>
                <path d="M19 21V10.85"></path>
                <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path>
              </svg>
              FDALabel <span className="dropdown-caret">▼</span>
            </button>

            <div className={`hp-dropdown-content ${activeDropdown === 'nav' ? 'visible' : ''}`}>
              <a
                href="https://fdalabel.fda.gov/fdalabel/ui/search"
                target="_blank"
                rel="noopener noreferrer"
                className="hp-dropdown-item"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="hp-dropdown-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18"></path>
                    <path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path>
                    <path d="M5 21V10.85"></path>
                    <path d="M19 21V10.85"></path>
                    <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path>
                  </svg>
                </span>
                <div>
                  <div style={{ fontWeight: 800 }}>FDA Official</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Global Public Interface</div>
                </div>
              </a>

              <a
                href="https://fdalabel.fda.gov/fdalabel-r/ui/search"
                target="_blank"
                rel="noopener noreferrer"
                className="hp-dropdown-item"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="hp-dropdown-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </span>
                <div>
                  <div style={{ fontWeight: 800 }}>CDER-CBER</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Internal Review Interface</div>
                </div>
              </a>
            </div>
          </div>
        ) : (
          <a
            href="https://nctr-crs.fda.gov/fdalabel/ui/search"
            target="_blank"
            rel="noopener noreferrer"
            className="hp-nav-item"
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18"></path>
              <path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path>
              <path d="M5 21V10.85"></path>
              <path d="M19 21V10.85"></path>
              <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path>
            </svg>
            FDALabel
          </a>
        )}

        <Link href="/search" className="hp-nav-item hp-nav-item-flagship" onClick={() => setMobileMenuOpen(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <path d="M11 8a2 2 0 0 0-2 2"></path>
          </svg>
          AFL Agent
        </Link>

        <Link href="/dashboard" className="hp-nav-item" onClick={() => setMobileMenuOpen(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Dashboard
        </Link>

        <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('more')} onMouseLeave={() => setActiveDropdown(null)}>
          <button className="hp-nav-item" onClick={(e) => e.preventDefault()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
            </svg>
            More <span className="dropdown-caret">▼</span>
          </button>

          <div className={`hp-dropdown-content ${activeDropdown === 'more' ? 'visible' : ''}`}>
            <Link href="/labelcomp" className="hp-dropdown-item" onClick={() => setMobileMenuOpen(false)}>
              <span className="hp-dropdown-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
                  <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
                  <path d="M7 21h10"></path>
                  <path d="M12 3v18"></path>
                  <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>
                </svg>
              </span>
              <div>
                <div style={{ fontWeight: 800 }}>Label Compare</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Side-by-side analysis</div>
              </div>
            </Link>

            <Link href="/drugtox" className="hp-dropdown-item" onClick={() => setMobileMenuOpen(false)}>
              <span className="hp-dropdown-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2v8"></path>
                  <path d="M14 2v8"></path>
                  <path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path>
                  <path d="M6 18h12"></path>
                  <path d="M6 22h12"></path>
                  <circle cx="12" cy="13" r="10"></circle>
                </svg>
              </span>
              <div>
                <div style={{ fontWeight: 800 }}>DrugTox Intelligence</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 500 }}>Toxicity profile tracking</div>
              </div>
            </Link>

            <Link href="/snippet" className="hp-dropdown-item" onClick={() => setMobileMenuOpen(false)}>
              <span className="hp-dropdown-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7h-9"></path>
                  <path d="M14 17H5"></path>
                  <circle cx="17" cy="17" r="3"></circle>
                  <circle cx="7" cy="7" r="3"></circle>
                </svg>
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
                <span style={{ opacity: 0.7, fontWeight: 400 }}>AI:</span> {session.ai_provider?.toUpperCase()}
                <span style={{ fontSize: '0.6rem' }}>▼</span>
              </button>

              {activeDropdown === 'ai' && (
                <div className="dropdown-menu">
                  {!session.is_internal && (
                    <button
                      className={`dropdown-item ${session.ai_provider === 'gemini' ? 'active' : ''}`}
                      onClick={() => {
                        updateAiProvider('gemini');
                        setActiveDropdown(null);
                      }}
                    >
                      Gemini
                    </button>
                  )}
                  {session.is_internal && (
                    <>
                      <button
                        className={`dropdown-item ${session.ai_provider === 'openai' ? 'active' : ''}`}
                        onClick={() => {
                          updateAiProvider('openai');
                          setActiveDropdown(null);
                        }}
                      >
                        LLAMA
                      </button>
                      <button
                        className={`dropdown-item ${session.ai_provider === 'elsa' ? 'active' : ''}`}
                        onClick={() => {
                          updateAiProvider('elsa');
                          setActiveDropdown(null);
                        }}
                      >
                        ELSA
                      </button>
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
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    background: '#3b82f6',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}
                >
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
                      onClick={() => {
                        openAuthModal('change_password');
                        setActiveDropdown(null);
                      }}
                      className="dropdown-item"
                      style={{ width: '100%', cursor: 'pointer' }}
                    >
                      Change Password
                    </button>
                    <button onClick={handleLogout} className="dropdown-item" style={{ color: '#ef4444', width: '100%', cursor: 'pointer' }}>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="header-auth-buttons">
            <button onClick={() => openAuthModal('login')} className="btn-login">
              Login
            </button>
            <button onClick={() => openAuthModal('register')} className="btn-register">
              Register
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
