'use client';

import Link from 'next/link';
import { useUser } from './context/UserContext';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Header from "./components/Header";
import Footer from './components/Footer';

interface Project {
  id: number;
  title: string;
  role: string;
  count: number;
}

export default function HomePage() {
  const router = useRouter();
  const { session, loading, updateAiProvider, refreshSession, openAuthModal } = useUser();
  const [isInternal, setIsInternal] = useState(false);
  const [fdaAccessible, setFdaAccessible] = useState(false);
  const [cderAccessible, setCderAccessible] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | 'ai' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // New Search & Project State
  const [searchTerm, setSearchTerm] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const fetchProjects = async () => {
    if (!session?.is_authenticated) return;
    setProjectsLoading(true);
    try {
      const res = await fetch('/api/dashboard/projects');
      const data = await res.json();
      // Show only top 5 recent projects on home page
      setProjects((data.projects || []).slice(0, 5));
    } catch (e) {
      console.error("Failed to fetch projects", e);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.is_authenticated) {
      fetchProjects();
    }
  }, [session?.is_authenticated]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

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
        setFdaAccessible(data.fdaAccessible);
        setCderAccessible(data.cderAccessible);
      } catch (error) {
        setIsInternal(false);
        setFdaAccessible(false);
        setCderAccessible(false);
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
      <Header />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 2rem 4rem 2rem' }}>
        {/* Hero Section with AI Search */}
        <section style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 className="hero-title-animated" style={{ 
              fontSize: 'clamp(2.5rem, 8vw, 4.5rem)', 
              fontWeight: 900, 
              letterSpacing: '-0.02em',
              marginBottom: '0.5rem'
            }}>
              AskFDALabel
            </h1>

            {/* Database Stats Row */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '24px', 
              color: '#64748b', 
              fontSize: '0.9rem', 
              fontWeight: 600,
              marginTop: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#3b82f6', fontSize: '1.1rem' }}>📊</span>
                <span>157,513 Structured Labels</span>
              </div>
              <div style={{ width: '1px', height: '16px', background: '#e2e8f0', alignSelf: 'center' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#10b981', fontSize: '1.1rem' }}>🧬</span>
                <span>MedDRA v28.0 Integrated</span>
              </div>
              <div style={{ width: '1px', height: '16px', background: '#e2e8f0', alignSelf: 'center' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#f59e0b', fontSize: '1.1rem' }}>🛡️</span>
                <span>Grounded Regulatory AI</span>
              </div>
            </div>
          </div>

          {/* Central Search Bar */}
          <div style={{ maxWidth: '800px', margin: '2.5rem auto 2rem auto' }}>            <form onSubmit={handleSearch} style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ask about clinical data, safety, or dosing..."
                style={{
                  width: '100%',
                  padding: '1.25rem 4rem 1.25rem 1.5rem',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  fontSize: '1.1rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 15px -5px rgba(0, 0, 0, 0.1)',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
              <button 
                type="submit"
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: searchTerm.trim() ? '#6366f1' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  cursor: searchTerm.trim() ? 'pointer' : 'default',
                  fontSize: '1.2rem',
                  transition: 'all 0.2s ease'
                }}
                disabled={!searchTerm.trim()}
              >
                ➤
              </button>
            </form>

            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'center', 
              gap: '12px', 
              marginTop: '1.5rem' 
            }}>
              {[
                "Adverse events for Humira?",
                "Indications for Keytruda?",
                "Ozempic boxed warning?",
                "Mounjaro contraindications?"
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSearchTerm(suggestion);
                    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
                  }}
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '999px',
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    color: '#64748b',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontWeight: 600
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.color = '#334155';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.color = '#64748b';
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Recent Projects Section */}
        {session?.is_authenticated && (
          <section style={{ marginBottom: '3.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Recent Projects</h2>
              <Link href="/dashboard" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>
                View all projects →
              </Link>
            </div>
            
            {projectsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="loader" style={{ margin: '0 auto' }}></div>
              </div>
            ) : projects.length > 0 ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
                gap: '1.25rem' 
              }}>
                {projects.map(p => (
                  <Link 
                    key={p.id} 
                    href={`/dashboard?projectId=${p.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      padding: '1.5rem',
                      borderRadius: '16px',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      height: '100%',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '8px', 
                          background: '#f0f9ff', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: '#0369a1'
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </h3>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                        {p.count} labels • {p.role.toUpperCase()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ 
                padding: '3rem', 
                textAlign: 'center', 
                background: 'white', 
                borderRadius: '16px', 
                border: '1px dashed #e2e8f0' 
              }}>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>No projects yet. Import your first dataset to get started.</p>
                <Link 
                  href="/dashboard"
                  style={{
                    background: '#6366f1',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}
                >
                  Go to Dashboard
                </Link>
              </div>
            )}
          </section>
        )}

        {/* Secondary Services (The List) */}
        <section style={{ marginTop: '5rem', borderTop: '1px solid #e2e8f0', paddingTop: '5rem', paddingBottom: '5rem' }}>
          <div style={{ marginBottom: '3.5rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Platform Tools</h2>
            <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Specialized modules for deeper regulatory and clinical analysis.</p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <PlatformToolRow 
              title="Project Dashboard" 
              description="Integrated analysis dashboard for safety trends, metadata tracking, and project management."
              href="/dashboard"
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>}
            />

            <PlatformToolRow 
              title="Label Compare" 
              description="Detailed side-by-side linguistic and regulatory comparison of multiple drug labels with highlighted differences."
              href="/labelcomp"
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>}
            />

            <PlatformToolRow 
              title="askDrugTox" 
              description="Advanced toxicological data and safety profiles for DILI, heart, and kidney risk tracking across harmonized datasets."
              href="/drugtox"
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v8"></path><path d="M14 2v8"></path><path d="M8.5 15c.7 0 1.3-.5 1.5-1.2l.5-2.3c.2-.7.8-1.2 1.5-1.2s1.3.5 1.5 1.2l.5 2.3c.2.7.8 1.2 1.5 1.2"></path><path d="M6 18h12"></path><path d="M6 22h12"></path><circle cx="12" cy="13" r="10"></circle></svg>}
            />

            <PlatformToolRow 
              title="ELSA Widget" 
              description="Specialized browser bookmarklets for assisting label analysis and metadata extraction within Elsa."
              href="/snippet"
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>}
            />

            {/* Discrete Webtest link for internal use */}
            <div style={{ textAlign: 'right', marginTop: '-0.5rem', paddingRight: '0.5rem' }}>
              <Link 
                href="/webtest" 
                style={{ 
                  fontSize: '0.7rem', 
                  color: '#cbd5e1', 
                  textDecoration: 'none',
                  fontWeight: 500,
                  transition: 'color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#94a3b8'}
                onMouseOut={(e) => e.currentTarget.style.color = '#cbd5e1'}
              >
                FDALabel Auto Test Tool
              </Link>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}

function PlatformToolRow({ title, description, href, icon, children }: { title: string, description: string, href?: string, icon: React.ReactNode, children?: React.ReactNode }) {
  const content = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '1.5rem',
      borderRadius: '16px',
      background: 'white',
      border: '1px solid #e2e8f0',
      transition: 'all 0.2s ease',
      cursor: href ? 'pointer' : 'default',
      gap: '1.5rem'
    }}
    className="tool-row-hover"
    >
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6366f1',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748b', lineHeight: 1.5 }}>
          {description}
        </p>
        {children}
      </div>
      {href && (
        <div style={{ paddingLeft: '1rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6366f1' }}>Launch →</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    );
  }

  return content;
}
