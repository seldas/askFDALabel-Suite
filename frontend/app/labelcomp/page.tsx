'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '../context/UserContext';
import Link from 'next/link';

interface LabelMetadata {
  set_id: string;
  brand_name: string;
  generic_name: string;
  manufacturer_name: string;
  effective_time: string;
  label_format: string;
}

interface ComparisonSection {
  title: string;
  key: string;
  nesting_level: number;
  contents: (string | null)[];
  is_same: boolean;
  is_empty: boolean;
  diff_html: string | null;
}

interface LabelCompData {
  labels: string[];
  comparison_data: ComparisonSection[];
  selected_labels_metadata: LabelMetadata[];
  drug_name: string | null;
  current_set_ids: string[];
  existing_summary: string | null;
  is_authenticated: boolean;
}

interface Project {
  id: number;
  title: string;
  count: number;
  role: string;
}

function LabelCompContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session, loading: userLoading } = useUser();
  const [data, setData] = useState<LabelCompData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'projects' | 'setid'>('projects');
  const [setIdInput, setSetIdInput] = useState('');
  
  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectLabels, setProjectLabels] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingLabels, setLoadingLabels] = useState(false);

  // Multi-select and Filter states
  const [selectedLabelsForAdd, setSelectedLabelsForAdd] = useState<any[]>([]);
  const [labelFilter, setLabelFilter] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryCollapsed, setAiSummaryCollapsed] = useState(false);

  // Collapse State
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const setIds = useMemo(() => searchParams.getAll('set_ids'), [searchParams]);

  useEffect(() => {
    if (setIds.length === 0) {
      setData(null);
      setAiSummary(null);
      return;
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/labelcomp/?json=1&${searchParams.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch comparison data');
        const json = await res.json();
        setData(json);
        setAiSummary(json.existing_summary);
        
        // Initialize all sections as expanded
        const initialCollapseState: Record<string, boolean> = {};
        json.comparison_data.forEach((s: ComparisonSection) => {
            initialCollapseState[s.key] = false;
        });
        setCollapsedSections(initialCollapseState);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [searchParams, setIds]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({
        ...prev,
        [key]: !prev[key]
    }));
  };

  const expandAll = () => {
    const newState: Record<string, boolean> = {};
    data?.comparison_data.forEach(s => newState[s.key] = false);
    setCollapsedSections(newState);
  };

  const collapseAll = () => {
    const newState: Record<string, boolean> = {};
    data?.comparison_data.forEach(s => newState[s.key] = true);
    setCollapsedSections(newState);
  };

  useEffect(() => {
    if (!showAddModal) {
      setSelectedLabelsForAdd([]);
      setLabelFilter('');
    }
  }, [showAddModal]);

  // Load projects when modal opens
  useEffect(() => {
    if (showAddModal && session?.is_authenticated) {
      fetchProjects();
    } else if (showAddModal && !session?.is_authenticated) {
        setAddTab('setid');
    }
  }, [showAddModal, session]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/dashboard/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchProjectLabels = async (project: Project) => {
    setLoadingLabels(true);
    setSelectedProject(project);
    try {
      const res = await fetch(`/api/dashboard/favorites_data?project_id=${project.id}`);
      const data = await res.json();
      setProjectLabels(data.favorites || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLabels(false);
    }
  };

  const toggleLabelSelection = (label: any) => {
    const isSelected = selectedLabelsForAdd.find(l => l.set_id === label.set_id);
    if (isSelected) {
      setSelectedLabelsForAdd(prev => prev.filter(l => l.set_id !== label.set_id));
    } else {
      if (selectedLabelsForAdd.length >= 10) {
        alert('Maximum 10 labels can be selected.');
        return;
      }
      setSelectedLabelsForAdd(prev => [...prev, label]);
    }
  };

  const handleBulkAdd = () => {
    if (selectedLabelsForAdd.length === 0) return;
    
    if (selectedLabelsForAdd.length >= 4) {
      setShowConfirmDialog(true);
    } else {
      confirmBulkAdd();
    }
  };

  const confirmBulkAdd = () => {
    const params = new URLSearchParams(searchParams.toString());
    let addedCount = 0;
    
    selectedLabelsForAdd.forEach(label => {
      if (!setIds.includes(label.set_id)) {
        params.append('set_ids', label.set_id);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      router.push(`/labelcomp?${params.toString()}`);
    }
    
    setShowAddModal(false);
    setShowConfirmDialog(false);
    setSelectedLabelsForAdd([]);
  };

  const handleAddLabel = (setId: string) => {
    const cleanId = setId.trim();
    if (!cleanId) return;
    
    if (setIds.includes(cleanId)) {
      alert('This label is already in the comparison.');
      return;
    }
    if (setIds.length >= 5) {
      alert('You can compare up to 5 labels at a time.');
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.append('set_ids', cleanId);
    router.push(`/labelcomp?${params.toString()}`);
    setShowAddModal(false);
    setSetIdInput('');
    setSelectedProject(null);
    setProjectLabels([]);
  };

  const handleRemoveLabel = (setId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const newIds = setIds.filter(id => id !== setId);
    params.delete('set_ids');
    newIds.forEach(id => params.append('set_ids', id));
    router.push(`/labelcomp?${params.toString()}`);
  };

  const generateAiSummary = async (force = false) => {
    if (!data) return;
    setSummaryGenerating(true);
    try {
      const diffData = data.comparison_data
        .filter(s => !s.is_same && !s.is_empty)
        .map(s => ({
          title: s.title,
          content1: s.contents[0],
          content2: s.contents[1]
        }));

      const res = await fetch('/api/labelcomp/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set_ids: data.current_set_ids,
          comparison_data: diffData,
          label_names: data.selected_labels_metadata.map(m => m.brand_name),
          force_refresh: force
        })
      });
      const result = await res.json();
      if (result.summary) setAiSummary(result.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setSummaryGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Unified Header & Menu */}
      <header className="header-main">
        {/* Left: Branding & Page Title */}
        <div className="header-branding">
          <Link href="/" className="header-logo-link" style={{ 
            background: 'rgba(255,255,255,0.15)',
            padding: '4px 12px',
            borderRadius: '20px',
            transition: 'all 0.2s ease'
          }}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
               <polyline points="9 22 9 12 15 12 15 22"></polyline>
             </svg>
             <span style={{ marginLeft: '8px', fontSize: '0.85rem', fontWeight: 700 }}>Home</span>
          </Link>
          <h1 className="header-title" style={{ fontSize: '1.1rem' }}>
            Label Comparison
          </h1>
        </div>

        {/* Mobile Toggle Button */}
        <button 
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          )}
        </button>

        {/* Center: Main Navigation */}
        <nav className={`header-nav ${mobileMenuOpen ? 'open' : ''}`}>
          {isInternal ? (
            <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('nav')} onMouseLeave={() => setActiveDropdown(null)}>
              <button className="hp-nav-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
                FDALabel <span className="dropdown-caret">▼</span>
              </button>
              <div className={`hp-dropdown-content ${activeDropdown === 'nav' ? 'visible' : ''}`}>
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
            <a href="https://nctr-crs.fda.gov/fdalabel/ui/search" target="_blank" rel="noopener noreferrer" className="hp-nav-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"></path><path d="M5 21V10.85"></path><path d="M19 21V10.85"></path><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"></path></svg>
              FDALabel
            </a>
          )}

          <Link href="/search" className="hp-nav-item hp-nav-item-flagship">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8a2 2 0 0 0-2 2"></path></svg>
            AFL Agent
          </Link>
          <Link href="/dashboard" className="hp-nav-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            Dashboard
          </Link>

          <div className="hp-nav-dropdown" onMouseEnter={() => setActiveDropdown('more')} onMouseLeave={() => setActiveDropdown(null)}>
            <button className="hp-nav-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
              More <span className="dropdown-caret">▼</span>
            </button>
            <div className={`hp-dropdown-content ${activeDropdown === 'more' ? 'visible' : ''}`}>
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
        <div className={`header-controls ${mobileMenuOpen ? 'open' : ''}`}>
          {userLoading ? (
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
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                <button 
                  className="dropdown-trigger"
                  onClick={() => setActiveDropdown(activeDropdown === 'user' ? null : 'user')}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'white' }}
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
                    fontWeight: 800,
                    color: 'white'
                  }}>
                    {session.username?.[0].toUpperCase()}
                  </div>
                  <span className="username-text" style={{ fontSize: '0.875rem', color: 'white' }}>{session.username}</span>
                </button>

                {activeDropdown === 'user' && (
                  <div className="dropdown-menu">
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ACCOUNT</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{session.username}</div>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      <a href="/dashboard" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>My Dashboard</a>
                      <a href="/api/dashboard/auth/change_password" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Change Password</a>
                      <a href="/api/dashboard/auth/logout" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#ef4444', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Sign Out</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <a href="/api/dashboard/auth/login?next=/labelcomp" style={{ color: 'white', fontSize: '0.875rem', textDecoration: 'none', background: 'rgba(255,255,255,0.1)', padding: '6px 16px', borderRadius: '20px' }}>Sign In</a>
          )}
          </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: 'clamp(2rem, 5vh, 4rem) clamp(1rem, 5vw, 2rem)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 5vh, 4rem)' }}>
          <h1 className="hero-title-animated" style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.025em' }}>
            Side-by-Side Analysis
          </h1>
          <p className="hero-subtitle-animated" style={{ 
            fontSize: 'clamp(1rem, 3vw, 1.25rem)', 
            color: '#64748b', 
            fontWeight: '500',
            textAlign: 'center',
            maxWidth: '800px',
            margin: '0 auto'
          }}>
            Compare and analyze drug labeling differences with AI assistance
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '3rem', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <button onClick={expandAll} style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, color: '#64748b', borderRight: '1px solid #e2e8f0', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Expand All</button>
              <button onClick={collapseAll} style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, color: '#64748b', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Collapse All</button>
          </div>
          <button 
              onClick={() => setShowAddModal(true)}
              style={{ 
              backgroundColor: '#10b981', 
              color: 'white', 
              border: 'none', 
              padding: '12px 32px', 
              borderRadius: '10px', 
              fontWeight: 800, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
              transition: 'all 0.2s ease',
              fontSize: '0.95rem'
              }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = '#059669'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = '#10b981'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Label
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '4rem' }}>Loading comparison data...</div>}
        {error && <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>Error: {error}</div>}
        
        {data && data.selected_labels_metadata.length > 0 && (
          <section className="side-by-side-grid" style={{ marginBottom: '3rem' }}>
            {data.selected_labels_metadata.map((meta) => (
              <div key={meta.set_id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative' }}>
                <button 
                  onClick={() => handleRemoveLabel(meta.set_id)}
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  &times;
                </button>
                <h3 style={{ color: '#002e5d', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{meta.brand_name}</h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
                  <p style={{ margin: '2px 0' }}><strong>Manufacturer:</strong> {meta.manufacturer_name}</p>
                  <p style={{ margin: '2px 0' }}><strong>Published:</strong> {meta.effective_time}</p>
                </div>
                <Link 
                  href={`/dashboard/label/${meta.set_id}`}
                  target="_blank"
                  style={{ 
                    display: 'block', 
                    marginTop: '1rem', 
                    fontSize: '0.85rem', 
                    color: '#3b82f6', 
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  View Full Label &rarr;
                </Link>
              </div>
            ))}
          </section>
        )}

        {/* AI Summary Section */}
        {data && data.selected_labels_metadata.length >= 2 && (
          <section style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '3rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiSummaryCollapsed ? '0' : '1.5rem' }}>
              <h3 
                onClick={() => setAiSummaryCollapsed(!aiSummaryCollapsed)}
                style={{ color: '#002e5d', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontSize: '0.8rem', transform: aiSummaryCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                <span>✨</span> AI Comparison Insight
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {session?.is_authenticated && (
                    <button 
                    onClick={() => generateAiSummary()}
                    disabled={summaryGenerating}
                    style={{ 
                        backgroundColor: '#002e5d', 
                        color: 'white', 
                        border: 'none', 
                        padding: '8px 16px', 
                        borderRadius: '6px', 
                        fontSize: '0.85rem', 
                        cursor: 'pointer',
                        opacity: summaryGenerating ? 0.7 : 1
                    }}
                    >
                    {summaryGenerating ? 'Analyzing...' : aiSummary ? 'Regenerate Summary' : 'Generate Summary'}
                    </button>
                )}
              </div>
            </div>
            
            {!aiSummaryCollapsed && (
                <div className="ai-summary-content" style={{ color: '#475569', lineHeight: 1.7, animation: 'fadeIn 0.2s' }}>
                {aiSummary ? (
                    <div dangerouslySetInnerHTML={{ __html: aiSummary }} />
                ) : (
                    <p style={{ fontStyle: 'italic' }}>
                    {session?.is_authenticated 
                        ? 'Click "Generate Summary" to let AI analyze the key differences between these labels.' 
                        : 'Sign in to generate an AI-powered comparison summary.'}
                    </p>
                )}
                </div>
            )}
          </section>
        )}

        {data && data.comparison_data.length > 0 ? (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {data.comparison_data.map((section, idx) => (
              <div key={idx} style={{ 
                borderBottom: '1px solid #f1f5f9', 
                backgroundColor: section.is_same ? '#fcfcfd' : 'white'
              }}>
                <div 
                    onClick={() => toggleSection(section.key)}
                    style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '1rem 1.5rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        marginLeft: `${section.nesting_level * 20}px`,
                    }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', transform: collapsedSections[section.key] ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                    <h4 style={{ margin: 0, color: section.is_same ? '#64748b' : '#002e5d', fontSize: '1rem', fontWeight: 700 }}>
                        {section.title}
                        {!section.is_empty && (
                        <span style={{ 
                            marginLeft: '10px', 
                            fontSize: '0.7rem', 
                            padding: '2px 8px', 
                            borderRadius: '4px',
                            backgroundColor: section.is_same ? '#f1f5f9' : '#fef2f2',
                            color: section.is_same ? '#94a3b8' : '#ef4444'
                        }}>
                            {section.is_same ? 'IDENTICAL' : 'CHANGES DETECTED'}
                        </span>
                        )}
                    </h4>
                  </div>
                </div>

                {!collapsedSections[section.key] && (
                    <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', animation: 'fadeIn 0.2s' }}>
                        {(section as any).is_major_change ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ 
                                    backgroundColor: '#fff7ed', 
                                    border: '1px solid #fed7aa', 
                                    borderRadius: '8px', 
                                    padding: '1rem', 
                                    color: '#9a3412',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                                    <div>
                                        <div style={{ fontWeight: 800 }}>Significant Section Overhaul</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Extensively rewritten. Granular highlighting disabled for readability.</div>
                                    </div>
                                </div>
                                <div className="side-by-side-grid" style={{ gap: '1rem' }}>
                                    {section.contents.map((content, cIdx) => {
                                        const meta = data.selected_labels_metadata[cIdx];
                                        return (
                                            <div key={cIdx} style={{ 
                                                fontSize: '0.9rem', 
                                                color: '#334155', 
                                                lineHeight: 1.6,
                                                padding: '2.25rem 1rem 1rem 1rem',
                                                backgroundColor: cIdx % 2 === 0 ? '#f8fafc' : '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                position: 'relative'
                                            }}>
                                                <div style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: '#002e5d', color: 'white', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                    {meta.brand_name}
                                                </div>
                                                {content ? <div dangerouslySetInnerHTML={{ __html: content }} /> : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not specified.</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="side-by-side-grid" style={{ gap: '1rem' }}>
                                {section.contents.map((content, cIdx) => {
                                    const meta = data.selected_labels_metadata[cIdx];
                                    const manufacturerSnippet = meta.manufacturer_name ? `${meta.manufacturer_name.substring(0, 5)}...` : 'N/A';
                                    const tagLabel = `${meta.brand_name} [${manufacturerSnippet}]`;
                                    
                                    // Use nuanced content if available, otherwise original content
                                    const displayContent = (section as any).nuanced_contents?.[cIdx] || content;

                                    return (
                                        <div key={cIdx} style={{ 
                                            fontSize: '0.9rem', 
                                            color: '#334155', 
                                            lineHeight: 1.6,
                                            padding: '2.25rem 1rem 1rem 1rem',
                                            backgroundColor: cIdx % 2 === 0 ? '#f8fafc' : '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            position: 'relative',
                                            minHeight: '100px'
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                left: '8px',
                                                backgroundColor: section.is_same ? '#64748b' : '#002e5d',
                                                color: 'white',
                                                fontSize: '0.65rem',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                maxWidth: '90%',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                zIndex: 1
                                            }} title={tagLabel}>
                                                {tagLabel}
                                            </div>
                                            {displayContent ? (
                                                <div dangerouslySetInnerHTML={{ __html: displayContent }} />
                                            ) : (
                                                <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not specified in this label.</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
              </div>
            ))}
          </div>
        ) : !loading && (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚖️</div>
            <h3 style={{ color: '#0f172a', marginBottom: '1rem' }}>No labels selected for comparison</h3>
            <p style={{ lineHeight: 1.6 }}>Use the "Add Label" button above to start your side-by-side research.</p>
          </div>
        )}
      </main>

      {/* Add Label Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '95%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(1rem, 5vw, 2rem)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
            
            {/* Bulk Add Button (Top Right) */}
            {selectedLabelsForAdd.length > 0 && (
                <button 
                    onClick={handleBulkAdd}
                    style={{ 
                        position: 'absolute', 
                        top: '1rem', 
                        right: '3.5rem', 
                        backgroundColor: '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        padding: '8px 16px', 
                        borderRadius: '6px', 
                        fontWeight: 700, 
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                        zIndex: 10
                    }}
                >
                    Add {selectedLabelsForAdd.length}
                </button>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#002e5d' }}>Add Labels</h3>
              <button onClick={() => { setShowAddModal(false); setSelectedProject(null); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            {/* Selected Badges Row */}
            {selectedLabelsForAdd.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', alignSelf: 'center', marginRight: '4px' }}>SELECTED:</span>
                    {selectedLabelsForAdd.map((l, i) => (
                        <div key={l.set_id} className="badge-container">
                            <div 
                                style={{ 
                                    width: '24px', 
                                    height: '24px', 
                                    borderRadius: '50%', 
                                    backgroundColor: '#002e5d', 
                                    color: 'white', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 800,
                                    cursor: 'help'
                                }}
                            >
                                {i + 1}
                            </div>
                            <div className="badge-tooltip">
                                <div style={{ color: '#94a3b8', fontSize: '0.6rem', marginBottom: '2px', fontWeight: 700, textTransform: 'uppercase' }}>Selected Label</div>
                                <div style={{ fontWeight: 600 }}>{l.brand_name}</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '4px' }}>{l.manufacturer_name}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Global Filter Bar */}
            <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                <input 
                    type="text" 
                    placeholder="Search labels..."
                    value={labelFilter}
                    onChange={(e) => setLabelFilter(e.target.value)}
                    style={{ 
                        width: '100%', 
                        padding: '12px 12px 12px 40px', 
                        borderRadius: '10px', 
                        border: '1px solid #e2e8f0', 
                        fontSize: '0.95rem',
                        outline: 'none',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
                    onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                />
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', background: '#f8fafc', padding: '4px', borderRadius: '12px', border: '1px solid #eef2f7' }}>
                <button 
                    onClick={() => setAddTab('projects')}
                    style={{ 
                        flex: 1,
                        padding: '10px 16px', 
                        borderRadius: '10px', 
                        border: 'none', 
                        backgroundColor: addTab === 'projects' ? '#ffffff' : 'transparent',
                        color: addTab === 'projects' ? '#0f172a' : '#64748b',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxShadow: addTab === 'projects' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    My Projects
                </button>
                <button 
                    onClick={() => setAddTab('setid')}
                    style={{ 
                        flex: 1,
                        padding: '10px 16px', 
                        borderRadius: '10px', 
                        border: 'none', 
                        backgroundColor: addTab === 'setid' ? '#ffffff' : 'transparent',
                        color: addTab === 'setid' ? '#0f172a' : '#64748b',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxShadow: addTab === 'setid' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    SET-ID Input
                </button>
            </div>

            {addTab === 'projects' ? (
                <div>
                    {!session?.is_authenticated ? (
                        <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem 2rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                          <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>Sign in to access your projects</p>
                          <a href="/api/dashboard/auth/login?next=/labelcomp" style={{ display: 'inline-block', padding: '8px 20px', background: '#002e5d', color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700 }}>Sign In Now</a>
                        </div>
                    ) : selectedProject ? (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', padding: '0 4px' }}>
                                <button onClick={() => setSelectedProject(null)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                  Back to Projects
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: selectedProject.title === 'Favorite' ? '#eab308' : '#6366f1' }}>
                                    {selectedProject.title === 'Favorite' ? (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    ) : (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                    )}
                                  </span>
                                  <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>{selectedProject.title}</h4>
                                </div>
                            </div>
                            {loadingLabels ? (
                                <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading labels...</p>
                            ) : (
                                <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }} className="custom-scrollbar">
                                    {projectLabels
                                      .filter(label => 
                                        !labelFilter || 
                                        (label.brand_name?.toLowerCase() || '').includes(labelFilter.toLowerCase()) || 
                                        (label.manufacturer_name?.toLowerCase() || '').includes(labelFilter.toLowerCase())
                                      )
                                      .map(label => {
                                        const isSelected = selectedLabelsForAdd.find(l => l.set_id === label.set_id);
                                        return (
                                            <div 
                                                key={label.set_id} 
                                                onClick={() => toggleLabelSelection(label)}
                                                style={{ 
                                                    padding: '14px 16px', 
                                                    borderRadius: '12px',
                                                    border: '1px solid',
                                                    borderColor: isSelected ? '#3b82f6' : '#f1f5f9', 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center',
                                                    cursor: 'pointer',
                                                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                                                    transition: 'all 0.2s ease',
                                                    boxShadow: isSelected ? '0 2px 8px rgba(59, 130, 246, 0.1)' : '0 1px 2px rgba(0,0,0,0.02)'
                                                }}
                                                onMouseOver={e => !isSelected && (e.currentTarget.style.borderColor = '#e2e8f0')}
                                                onMouseOut={e => !isSelected && (e.currentTarget.style.borderColor = '#f1f5f9')}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isSelected ? '#1e40af' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.brand_name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: isSelected ? '#3b82f6' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.manufacturer_name}</div>
                                                </div>
                                                <div style={{ 
                                                    marginLeft: '16px',
                                                    width: '22px', 
                                                    height: '22px', 
                                                    borderRadius: '6px', 
                                                    border: '2px solid',
                                                    borderColor: isSelected ? '#3b82f6' : '#cbd5e1',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: isSelected ? '#3b82f6' : 'white',
                                                    transition: 'all 0.2s ease'
                                                }}>
                                                    {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                                </div>
                                            </div>
                                        );
                                      })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }} className="custom-scrollbar">
                            {loadingProjects ? <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading projects...</p> : projects.map(p => (
                                <div
                                  key={p.id}
                                  onClick={() => fetchProjectLabels(p)}
                                  style={{
                                    padding: '16px 20px',
                                    borderRadius: '14px',
                                    border: '1px solid #f1f5f9',
                                    backgroundColor: '#ffffff',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                  }}
                                  onMouseOver={e => {
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                                  }}
                                  onMouseOut={e => {
                                    e.currentTarget.style.borderColor = '#f1f5f9';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                                  }}
                                >
                                  <div style={{ 
                                    width: '44px', 
                                    height: '44px', 
                                    borderRadius: '12px', 
                                    backgroundColor: p.title === 'Favorite' ? '#fef9c3' : '#f5f3ff', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    color: p.title === 'Favorite' ? '#eab308' : '#6366f1'
                                  }}>
                                    {p.title === 'Favorite' ? (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    ) : (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                    )}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginBottom: '2px' }}>{p.title}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>{p.count} labels • {p.role}</div>
                                  </div>
                                  <div style={{ color: '#cbd5e1' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                  </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.5 }}>Enter the unique SPL SET-ID (UUID) of the label you wish to add.</p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input 
                            type="text" 
                            placeholder="e.g. 01e46f58-8bda-4ff3-ab21-..."
                            value={setIdInput}
                            onChange={(e) => setSetIdInput(e.target.value)}
                            style={{ 
                              flex: 1, 
                              padding: '14px', 
                              borderRadius: '10px', 
                              border: '1px solid #e2e8f0', 
                              outline: 'none', 
                              fontFamily: 'monospace', 
                              fontSize: '0.9rem',
                              backgroundColor: '#f8fafc',
                              transition: 'all 0.2s ease'
                            }}
                            onFocus={e => {
                              e.currentTarget.style.borderColor = '#3b82f6';
                              e.currentTarget.style.backgroundColor = '#ffffff';
                            }}
                            onBlur={e => {
                              e.currentTarget.style.borderColor = '#e2e8f0';
                              e.currentTarget.style.backgroundColor = '#f8fafc';
                            }}
                        />
                        <button 
                            onClick={() => handleAddLabel(setIdInput)}
                            style={{ 
                              backgroundColor: '#002e5d', 
                              color: 'white', 
                              border: 'none', 
                              padding: '0 28px', 
                              borderRadius: '10px', 
                              cursor: 'pointer', 
                              fontWeight: 700,
                              boxShadow: '0 4px 12px rgba(0, 46, 93, 0.15)',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#003d7a'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = '#002e5d'}
                        >
                            Add Label
                        </button>
                    </div>
                </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔬</div>
                <h3 style={{ margin: '0 0 1rem 0', color: '#002e5d' }}>Complex Comparison</h3>
                <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                    You have selected <strong>{selectedLabelsForAdd.length} labels</strong>. Comparing many documents simultaneously may take longer to process. Proceed with analysis?
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setShowConfirmDialog(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={confirmBulkAdd} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#002e5d', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Proceed</button>
                </div>
            </div>
        </div>
      )}

      <style jsx global>{`
        .badge-container {
          position: relative;
          display: inline-block;
        }
        .badge-tooltip {
          visibility: hidden;
          width: 220px;
          background-color: #1e293b;
          color: #fff;
          text-align: center;
          border-radius: 8px;
          padding: 10px 14px;
          position: absolute;
          z-index: 100;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%) translateY(5px);
          opacity: 0;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          font-size: 0.8rem;
          line-height: 1.4;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
          pointer-events: none;
        }
        .badge-tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 6px;
          border-style: solid;
          border-color: #1e293b transparent transparent transparent;
        }
        .badge-container:hover .badge-tooltip {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .ai-summary-content h3 { color: #002e5d; margin-top: 0; font-size: 1.25rem; }
        .ai-summary-content h4 { color: #0071bc; margin: 1.5rem 0 0.5rem 0; font-size: 1rem; font-weight: 700; }
        .ai-summary-content ul { padding-left: 1.5rem; margin-bottom: 1rem; }
        .ai-summary-content li { margin-bottom: 0.5rem; }
        .summary-section { margin-bottom: 1.5rem; }

        .diff-table-wrapper { width: 100%; overflow-x: auto; }
        .diff { width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 0.85rem; }
        .diff td, .diff th { padding: 8px; border: 1px solid #e2e8f0; vertical-align: top; }
        .diff_header { background-color: #f1f5f9; color: #64748b; font-weight: 700; text-align: center; }
        .diff_next { display: none; }
        .diff_add, ins.diff-add { background-color: #dcfce7; color: #166534; text-decoration: none; border-radius: 2px; padding: 0 2px; }
        .diff_chg { background-color: #fef9c3; color: #854d0e; }
        .diff_sub, del.diff-sub { background-color: #fee2e2; color: #991b1b; text-decoration: line-through; border-radius: 2px; padding: 0 2px; }
      `}</style>
    </div>
  );
}

export default function LabelCompPage() {
  return (
    <Suspense fallback={<div>Loading Page...</div>}>
      <LabelCompContent />
    </Suspense>
  );
}