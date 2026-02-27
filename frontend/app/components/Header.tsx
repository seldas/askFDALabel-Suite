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
  if (pathname.startsWith('/snippet')) return 'snippet';
  return 'home';
}

export default function Header({ 
  activeApp, 
  simpleView, 
  onSimpleViewChange 
}: { 
  activeApp?: ActiveApp, 
  simpleView?: boolean, 
  onSimpleViewChange?: (simple: boolean) => void 
}) {
  const { session, loading, updateAiProvider, refreshSession, openAuthModal, activeTasks } = useUser();

  const pathname = usePathname();
  const resolvedActiveApp = useMemo(
    () => activeApp ?? inferActiveApp(pathname || ''),
    [activeApp, pathname]
  );

  const [isInternal, setIsInternal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey | 'tasks'>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMoreActive = ['labelcomp', 'drugtox', 'snippet'].includes(resolvedActiveApp);

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
      } catch {
        setIsInternal(false);
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
          AskFDALabel <span className="header-title-suffix">Suite</span>
        </h1>
        {onSimpleViewChange && (
        <button
          type="button"
          className="simple-view-toggle"
          onClick={() => onSimpleViewChange(!simpleView)}
          aria-label={simpleView ? "Switch to default view" : "Switch to simple view"}
          title={simpleView ? "Default view" : "Simple view"}
          style={{
            marginLeft: 8,
            padding: 8,
            background: "transparent",
            border: "none",
            color: "inherit",              // inherit from theme
            opacity: 0.85,                 // quieter by default
            borderRadius: 8,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
            transition: "background 120ms ease, opacity 120ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          onFocus={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
          onBlur={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {simpleView ? (
            // Simple view icon: single square
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          ) : (
            // Default view icon: "layout" (split panel)
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d="M4 9h5" />
            </svg>
          )}
        </button>
      )}
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
            className={cx('hp-nav-item', (resolvedActiveApp === 'fdalabel' || resolvedActiveApp === 'device') && 'is-active')}
            aria-current={(resolvedActiveApp === 'fdalabel' || resolvedActiveApp === 'device') ? 'page' : undefined}
            onClick={(e) => e.preventDefault()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Search <span className="dropdown-caret">▼</span>
          </button>

          <div className={cx('hp-dropdown-content', activeDropdown === 'nav' && 'visible')} style={{ minWidth: '240px' }}>
            {/* Drug Search Section */}
            <div className="dropdown-section-label" style={{ padding: '8px 12px 4px', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
              Drug (FDALabel)
            </div>
            
            {isInternal ? (
              <>
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

        {/* AFL */}
        <Link
          href="/search"
          className={cx('hp-nav-item', resolvedActiveApp === 'afl' && 'is-active')}
          aria-current={resolvedActiveApp === 'afl' ? 'page' : undefined}
          onClick={closeMobile}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <path d="M11 8a2 2 0 0 0-2 2"></path>
          </svg>
          AI Assistant
        </Link>

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

        {/* More */}
        <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('more')} onMouseLeave={() => setActiveDropdown(null)}>
          <button className={cx('hp-nav-item', isMoreActive && 'is-active')} aria-current={isMoreActive ? 'page' : undefined} onClick={(e) => e.preventDefault()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
            </svg>
            More <span className="dropdown-caret">▼</span>
          </button>

          <div className={cx('hp-dropdown-content', activeDropdown === 'more' && 'visible')}>
            <Link
              href="/labelcomp"
              className={cx('hp-dropdown-item', resolvedActiveApp === 'labelcomp' && 'is-active')}
              aria-current={resolvedActiveApp === 'labelcomp' ? 'page' : undefined}
              onClick={closeMobile}
            >
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
                <div className="dropdown-title">Label Compare</div>
                <div className="dropdown-subtitle">Side-by-side analysis</div>
              </div>
            </Link>

            <Link
              href="/drugtox"
              className={cx('hp-dropdown-item', resolvedActiveApp === 'drugtox' && 'is-active')}
              aria-current={resolvedActiveApp === 'drugtox' ? 'page' : undefined}
              onClick={closeMobile}
            >
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
                <div className="dropdown-title">askDrugTox</div>
                <div className="dropdown-subtitle">Toxicity profile tracking</div>
              </div>
            </Link>

            <Link
              href="/snippet"
              className={cx('hp-dropdown-item', resolvedActiveApp === 'snippet' && 'is-active')}
              aria-current={resolvedActiveApp === 'snippet' ? 'page' : undefined}
              onClick={closeMobile}
            >
              <span className="hp-dropdown-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7h-9"></path>
                  <path d="M14 17H5"></path>
                  <circle cx="17" cy="17" r="3"></circle>
                  <circle cx="7" cy="7" r="3"></circle>
                </svg>
              </span>
              <div>
                <div className="dropdown-title">Elsa addons</div>
                <div className="dropdown-subtitle">Browser snippets</div>
              </div>
            </Link>
          </div>
        </div>
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
              <button className="dropdown-trigger header-chip" onClick={() => setActiveDropdown(activeDropdown === 'ai' ? null : 'ai')}>
                <span className="header-muted">AI:</span> {session.ai_provider?.toUpperCase()}
                <span className="caret">▼</span>
              </button>

              {activeDropdown === 'ai' && (
                <div className="dropdown-menu">
                  {!session.is_internal && (
                    <button className={cx('dropdown-item', session.ai_provider === 'gemini' && 'active')} onClick={() => { updateAiProvider('gemini'); setActiveDropdown(null); }}>
                      Gemini
                    </button>
                  )}
                  {session.is_internal && (
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
              <button className="dropdown-trigger header-chip" onClick={() => setActiveDropdown(activeDropdown === 'user' ? null : 'user')}>
                <div className="avatar-circle">{session.username?.[0].toUpperCase()}</div>
                <span className="username-text">{session.username}</span>
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
