'use client';

import { useEffect, useState, useRef } from 'react';
import { Section, LabelData } from './types';

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

export default function LabelView({ 
  data, 
  activeTab 
}: { 
  data: LabelData; 
  activeTab: string;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const labelViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!labelViewRef.current || activeTab !== 'label-view') return;
      const { scrollLeft, clientWidth, scrollWidth } = labelViewRef.current;
      
      if (clientWidth > 0) {
        const newPage = Math.round(scrollLeft / clientWidth) + 1;
        const total = Math.ceil(scrollWidth / clientWidth);
        setCurrentPage(isNaN(newPage) ? 1 : newPage);
        setTotalPages(isNaN(total) ? 1 : total);
      }
    };

    const el = labelViewRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      // Initial calculation
      setTimeout(handleScroll, 500);
    }
    return () => el?.removeEventListener('scroll', handleScroll);
  }, [activeTab, data]);

  const flipPage = (direction: 'next' | 'prev') => {
    if (!labelViewRef.current) return;
    const { clientWidth, scrollLeft } = labelViewRef.current;
    const target = direction === 'next' ? scrollLeft + clientWidth : scrollLeft - clientWidth;
    labelViewRef.current.scrollTo({ left: target, behavior: 'smooth' });
  };

  return (
    <div id="label-view" className={`tab-content ${activeTab === 'label-view' ? 'active' : ''} book-mode-container`} style={{ display: activeTab === 'label-view' ? 'block' : 'none' }}>
        <div className="book-viewport" ref={labelViewRef}>
            <div className="book-pages-flow">
                {data.highlights && data.highlights.length > 0 && (
                <div id="highlights-section" className="highlights-box book-page-item">
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
                </div>
                )}

                {data.sections && data.sections.length > 0 ? (
                data.sections.map((section, idx) => (
                    <div key={idx} className="book-page-item">
                        <SectionComponent section={section} />
                    </div>
                ))
                ) : data.fallback_html ? (
                <div className="Section book-page-item">
                    <h2>Full Document Text</h2>
                    <div dangerouslySetInnerHTML={{ __html: data.fallback_html }} />
                </div>
                ) : (
                <p>Could not parse the drug label sections.</p>
                )}
            </div>
        </div>

        {/* Book Navigation Controls */}
        <div className="book-nav-overlay">
            <button className="book-flip-btn prev" onClick={() => flipPage('prev')} disabled={currentPage === 1}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            
            <div className="book-page-indicator">
                <span className="page-current">{currentPage}</span>
                <span className="page-divider">/</span>
                <span className="page-total">{totalPages}</span>
            </div>

            <button className="book-flip-btn next" onClick={() => flipPage('next')} disabled={currentPage === totalPages}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
    </div>
  );
}
