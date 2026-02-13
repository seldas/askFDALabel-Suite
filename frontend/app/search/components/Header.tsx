import React, { useState, useEffect, useRef } from 'react';
import { useSearchContext } from '../context/SearchContext';
import { useUser } from '../../context/UserContext';
import Link from 'next/link';

const Header: React.FC = () => {
  const { searchMode, setSearchMode } = useSearchContext();
  const { session, loading, updateAiProvider } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'ai' | 'user' | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
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
          Agentic Search
        </h1>
      </div>

      <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div className="mode-switch" style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', padding: '4px 12px', borderRadius: '20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span style={{ marginRight: '8px', color: searchMode === 'v1' ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: searchMode === 'v1' ? 'bold' : 'normal' }}>V1</span>
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '30px', height: '16px' }}>
              <input 
                type="checkbox" 
                checked={searchMode === 'v2'}
                onChange={() => setSearchMode(searchMode === 'v1' ? 'v2' : 'v1')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span className="slider round" style={{ 
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                backgroundColor: searchMode === 'v2' ? 'var(--fda-blue)' : '#ccc', 
                transition: '.4s', borderRadius: '34px' 
              }}>
                <span style={{ 
                  position: 'absolute', content: "", height: '12px', width: '12px', left: '2px', bottom: '2px', 
                  backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                  transform: searchMode === 'v2' ? 'translateX(14px)' : 'translateX(0)'
                }}></span>
              </span>
            </label>
            <span style={{ marginLeft: '8px', color: searchMode === 'v2' ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: searchMode === 'v2' ? 'bold' : 'normal' }}>Agentic (V2)</span>
        </div>

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
          <Link href="/" style={{ color: 'white', fontSize: '0.85rem', textDecoration: 'none', opacity: 0.9 }}>Suite Home</Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
