'use client';

import { useEffect, useState, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { useUser } from '../../../context/UserContext';
import { withAppBase } from '../../../utils/appPaths';

// Modular Components
import LabelView from './label';
import FaersView from './faers';
import AgentView from './agent';
import DeepDiveView from './deepdive';
import './label.css';

// Shared Types
import { TOCItem, LabelData } from './types';

function TOCItemComponent({
  item,
  level = 0,
  expandedSections, 
  toggleSection,
  activeSectionId
}: { 
  item: TOCItem; 
  level?: number; 
  expandedSections: Set<string>; 
  toggleSection: (id: string) => void;
  activeSectionId?: string;
}) {
  const isExpanded = expandedSections.has(item.id);
  const isActive = item.id === activeSectionId;
  const hasChildren = item.children && item.children.length > 0;

  let specialClass = '';
  if (item.is_boxed_warning) specialClass = 'toc-boxed-warning';
  else if (item.is_highlights) specialClass = 'toc-highlights';
  else if (item.is_drug_facts) specialClass = 'toc-drug-facts';
  else if (item.is_drug_facts_item) specialClass = 'toc-drug-facts-item';

  return (
    <li className={`toc-item-level-${level} ${specialClass}`}>
      <div className="toc-item-container" style={{ padding: '0' }}>
        {hasChildren ? (
          <button 
            className={`toc-expander ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSection(item.id);
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        ) : (
          <div style={{ width: '18px' }}></div>
        )}
        <a 
          href={`#${item.id}`}
          className={`toc-link ${level === 0 ? 'root-link' : 'sub-link'} ${isActive ? 'active-section-link' : ''}`}
          style={isActive ? { backgroundColor: '#e0f2fe', color: '#0284c7', borderLeft: '3px solid #0284c7', paddingLeft: '7px' } : {}}
          onClick={() => {
            if (hasChildren && !isExpanded) {
              toggleSection(item.id);
            }
          }}
        >
          {item.title}
        </a>
      </div>
      {hasChildren && isExpanded && item.children && (
        <ol className="toc-sub-list">
          {item.children.map((child) => (
            <TOCItemComponent 
              key={child.id} 
              item={child} 
              level={level + 1} 
              expandedSections={expandedSections}
              toggleSection={toggleSection}
              activeSectionId={activeSectionId}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

function ExportSectionItem({ 
  item, 
  level = 0, 
  selectedSectionsForExport, 
  toggleSectionSelection 
}: { 
  item: any; 
  level?: number; 
  selectedSectionsForExport: Set<string>; 
  toggleSectionSelection: (id: string, includeChildren?: boolean) => void;
}) {
  const isSelected = selectedSectionsForExport.has(item.id);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div style={{ marginLeft: level * 12, marginBottom: '6px', borderLeft: level > 0 ? '1px solid #f1f5f9' : 'none', paddingLeft: level > 0 ? '8px' : '0' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', transition: 'background 0.2s ease' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
        <input 
          type="checkbox" 
          checked={isSelected} 
          onChange={(e) => toggleSectionSelection(item.id, true)} 
          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
        />
        <span style={{ 
          fontWeight: level === 0 ? 700 : 500, 
          color: isSelected ? '#0f172a' : '#64748b',
          fontSize: level === 0 ? '0.85rem' : '0.8rem',
          textTransform: level === 0 ? 'uppercase' : 'none',
          letterSpacing: level === 0 ? '0.02em' : 'normal'
        }}>
          {item.title}
        </span>
      </label>
      {hasChildren && item.children.map((child: any) => (
        <ExportSectionItem 
          key={child.id} 
          item={child} 
          level={level + 1} 
          selectedSectionsForExport={selectedSectionsForExport} 
          toggleSectionSelection={toggleSectionSelection} 
        />
      ))}
    </div>
  );
}

function LabelContent({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params);
  const router = useRouter();
  const { session, loading: userLoading, openAuthModal } = useUser();
  const [data, setData] = useState<LabelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('label-view');
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedSectionsForExport, setSelectedSectionsForExport] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'html' | 'xml' | 'text'>('html');
  const [techDetailsOpen, setTechDetailsOpen] = useState(false);
  const [ndcModalOpen, setNdcModalOpen] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);

  // Reset global legacy caches when setId changes to prevent stale data
  useEffect(() => {
    const win = window as any;
    win.meddraScanData = null;
    win.faersDataLoaded = false;
    win.trendCache = {};
    win.selectedTerms = new Set();
    console.log("Global legacy caches reset for setId:", setId);
  }, [setId]);

  // Robust initialization: wait for scripts to be ready
  useEffect(() => {
    if (!loading && data) {
      let attempts = 0;
      const interval = setInterval(() => {
        const win = window as any;
        attempts++;
        
        const scriptsReady = win.initUI && win.initFaers && win.initToxAgents && 
                           win.initChat && win.initAnnotations && win.initFavorites;

        if (scriptsReady) {
          console.log("Initializing legacy scripts...");
          win.initUI();
          win.initFaers();
          win.initToxAgents();
          win.initChat();
          win.initAnnotations();
          win.initFavorites();
          clearInterval(interval);

          // Trigger MedDRA Scan with a slight delay AFTER UI init
          setTimeout(() => {
            if (win.loadMeddraScan) {
              console.log("Triggering MedDRA Scan for setId:", setId);
              win.loadMeddraScan(setId);
            }
          }, 200);

        } else if (attempts > 50) {
          console.warn("Legacy scripts failed to load in time.");
          clearInterval(interval);
        }
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [loading, data, setId]);

  useEffect(() => {
    if (activeTab === 'faers-view') {
      const win = window as any;
      if (win.loadFaersData) {
        win.loadFaersData();
      }
    }

    // Auto-hide TOC sidebar for non-label views to give more space
    if (activeTab === 'label-view') {
      const win = window as any;
      if (win.initTableExtractor) {
        // Give it a tiny bit of time for the 'display: block' to take effect
        setTimeout(() => win.initTableExtractor(), 100);
      }
    }

    if (activeTab !== 'label-view') {
      setTocCollapsed(true);
    } else {
      setTocCollapsed(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (data) {
      const brand = data.brand_name || data.drug_name;
      const generic = data.generic_name;
      const effective = data.effective_time;
      
      const titleParts = [brand, generic, effective]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      
      document.title = titleParts.join(' - ');
    }
  }, [data]);

  const toggleSectionSelection = (id: string, includeChildren: boolean = true) => {
    setSelectedSectionsForExport((prev) => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(id);

      const findAndToggleRecursive = (items: any[], targetId: string, forceState: boolean) => {
        for (const item of items) {
          if (item.id === targetId) {
             if (forceState) next.add(item.id); else next.delete(item.id);
             if (includeChildren && item.children) {
                const toggleChildren = (childs: any[]) => {
                  childs.forEach(c => {
                    if (forceState) next.add(c.id); else next.delete(c.id);
                    if (c.children) toggleChildren(c.children);
                  });
                };
                toggleChildren(item.children);
             }
             return true;
          }
          if (item.children && findAndToggleRecursive(item.children, targetId, forceState)) return true;
        }
        return false;
      };

      const sectionsTree = [
        ...(data?.table_of_contents || [])
      ];

      findAndToggleRecursive(sectionsTree, id, !isCurrentlySelected);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedSectionsForExport.size === 0) {
      alert("Please select at least one section for export.");
      return;
    }

    try {
      const response = await fetch('/api/dashboard/export_sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set_id: data?.set_id,
          section_ids: Array.from(selectedSectionsForExport),
          format: exportFormat
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to generate export file.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = (data?.brand_name || data?.drug_name || 'label').replace(/[^a-z0-9]/gi, '_');
      a.download = `${cleanTitle}_sections.${exportFormat === 'text' ? 'txt' : exportFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setExportModalOpen(false);
    } catch (err: any) {
      alert(`Export Error: ${err.message}`);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!exportModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportModalOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [exportModalOpen]);

  useEffect(() => {
    if (!ndcModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNdcModalOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ndcModalOpen]);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/dashboard/label/${setId}?json=1`, {
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to fetch label data');
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [setId]);

  const ndcRaw = (data?.ndc || '').trim();
  const ndcTooLong = ndcRaw.length > 40;

  const ndcList = (() => {
    if (!ndcRaw) return [];
    return ndcRaw
      .split(/[\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
  })();

  const tabs = [
    { id: 'label-view', label: 'Label' },
    { id: 'deep-dive-view', label: 'Deep Dive' },
    { id: 'faers-view', label: 'FAERS' },
    { id: 'tox-view', label: 'Agents' },
  ];

  if (loading) {
    return (
      <div className="hp-main-layout">
        <div className="hp-container">
          <div className="loader" style={{ margin: '50px auto' }}></div>
          <p style={{ textAlign: 'center' }}>Loading label...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hp-main-layout">
        <div className="hp-container">
          <p style={{ color: 'red', textAlign: 'center' }}>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="results-container" style={{ height: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Main Header */}
      <header className="header-main" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, width: '100vw', justifyContent: 'space-between', padding: '0.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <a href="/" style={{ 
            color: 'white', 
            textDecoration: 'none', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            opacity: 0.9,
            background: 'rgba(255,255,255,0.15)',
            padding: '5px 14px',
            borderRadius: '20px',
            transition: 'all 0.2s ease',
            height: '36px'
          }}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
               <polyline points="9 22 9 12 15 12 15 22"></polyline>
             </svg>
             Home
          </a>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            Label View and Analysis
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '0 0 250px', justifyContent: 'flex-end' }}>
          {userLoading ? (
            <span style={{ fontSize: '0.875rem', opacity: 0.8, color: 'white' }}>Loading...</span>
          ) : session?.is_authenticated ? (
            <>
              <div style={{ 
                fontSize: '0.8rem', 
                color: 'white', 
                background: 'rgba(255,255,255,0.1)', 
                padding: '4px 12px', 
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }} title="AI model is set on the Home page">
                <span style={{ opacity: 0.7 }}>AI:</span>
                <span style={{ fontWeight: 700 }}>{session.ai_provider?.toUpperCase()}</span>
              </div>

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
                  <span style={{ fontSize: '0.875rem', color: 'white' }}>{session.username}</span>
                </button>

                {activeDropdown === 'user' && (
                  <div className="dropdown-menu" style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #f1f5f9',
                    minWidth: '200px',
                    zIndex: 1001,
                    overflow: 'hidden',
                    textAlign: 'left'
                  }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ACCOUNT</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{session.username}</div>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      <Link href="/dashboard" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>My Dashboard</Link>
                      <button 
                        onClick={() => { openAuthModal('change_password'); setActiveDropdown(null); }}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155' }} 
                        onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} 
                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        Change Password
                      </button>
                      <a href="/api/dashboard/auth/logout" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#ef4444', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Sign Out</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button 
              onClick={() => openAuthModal('login')}
              style={{ color: 'white', fontSize: '0.875rem', border: 'none', background: 'rgba(255,255,255,0.1)', padding: '6px 16px', borderRadius: '20px', cursor: 'pointer' }}
            >
              Sign In
            </button>
          )}
        </div>
      </header>
      
      <div style={{ display: 'flex', flex: 1, paddingTop: '60px', overflow: 'hidden' }}>
        {/* Main Content Area */}
        <div id="main-content" className="main-content expanded" style={{ 
            transition: 'margin-left 0.3s ease', 
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 0
        }}>
          <div className="content-scroll-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0' }}>
            
            <div className="container" style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            
            {/* DRUG METADATA */}
            <div className="label-header" style={{ marginBottom: '20px', background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '40px' }}>
                        <div style={{ flex: '0 1 60%', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
                                <h1 className="DocumentTitle" style={{ 
                                  margin: 0, 
                                  fontSize: '2.25rem', 
                                  fontWeight: 800, 
                                  letterSpacing: '-0.04em', 
                                  color: '#0f172a',
                                  lineHeight: 1.1,
                                  wordBreak: 'break-word',
                                  fontFamily: 'var(--font-inter), sans-serif',
                                  textShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                  textTransform: 'capitalize'
                                }}>
                                  {([data.brand_name || data.drug_name, data.effective_time]
                                          .filter(Boolean)
                                          .join(' - ')
                                          .toLowerCase())}
                                </h1>
                                <span style={{ 
                                    backgroundColor: data.label_format === 'PLR' ? '#dcfce7' : '#f1f5f9',
                                    color: data.label_format === 'PLR' ? '#166534' : '#64748b',
                                    padding: '6px 14px',
                                    borderRadius: '30px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    flexShrink: 0,
                                    marginTop: '8px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}>
                                    {data.label_format}
                                </span>
                                {data.is_rld && (
                                  <span style={{ 
                                      backgroundColor: '#fef2f2',
                                      color: '#ef4444',
                                      padding: '6px 14px',
                                      borderRadius: '30px',
                                      fontSize: '0.75rem',
                                      fontWeight: 900,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      flexShrink: 0,
                                      marginTop: '8px',
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                      border: '1px solid #fee2e2'
                                  }}>
                                      RLD
                                  </span>
                                )}
                                {data.is_rs && (
                                  <span style={{ 
                                      backgroundColor: '#f0fdf4',
                                      color: '#16a34a',
                                      padding: '6px 14px',
                                      borderRadius: '30px',
                                      fontSize: '0.75rem',
                                      fontWeight: 900,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      flexShrink: 0,
                                      marginTop: '8px',
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                      border: '1px solid #dcfce7'
                                  }}>
                                      RS
                                  </span>
                                )}
                            </div>
                            {data.generic_name && (
                                <div style={{ 
                                    fontSize: '1rem', 
                                    fontWeight: 600, 
                                    color: '#64748b', 
                                    marginTop: '2px',
                                    fontStyle: 'italic',
                                    maxWidth: '100%',
                                    wordBreak: 'break-word'
                                }}>
                                    {data.generic_name}
                                </div>
                            )}
                        </div>
                    {session?.is_authenticated && (
                      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                          <button 
                            onClick={() => {
                              const allIds = new Set<string>();
                              const addIdsRecursive = (items: any[]) => {
                                items.forEach(i => {
                                  allIds.add(i.id);
                                  if (i.children && i.children.length > 0) {
                                    addIdsRecursive(i.children);
                                  }
                                });
                              };
                              if (data.table_of_contents) {
                                addIdsRecursive(data.table_of_contents);
                              }
                              setSelectedSectionsForExport(allIds);
                              setExportModalOpen(true);
                            }}
                            title="Export Selected Sections"
                            style={{ 
                                background: '#f1f5f9', 
                                border: '1px solid #e2e8f0', 
                                color: '#475569', 
                                padding: '8px 14px', 
                                borderRadius: '10px', 
                                fontSize: '0.8rem', 
                                fontWeight: 800, 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          >
                             <span style={{ fontSize: '1rem' }}>{"\u2913"}</span> EXPORT
                          </button>

                          <button 
                               onClick={async () => {
                                 try {
                                   const response = await fetch(`/api/dashboard/meddra/profile/${setId}`);
                                   if (!response.ok) throw new Error("Failed to fetch MedDRA profile");
                                   const dataJson = await response.json();
                                   const blob = new Blob([JSON.stringify(dataJson, null, 2)], { type: 'application/json' });
                                   const url = window.URL.createObjectURL(blob);
                                   const a = document.createElement('a');
                                   a.href = url;
                                   a.download = `MedDRA_Profile_${dataJson.metadata?.brand_name || setId}.json`;
                                   document.body.appendChild(a);
                                   a.click();
                                   window.URL.revokeObjectURL(url);
                                   document.body.removeChild(a);
                                 } catch (err) {
                                   console.error("MedDRA Profile Export Error:", err);
                                   alert("Failed to export MedDRA profile.");
                                 }
                               }}
                             title="Export MedDRA Profile JSON"
                             style={{ 
                                background: '#f1f5f9', 
                                border: '1px solid #e2e8f0', 
                                color: '#6366f1', 
                                padding: '8px 14px', 
                                borderRadius: '10px', 
                                fontSize: '0.8rem', 
                                fontWeight: 800, 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          >
                             <span style={{ fontSize: '1rem' }}>{"\u2b21"}</span> MedDRA Profile
                          </button>
                          <button id="favorite-btn" className="favorite-btn" title="Toggle Project" style={{ background:'none', border:'none', cursor:'pointer', fontSize: '2rem', color: '#cbd5e1', padding: 0 }}>
                              {"\u2606"}
                          </button>
                      </div>
                    )}
                </div>

                <div className="label-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginTop: '24px' }}>
                    {data.has_boxed_warning && (
                    <div className="meta-item" style={{ gridColumn: '1 / -1', backgroundColor: '#fff1f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.5rem', color: '#e11d48' }}>{"\u26A0"}</span>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: '#e11d48', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Clinical Alert</span>
                            <span style={{ fontWeight: 700, color: '#9f1239', fontSize: '0.95rem' }}>Boxed Warning Information Present</span>
                        </div>
                    </div>
                    )}
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '4px' }}>Manufacturer</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>{data.manufacturer_name || 'N/A'}</span>
                          {data.companies && data.companies.length > 0 && (
                            <button 
                              onClick={() => setCompanyModalOpen(true)} 
                              style={{ background: '#f1f5f9', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}
                            >
                              DETAILS
                            </button>
                          )}
                        </div>
                    </div>
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '4px' }}>Product Type</span>
                        <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>{data.document_type || 'Label'}</span>
                    </div>
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '4px' }}>NDC</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem', fontFamily: 'ui-monospace, monospace' }}>{ndcTooLong ? ndcRaw.slice(0, 12) + '...' : (ndcRaw || 'N/A')}</span>
                          {ndcTooLong && (
                            <button onClick={() => setNdcModalOpen(true)} style={{ background: '#f1f5f9', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>MORE</button>
                          )}
                        </div>
                    </div>
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '4px' }}>Application No.</span>
                        <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem', fontFamily: 'ui-monospace, monospace' }}>{data.application_number || 'N/A'}</span>
                    </div>
                </div>

                {data.product_data && data.product_data.length > 0 && (
                   <div style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                      <button 
                        onClick={() => setTechDetailsOpen(!techDetailsOpen)}
                        style={{ 
                            background: techDetailsOpen ? '#f1f5f9' : '#ffffff', 
                            border: '1px solid #e2e8f0', 
                            padding: '10px 20px', 
                            borderRadius: '12px', 
                            fontSize: '0.85rem', 
                            fontWeight: 800, 
                            color: '#334155', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px',
                            transition: 'all 0.2s ease',
                            boxShadow: techDetailsOpen ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : '0 2px 4px rgba(0,0,0,0.02)'
                        }}
                      >
                         <span style={{ fontSize: '1.1rem' }}>📦</span> 
                         TECHNICAL PRODUCT SPECIFICATIONS ({data.product_data.length}) 
                         <span style={{ opacity: 0.5, transition: 'transform 0.3s ease', transform: techDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                      </button>
                      
                      {techDetailsOpen && (
                        <div style={{ marginTop: '16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="tech-spec-table">
                                    <thead className="tech-spec-header">
                                        <tr>
                                            <th className="tech-spec-th" style={{ width: '150px' }}>NDC Identifier</th>
                                            <th className="tech-spec-th" style={{ width: '250px' }}>Product & Dosage Form</th>
                                            <th className="tech-spec-th">Composition Analysis</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.product_data.map((prod, pIdx) => {
                                            const activeIngredients = prod.ingredients.filter(i => i.type === 'active');
                                            const inactiveIngredients = prod.ingredients.filter(i => i.type !== 'active');
                                            
                                            return (
                                                <tr key={pIdx} className="tech-spec-row">
                                                    <td className="tech-spec-td">
                                                        <span className="ndc-badge">{prod.ndc}</span>
                                                    </td>
                                                    <td className="tech-spec-td">
                                                        <div className="product-name">{prod.name}</div>
                                                        <div className="product-form">{prod.form}</div>
                                                    </td>
                                                    <td className="tech-spec-td">
                                                        <div className="composition-container">
                                                            {activeIngredients.length > 0 && (
                                                                <div className="ingredient-group">
                                                                    <span className="ingredient-group-title">Active Ingredients</span>
                                                                    <div className="active-ingredients-list">
                                                                        {activeIngredients.map((ingr, iIdx) => (
                                                                            <div key={iIdx} className="active-ingredient-item">
                                                                                <span className="active-ingredient-name">{ingr.name}</span>
                                                                                {ingr.strength && <span className="active-ingredient-strength">{ingr.strength}</span>}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {inactiveIngredients.length > 0 && (
                                                                <div className="ingredient-group" style={{ marginTop: activeIngredients.length > 0 ? '10px' : '0' }}>
                                                                    <span className="ingredient-group-title">Inactive Ingredients</span>
                                                                    <div className="inactive-ingredients-flow">
                                                                        {inactiveIngredients.map((ingr, iIdx) => (
                                                                            <span key={iIdx} className="inactive-ingredient-item">
                                                                                {ingr.name}
                                                                                {ingr.strength && <span className="inactive-ingredient-strength">({ingr.strength})</span>}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                      )}
                   </div>
                )}
            </div>
            
            {/* FUNCTION PANELS */}
            <div className="function-tabs-bar" style={{ width: '100%', padding: '0 0 20px 0', display: 'flex', justifyContent: 'center' }}>
                <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f1f5f9', padding: '6px', borderRadius: '14px' }}>
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{ border: 'none', background: isActive ? 'white' : 'transparent', color: isActive ? '#0f172a' : '#64748b', padding: '10px 32px', borderRadius: '12px', cursor: 'pointer', fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.01em', boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.2s ease', lineHeight: '1.1', whiteSpace: 'nowrap' }}
                      >{tab.label}</button>
                    );
                  })}
                </div>
            </div>

            <div className="function-content-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div id="top-annotations-container" className="top-annotations-container"></div>
                <LabelView data={data} activeTab={activeTab} tocCollapsed={tocCollapsed} setTocCollapsed={setTocCollapsed} expandedSections={expandedSections} toggleSection={toggleSection} TOCItemComponent={TOCItemComponent} />
                <DeepDiveView activeTab={activeTab} setId={setId} />
                <FaersView activeTab={activeTab} drugName={data?.faers_drug_name ?? data?.generic_name ?? undefined} setId={setId} />
                <AgentView data={data} activeTab={activeTab} />
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Floating Action Buttons */}
      {session?.is_authenticated && (
        <div id="user-notes-btn" className="floating-action-btn" title="My Notes" style={{ bottom: '160px', backgroundColor: '#0071bc', zIndex: 2500 }}><span>{"\u270E"}</span></div>
      )}
      <div id="meddra-stats-btn" className="floating-action-btn" title="MedDRA Stats" style={{ bottom: '90px', backgroundColor: '#0071bc', zIndex: 2500 }}><span>{"\u2126"}</span></div>
      <div id="chat-bubble" className="floating-action-btn chat-bubble" title="AI Assistant" style={{ bottom: '20px', backgroundColor: '#002e5d', zIndex: 2500 }}><span>{"\uD83D\uDCAC"}</span></div>

      {/* Hidden Data for JS */}
      <div id="xml-content" style={{ display: 'none' }}>{data.label_xml_raw}</div>
      <Script id="label-data-init" strategy="afterInteractive">
        {`
          window.currentSetId = ${JSON.stringify(data.set_id)};
          window.currentDrugName = ${JSON.stringify(data.faers_drug_name)};
          window.currentGenericName = ${JSON.stringify(data.generic_name)};
          window.currentManufacturer = ${JSON.stringify(data.manufacturer_name)};
          window.currentEffectiveTime = ${JSON.stringify(data.effective_time)};
          window.toxSummary = ${JSON.stringify(data.tox_summary)};
          window.currentUserId = ${data.user_id || 'null'};
          window.savedAnnotations = ${JSON.stringify(data.saved_annotations)};
        `}
      </Script>

      <Script src={withAppBase("/dashboard/js/chart.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/marked.min.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/utils.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/ui.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/favorites.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/session_manager.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/chat.js?v=20260218_1")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/annotations.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/faers.js")} strategy="afterInteractive" />
      <Script src={withAppBase("/dashboard/js/tox.js")} strategy="afterInteractive" />

      {/* Modals placeholders */}
      <div id="user-notes-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content">
          <div className="custom-modal-header"><h3>My Notes</h3><span className="close-modal" id="close-user-notes">&times;</span></div>
          <div className="custom-modal-body" id="user-notes-modal-body"><div id="notes-list-container" className="notes-summary-list"></div></div>
        </div>
      </div>

      <div id="meddra-stats-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content">
          <div className="custom-modal-header"><h3>MedDRA Statistics</h3><span className="close-modal" id="close-meddra-stats">&times;</span></div>
          <div className="custom-modal-body" id="meddra-stats-body"></div>
        </div>
      </div>

      <div id="table-extract-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content" style={{ maxWidth: '95%', height: '90vh' }}>
          <div className="custom-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 id="table-extract-title" style={{ margin: 0 }}>Table Data</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button id="copy-selection-btn" className="button" style={{ display: 'none', padding: '6px 12px', fontSize: '0.85rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignItems: 'center', gap: '5px' }}><span>{"\uD83D\uDCCB"}</span> Copy Selection</button>
                <span className="close-modal" id="close-table-extract" style={{ cursor: 'pointer', fontSize: '1.5rem' }}>&times;</span>
            </div>
          </div>
          <div className="custom-modal-body" id="table-extract-container"></div>
        </div>
      </div>

      <div id="ai-prefs-modal" className="custom-modal" style={{ display: 'none' }}>
         <div className="custom-modal-content" style={{ maxWidth: '600px', height: 'auto' }}>
            <div className="custom-modal-header"><h3>AI Configuration</h3><span className="close-modal" id="close-ai-prefs">&times;</span></div>
            <div className="custom-modal-body"><form id="ai-prefs-form"></form></div>
         </div>
      </div>

      <div id="chatbox" className="chatbox" style={{ display: 'none', zIndex: 2500 }}>
        <div className="chat-header" id="chat-header">
            <h3>AI Assistant</h3>
            <div className="chat-header-buttons" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button id="chat-reset" className="chat-reset" title="Reset Chat" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.25rem', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&#8634;</button>
                <button id="close-chat" className="close-chat" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.25rem', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>
        </div>
        <div id="chat-messages" className="chat-messages"></div>
        <div className="chat-input-form">
            <input type="text" id="chat-input" placeholder="Type a message..." />
            <button id="chat-send">Send</button>
        </div>
      </div>

      {ndcModalOpen && (
        <div onClick={() => setNdcModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 92vw)', maxHeight: 'min(520px, 80vh)', background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div><div style={{ fontWeight: 800, color: '#0f172a' }}>NDC Codes</div><div style={{ fontSize: '0.8rem', color: '#64748b' }}>ESC or outside click to close</div></div>
              <button onClick={() => setNdcModalOpen(false)} style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '18px', color: '#334155' }}>×</button>
            </div>
            <div style={{ padding: '16px', overflow: 'auto' }}>
              {ndcList.length > 0 ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  {ndcList.map((code, i) => (
                    <div key={i} style={{ padding: '10px 12px', display: 'flex', gap: '12px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 0 ? '#ffffff' : '#fbfdff' }}>
                      <div style={{ minWidth: '44px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>#{i + 1}</div>
                      <div style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a', fontSize: '0.95rem' }}>{code}</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#64748b' }}>No NDC codes available.</div>}
            </div>
          </div>
        </div>
      )}

      {companyModalOpen && (
        <div onClick={() => setCompanyModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(800px, 95vw)', maxHeight: 'min(600px, 90vh)', background: 'white', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Organization Details</h3><p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Companies involved in manufacture/distribution</p></div>
              <button onClick={() => setCompanyModalOpen(false)} style={{ background: 'white', border: '1px solid #e2e8f0', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: '0 12px', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Role</th><th style={{ padding: '0 12px', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Name & Address</th><th style={{ padding: '0 12px', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>DUNS</th><th style={{ padding: '0 12px', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Safety Contact</th></tr></thead>
                <tbody>
                  {data?.companies?.map((comp, idx) => (
                    <tr key={idx} style={{ background: '#f8fafc', borderRadius: '12px' }}>
                      <td style={{ padding: '16px 12px', verticalAlign: 'top', width: '20%' }}><span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', background: '#e2e8f0', padding: '4px 10px', borderRadius: '20px' }}>{comp.role.toUpperCase()}</span></td>
                      <td style={{ padding: '16px 12px', verticalAlign: 'top' }}><div style={{ fontWeight: 700, color: '#0f172a' }}>{comp.name}</div>{comp.address && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{comp.address}</div>}</td>
                      <td style={{ padding: '16px 12px', verticalAlign: 'top', width: '12%' }}><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', fontWeight: 700 }}>{comp.duns || 'N/A'}</span></td>
                      <td style={{ padding: '16px 12px', verticalAlign: 'top', width: '18%' }}>{comp.safety_phone ? <div><div style={{ fontSize: '0.65rem', color: '#0284c7', fontWeight: 800 }}>SAFETY:</div><span style={{ fontWeight: 700, color: '#0284c7' }}>{comp.safety_phone}</span></div> : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setCompanyModalOpen(false)} style={{ padding: '10px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800 }}>CLOSE</button>
            </div>
          </div>
        </div>
      )}
      {exportModalOpen && (
        <div onClick={() => setExportModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(600px, 95vw)', maxHeight: 'min(700px, 90vh)', background: 'white', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Export Sections</h3><p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Select label sections and preferred format</p></div>
              <button onClick={() => setExportModalOpen(false)} style={{ background: 'white', border: '1px solid #e2e8f0', width: '32px', height: '32px', borderRadius: '8px' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>Available Sections ({selectedSectionsForExport.size})</span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => {
                    const allIds = new Set<string>();
                    const addIdsRecursive = (items: any[]) => { items.forEach(i => { allIds.add(i.id); if (i.children) addIdsRecursive(i.children); }); };
                    if (data.table_of_contents) addIdsRecursive(data.table_of_contents);
                    setSelectedSectionsForExport(allIds);
                  }} style={{ color: '#3b82f6', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.7rem' }}>SELECT ALL</button>
                  <button onClick={() => setSelectedSectionsForExport(new Set())} style={{ color: '#64748b', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.7rem' }}>CLEAR</button>
                </div>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #f1f5f9', borderRadius: '12px', padding: '16px' }}>
                {data?.table_of_contents?.map(item => <ExportSectionItem key={item.id} item={item} selectedSectionsForExport={selectedSectionsForExport} toggleSectionSelection={toggleSectionSelection} />)}
              </div>
            </div>
            <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>FORMAT:</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['html', 'xml', 'text'] as const).map(fmt => (
                    <button key={fmt} onClick={() => setExportFormat(fmt)} style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: exportFormat === fmt ? '#3b82f6' : 'white', color: exportFormat === fmt ? 'white' : '#64748b', border: '1px solid #e2e8f0' }}>{fmt}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleExport} style={{ width: '100%', backgroundColor: '#0f172a', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>GENERATE EXPORT FILE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LabelPage({ params }: { params: Promise<{ setId: string }> }) {
  return (
    <Suspense fallback={<div>Loading Label Page...</div>}>
      <LabelContent params={params} />
    </Suspense>
  );
}
