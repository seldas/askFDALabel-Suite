'use client';

import { useEffect, useState, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

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
  user_id: number | null;
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
  const [data, setData] = useState<LabelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('label-view');
  const [tocCollapsed, setTocCollapsed] = useState(false);

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

  if (loading) return <div className="hp-main-layout"><div className="hp-container"><div className="loader" style={{margin:'50px auto'}}></div><p style={{textAlign:'center'}}>Loading label...</p></div></div>;
  if (error) return <div className="hp-main-layout"><div className="hp-container"><p style={{color:'red', textAlign:'center'}}>Error: {error}</p></div></div>;
  if (!data) return null;

  return (
    <div className="results-container">
      {/* Table of Contents Side Panel */}
      <div id="toc-panel" className={`toc-side-panel ${tocCollapsed ? 'hidden' : ''}`}>
        <div className="toc-box">
          <div className="toc-header">
            <h2>Table of Contents</h2>
            <button id="toc-close-internal" onClick={() => setTocCollapsed(true)} title="Collapse Panel" style={{ background: 'none', border: 'none', fontSize: '1.5em', cursor: 'pointer' }}>
                <span>{"\u00AB"}</span>
            </button>
          </div>
          {data.table_of_contents && data.table_of_contents.length > 0 ? (
            <ol>
              {data.table_of_contents.map((item) => (
                <li key={item.id}><a href={`#${item.id}`}>{item.title}</a></li>
              ))}
            </ol>
          ) : (
            <p>No table of contents available.</p>
          )}
        </div>
        <div className="sidebar-footer">
          <a href="/dashboard" className="button btn-sidebar-home">
            <span>{"\u2302"}</span> Return Home
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div id="main-content" className="main-content">
        <div className="container">
          <div className="auth-nav">
            <button onClick={() => router.push('/dashboard')} className="button nav-btn-primary" title="Home">
               Home
            </button>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="button nav-btn-primary" title="Scroll to Top">
               Top
            </button>
            <button 
                id="show-toc-btn" 
                className="button nav-btn-primary" 
                style={{ display: tocCollapsed ? 'inline-flex' : 'none' }} 
                onClick={() => setTocCollapsed(false)}
                title="Show Sidebar"
            >
               Sidebar
            </button>

            <div className="view-tabs" style={{ marginBottom: 0, display: 'flex', gap: '8px', marginRight: 'auto', marginLeft: '15px' }}>
              <button className={`tab-btn ${activeTab === 'label-view' ? 'active' : ''}`} onClick={() => setActiveTab('label-view')} data-target="label-view">📄 Official Label</button>
              <button className={`tab-btn ${activeTab === 'faers-view' ? 'active' : ''}`} onClick={() => setActiveTab('faers-view')} id="btn-faers-view" data-target="faers-view">📊 FAERS</button>
              <button className={`tab-btn ${activeTab === 'tox-view' ? 'active' : ''}`} onClick={() => setActiveTab('tox-view')} id="btn-tox-view" data-target="tox-view">🧪 Agents</button>
            </div>

            <button id="favorites-toggle-btn" className="button btn-favorites"><span>{"\uD83D\uDCBC"}</span> My Projects</button>
            <div id="favorites-dropdown-menu" className="favorites-dropdown-menu">
                <div id="favorites-dropdown-content"><div className="dropdown-loading">Loading...</div></div>
            </div>
          </div>

          <div className="label-header" style={{ marginBottom: '25px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                    <h1 className="DocumentTitle" style={{ marginBottom: '5px', lineHeight: '1.2' }}>{data.brand_name || data.drug_name}</h1>
                    <h2 style={{ marginTop: 0, fontSize: '1.1em', color: '#666', fontWeight: 400, marginBottom: 0 }}>{data.original_title || data.generic_name}</h2>
                </div>
                <div style={{ marginLeft: '20px' }}>
                    <button id="favorite-btn" className="favorite-btn" title="Toggle Project" style={{ background:'none', border:'none', cursor:'pointer', fontSize: '1.8em', color: '#ccc', padding: 0 }}>
                        {"\u2606"}
                    </button>
                </div>
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
                    <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>NDC Code</span>
                    <span style={{ fontFamily: 'monospace', color: '#333' }}>{data.ndc || 'N/A'}</span>
                </div>
                <div className="meta-item">
                    <span style={{ display: 'block', fontSize: '0.75em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Application Number</span>
                    <span style={{ fontFamily: 'monospace', color: '#333' }}>{data.application_number || 'N/A'}</span>
                </div>
             </div>
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
                   <h3>Label Coverage Analysis</h3>
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
             <div id="tox-index" style={{ textAlign: 'center', padding: '50px 20px' }}>
                <h2 style={{ color: '#333', marginBottom: '40px', fontWeight: 300 }}>Select an Agent</h2>
                <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
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

      {/* Floating Action Buttons */}
      <div id="user-notes-btn" className="floating-action-btn" title="My Notes" style={{ bottom: '160px', backgroundColor: '#fd7e14' }}>
        <span>{"\uD83D\uDDD2"}</span>
      </div>
      <div id="meddra-stats-btn" className="floating-action-btn" title="MedDRA Stats" style={{ bottom: '90px', backgroundColor: '#6f42c1' }}>
        <span>{"\uD83D\uDCCA"}</span>
      </div>
      <div id="chat-bubble" className="floating-action-btn chat-bubble" title="AI Assistant" style={{ bottom: '20px', backgroundColor: '#007bff' }}>
        <span>{"\uD83D\uDCAC"}</span>
      </div>

      {/* Hidden Data for JS */}
      <div id="xml-content" style={{ display: 'none' }}>{data.label_xml_raw}</div>
      <Script id="label-data-init" strategy="afterInteractive">
        {`
          window.currentSetId = ${JSON.stringify(data.set_id)};
          window.currentDrugName = ${JSON.stringify(data.faers_drug_name)};
          window.currentManufacturer = ${JSON.stringify(data.manufacturer_name)};
          window.currentEffectiveTime = ${JSON.stringify(data.effective_time)};
          window.currentUserId = ${data.user_id || 'null'};
          window.savedAnnotations = ${JSON.stringify(data.saved_annotations)};
        `}
      </Script>

      {/* Legacy Scripts */}
      <Script src="/api/dashboard/static/js/chart.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/marked.min.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/utils.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/ui.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/favorites.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/session_manager.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/chat.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/annotations.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/faers.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/tox.js" strategy="afterInteractive" />

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
          <div className="custom-modal-header">
            <h3 id="table-extract-title">Table Data</h3>
            <span className="close-modal" id="close-table-extract">&times;</span>
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

      <div id="chatbox" className="chatbox" style={{ display: 'none' }}>
        <div className="chat-header" id="chat-header">
            <h3>AI Assistant</h3>
            <div className="chat-header-buttons">
                <button id="close-chat" className="close-chat">&times;</button>
            </div>
        </div>
        <div id="chat-messages" className="chat-messages"></div>
        <div className="chat-input-form">
            <input type="text" id="chat-input" placeholder="Type a message..." />
            <button id="chat-send">Send</button>
        </div>
      </div>
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
