'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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
  const [currentIndex, setCurrentIndex] = useState(0); // 0-based index of sections
  const labelViewRef = useRef<HTMLDivElement>(null);
  const disableScrollObserver = useRef(false);

  // Flatten top-level sections into a single list for sequential navigation
  const sections = useMemo(() => [
    ...(data.highlights && data.highlights.length > 0 ? [{ id: 'highlights-section', is_highlights: true, title: 'Highlights' }] : []),
    ...(data.sections || [])
  ], [data.highlights, data.sections]);

  // Helper to find which top-level section contains a specific ID (for TOC links)
  const findSectionIdxForId = (id: string) => {
    // 1. Exact match
    const idx = sections.findIndex(s => s.id === id);
    if (idx !== -1) return idx;

    // 2. Nested match
    const checkNested = (secs: any[], targetId: string): boolean => {
      return secs.some(s => s.id === targetId || (s.children && checkNested(s.children, targetId)));
    };

    return sections.findIndex(s => {
      if ('children' in s && s.children && checkNested(s.children, id)) return true;
      return false;
    });
  };

  // Scroll to a specific section index
  const scrollToSection = (index: number, targetId?: string) => {
    if (!labelViewRef.current || index < 0 || index >= sections.length) return;
    
    disableScrollObserver.current = true;
    setCurrentIndex(index);

    const targetSection = sections[index];
    // Find the element in the DOM
    // We use the ID if available, otherwise rely on order (which should match)
    const container = labelViewRef.current;
    
    // Prefer finding by ID if possible for robustness
    let el = targetId ? container.querySelector(`[id="${targetId}"]`) : null;
    
    if (!el && targetSection.id) {
        el = container.querySelector(`[id="${targetSection.id}"]`);
    }
    
    // Fallback to data-index if ID lookup fails
    if (!el) {
        el = container.querySelector(`[data-section-index="${index}"]`);
    }

    if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        
        // Update URL hash
        const hashId = targetId || targetSection.id;
        if (hashId && window.location.hash !== `#${hashId}`) {
            window.history.pushState(null, '', `#${hashId}`);
        }
    }

    // Re-enable observer after a delay
    setTimeout(() => {
        disableScrollObserver.current = false;
    }, 100);
  };

  const jumpSection = (direction: 'next' | 'prev') => {
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < sections.length) {
        scrollToSection(newIndex);
    }
  };

  // Sync TOC clicks (hash changes)
  useEffect(() => {
    const handleHashChange = (e?: HashChangeEvent) => {
      if (e) e.preventDefault();
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        const idx = findSectionIdxForId(hash);
        if (idx !== -1) {
          scrollToSection(idx, hash);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    setTimeout(() => handleHashChange(), 100); // Initial check
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [sections]);

  // Track active section on scroll
  useEffect(() => {
    const intersectingIndices = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (disableScrollObserver.current) return;
        
        entries.forEach(entry => {
            const index = Number(entry.target.getAttribute('data-section-index'));
            if (!isNaN(index)) {
                if (entry.isIntersecting) {
                    intersectingIndices.add(index);
                } else {
                    intersectingIndices.delete(index);
                }
            }
        });

        if (intersectingIndices.size > 0) {
            // Pick the highest index among those currently intersecting the active zone.
            // This ensures that as you scroll down, the most recently entered section becomes active.
            const maxIndex = Math.max(...Array.from(intersectingIndices));
            setCurrentIndex(maxIndex);
        }
      },
      {
        root: labelViewRef.current,
        // Active zone: Trigger when sections are in the top portion (10% to 25% from top)
        rootMargin: '-10% 0px -75% 0px', 
        threshold: 0
      }
    );

    const container = labelViewRef.current;
    if (container) {
        const children = container.querySelectorAll('.label-section-item');
        children.forEach(c => observer.observe(c));
    }

    return () => observer.disconnect();
  }, [sections.length, activeTab]);

  // Re-apply MedDRA highlights after render
  useEffect(() => {
    if (activeTab === 'label-view') {
        setTimeout(() => {
            if ((window as any).reapplyMeddraHighlights) {
                (window as any).reapplyMeddraHighlights();
            }
        }, 500); 
    }
  }, [activeTab, sections]);

  return (
    <div id="label-view" className={`tab-content ${activeTab === 'label-view' ? 'active' : ''}`} style={{ 
      display: activeTab === 'label-view' ? 'flex' : 'none', 
      flex: 1, 
      minHeight: 0,
      gap: '20px',
      alignItems: 'stretch',
      marginTop: '10px'
    }}>
        
        {/* TOC Panel */}
        <div id="toc-panel" className={`toc-side-panel-inline ${tocCollapsed ? 'collapsed' : ''}`} style={{ 
          width: tocCollapsed ? '0' : '300px', 
          height: '100%',
          maxHeight: '80vh',
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
                    activeSectionId={sections[currentIndex]?.id}
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

        {/* Main Content */}
        <div className="label-main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto', maxHeight: '80vh' }}>
            {tocCollapsed && (
              <button onClick={() => setTocCollapsed(false)} style={{ position: 'absolute', left: '20px', zIndex: 10, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                ☰ SHOW MENU
              </button>
            )}

            {/* Continuous Vertical Scroll View */}
            <div className="vertical-scroll-container" style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                background: '#f1f5f9',
                borderRadius: '12px',
                padding: '0',
                position: 'relative',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
                overflow: 'hidden'
            }}>
                <div 
                    className="label-viewport" 
                    ref={labelViewRef} 
                    style={{ 
                        flex: 1, 
                        overflowY: 'auto', 
                        padding: '40px',
                        scrollBehavior: 'smooth'
                    }}
                >
                    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '60px' }}>
                        {sections.map((section: any, idx) => {
                          const isSafetySection = section.is_highlights || section.is_boxed_warning;
                          return (
                            <div 
                                key={idx} 
                                className="label-section-item" 
                                data-section-index={idx}
                                id={section.id} // Ensure ID is on wrapper for scroll targets
                                style={{ 
                                    background: 'white',
                                    borderRadius: '8px',
                                    padding: '40px 50px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                    border: '1px solid #e2e8f0',
                                    position: 'relative'
                                }}
                            >
                                {section.is_highlights ? (
                                    <div id="highlights-content">
                                        <h2 style={{ 
                                            fontSize: '1.25rem', 
                                            color: '#000', 
                                            marginBottom: '20px', 
                                            fontWeight: 900, 
                                            textTransform: 'uppercase', 
                                            borderBottom: '2px solid #000', 
                                            paddingBottom: '8px',
                                            letterSpacing: '0.05em' 
                                        }}>
                                            Highlights of Prescribing Information
                                        </h2>
                                        {data.highlights.map((h, i) => (
                                            <div key={i} className="highlight-item" style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                                                {h.source_section_title !== 'Untitled Section' && (
                                                    <div className="highlight-source-header" style={{ marginBottom: '6px' }}>
                                                        <span className="source-title" style={{ fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.75rem' }}>{h.source_section_title}</span>
                                                    </div>
                                                )}
                                                <div className="highlight-body" style={{ color: '#1e293b', lineHeight: '1.5', fontSize: '0.9rem' }} dangerouslySetInnerHTML={{ __html: h.content_html }} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <SectionComponent section={section} />
                                )}
                            </div>
                          );
                        })}
                    </div>
                    {/* Spacer at bottom to allow scrolling last item to top */}
                    <div style={{ height: '200px' }}></div>
                </div>
            </div>
        </div>

        <style jsx>{`
            .toc-side-panel-inline { transition: width 0.3s ease; }
            .toc-side-panel-inline.collapsed { width: 0 !important; margin-right: -20px; border: none; }
            .label-viewport::-webkit-scrollbar { width: 8px; }
            .label-viewport::-webkit-scrollbar-track { background: transparent; }
            .label-viewport::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .label-viewport::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            .page-inner-content :global(table) { width: 100% !important; font-size: 0.8rem !important; }
            .page-inner-content :global(img) { max-height: 300px; width: auto; object-fit: contain; }
        `}</style>
    </div>
  );
}
