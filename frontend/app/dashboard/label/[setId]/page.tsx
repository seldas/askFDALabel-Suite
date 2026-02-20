'use client';

import { useEffect, useState, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { useUser } from '../../../context/UserContext';

interface Section {
  id?: string;
  numeric_id?: string;
  title?: string;
  content?: string;
  is_boxed_warning?: boolean;
  children?: Section[];
}

interface Highlight {
  source_section_title: string;
  content_html: string;
}

interface TOCItem {
  id: string;
  title: string;
  numeric_id?: string;
  children?: TOCItem[];
}

interface Annotation {
  id: string;
  section_number: string;
  question: string;
  answer: string;
  keywords: string[];
  is_public: boolean;
}

interface LabelData {
  drug_name: string;
  brand_name: string | null;
  generic_name: string | null;
  original_title: string;
  faers_drug_name: string;
  manufacturer_name: string;
  effective_time: string;
  label_format: string | null;
  ndc: string | null;
  application_number: string | null;
  version_number: string | null;
  document_type: string | null;
  has_boxed_warning: boolean;
  clean_app_num: string | null;
  sections: Section[];
  fallback_html: string | null;
  highlights: Highlight[];
  table_of_contents: TOCItem[];
  label_xml_raw: string;
  set_id: string;
  metadata: any;
  saved_annotations: Annotation[];
  tox_summary: {
    dili: boolean;
    dict: boolean;
    diri: boolean;
    last_updated?: string;
  };
  user_id: number | null;
}

function TOCItemComponent({ 
  item, 
  level = 0, 
  expandedSections, 
  toggleSection 
}: { 
  item: TOCItem; 
  level?: number; 
  expandedSections: Set<string>; 
  toggleSection: (id: string) => void;
}) {
  const isExpanded = expandedSections.has(item.id);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <li className={`toc-item-level-${level}`}>
      <div className="toc-item-container">
        {hasChildren ? (
          <button 
            className={`toc-expander ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSection(item.id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        ) : (
          <div style={{ width: '20px' }}></div>
        )}
        <a 
          href={`#${item.id}`}
          className={`toc-link ${level === 0 ? 'root-link' : 'sub-link'}`}
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
            />
          ))}
        </ol>
      )}
    </li>
  );
}

