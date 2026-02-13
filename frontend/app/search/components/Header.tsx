import React, { useEffect, useRef } from 'react';
import { useSearchContext } from '../context/SearchContext';
import { useUser } from '../../context/UserContext';

const Header: React.FC = () => {
  const { searchMode, setSearchMode } = useSearchContext();
  const { session, loading, updateAiProvider } = useUser();

  return (
    <header className="header-main">
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <a href="/" style={{ 
          backgroundColor: 'white', 
          padding: '5px', 
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none'
        }}>
           <img src="/askfdalabel_icon.svg" alt="Logo" style={{ height: '24px' }} />
        </a>
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
        
        <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <a href="/" style={{ color: 'white', fontSize: '0.85rem', textDecoration: 'none', opacity: 0.9 }}>Suite Home</a>
        </nav>
      </div>
    </header>
  );
};

export default Header;
