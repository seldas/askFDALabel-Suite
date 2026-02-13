'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { session, loading, updateAiProvider, refreshSession } = useUser();
  const [showAiModal, setShowAiModal] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    const checkInternalStatus = async () => {
      try {
        const response = await fetch("/api/check-fdalabel", {
          method: 'POST'
        });
        const data = await response.json();
        setIsInternal(data.isInternal);
      } catch (error) {
        setIsInternal(false);
      }
    };
    checkInternalStatus();
  }, []);

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
        await refreshSession();
        setShowAiModal(false);
      }
    } catch (e) {
      alert("Failed to save configuration");
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f8fafc',
      padding: '20px',
      position: 'relative'
    }}>
      {/* Top Navbar */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '15px'
      }}>
        {loading ? (
          <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Loading session...</div>
        ) : session?.is_authenticated ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '5px 12px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
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
              <button 
                onClick={() => setShowAiModal(true)}
                title="AI Configuration" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                {"\u2699"}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', background: '#6366f1', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {session.username?.[0].toUpperCase()}
              </div>
              <span style={{ fontSize: '0.9em', color: '#475569' }}>
                <strong>{session.username}</strong>
              </span>
            </div>
            <a href="/api/dashboard/auth/logout" style={{ 
              textDecoration: 'none', 
              color: '#ef4444', 
              fontSize: '0.85rem', 
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #fee2e2',
              backgroundColor: '#fff'
            }}>Logout</a>
          </>
        ) : (
          <>
            <a href="/api/dashboard/auth/login" style={{ 
              textDecoration: 'none', 
              color: '#6366f1', 
              fontSize: '0.85rem', 
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: '50px',
              border: '1px solid #e0e7ff',
              backgroundColor: '#fff'
            }}>Login</a>
            <a href="/api/dashboard/auth/register" style={{ 
              textDecoration: 'none', 
              color: '#10b981', 
              fontSize: '0.85rem', 
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: '50px',
              border: '1px solid #d1fae5',
              backgroundColor: '#fff'
            }}>Register</a>
          </>
        )}
      </div>

      <h1 style={{ color: '#1e293b', fontSize: '3rem', marginBottom: '1rem' }}>askFDALabel Suite</h1>
      <p style={{ color: '#64748b', fontSize: '1.25rem', marginBottom: '3rem', textAlign: 'center', maxWidth: '600px' }}>
        A unified platform for drug label analysis, safety screening, and agentic search.
      </p>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '2rem',
        width: '100%',
        maxWidth: '1200px'
      }}>
        {isInternal ? (
          <AppCard 
            title="FDALabel" 
            description="Access official internal FDALabel search interfaces."
            icon="🏛️"
            color="#1e293b"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
              <a 
                href="https://fdalabel.fda.gov/fdalabel/ui/search" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '8px',
                  backgroundColor: '#1e293b',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                FDA Version
              </a>
              <a 
                href="https://fdalabel.fda.gov/fdalabel-r/ui/search" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '8px',
                  backgroundColor: '#334155',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                CDER-CBER Version
              </a>
            </div>
          </AppCard>
        ) : (
          <AppCard 
            title="FDALabel" 
            description="Direct access to the official FDALabel public search interface."
            href="https://nctr-crs.fda.gov/fdalabel/ui/search"
            icon="🏛️"
            color="#1e293b"
          />
        )}
        <AppCard 
          title="Agentic Search" 
          description="Semantically search across FDA drug labels with AI-powered reasoning."
          href="/search"
          icon="🔍"
          color="#3b82f6"
        />
        <AppCard 
          title="Drug Analyzer" 
          description="Deep analysis of drug labels, comparison, and FAERS safety trends."
          href="/dashboard"
          icon="📊"
          color="#8b5cf6"
        />
        <AppCard 
          title="Label Compare" 
          description="Side-by-side comparison of different drug labels and versions."
          href="/labelcomp/"
          icon="⚖️"
          color="#ec4899"
        />
        <AppCard 
          title="DrugTox" 
          description="Advanced pharmacology intelligence for liver, heart, and kidney toxicity."
          href="/drugtox"
          icon="🧪"
          color="#10b981"
        />
        <AppCard 
          title="Snippet Store" 
          description="Code snippets and bookmarklets for enhanced productivity."
          href="/snippet"
          icon="📋"
          color="#f97316"
        />
      </div>
      
      <footer style={{ marginTop: '5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
        &copy; 2026 askFDALabel Project
      </footer>

      {/* AI Config Modal */}
      {showAiModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            maxWidth: '500px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>AI Configuration</h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <form onSubmit={handleConfigSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>AI Provider</label>
                <select name="ai_provider" defaultValue={session?.ai_provider} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  {!session?.is_internal && (
                    <>
                      <option value="gemini">Gemini (Default)</option>
                      <option value="gemma">Gemma 3 27B</option>
                    </>
                  )}
                  <option value="openai">OpenAI-Compatible</option>
                  {session?.is_internal && <option value="elsa">ELSA (Internal)</option>}
                </select>
              </div>
              
              <div style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', marginBottom: '15px', background: '#f8fafc' }}>
                 <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Gemini Key</label>
                    <input type="password" name="custom_gemini_key" defaultValue={session?.custom_gemini_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                 </div>
                 <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.9em' }}>OpenAI Key</label>
                    <input type="password" name="openai_api_key" defaultValue={session?.openai_api_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                 </div>
                 <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Base URL</label>
                    <input type="text" name="openai_base_url" defaultValue={session?.openai_base_url} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                 </div>
                 <div>
                    <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Model Name</label>
                    <input type="text" name="openai_model_name" defaultValue={session?.openai_model_name} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                 </div>
              </div>

              <div style={{ textAlign: 'right', marginTop: '20px' }}>
                <button type="submit" disabled={configLoading} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  {configLoading ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AppCard({ title, description, href, icon, color, children }: { title: string, description: string, href?: string, icon: string, color: string, children?: React.ReactNode }) {
  const cardContent = (
    <div style={{ 
      backgroundColor: 'white', 
      padding: '2rem', 
      borderRadius: '16px', 
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: href ? 'pointer' : 'default',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderTop: `6px solid ${color}`,
      position: 'relative'
    }}
    onMouseEnter={(e) => {
      if (href) {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
      }
    }}
    onMouseLeave={(e) => {
      if (href) {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
      }
    }}
    >
      <div style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>{icon}</div>
      <h2 style={{ color: '#1e293b', marginBottom: '0.75rem', fontSize: '1.5rem' }}>{title}</h2>
      <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: children ? '1.5rem' : '0' }}>{description}</p>
      {children}
    </div>
  );

  if (href) {
    const isExternal = href.startsWith('http') || href.startsWith('/labelcomp');
    if (isExternal) {
      return (
        <a href={href} style={{ textDecoration: 'none' }} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
          {cardContent}
        </a>
      );
    }
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
