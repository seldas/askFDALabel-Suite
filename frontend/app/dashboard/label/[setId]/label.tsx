'use client';

import { useEffect, useState, useRef } from 'react';
import { Section, LabelData, TOCItem } from './types';
import Link from 'next/link';

function SectionComponent({ section }: { section: Section }) {
  return (
    <div 
      className={`Section ${section.is_boxed_warning ? 'black-boxed-warning' : ''}`}
      id={section.id}
      data-section-number={section.numeric_id}
      style={{ marginBottom: '30px' }}
    >
      {section.title && <h2 style={{ 
        fontSize: '1.5rem', 
        color: '#1e293b', 
        borderBottom: '2px solid #f1f5f9', 
        paddingBottom: '12px',
        marginBottom: '20px',
        fontWeight: 700
      }}>{section.title}</h2>}
      {section.content && <div className="spl-content" dangerouslySetInnerHTML={{ __html: section.content }} />}
      {section.children && section.children.map((child, idx) => (
        <SectionComponent key={idx} section={child} />
      ))}
    </div>
  );
}

export default function LabelView({ 
  data, 
  activeTab,
  tocCollapsed,
  setTocCollapsed,
  expandedSections,
  toggleSection,
  TOCItemComponent
}: { 
  data: LabelData; 
  activeTab: string;
  tocCollapsed: boolean;
  setTocCollapsed: (collapsed: boolean) => void;
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  TOCItemComponent: any;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const labelViewRef = useRef<HTMLDivElement>(null);
  const disableScrollObserver = useRef(false);

  // Rollback logic: Each top-level section is one page
  const pages = [
    ...(data.highlights && data.highlights.length > 0 ? [{ id: 'highlights-section', is_highlights: true }] : []),
    ...(data.sections || [])
  ];

  // Helper to find which top-level page contains a specific section ID
  const findPageIdxForId = (id: string) => {
    // Pass 1: Exact Page ID Match (High Priority) - prevents jumping to children when parent is requested
    const topLevelIdx = pages.findIndex(p => p.id === id);
    if (topLevelIdx !== -1) return topLevelIdx;

    // Pass 2: Nested Child Search
    const checkNested = (secs: any[], targetId: string): boolean => {
      return secs.some(s => s.id === targetId || (s.children && checkNested(s.children, targetId)));
    };

    return pages.findIndex(p => {
      if (p.children && checkNested(p.children, id)) return true;
      return false;
    });
  };

  useEffect(() => {
    setTotalPages(pages.length);
  }, [pages.length]);

  useEffect(() => {
    const handleScroll = () => {
      if (!labelViewRef.current || activeTab !== 'label-view' || disableScrollObserver.current) return;
      const { scrollLeft, clientWidth } = labelViewRef.current;
      
      if (clientWidth > 0) {
        // Use a small epsilon to avoid floating point errors in page calculation
        const newPage = Math.round(scrollLeft / clientWidth) + 1;
        setCurrentPage(isNaN(newPage) ? 1 : (newPage > pages.length ? pages.length : newPage));
      }
    };

    const el = labelViewRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      setTimeout(handleScroll, 500);
    }
    return () => el?.removeEventListener('scroll', handleScroll);
  }, [activeTab, pages.length]);

  const goToPage = (index: number, targetId?: string) => {
    if (!labelViewRef.current) return;
    const { clientWidth } = labelViewRef.current;
    
    disableScrollObserver.current = true;
    setCurrentPage(index + 1);

    // TEMPORARY: Disable scroll snap to prevent fighting with smooth scroll
    labelViewRef.current.style.scrollSnapType = 'none';

    // 1. Horizontal Scroll to Page
    labelViewRef.current.scrollTo({ left: index * clientWidth, behavior: 'smooth' });

    // 2. Update Hash if NOT triggered by hash change (optional, keeps UI in sync)
    if (!targetId) {
      const pageId = pages[index]?.id;
      if (pageId && window.location.hash !== `#${pageId}`) {
        window.history.pushState(null, '', `#${pageId}`);
      }
    }

    // 3. Vertical Scroll within Page to specific ID (if provided)
    if (targetId) {
      setTimeout(() => {
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Re-enable snap and observer
        if (labelViewRef.current) labelViewRef.current.style.scrollSnapType = 'x mandatory';
        disableScrollObserver.current = false;
      }, 500); // Wait for horizontal scroll to be underway
    } else {
      setTimeout(() => {
        // Re-enable snap and observer
        if (labelViewRef.current) labelViewRef.current.style.scrollSnapType = 'x mandatory';
        disableScrollObserver.current = false;
      }, 600);
    }
  };

  const flipPage = (direction: 'next' | 'prev') => {
    if (direction === 'next' && currentPage < totalPages) {
      goToPage(currentPage); // index is 0-based, so goToPage(currentPage) goes to idx = current (which is next page)
    } else if (direction === 'prev' && currentPage > 1) {
      goToPage(currentPage - 2); // idx = current - 2
    }
  };

  // Sync TOC clicks with book pages
  useEffect(() => {
    const handleHashChange = (e?: HashChangeEvent) => {
      // Prevent browser jump if it's a real event
      if (e) e.preventDefault();
      
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        const pageIdx = findPageIdxForId(hash);
        if (pageIdx !== -1) {
          goToPage(pageIdx, hash);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    
    // Initial check
    setTimeout(() => handleHashChange(), 500);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [pages]);

  if (activeTab !== 'label-view') return null;

  return (
    <div id="label-view" className="tab-content active" style={{ 
      display: 'flex', 
      flex: 1, 
      minHeight: 0,
      gap: '20px',
      alignItems: 'flex-start',
      marginTop: '10px'
    }}>
        
        {/* Layer 2: Menu (TOC) */}
        <div id="toc-panel" className={`toc-side-panel-inline ${tocCollapsed ? 'collapsed' : ''}`} style={{ 
          width: tocCollapsed ? '0' : '300px', 
          height: '750px',
          flexShrink: 0,
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          border: '1px solid #f1f5f9',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s ease'
        }}>
          <div className="toc-box" style={{ padding: '15px', flex: 1, overflowY: 'auto' }}>
            <div className="toc-header" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', margin: 0 }}>Table of Contents</h2>
              <button onClick={() => setTocCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem' }}>✕</button>
            </div>
            {data.table_of_contents && data.table_of_contents.length > 0 ? (
              <ol className="toc-list">
                {data.table_of_contents.map((item: TOCItem) => (
                  <TOCItemComponent 
                    key={item.id} 
                    item={item} 
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  />
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No TOC available.</p>
            )}
          </div>
          <div className="sidebar-footer" style={{ padding: '12px', borderTop: '1px solid #f1f5f9' }}>
            <Link href="/dashboard" className="btn-sidebar-home" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textDecoration: 'none' }}>
               🏠 Dashboard
            </Link>
          </div>
        </div>

        {/* Layer 2: Main Content (Book Placeholder) */}
        <div className="label-main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {tocCollapsed && (
              <button onClick={() => setTocCollapsed(false)} style={{ position: 'absolute', left: '20px', zIndex: 10, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                ☰ SHOW MENU
              </button>
            )}

            {/* Layer 3: Book View */}
            <div className="book-mode-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, justifyContent: 'flex-start', padding: '0' }}>
                <div className="book-viewport" ref={labelViewRef} style={{ 
                    height: '750px', 
                    maxWidth: '900px',
                    width: '100%',
                    maxHeight: '75vh',
                    overflowX: 'auto', 
                    scrollSnapType: 'x mandatory', 
                    display: 'flex',
                    margin: '0',
                    gap: '0'
                }}>
                    <div className="book-pages-flow" style={{ display: 'flex', padding: '0' }}>
                        {pages.map((page: any, idx) => {
                          const isSafetySection = page.is_highlights || page.is_boxed_warning;
                          return (
                            <div key={idx} className="book-page-item" style={{ 
                              scrollSnapAlign: 'start', 
                              flexShrink: 0, 
                              width: '100%',
                              padding: '0 10px',
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                               <div className="page-inner-content" style={{ 
                                  background: 'white', 
                                  borderRadius: '4px 12px 12px 4px', 
                                  padding: '50px 60px 100px 60px', 
                                  boxShadow: '5px 15px 35px rgba(0,0,0,0.1), 0 5px 15px rgba(0,0,0,0.05)', 
                                  border: '1px solid #e2e8f0', 
                                  borderLeft: isSafetySection ? '10px solid #e11d48' : '10px solid #cbd5e1',
                                  height: '100%', 
                                  overflowY: 'auto', 
                                  position: 'relative'
                               }}>
                                  {/* Subtle Gutter Effect */}
                                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to right, rgba(0,0,0,0.08) 0%, transparent 100%)', pointerEvents: 'none' }}></div>
                                  
                                  {page.is_highlights ? (
                                      <div id="highlights-section">
                                          <h2 style={{ fontSize: '1.8rem', color: '#0f172a', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ backgroundColor: '#fef3c7', padding: '8px', borderRadius: '10px' }}>✨</span>
                                            Highlights of Prescribing
                                          </h2>
                                          {data.highlights.map((h, i) => (
                                            <div key={i} className="highlight-item" style={{ marginBottom: '20px', padding: '15px', borderLeft: '4px solid #f59e0b', background: '#fffbeb', borderRadius: '0 8px 8px 0' }}>
                                                {h.source_section_title !== 'Untitled Section' && (
                                                  <div className="highlight-source-header" style={{ marginBottom: '8px' }}>
                                                      <span className="source-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginRight: '8px' }}>Section</span>
                                                      <span className="source-title" style={{ fontWeight: 700, color: '#92400e' }}>{h.source_section_title}</span>
                                                  </div>
                                                )}
                                                <div className="highlight-body" style={{ color: '#78350f', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: h.content_html }} />
                                            </div>
                                          ))}
                                      </div>
                                  ) : (
                                      <SectionComponent section={page} />
                                  )}
                               </div>
                            </div>
                          );
                        })}
                    </div>
                </div>

                {/* Book Navigation Controls */}
                <div className="book-nav-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', padding: '20px 0' }}>
                    <button className="book-flip-btn prev" onClick={() => flipPage('prev')} disabled={currentPage === 1} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        ←
                    </button>
                    
                    <div className="book-page-indicator" style={{ background: '#1e293b', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700 }}>
                        PAGE {currentPage} / {totalPages}
                    </div>

                    <button className="book-flip-btn next" onClick={() => flipPage('next')} disabled={currentPage === totalPages} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        →
                    </button>
                </div>
            </div>
        </div>

        <style jsx>{`
            .toc-side-panel-inline { transition: width 0.3s ease; }
            .toc-side-panel-inline.collapsed { width: 0 !important; margin-right: -20px; border: none; }
            .book-viewport::-webkit-scrollbar { display: none; }
            .book-viewport { -ms-overflow-style: none; scrollbar-width: none; }
            .page-inner-content :global(table) { width: 100% !important; font-size: 0.8rem !important; }
            .page-inner-content :global(img) { max-height: 300px; width: auto; object-fit: contain; }
        `}</style>
    </div>
  );
}
