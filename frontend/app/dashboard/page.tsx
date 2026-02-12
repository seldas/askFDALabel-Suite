'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardClient from './DashboardClient';

interface UserSession {
  is_authenticated: boolean;
  username?: string;
  ai_provider?: string;
  custom_gemini_key?: string;
  openai_api_key?: string;
  openai_base_url?: string;
  openai_model_name?: string;
  is_internal?: boolean;
}

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [session, setSession] = useState<UserSession | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/dashboard/auth/session');
        const data = await res.json();
        setSession(data);
      } catch (e) {
        console.error("Failed to fetch session", e);
      }
    }
    fetchSession();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard/results?drug_name=${encodeURIComponent(searchQuery)}`);
    }
  };

  const updateAiModel = async (provider: string) => {
    try {
      const res = await fetch('/api/dashboard/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'ai_provider': provider })
      });
      const data = await res.json();
      if (data.success) {
        setSession(prev => prev ? { ...prev, ai_provider: provider } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfigSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setConfigLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/dashboard/preferences', {
        method: 'POST',
        body: new URLSearchParams(formData as any),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const data = await res.json();
      if (data.success) {
        alert("Configuration saved!");
        window.location.reload();
      }
    } catch (e) {
      alert("Failed to save configuration");
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <main className="hp-main-layout">
      <DashboardClient />
      
      <div className="hp-container">
        <div className="hp-auth-nav">
          <a href="/" className="hp-nav-btn hp-btn-outline">
            <span>&#127968;</span> Suite Home
          </a>

          {session?.is_authenticated ? (
            <>
              <div className="hp-ai-switcher" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '5px 12px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 600 }}>AI:</span>
                <select 
                  value={session.ai_provider} 
                  onChange={(e) => updateAiModel(e.target.value)}
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
                <button id="ai-config-btn" title="AI Configuration" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>&#9881;</button>
              </div>

              <div className="hp-user-badge" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px' }}>
                <div className="hp-user-avatar" style={{ width: '32px', height: '32px', background: '#6366f1', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {session.username?.[0].toUpperCase()}
                </div>
                <span className="hp-welcome-text" style={{ fontSize: '0.9em', color: '#475569' }}>
                  Signed in as <strong>{session.username}</strong>
                </span>
              </div>
            </>
          ) : (
            <>
              <a href="/api/dashboard/auth/login" className="hp-nav-btn hp-btn-outline"><span>&#128100;</span> Login</a>
              <a href="/api/dashboard/auth/register" className="hp-nav-btn hp-btn-outline"><span>✨</span> Register</a>
            </>
          )}
          
          <div className="hp-theme-container" style={{ position: 'relative' }}>
            <button id="theme-toggle-btn" className="hp-nav-btn hp-btn-outline">
              <span>&#127928;</span> Theme
            </button>
            <div id="theme-dropdown" style={{ display: 'none', position: 'absolute', top: '120%', right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '150px', overflow: 'hidden', zIndex: 100 }}>
              <div className="theme-option" data-theme="modern" style={{ padding: '10px 15px', cursor: 'pointer' }}>✨ Modern</div>
              <div className="theme-option" data-theme="default" style={{ padding: '10px 15px', cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}>📄 Default</div>
              <div className="theme-option" data-theme="scientific" style={{ padding: '10px 15px', cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}>🔬 Scientific</div>
              <div className="theme-option" data-theme="playful" style={{ padding: '10px 15px', cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}>🎈 Playful</div>
            </div>
          </div>

          {session?.is_authenticated && (
            <>
              <a href="/api/dashboard/my_labelings" className="hp-nav-btn hp-btn-outline" target="AskFDALabel_MyProjects"><span>&#128188;</span> My Projects</a>
              <a href="/api/dashboard/auth/logout" className="hp-nav-btn hp-btn-outline"><span>&#8618;</span> Logout</a>
            </>
          )}
        </div>

        <div className="hp-hero">
          <h1>AskFDALabel</h1>
          <p className="hp-hero-subtitle">The Intelligence Layer for Drug Safety & Analysis</p>
        </div>

        <div className="hp-action-center">
          <div className="hp-import-row">
            <div id="excel-upload-box" className="hp-upload-box">
              <div className="hp-icon-container">
                <div className="hp-pill-animation">
                  <div className="hp-pill-half hp-pill-indigo"></div>
                  <div className="hp-pill-half hp-pill-sky"></div>
                </div>
              </div>
              <div className="hp-upload-text">Import FDALabel Excel</div>
              <div className="hp-upload-hint">Drag & drop or click to browse files</div>
            </div>
          </div>

          <div className="hp-ad-bar">
            <div className="hp-source-header">
              <img src="/dashboard/logo_FDALabel.jpg" alt="FDALabel Logo" className="hp-source-logo" />
              <p className="hp-ad-text">🚀 <strong>Transform your workflow.</strong> Get your customized drug list from the <strong>FDALabel website</strong> first.</p>
            </div>
            <div className="hp-import-links">
              <a href="https://nctr-crs.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer">FDALabel Public Version</a>
            </div>
          </div>

          <div className="hp-secondary-search">
            <span className="hp-search-label">Standard Search</span>
            <form id="search-form" onSubmit={handleSearch}>
              <div className="hp-search-wrapper">
                <input 
                  type="text" 
                  id="drug-name-input" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, Set ID, or NDC..." 
                  required 
                />
                <button type="submit" className="hp-search-btn">Search</button>
              </div>
            </form>
          </div>
        </div>

        <div className="hp-features">
          <div className="hp-feature-card">
            <span className="hp-feature-icon">&#128172;</span>
            <h3>Clinical Chat</h3>
            <p>Natural language interactions with full document citations.</p>
          </div>
          <div className="hp-feature-card">
            <span className="hp-feature-icon">&#9878;</span>
            <h3>Label Compare</h3>
            <p>Deep section alignment for PLR and non-PLR formats.</p>
          </div>
          <div className="hp-feature-card">
            <span className="hp-feature-icon">&#128202;</span>
            <h3>PV Assistant</h3>
            <p>Visualize FAERS trends and identify real-world safety signals.</p>
          </div>
          <div className="hp-feature-card">
            <span className="hp-feature-icon">&#129302;</span>
            <h3>Safety Agents</h3>
            <p>Automated toxicity screening using specialized AI domain knowledge.</p>
          </div>
        </div>
      </div>

      <div id="info-btn" className="floating-info-btn" style={{ cursor: 'pointer' }}>
        <span>&#8505;</span>
      </div>

      <div id="info-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content info-modal-content">
          <span className="close-modal" id="close-info-modal" style={{ position: 'absolute', top: '15px', right: '20px', zIndex: 10, cursor: 'pointer' }}>&times;</span>
          <div className="index-hero-container" style={{ paddingTop: '20px', textAlign: 'center' }}>
            <div className="hero-icon" style={{ fontSize: '3em', marginBottom: '0.2em' }}><span>&#8505;</span></div>
            <h1 style={{ fontSize: '2em' }}>About AskFDALabel</h1>
            <p className="hero-subtitle">Streamlining Drug Label Analysis for Professionals</p>
          </div>
          <div className="info-content" style={{ textAlign: 'left', padding: '0 40px 40px' }}>
            <p style={{ fontSize: '1.1em', color: '#495057', textAlign: 'center', maxWidth: '700px', margin: '0 auto 40px', lineHeight: '1.6' }}>
              AskFDALabel is an intelligent tool designed to assist healthcare practitioners and safety reviewers in navigating complex regulatory documents.
            </p>
          </div>
        </div>
      </div>

      {session?.is_authenticated && (
        <div id="ai-config-modal" className="custom-modal" style={{ display: 'none' }}>
          <div className="custom-modal-content" style={{ maxWidth: '600px', height: 'auto' }}>
            <div className="custom-modal-header">
              <h3>AI Configuration</h3>
              <span className="close-modal" id="close-ai-config" style={{ cursor: 'pointer' }}>&times;</span>
            </div>
            <div className="custom-modal-body">
              <form id="ai-config-form" onSubmit={handleConfigSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>AI Provider</label>
                  <select name="ai_provider" defaultValue={session.ai_provider} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {!session.is_internal && (
                      <>
                        <option value="gemini">Gemini (Default)</option>
                        <option value="gemma">Gemma 3 27B</option>
                      </>
                    )}
                    <option value="openai">OpenAI-Compatible</option>
                    {session.is_internal && <option value="elsa">ELSA (Internal)</option>}
                  </select>
                </div>
                
                <div style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', marginBottom: '15px', background: '#f8fafc' }}>
                   <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Gemini Key</label>
                      <input type="password" name="custom_gemini_key" defaultValue={session.custom_gemini_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                   <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>OpenAI Key</label>
                      <input type="password" name="openai_api_key" defaultValue={session.openai_api_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                   <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Base URL</label>
                      <input type="text" name="openai_base_url" defaultValue={session.openai_base_url} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                   <div>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Model Name</label>
                      <input type="text" name="openai_model_name" defaultValue={session.openai_model_name} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                </div>

                <div style={{ textAlign: 'right', marginTop: '20px' }}>
                  <button type="submit" disabled={configLoading} style={{ background: '#6f42c1', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' }}>
                    {configLoading ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
