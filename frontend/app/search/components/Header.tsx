import React, { useEffect, useRef } from 'react';
import { useSearchContext } from '../context/SearchContext';
import { useUser } from '../../context/UserContext';

const Header: React.FC = () => {
  const { searchMode, setSearchMode } = useSearchContext();
  const { session, loading, updateAiProvider } = useUser();
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (bookmarkletRef.current) {
      // Fetch + Eval approach to bypass CSP blocking of script.src
      const code = "javascript:(async function(){try{const r=await fetch('https://ncshpcgpu01:8845/drug-snippet/drug_snippet.js?t='+Date.now());const t=await r.text();const s=document.createElement('script');s.textContent=t;document.body.appendChild(s);}catch(e){alert('Failed to load: '+e)}})();";
      bookmarkletRef.current.setAttribute('href', code);
    }
  }, []);

  return (
    <header className="navbar">
      <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <a href="/" className="hp-nav-btn hp-btn-outline" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '50px', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: '0.85rem' }}>
          <span>&#127968;</span> Suite Home
        </a>
      </div>
      <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        
        {!loading && session?.is_authenticated && (
          <div className="hp-ai-switcher" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '4px 12px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 600 }}>AI:</span>
            <select 
              value={session.ai_provider} 
              onChange={(e) => updateAiProvider(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9em', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}
            >
              {!session.is_internal && (
                <>
                  <option value="gemini">Gemini</option>
                  <option value="gemma">Gemma 3</option>
                </>
              )}
              <option value="openai">OpenAI</option>
              {session.is_internal && <option value="elsa">ELSA</option>}
            </select>
          </div>
        )}

        <div className="mode-switch" style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <span style={{ marginRight: '8px', color: searchMode === 'v1' ? '#0077cc' : '#94a3b8', fontWeight: searchMode === 'v1' ? 'bold' : 'normal' }}>V1</span>
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '34px', height: '20px' }}>
              <input 
                type="checkbox" 
                checked={searchMode === 'v2'}
                onChange={() => setSearchMode(searchMode === 'v1' ? 'v2' : 'v1')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span className="slider round" style={{ 
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                backgroundColor: searchMode === 'v2' ? '#0077cc' : '#ccc', 
                transition: '.4s', borderRadius: '34px' 
              }}>
                <span style={{ 
                  position: 'absolute', content: "", height: '14px', width: '14px', left: '3px', bottom: '3px', 
                  backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                  transform: searchMode === 'v2' ? 'translateX(14px)' : 'translateX(0)'
                }}></span>
              </span>
            </label>
            <span style={{ marginLeft: '8px', color: searchMode === 'v2' ? '#0077cc' : '#94a3b8', fontWeight: searchMode === 'v2' ? 'bold' : 'normal' }}>Agentic (V2)</span>
        </div>
        <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {!loading && !session?.is_authenticated ? (
            <>
              <a href="/api/dashboard/auth/login?next=/dashboard" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Login</a>
              <a href="/api/dashboard/auth/register?next=/dashboard" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Register</a>
            </>
          ) : !loading && session?.is_authenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '24px', height: '24px', background: '#6366f1', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.75rem' }}>
                {session.username?.[0].toUpperCase()}
              </div>
            </div>
          )}
          <div className="bookmarklet-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <a 
              ref={bookmarkletRef}
              href="#"
              className="bookmarklet-button"
              style={{
                backgroundColor: '#eab308', /* yellow-500 */
                color: '#fff',
                padding: '4px 12px',
                borderRadius: '20px',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                cursor: 'grab',
                border: '1px solid #ca8a04',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onClick={(e) => {
                // Allow dragging, but prevent navigation if clicked
                if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
              }}
              title="Drag this button to your bookmarks bar!"
            >
              💊 Drug Snippet
            </a>
            <div className="bookmarklet-tooltip" style={{
              visibility: 'hidden',
              position: 'absolute',
              top: '120%',
              right: '0',
              backgroundColor: '#1e293b',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              width: '240px',
              textAlign: 'center',
              zIndex: 100,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              opacity: 0,
              transition: 'opacity 0.2s',
              lineHeight: '1.4'
            }}>
              <p style={{ margin: '0 0 8px 0' }}>Step 1: Drag this to your bookmarks bar.</p>
              <p style={{ margin: '0 0 8px 0' }}>Step 2: On Elsa Page, click the bookmark. </p>
              <p style={{ margin: '0 0 8px 0' }}>If successful, you will see <i style={{ color: '#eab308' }}>"Drug Snippet: Monitoring active..."</i> in the console.</p>
            </div>
            <style jsx>{`
              .bookmarklet-container:hover .bookmarklet-tooltip {
                visibility: visible !important;
                opacity: 1 !important;
              }
            `}</style>
          </div>
          <a target="_blank" rel="noreferrer" href="https://nctr-crs.fda.gov/fdalabel/ui/search">Link to FDALabel</a>
        </nav>
      </div>
    </header>
  );
};

export default Header;
