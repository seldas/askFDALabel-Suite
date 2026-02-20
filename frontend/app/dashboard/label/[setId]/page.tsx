'use client';

import { useEffect, useState, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { useUser } from '../../../context/UserContext';

// Modular Components
import LabelView from './label';
import FaersView from './faers';
import AgentView from './agent';

// Shared Types
import { TOCItem, LabelData } from './types';

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

  let specialClass = '';
  if (item.is_boxed_warning) specialClass = 'toc-boxed-warning';
  else if (item.is_highlights) specialClass = 'toc-highlights';
  else if (item.is_drug_facts) specialClass = 'toc-drug-facts';
  else if (item.is_drug_facts_item) specialClass = 'toc-drug-facts-item';

  return (
    <li className={`toc-item-level-${level} ${specialClass}`}>
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
    <div className="results-container" style={{ height: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

        /* General TOC Link Adjustments for better spacing */
        .toc-link {
          text-decoration: none;
          color: #475569;
          font-size: 0.875rem; /* Slightly larger for readability */
          padding: 10px 12px;
          border-radius: 8px;
          display: block;
          transition: all 0.2s ease;
          line-height: 1.2;
          margin-bottom: 2px;
        }

        .toc-link:hover {
          background-color: #f1f5f9;
          color: #0f172a;
        }

        /* --- Boxed Warnings Refinement --- */
        .toc-boxed-warning {
          margin: 8px 0 !important;
          background-color: #fff1f2; /* Ultra-soft red */
          border: 1px solid #fecaca; /* Soft red border */
          border-left: 4px solid #e11d48; /* Strong clinical red accent */
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(225, 29, 72, 0.05);
        }

        .toc-boxed-warning .toc-link {
          color: #9f1239 !important; /* Deep red for text */
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          padding: 12px;
        }

        .toc-boxed-warning:hover {
          background-color: #ffe4e6;
          border-color: #fda4af;
        }

        /* --- Highlights Refinement --- */
        .toc-highlights {
          margin: 8px 0 !important;
          background-color: #fffbeb; /* Creamy amber */
          border: 1px solid #fde68a;
          border-left: 4px solid #f59e0b; /* Amber accent */
          border-radius: 6px;
          overflow: hidden;
        }

        .toc-highlights .toc-link {
          color: #92400e !important; /* Deep amber/brown for text */
          font-weight: 700;
          padding: 12px;
        }

        .toc-highlights:hover {
          background-color: #fef3c7;
          border-color: #fcd34d;
        }

        /* --- Drug Facts OTC --- */
        .toc-drug-facts {
          margin: 8px 0 !important;
          background-color: #f0f9ff; /* Ultra-soft blue */
          border: 1px solid #bae6fd;
          border-left: 4px solid #0284c7; /* Strong clinical blue accent */
          border-radius: 6px;
          overflow: hidden;
        }

        .toc-drug-facts .toc-link {
          color: #0369a1 !important;
          font-weight: 700;
          padding: 12px;
        }

        .toc-drug-facts:hover {
          background-color: #e0f2fe;
          border-color: #7dd3fc;
        }

        /* Adjust standard root links to match the new vertical rhythm */
        .toc-link.root-link {
          font-weight: 600;
          color: #1e293b;
          text-transform: uppercase;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
        }

        /* --- Book Mode Architecture --- */
        .book-mode-container {
          position: relative;
          background-color: #f1f5f9;
          border-radius: 12px;
          padding: 20px;
          margin-top: 20px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .book-viewport {
          width: 100%;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scrollbar-width: none; /* Firefox */
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .book-viewport::-webkit-scrollbar {
          display: none; /* Chrome/Safari */
        }

        .book-pages-flow {
          display: flex;
          width: fit-content;
          min-width: 100%;
          gap: 40px;
          padding: 20px 40px;
          align-items: stretch; /* All pages stretch to the same height */
        }

        .book-page-item {
          scroll-snap-align: center;
          background: white;
          width: 800px; /* Base width for a "page" */
          max-width: 85vw;
          
          /* Uniform Height: Fills the flex container */
          height: 100%;
          min-height: 400px; 
          
          overflow-y: auto; /* Allow internal scroll for long sections */
          
          padding: 60px;
          border-radius: 8px;
          box-shadow: 0 15px 35px rgba(0,0,0,0.1), 0 3px 10px rgba(0,0,0,0.05);
          position: relative;
          border: 1px solid #e2e8f0;
          flex-shrink: 0;
          
          display: flex;
          flex-direction: column;
          justify-content: flex-start; /* Ensure text is at the top */
          
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        /* Custom scrollbar for the page itself */
        .book-page-item::-webkit-scrollbar {
          width: 6px;
        }
        .book-page-item::-webkit-scrollbar-track {
          background: transparent;
        }
        .book-page-item::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .book-page-item::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }

        /* Book Gutter effect - more subtle for flexible height */
        .book-page-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 20px;
          background: linear-gradient(to right, rgba(0,0,0,0.03) 0%, transparent 100%);
          pointer-events: none;
          z-index: 10;
        }

        /* Responsive Pages */
        @media (max-width: 1200px) {
          .book-page-item { width: 700px; padding: 40px; }
        }

        @media (max-width: 768px) {
          .book-page-item { width: 90vw; padding: 30px; }
          .book-pages-flow { gap: 20px; padding: 0 10px; }
          .book-mode-container { padding: 20px 10px; }
        }

        /* Navigation Overlays */
        .book-nav-overlay {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 30px;
          margin-top: 30px;
          position: sticky;
          bottom: 20px;
          z-index: 100;
        }

        .book-flip-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: white;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s ease;
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        .book-flip-btn:hover:not(:disabled) {
          background: #3b82f6;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 8px 15px rgba(59, 130, 246, 0.2);
        }

        .book-flip-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .book-page-indicator {
          background: rgba(15, 23, 42, 0.8);
          color: white;
          padding: 8px 20px;
          border-radius: 30px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-weight: 700;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 8px;
          backdrop-filter: blur(8px);
        }

        .page-divider { opacity: 0.5; font-weight: 400; }
        .page-total { opacity: 0.7; }

        /* Smooth Anchor Scrolling for Book Mode */
        :global(html) {
          scroll-behavior: smooth;
        }

        .book-page-item h2 {
          margin-top: 0;
          color: #0f172a;
          font-size: 1.5rem;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 15px;
          margin-bottom: 25px;
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

      <div style={{ display: 'flex', flex: 1, paddingTop: '60px', overflow: 'hidden' }}>
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

        {/* Main Content Area */}
        <div id="main-content" className={`main-content ${tocCollapsed ? 'expanded' : ''}`} style={{ 
            transition: 'margin-left 0.3s ease', 
            marginLeft: tocCollapsed ? '0' : '300px',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 0
        }}>
          <div className="content-scroll-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div className="container-top" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
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
          <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
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
            <LabelView data={data} activeTab={activeTab} />
            <FaersView activeTab={activeTab} faersCoverageFilter={faersCoverageFilter} setFaersCoverageFilter={setFaersCoverageFilter} />
            <AgentView activeTab={activeTab} />
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