function SectionComponent({ section }: { section: Section }) {
  return (
    <div 
      className={`Section ${section.is_boxed_warning ? 'black-boxed-warning' : ''}`}
      id={section.id}
      data-section-number={section.numeric_id}
    >
      {section.title && <h2>{section.title}</h2>}
      {section.content && <div dangerouslySetInnerHTML={{ __html: section.content }} />}
      {section.children && section.children.map((child, idx) => (
        <SectionComponent key={idx} section={child} />
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
  const [ndcModalOpen, setNdcModalOpen] = useState(false);

  const ndcRaw = (data?.ndc || '').trim();
  const ndcTooLong = ndcRaw.length > 40;

  const ndcList = (() => {
    if (!ndcRaw) return [];
    // split by common delimiters: comma, semicolon, newline
    return ndcRaw
      .split(/[\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
  })();

  const closeNdcModal = () => setNdcModalOpen(false);

  const tabs = [
    { id: 'label-view', label: 'Label' },
    { id: 'faers-view', label: 'FAERS' },
    { id: 'tox-view', label: 'Agents' },
  ];

  const [faersCoverageFilter, setFaersCoverageFilter] = useState<'all' | 'not_presented'>('all');

  // Optional helper: tries to detect "not presented" from the row's Status cell text.
  // If your status wording differs, adjust the keywords below.
  const isNotPresentedStatus = (statusText: string) => {
    const t = (statusText || '').toLowerCase();
    return (
      t.includes('not presented') ||
      t.includes('not in label') ||
      t.includes('not present') ||
      t.includes('absent')
    );
  };

  useEffect(() => {
    if (activeTab !== 'faers-view') return;
    const win = window as any;
    if (typeof win.setCoverageFilter === 'function') {
      win.setCoverageFilter(faersCoverageFilter);
    }
  }, [faersCoverageFilter, activeTab]);

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

  useEffect(() => {
    if (!ndcModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNdcModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ndcModalOpen]);

  useEffect(() => {
    if (!loading && data) {
      // Robust initialization: wait for scripts to be ready
      let attempts = 0;
      const interval = setInterval(() => {
        const win = window as any;
        attempts++;
        
        if (win.initUI && win.initFaers && win.initToxAgents && win.initChat && win.initAnnotations && win.initFavorites) {
          win.initUI();
          win.initFaers();
          win.initToxAgents();
          win.initChat();
          win.initAnnotations();
          win.initFavorites();
          clearInterval(interval);
        } else if (attempts > 50) { // Stop after 5 seconds
          console.warn("Legacy scripts failed to load in time.");
          clearInterval(interval);
        }
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [loading, data]);

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
    <div className="results-container" style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'block' }}>
      <style jsx global>{`
        /* FAERS In-Text Annotation */
        .faers-signal {
            position: relative;
            cursor: help;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 4px;
            border-bottom: 2px solid transparent;
            display: inline;
        }

        /* Intensity Colors for FAERS Signals - Intuitive Traffic Light System */
        .faers-signal.intensity-high {
            background-color: #fee2e2; /* Red-50 */
            color: #991b1b;           /* Red-800 */
            border-bottom-color: #ef4444; /* Red-500 */
        }
        .faers-signal.intensity-high:hover {
            background-color: #fecaca; /* Red-100 */
        }

        .faers-signal.intensity-mid {
            background-color: #ffedd5; /* Orange-50 */
            color: #9a3412;           /* Orange-800 */
            border-bottom-color: #f97316; /* Orange-500 */
        }
        .faers-signal.intensity-mid:hover {
            background-color: #fed7aa; /* Orange-100 */
        }

        .faers-signal.intensity-low {
            background-color: #f0fdf4; /* Green-50 */
            color: #166534;           /* Green-800 */
            border-bottom-color: #22c55e; /* Green-500 */
        }
        .faers-signal.intensity-low:hover {
            background-color: #dcfce7; /* Green-100 */
        }

        /* Beautiful HTML Tooltip for FAERS signals */
        .faers-signal-tooltip {
            position: absolute;
            background: #ffffff;
            border-radius: 14px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1);
            z-index: 10000;
            width: 320px;
            padding: 0;
            overflow: hidden;
            font-family: 'Inter', system-ui, sans-serif;
            opacity: 0;
            visibility: hidden;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateY(10px) scale(0.98);
            border: 1px solid rgba(0,0,0,0.05);
        }

        .faers-signal-tooltip.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
        }

        .faers-tooltip-header {
            background: #f8fafc;
            padding: 16px 20px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .faers-tooltip-term {
            font-weight: 800;
            color: #0f172a;
            font-size: 1.1rem;
            letter-spacing: -0.02em;
        }

        .faers-tooltip-count {
            font-size: 0.75rem;
            color: white;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .faers-tooltip-count.intensity-high { background-color: #ef4444; }
        .faers-tooltip-count.intensity-mid { background-color: #f97316; }
        .faers-tooltip-count.intensity-low { background-color: #22c55e; }

        .faers-tooltip-body {
            padding: 20px;
            background: white;
        }

        .faers-tooltip-row {
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
        }

        .faers-tooltip-row:last-child {
            margin-bottom: 0;
        }

        .faers-tooltip-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 800;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }

        .faers-tooltip-value {
            font-size: 0.9rem;
            color: #334155;
            line-height: 1.6;
            font-weight: 500;
        }

        .faers-tooltip-footer {
            background: #f8fafc;
            padding: 10px 20px;
            font-size: 0.7rem;
            color: #94a3b8;
            font-weight: 600;
            text-align: right;
            border-top: 1px solid #f1f5f9;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .faers-tooltip-footer::before {
            content: "Signal Confidence";
            font-size: 0.6rem;
            text-transform: uppercase;
        }

        /* SOC summary bar (gov/simple pill chips) */
        .soc-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
        }

        .soc-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;

          padding: 6px 12px;
          border-radius: 999px;

          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #0f172a;

          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;

          transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
        }

        .soc-chip:hover {
          border-color: #0071bc;
          background: #f1f7fd;
        }

        .soc-chip:active {
          transform: translateY(1px);
        }

        .soc-chip.active {
          border-color: #0071bc;
          background: #e6f2fb;
          color: #002e5d;
        }

        .soc-chip-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;

          min-width: 28px;
          height: 22px;
          padding: 0 8px;

          border-radius: 999px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #334155;

          font-size: 0.78rem;
          font-weight: 800;
        }

        .soc-chip.active .soc-chip-count {
          background: #ffffff;
          border-color: #b6d7f2;
          color: #002e5d;
        }

        /* Hierarchical TOC Styles */
        .toc-list, .toc-sub-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .toc-sub-list {
          margin-left: 12px;
          border-left: 1px solid #f1f5f9;
        }

        .toc-item-container {
          display: flex;
          align-items: center;
          padding: 2px 0;
        }

        .toc-expander {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        }

        .toc-expander.expanded {
          transform: rotate(90deg);
        }

        .toc-link {
          text-decoration: none;
          color: #475569;
          font-size: 0.85rem;
          padding: 6px 8px;
          border-radius: 6px;
          display: block;
          transition: all 0.15s ease;
          line-height: 1.4;
          flex: 1;
        }

        .toc-link:hover {
          background-color: #f1f5f9;
          color: #002e5d;
          text-decoration: none;
        }

        .toc-link.root-link {
          font-weight: 700;
        }

        .toc-link.sub-link {
          font-weight: 500;
          font-size: 0.8rem;
          color: #64748b;
        }
      `}</style>
      
      {/* Main Header */}
      <header className="header-main" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, width: '100vw', justifyContent: 'space-between', padding: '0.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => setTocCollapsed(!tocCollapsed)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.25rem' }}>
             ☰
          </button>
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
            transition: 'all 0.2s ease'
          }}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
               <polyline points="9 22 9 12 15 12 15 22"></polyline>
             </svg>
             Home
          </a>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            Label Intelligence
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
              }} title="AI model is set on the Suite Home page">
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

      <div style={{ display: 'flex', paddingTop: '60px' }}>
        {/* Table of Contents Side Panel */}
        <div id="toc-panel" className={`toc-side-panel ${tocCollapsed ? 'hidden' : ''}`} style={{ position: 'fixed', top: '60px', left: 0, bottom: 0, height: 'calc(100vh - 60px)', zIndex: 1500 }}>
          <div className="toc-box">
            <div className="toc-header">
              <h2>Table of Contents</h2>
              <button id="toc-close-internal" onClick={() => setTocCollapsed(true)} title="Collapse Panel" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
              </button>
            </div>
            {data.table_of_contents && data.table_of_contents.length > 0 ? (
              <ol className="toc-list">
                {data.table_of_contents.map((item) => (
                  <TOCItemComponent 
                    key={item.id} 
                    item={item} 
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  />
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', marginTop: '2rem' }}>No table of contents available.</p>
            )}
          </div>
          <div className="sidebar-footer">
            <Link href="/dashboard" className="btn-sidebar-home" style={{ textDecoration: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Return Home
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div id="main-content" className={`main-content ${tocCollapsed ? 'expanded' : ''}`} style={{ 
            transition: 'margin-left 0.3s ease', 
            marginLeft: tocCollapsed ? '0' : '300px',
            width: '100%',
            padding: '20px'
        }}>
          <div className="container-top" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* User Session Notice Bar (Only for Guest) */}
            {!userLoading && !session?.is_authenticated && (
              <div className="auth-notice-bar animate-fade-in" style={{
                padding: '12px 20px',
                borderRadius: '12px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.9rem',
                fontWeight: 500,
                backgroundColor: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#9a3412',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem' }}>💡</span>
                  <span>You are in <strong>Guest Mode</strong>. Sign in to unlock saved notes, projects, and advanced AI features.</span>
                </div>
                <button 
                  onClick={() => openAuthModal('login')}
                  style={{ 
                    backgroundColor: '#ea580c', 
                    color: 'white', 
                    padding: '8px 18px', 
                    borderRadius: '20px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.2)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  SIGN IN / LOGIN
                </button>
              </div>
            )}

            {/* View Selection Tabs (STICKY, FULL-BLEED, TALLER) */}
            <div
              className="hp-sticky-tabs"
              style={{
                position: 'sticky',
                top: '10px', // header height
                zIndex: 1600,

                // full-bleed trick (break out of centered container)
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
                marginRight: 'calc(50% - 50vw)',

                // make it taller
                padding: '6px 0', // ↑ higher Y height

                background: '#f9fafb',
                borderBottom: '1px solid #e2e8f0',
                boxShadow: '0 6px 18px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: '64px', // ↑ extra height; adjust to taste
                  padding: '0 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    backgroundColor: '#f1f5f9',
                    padding: '6px',
                    borderRadius: '14px',
                  }}
                >
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                          border: 'none',
                          background: isActive ? 'white' : 'transparent',
                          color: isActive ? '#0f172a' : '#64748b',

                          // slightly bigger buttons for a “taller” feel
                          padding: '10px 26px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '0.95rem',
                          fontWeight: 800,
                          letterSpacing: '-0.01em',
                          boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.10)' : 'none',
                          transition: 'all 0.2s ease',
                          lineHeight: '1.1',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div className="label-header" style={{ marginBottom: '25px', marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '5px' }}>
                            <h1 className="DocumentTitle" style={{ margin: 0, lineHeight: '1.2' }}>{data.brand_name || data.drug_name}</h1>
                            <span style={{ 
                                backgroundColor: data.label_format === 'PLR' ? '#e0f2fe' : '#f1f5f9',
                                color: data.label_format === 'PLR' ? '#0369a1' : '#64748b',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                flexShrink: 0
                            }}>
                                {data.label_format}
                            </span>
                        </div>
                        <h2 style={{ marginTop: 0, fontSize: '1.1em', color: '#666', fontWeight: 400, marginBottom: 0 }}>{data.original_title || data.generic_name}</h2>
                    </div>
                    {session?.is_authenticated && (
                      <div style={{ marginLeft: '20px' }}>
                          <button id="favorite-btn" className="favorite-btn" title="Toggle Project" style={{ background:'none', border:'none', cursor:'pointer', fontSize: '1.8em', color: '#ccc', padding: 0 }}>
                              {"\u2606"}
                          </button>
                      </div>
                    )}
                </div>

                <div className="label-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginTop: '15px', border: '1px solid #eee' }}>
                    {data.has_boxed_warning && (
                    <div className="meta-item" style={{ gridColumn: '1 / -1', backgroundColor: '#fff5f5', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.5em', color: '#dc3545' }}>{"\u26A0"}</span>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75em', color: '#dc3545', textTransform: 'uppercase', fontWeight: 700 }}>Safety Alert</span>
                            <span style={{ fontWeight: 600, color: '#721c24' }}>Contains Boxed Warning</span>
                        </div>
                    </div>
                    )}
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Manufacturer</span>
                        <span style={{ fontWeight: 600, color: '#333' }}>{data.manufacturer_name || 'N/A'}</span>
                    </div>
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Product Type</span>
                        <span style={{ fontWeight: 600, color: '#333' }}>{data.document_type || 'Label'}</span>
                    </div>
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Version</span>
                        <span style={{ fontFamily: 'monospace', color: '#555' }}>v{data.version_number || '1'}</span>
                    </div>
                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Last Revised</span>
                        <span>{data.effective_time || 'N/A'}</span>
                    </div>
                    <div className="meta-item">
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.75em',
                          color: '#888',
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          marginBottom: '3px'
                        }}
                      >
                        NDC Code
                      </span>

                      {!ndcRaw ? (
                        <span style={{ fontFamily: 'monospace', color: '#333' }}>N/A</span>
                      ) : ndcTooLong ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontFamily: 'monospace', color: '#333' }}>
                            {ndcRaw.slice(0, 12)}…
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNdcModalOpen(true);
                            }}
                            style={{
                              border: '1px solid #e2e8f0',
                              background: 'white',
                              color: '#334155',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            View full
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'monospace', color: '#333' }}>{ndcRaw}</span>
                      )}
                    </div>

                    <div className="meta-item">
                        <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Application Number</span>
                        <span style={{ fontFamily: 'monospace', color: '#333' }}>{data.application_number || 'N/A'}</span>
                    </div>
                </div>

                {data.original_title && (
                    <div style={{ 
                        marginTop: '20px', 
                        padding: '15px 20px', 
                        backgroundColor: '#f1f5f9', 
                        borderRadius: '8px', 
                        borderLeft: '4px solid #64748b',
                        color: '#334155',
                        fontSize: '0.9rem',
                        lineHeight: '1.5',
                        fontStyle: 'italic',
                        fontWeight: 500
                    }}>
                        {data.original_title}
                    </div>
                )}
            </div>

            <div id="top-annotations-container" className="top-annotations-container"></div>

            {/* Tab Contents */}
            <div id="label-view" className={`tab-content ${activeTab === 'label-view' ? 'active' : ''}`} style={{ display: activeTab === 'label-view' ? 'block' : 'none', overflowX: 'auto' }}>
                {data.highlights && data.highlights.length > 0 && (
                <div id="highlights-section" className="highlights-box">
                    <h2>Highlights of Prescribing Information</h2>
                    {data.highlights.map((h, i) => (
                    <div key={i} className="highlight-item">
                        {h.source_section_title !== 'Untitled Section' && (
                        <div className="highlight-source-header">
                            <span className="source-label">Section</span>
                            <span className="source-title">{h.source_section_title}</span>
                        </div>
                        )}
                        <div className="highlight-body" dangerouslySetInnerHTML={{ __html: h.content_html }} />
                    </div>
                    ))}
                    <hr />
                </div>
                )}

                {data.sections && data.sections.length > 0 ? (
                data.sections.map((section, idx) => (
                    <SectionComponent key={idx} section={section} />
                ))
                ) : data.fallback_html ? (
                <div className="Section">
                    <h2>Full Document Text</h2>
                    <div dangerouslySetInnerHTML={{ __html: data.fallback_html }} />
                </div>
                ) : (
                <p>Could not parse the drug label sections.</p>
                )}
            </div>

            <div id="faers-view" className={`tab-content ${activeTab === 'faers-view' ? 'active' : ''}`} style={{ display: activeTab === 'faers-view' ? 'block' : 'none' }}>
                <div id="faers-loading" className="loader"></div>
                <div id="dashboard-content" className="dashboard-grid" style={{ display: 'none' }}>
                    <div className="chart-card full-width">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <h3 style={{ margin: 0 }}>Label Coverage Analysis</h3>

                      {/* Toggle */}
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: '4px',
                          padding: '4px',
                          background: '#f1f5f9',
                          borderRadius: '999px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setFaersCoverageFilter('all')}
                          style={{
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            background: faersCoverageFilter === 'all' ? 'white' : 'transparent',
                            boxShadow: faersCoverageFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                            color: faersCoverageFilter === 'all' ? '#0f172a' : '#64748b',
                          }}
                        >
                          All
                        </button>

                        <button
                          type="button"
                          onClick={() => setFaersCoverageFilter('not_presented')}
                          style={{
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            background: faersCoverageFilter === 'not_presented' ? 'white' : 'transparent',
                            boxShadow: faersCoverageFilter === 'not_presented' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                            color: faersCoverageFilter === 'not_presented' ? '#0f172a' : '#64748b',
                          }}
                        >
                          Not Presented
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '0.85rem',
                        color: '#475569',
                        fontWeight: 500
                      }}
                    >
                      Note: For clarity, we exclude SOC-level terms and non-AE groupings (e.g., PRD, SMP) from the summary bar.
                    </div>

                    {/* SOC summary bar injected by faers.js */}
                    <div id="soc-summary-bar" style={{ marginTop: '12px' }} />


                    <div className="table-container">
                        <table id="coverageTable" className="coverage-table">
                            <thead>
                                <tr>
                                <th style={{ width: '50px' }}></th>
                                <th>Reaction</th>
                                <th>Count</th>
                                <th>SOC</th>
                                <th>HLT</th>
                                <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="coverageTable-body"></tbody>
                        </table>
                    </div>
                    <div className="pagination-controls" style={{ marginTop: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                            <button id="firstPage" className="button pagination-btn">&laquo;</button>
                            <button id="prevPage" className="button pagination-btn">&lsaquo;</button>
                            <input type="number" id="pageInput" defaultValue="1" style={{ width: '50px', textAlign: 'center' }} />
                            <span className="page-info">of <span id="totalPages">1</span></span>
                            <button id="nextPage" className="button pagination-btn">&rsaquo;</button>
                            <button id="lastPage" className="button pagination-btn">&raquo;</button>
                    </div>
                    </div>
                    <div className="chart-card full-width">
                        <h3>Adverse Events Trends (Time Series)</h3>
                        <div className="canvas-container" style={{ height: '400px' }}>
                            <canvas id="trendComparisonChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <div id="tox-view" className={`tab-content ${activeTab === 'tox-view' ? 'active' : ''}`} style={{ display: activeTab === 'tox-view' ? 'block' : 'none' }}>
                <div id="tox-index" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button id="btn-agent-dili" className="agent-card">
                        <h3 style={{ margin: 0, color: '#17a2b8', fontSize: '2em' }}>DILI</h3>
                        <p style={{ margin: '10px 0 0', color: '#555' }}>Liver Injury</p>
                    </button>
                    <button id="btn-agent-dict" className="agent-card">
                        <h3 style={{ margin: 0, color: '#dc3545', fontSize: '2em' }}>DICT</h3>
                        <p style={{ margin: '10px 0 0', color: '#555' }}>Cardiotoxicity</p>
                    </button>
                    <button id="btn-agent-diri" className="agent-card">
                        <h3 style={{ margin: 0, color: '#ffc107', fontSize: '2em' }}>DIRI</h3>
                        <p style={{ margin: '10px 0 0', color: '#555' }}>Renal Injury</p>
                    </button>
                    <button id="btn-agent-pgx" className="agent-card">
                        <h3 style={{ margin: 0, color: '#6610f2', fontSize: '2em' }}>PGx</h3>
                        <p style={{ margin: '10px 0 0', color: '#555' }}>Genomics</p>
                    </button>
                    </div>
                </div>

                {/* DILI Module */}
                <div id="dili-module" style={{ display: 'none' }}>
                    <div id="dili-loading" className="loader" style={{ display: 'none' }}></div>
                    <div id="dili-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
                    <div id="dili-content" className="dashboard-grid" style={{ display: 'none' }}>
                        <div className="chart-card full-width">
                            <h3>Official Label Analysis</h3>
                            <div id="dili-label-signals"></div>
                        </div>
                        <div className="chart-card full-width">
                            <h3>FAERS Liver-Related Events</h3>
                            <div className="canvas-container" style={{ height: '400px' }}>
                                <canvas id="diliFaersChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="dili-error" style={{ display: 'none' }}><p>Error loading DILI data.</p></div>
                </div>

                {/* DICT Module */}
                <div id="dict-module" style={{ display: 'none' }}>
                    <div id="dict-loading" className="loader" style={{ display: 'none' }}></div>
                    <div id="dict-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
                    <div id="dict-content" className="dashboard-grid" style={{ display: 'none' }}>
                        <div className="chart-card full-width">
                            <h3>Official Label Analysis</h3>
                            <div id="dict-label-signals"></div>
                        </div>
                        <div className="chart-card full-width">
                            <h3>FAERS Cardiac-Related Events</h3>
                            <div className="canvas-container" style={{ height: '400px' }}>
                                <canvas id="dictFaersChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="dict-error" style={{ display: 'none' }}><p>Error loading DICT data.</p></div>
                </div>

                {/* DIRI Module */}
                <div id="diri-module" style={{ display: 'none' }}>
                    <div id="diri-loading" className="loader" style={{ display: 'none' }}></div>
                    <div id="diri-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
                    <div id="diri-content" className="dashboard-grid" style={{ display: 'none' }}>
                        <div className="chart-card full-width">
                            <h3>Official Label Analysis</h3>
                            <div id="diri-label-signals"></div>
                        </div>
                        <div className="chart-card full-width">
                            <h3>FAERS Renal-Related Events</h3>
                            <div className="canvas-container" style={{ height: '400px' }}>
                                <canvas id="diriFaersChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="diri-error" style={{ display: 'none' }}><p>Error loading DIRI data.</p></div>
                </div>

                {/* PGx Module */}
                <div id="pgx-module" style={{ display: 'none' }}>
                    <div id="pgx-loading" className="loader" style={{ display: 'none' }}></div>
                    <div id="pgx-content" className="dashboard-grid" style={{ display: 'none' }}>
                        <div className="chart-card full-width">
                            <h3>Pharmacogenomic Biomarkers</h3>
                            <div id="pgx-results-container"></div>
                        </div>
                    </div>
                    <div id="pgx-error" style={{ display: 'none' }}><p>Error loading PGx data.</p></div>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      {session?.is_authenticated && (
        <div id="user-notes-btn" className="floating-action-btn" title="My Notes" style={{ bottom: '160px', backgroundColor: '#0071bc', zIndex: 2500, }}>
          <span>{"\u270E"}</span>
        </div>
      )}
      <div id="meddra-stats-btn" className="floating-action-btn" title="MedDRA Stats" style={{ bottom: '90px', backgroundColor: '#0071bc', zIndex: 2500, }}>
        <span>{"\u2126"}</span>
      </div>
      <div id="chat-bubble" className="floating-action-btn chat-bubble" title="AI Assistant" style={{ bottom: '20px', backgroundColor: '#002e5d', zIndex: 2500, }}>
        <span>{"\uD83D\uDCAC"}</span>
      </div>

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

      {/* Legacy Scripts */}
      <Script src="/dashboard/js/Chart.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/marked.min.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/utils.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/ui.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/favorites.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/session_manager.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/chat.js?v=20260218_1" strategy="afterInteractive" />
      <Script src="/dashboard/js/annotations.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/faers.js" strategy="afterInteractive" />
      <Script src="/dashboard/js/tox.js" strategy="afterInteractive" />

      {/* Modals placeholders for ui.js */}
      <div id="user-notes-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content">
          <div className="custom-modal-header">
            <h3>My Notes</h3>
            <span className="close-modal" id="close-user-notes">&times;</span>
          </div>
          <div className="custom-modal-body" id="user-notes-modal-body">
             <div id="notes-list-container" className="notes-summary-list"></div>
          </div>
        </div>
      </div>

      <div id="meddra-stats-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content">
          <div className="custom-modal-header">
            <h3>MedDRA Statistics</h3>
            <span className="close-modal" id="close-meddra-stats">&times;</span>
          </div>
          <div className="custom-modal-body" id="meddra-stats-body"></div>
        </div>
      </div>

      <div id="table-extract-modal" className="custom-modal" style={{ display: 'none' }}>
        <div className="custom-modal-content" style={{ maxWidth: '95%', height: '90vh' }}>
          <div className="custom-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 id="table-extract-title" style={{ margin: 0 }}>Table Data</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button id="copy-selection-btn" className="button" style={{ 
                    display: 'none', 
                    padding: '6px 12px', 
                    fontSize: '0.85rem', 
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    alignItems: 'center',
                    gap: '5px'
                }}>
                    <span>{"\uD83D\uDCCB"}</span> Copy Selection
                </button>
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

      <div id="chatbox" className="chatbox" style={{ display: 'none', zIndex: 2500, }}>
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
        <div
          onClick={closeNdcModal} // clicking outside closes
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()} // keep clicks inside from closing
            style={{
              width: 'min(720px, 92vw)',
              maxHeight: 'min(520px, 80vh)',
              background: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc'
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                  NDC Codes
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                  ESC or outside click to close
                </div>
              </div>

              <button
                type="button"
                onClick={closeNdcModal}
                aria-label="Close"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px', overflow: 'auto' }}>
              {ndcList.length > 0 ? (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden'
                  }}
                >
                  {ndcList.map((code, i) => (
                    <div
                      key={`${code}-${i}`}
                      style={{
                        padding: '10px 12px',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'baseline',
                        borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                        background: i % 2 === 0 ? '#ffffff' : '#fbfdff'
                      }}
                    >
                      <div
                        style={{
                          minWidth: '44px',
                          fontSize: '0.75rem',
                          color: '#94a3b8',
                          fontWeight: 800
                        }}
                      >
                        #{i + 1}
                      </div>
                      <div
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          color: '#0f172a',
                          fontSize: '0.95rem',
                          userSelect: 'text'
                        }}
                      >
                        {code}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#64748b' }}>No NDC codes available.</div>
              )}
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
