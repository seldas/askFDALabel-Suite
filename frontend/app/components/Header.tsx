'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUser } from '../context/UserContext';

type DropdownKey = 'user' | 'nav' | 'more' | 'ai' | null;

export type ActiveApp =
  | 'home'
  | 'fdalabel'
  | 'device'
  | 'afl'
  | 'dashboard'
  | 'labelcomp'
  | 'drugtox'
  | 'localquery'
  | 'snippet';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function inferActiveApp(pathname: string): ActiveApp {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname.startsWith('/search')) return 'afl';
  if (pathname.startsWith('/device')) return 'device';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/labelcomp')) return 'labelcomp';
  if (pathname.startsWith('/drugtox')) return 'drugtox';
  if (pathname.startsWith('/localquery')) return 'localquery';
  if (pathname.startsWith('/snippet')) return 'snippet';
  return 'home';
}

export default function Header({ 
  activeApp 
}: { 
  activeApp?: ActiveApp 
}) {
  const { session, loading, updateAiProvider, refreshSession, openAuthModal, activeTasks } = useUser();

  const pathname = usePathname();
  const resolvedActiveApp = useMemo(
    () => activeApp ?? inferActiveApp(pathname || ''),
    [activeApp, pathname]
  );

  const [isInternal, setIsInternal] = useState(false);
  const [fdaAccessible, setFdaAccessible] = useState(false);
  const [cderAccessible, setCderAccessible] = useState(false);
  const [allowLocalQuery, setAllowLocalQuery] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey | 'tasks'>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const totalActiveTasks = activeTasks.length;
  const avgProgress = totalActiveTasks > 0 
    ? Math.round(activeTasks.reduce((sum, t) => sum + t.progress, 0) / totalActiveTasks)
    : 0;

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkInternalStatus = async () => {
      try {
        const response = await fetch('/api/check-fdalabel', { method: 'POST' });
        const data = await response.json();
        setIsInternal(Boolean(data.isInternal));
        setFdaAccessible(Boolean(data.fdaAccessible));
        setCderAccessible(Boolean(data.cderAccessible));
        setAllowLocalQuery(Boolean(data.allowLocalQuery));
      } catch {
        setIsInternal(false);
        setFdaAccessible(false);
        setCderAccessible(false);
        setAllowLocalQuery(true);
      }
    };
    checkInternalStatus();
  }, []);

  const closeMobile = () => setMobileMenuOpen(false);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/dashboard/auth/logout', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) await refreshSession();
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <header className="header-main header-typography">
      {/* Left: Branding */}
      <div className="header-branding">
        <Link href="/" className="header-logo-link" onClick={closeMobile} aria-label="AskFDALabel Home">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="header-logo"
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
          AskFDALabel
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
      <nav className={cx('header-nav', mobileMenuOpen && 'open')}>
        {/* Search Dropdown (Drug & Device) */}
        <div
          className="hp-nav-dropdown"
          onMouseEnter={() => setActiveDropdown('nav')}
          onMouseLeave={() => setActiveDropdown(null)}
        >
          <button
            className={cx('hp-nav-item', (resolvedActiveApp === 'fdalabel' || resolvedActiveApp === 'device' || resolvedActiveApp === 'localquery') && 'is-active')}
            aria-current={(resolvedActiveApp === 'fdalabel' || resolvedActiveApp === 'device' || resolvedActiveApp === 'localquery') ? 'page' : undefined}
            onClick={(e) => e.preventDefault()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Official Database <span className="dropdown-caret">▼</span>
          </button>

          <div className={cx('hp-dropdown-content', activeDropdown === 'nav' && 'visible')} style={{ minWidth: '240px' }}>
            {/* Drug Search Section */}
            <div className="dropdown-section-label" style={{ padding: '8px 12px 4px', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
              Drug (FDALabel)
            </div>
            
            {allowLocalQuery && (
              <Link
                href="/localquery"
                className={cx('hp-dropdown-item', resolvedActiveApp === 'localquery' && 'is-active')}
                onClick={closeMobile}
              >
                <span className="hp-dropdown-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                  </svg>
                </span>
                <div>
                  <div className="dropdown-title">Label Archive</div>
                  <div className="dropdown-subtitle">Local Metadata Search</div>
                </div>

              </Link>
            )}

            {(fdaAccessible || cderAccessible) ? (
              <>
                {fdaAccessible && (
                  <a
                    href="https://fdalabel.fda.gov/fdalabel/ui/search"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hp-dropdown-item"
                    onClick={closeMobile}
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
                      <div className="dropdown-title">FDA version</div>
                      <div className="dropdown-subtitle">FDA-wide Interface</div>
                    </div>
                  </a>
                )}

                {cderAccessible && (
                  <a
                    href="https://fdalabel.fda.gov/fdalabel-r/ui/search"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hp-dropdown-item"
                    onClick={closeMobile}
                  >
                    <span className="hp-dropdown-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                    </span>
                    <div>
                      <div className="dropdown-title">CDER-CBER version</div>
                      <div className="dropdown-subtitle">Specific for PLR Labeling</div>
                    </div>
                  </a>
                )}
              </>
            ) : (
              <a
                href="https://nctr-crs.fda.gov/fdalabel/ui/search"
                target="_blank"
                rel="noopener noreferrer"
                className="hp-dropdown-item"
                onClick={closeMobile}
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
                  <div className="dropdown-title">Public FDALabel</div>
                  <div className="dropdown-subtitle">NCTR-CRS Public Access</div>
                </div>
              </a>
            )}

            <div className="dropdown-divider" style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
            
            {/* Device Search Section */}
            <div className="dropdown-section-label" style={{ padding: '8px 12px 4px', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
              Device (MAUDE/GUDID)
            </div>

            <Link
              href="/device"
              className={cx('hp-dropdown-item', resolvedActiveApp === 'device' && 'is-active')}
              onClick={closeMobile}
            >
              <span className="hp-dropdown-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77Z"></path>
                </svg>
              </span>
              <div>
                <div className="dropdown-title">Device Search</div>
                <div className="dropdown-subtitle">Safety & Labeling Data</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cx('hp-nav-item', resolvedActiveApp === 'dashboard' && 'is-active')}
          aria-current={resolvedActiveApp === 'dashboard' ? 'page' : undefined}
          onClick={closeMobile}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Dashboard
        </Link>

        {/* Label Compare */}
        <Link
          href="/labelcomp"
          className={cx('hp-nav-item', resolvedActiveApp === 'labelcomp' && 'is-active')}
          aria-current={resolvedActiveApp === 'labelcomp' ? 'page' : undefined}
          onClick={closeMobile}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
            <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
            <path d="M7 21h10"></path>
            <path d="M12 3v18"></path>
            <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>
          </svg>
          Compare
        </Link>

        {/* DrugTox */}
        <Link
          href="/drugtox"
          className={cx('hp-nav-item', resolvedActiveApp === 'drugtox' && 'is-active')}
          aria-current={resolvedActiveApp === 'drugtox' ? 'page' : undefined}
          onClick={closeMobile}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2v8"></path>
            <path d="M14 2v8"></path>
            <path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path>
            <path d="M6 18h12"></path>
            <path d="M6 22h12"></path>
            <circle cx="12" cy="13" r="10"></circle>
          </svg>
          DrugTox
        </Link>

        {/* Snippets / Addons */}
        <Link
          href="/snippet"
          className={cx('hp-nav-item', resolvedActiveApp === 'snippet' && 'is-active')}
          aria-current={resolvedActiveApp === 'snippet' ? 'page' : undefined}
          onClick={closeMobile}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7h-9"></path>
            <path d="M14 17H5"></path>
            <circle cx="17" cy="17" r="3"></circle>
            <circle cx="7" cy="7" r="3"></circle>
          </svg>
          Addons
        </Link>
      </nav>

      {/* Right: User Controls */}
      <div className={cx('header-controls', mobileMenuOpen && 'open')}>
        {loading ? (
          <span className="header-muted">Loading...</span>
        ) : session?.is_authenticated ? (
          <>
            {/* Active Tasks Indicator */}
            {totalActiveTasks > 0 && (
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()}>
                <button 
                  className={cx('dropdown-trigger header-chip', activeDropdown === 'tasks' && 'active')} 
                  onClick={() => setActiveDropdown(activeDropdown === 'tasks' ? null : 'tasks')}
                  style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #e0e7ff' }}
                >
                  <span className="pulse-dot"></span>
                  <span style={{ fontWeight: 800 }}>{totalActiveTasks} Active Task{totalActiveTasks > 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.8 }}>{avgProgress}%</span>
                  <span className="caret">▼</span>
                </button>

                {activeDropdown === 'tasks' && (
                  <div className="dropdown-menu" style={{ width: '280px', padding: '12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', padding: '0 4px' }}>
                      Background Operations
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {activeTasks.map(task => (
                        <div key={task.id} style={{ padding: '8px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              AE: {task.target_pt}
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1' }}>{task.progress}%</div>
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '6px' }}>Project: {task.project_title}</div>
                          <div style={{ width: '100%', height: '4px', background: '#eef2ff', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${task.progress}%`, height: '100%', background: '#6366f1', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Provider Dropdown */}
            <div className="custom-dropdown" onClick={(e) => e.stopPropagation()}>
              <button 
                className={cx('dropdown-trigger header-chip', activeDropdown === 'ai' && 'active')} 
                onClick={() => setActiveDropdown(activeDropdown === 'ai' ? null : 'ai')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                  <rect x="9" y="9" width="6" height="6"></rect>
                  <line x1="9" y1="1" x2="9" y2="4"></line>
                  <line x1="15" y1="1" x2="15" y2="4"></line>
                  <line x1="9" y1="20" x2="9" y2="23"></line>
                  <line x1="15" y1="20" x2="15" y2="23"></line>
                  <line x1="20" y1="9" x2="23" y2="9"></line>
                  <line x1="20" y1="15" x2="23" y2="15"></line>
                  <line x1="1" y1="9" x2="4" y2="9"></line>
                  <line x1="1" y1="15" x2="4" y2="15"></line>
                </svg>
                <span className="header-muted" style={{ fontWeight: 800 }}>{session.ai_provider?.toUpperCase()}</span>
                <span className="caret">▼</span>
              </button>

              {activeDropdown === 'ai' && (
                <div className="dropdown-menu">
                  {!isInternal && (
                    <button className={cx('dropdown-item', session.ai_provider === 'gemini' && 'active')} onClick={() => { updateAiProvider('gemini'); setActiveDropdown(null); }}>
                      Gemini
                    </button>
                  )}
                  {isInternal && (
                    <>
                      <button className={cx('dropdown-item', session.ai_provider === 'llama' && 'active')} onClick={() => { updateAiProvider('llama'); setActiveDropdown(null); }}>
                        LLAMA
                      </button>
                      <button className={cx('dropdown-item', session.ai_provider === 'elsa' && 'active')} onClick={() => { updateAiProvider('elsa'); setActiveDropdown(null); }}>
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
                className={cx('dropdown-trigger header-chip', activeDropdown === 'user' && 'active')} 
                onClick={() => setActiveDropdown(activeDropdown === 'user' ? null : 'user')}
              >
                <div className="avatar-circle">{session.username?.[0].toUpperCase()}</div>
                <span className="username-text" style={{ fontWeight: 800 }}>{session.username}</span>
                <span className="caret">▼</span>
              </button>

              {activeDropdown === 'user' && (
                <div className="dropdown-menu">
                  <div className="account-block">
                    <div className="account-label">ACCOUNT</div>
                    <div className="account-name">{session.username}</div>
                  </div>

                  <div className="account-actions">
                    <button onClick={() => { openAuthModal('change_password'); setActiveDropdown(null); }} className="dropdown-item">
                      Change Password
                    </button>
                    <button onClick={handleLogout} className="dropdown-item danger">
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
      <style jsx>{`
        .pulse-dot {
          width: 8px;
          height: 8px;
          background-color: #6366f1;
          border-radius: 50%;
          display: inline-block;
          margin-right: 8px;
          box-shadow: 0 0 0 rgba(99, 102, 241, 0.4);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(99, 102, 241, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
          }
        }

        .header-chip.active {
          background-color: #e0e7ff !important;
          border-color: #6366f1 !important;
        }
      `}</style>
    </header>
  );
}
