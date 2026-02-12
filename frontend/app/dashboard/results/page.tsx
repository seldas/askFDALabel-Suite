'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Script from 'next/script';
import { useUser } from '../../context/UserContext';

interface Label {
  set_id: string;
  brand_name: string;
  generic_name: string;
  manufacturer_name: string;
  effective_time: string;
  label_format: string;
  marketing_category?: string;
  product_type?: string;
  application_number?: string;
  dosage_forms?: string;
  routes?: string;
  active_ingredients?: string;
  labeling_type?: string;
  epc?: string;
  source?: string;
  is_favorite?: boolean;
}

interface SearchResponse {
  drug_name: string;
  page_title: string;
  labels: Label[];
  total: number;
  page: number;
  limit: number;
  view: 'panel' | 'table';
  is_internal: boolean;
  batch_id_search?: string;
  import_id?: string;
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session, loading: sessionLoading, updateAiProvider, refreshSession } = useUser();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [showAiModal, setShowAiModal] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [showFavAllModal, setShowFavAllModal] = useState(false);
  const [projects, setProjects] = useState<{id: number; title: string}[]>([]);

  const drugName = searchParams.get('drug_name') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const view = (searchParams.get('view') || 'table') as 'panel' | 'table';
  const importId = searchParams.get('import_id') || '';
  const batchSearch = searchParams.get('batch_id_search') || '';

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams(searchParams.toString());
        params.set('json', '1');
        const response = await fetch(`/api/dashboard/search?${params.toString()}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to fetch results');
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [searchParams]);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/dashboard/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects);
        }
      } catch (e) {
        console.error("Failed to fetch projects", e);
      }
    }
    if (session?.is_authenticated) {
      fetchProjects();
    }
  }, [session]);

  const handleSelectionChange = (setId: string) => {
    const newSelection = new Set(selectedSetIds);
    if (newSelection.has(setId)) {
      newSelection.delete(setId);
    } else {
      if (newSelection.size < 5) {
        newSelection.add(setId);
      } else {
        alert("You can select up to 5 labels for comparison.");
      }
    }
    setSelectedSetIds(newSelection);
  };

  const toggleView = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', view === 'panel' ? 'table' : 'panel');
    router.push(`/dashboard/results?${params.toString()}`);
  };

  const jumpToPage = (pageNum: number) => {
    if (!data) return;
    const maxPage = Math.ceil(data.total / data.limit);
    if (pageNum >= 1 && pageNum <= maxPage) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', pageNum.toString());
      router.push(`/dashboard/results?${params.toString()}`);
    }
  };

  if (loading) return <div className="hp-main-layout"><div className="hp-container"><p>Loading results...</p></div></div>;
  if (error) return <div className="hp-main-layout"><div className="hp-container"><p>Error: {error}</p></div></div>;
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

  const openFavAllModal = () => {
    setShowFavAllModal(true);
  };

  const closeFavAllModal = () => {
    setShowFavAllModal(false);
  };

  const handleSaveAll = async () => {
    const projectId = (document.getElementById('fav-all-project-select') as HTMLSelectElement).value;
    const newProjectName = (document.getElementById('fav-all-new-project-name') as HTMLInputElement).value;

    try {
      const res = await fetch('/api/dashboard/favorite_all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drug_name: data?.drug_name,
          batch_id_search: data?.batch_id_search,
          import_id: data?.import_id,
          project_id: projectId !== 'new' ? projectId : undefined,
          new_project_name: projectId === 'new' ? newProjectName : undefined
        })
      });
      const result = await res.json();
      if (result.success) {
        alert(`Successfully saved to project ${result.project_title}`);
        closeFavAllModal();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (e) {
      console.error("Failed to save all to project", e);
      alert("Failed to save all to project");
    }
  };

  if (!data) return null;

  return (
    <div className="hp-main-layout search-results-page">
      {showFavAllModal && (
        <div id="favAllModal" className="custom-modal" style={{ display: 'flex' }}>
          <div className="custom-modal-content" style={{ maxWidth: '600px', height: 'auto' }}>
            <div className="custom-modal-header">
              <h3>Save All Results to Project</h3>
              <span className="close-modal" onClick={closeFavAllModal} style={{ cursor: 'pointer' }}>&times;</span>
            </div>
            <div className="custom-modal-body">
              <p>Add all {data.total} labels to a project:</p>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: '#64748b', fontWeight: 600 }}>Select Project</label>
                  <select id="fav-all-project-select" className="import-input">
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                    <option value="new">Create New Project</option>
                  </select>
                </div>

                <div id="new-project-input-container" style={{ display: 'none', marginBottom: '15px', animation: 'slideDown 0.2s ease-out' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: '#64748b', fontWeight: 600 }}>New Project Name</label>
                  <input type="text" id="fav-all-new-project-name" className="import-input" placeholder="e.g. My Oncology Research" />
                </div>

                <button id="confirm-fav-all-btn" className="button" style={{ width: '100%', height: '45px', background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)', color: 'white', border: 'none', marginTop: '10px' }}
                  onClick={handleSaveAll}
                >
                  <span>{"\uD83D\uDCDD"}</span> Save All
                </button>
              </div>
            </div>
          </div>
      )}
      
      <div className="hp-container" style={{ maxWidth: '1200px', padding: '1.5em 2em' }}>
        
        {/* Navigation */}
        <div className="hp-auth-nav" style={{ justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '10px' }}>
          <a href="/dashboard" className="hp-nav-btn hp-btn-outline" style={{ marginRight: 'auto' }}>
            <span>{"\u2190"}</span> Back Home
          </a>
          {/* AI Switcher and Projects Placeholder */}
          <div style={{ display: 'flex', gap: '15px' }}>
            {/* AI Switcher */}
            <div className="hp-ai-switcher" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '5px 12px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 600 }}>AI:</span>
              <select 
                value={session?.ai_provider} 
                onChange={(e) => updateAiProvider(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9em', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}
              >
                {session && !session.is_internal && (
                  <>
                    <option value="gemini">Gemini</option>
                    <option value="gemma">Gemma 3</option>
                  </>
                )}
                <option value="openai">OpenAI</option>
                {session && session.is_internal && <option value="elsa">ELSA</option>}
              </select>
              <button 
                onClick={() => setShowAiModal(true)}
                title="AI Configuration" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                {"\u2699"}
              </button>
            </div>
            <a href="/api/dashboard/my_labelings" target="AskFDALabel_MyProjects" className="hp-nav-btn hp-btn-outline"><span>{"\uD83D\uDCBC"}</span> My Projects</a>
          </div>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5em', lineHeight: '1.2' }}>
              {data.page_title}
              {data.labels.length > 0 && data.labels[0].source === 'FDALabel_Internal' ? (
                <span style={{ fontSize: '0.4em', verticalAlign: 'middle', backgroundColor: '#28a745', color: 'white', padding: '3px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '10px' }}>Internal DB</span>
              ) : data.labels.length > 0 ? (
                <span style={{ fontSize: '0.4em', verticalAlign: 'middle', backgroundColor: '#007bff', color: 'white', padding: '3px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '10px' }}>OpenFDA</span>
              ) : null}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.85em', color: '#64748b' }}>
              {data.total > 0 ? (
                `Showing results ${(data.page - 1) * data.limit + 1} - ${Math.min(data.page * data.limit, data.total)} of ${data.total} total matches.`
              ) : (
                "No matches found for this query."
              )}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {selectedSetIds.size > 0 && (
              <button 
                onClick={() => router.push(`/api/dashboard/compare?set_ids=${Array.from(selectedSetIds).join(',')}`)} 
                className="hp-nav-btn" 
                style={{ backgroundColor: '#28a745', color: 'white' }}
              >
                <span>{"\u2696"}</span> Compare ({selectedSetIds.size})
              </button>
            )}
              <button 
                onClick={() => openFavAllModal()} 
                className="hp-nav-btn hp-btn-outline"
                title="Save all results to a project"
              >
                <span>{"\uD83D\uDCDD"}</span> Save All
              </button>
            <button onClick={toggleView} className="hp-nav-btn hp-btn-outline">
              <span>{view === 'panel' ? "\uD83D\uDCCB" : "\uD83D\uDCBB"}</span> {view === 'panel' ? 'Table View' : 'Panel View'}
            </button>
          </div>
        </div>

        <hr style={{ margin: '5px 0 15px', opacity: 0.1 }} />

        {/* Results */}
        {data.labels.length > 0 ? (
          <>
            {view === 'panel' ? (
              <div className="selection-panels">
                {data.labels.map((label) => (
                  <div key={label.set_id} className="panel" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                      <span className={`status-badge ${label.label_format === 'PLR' ? 'plr-badge' : 'non-plr-badge'}`}>
                        {label.marketing_category || label.label_format || 'Unknown Format'}
                      </span>
                      <input 
                        type="checkbox" 
                        checked={selectedSetIds.has(label.set_id)}
                        onChange={() => handleSelectionChange(label.set_id)}
                        style={{ transform: 'scale(1.2)' }}
                      />
                    </div>
                    <h3 style={{ marginBottom: '10px', lineHeight: '1.2' }}>{label.brand_name}</h3>
                    <p style={{ color: '#6c757d', fontStyle: 'italic', marginBottom: '15px', fontSize: '0.95em' }}>{label.generic_name}</p>
                    
                    <div className="panel-meta-grid">
                      <div className="meta-item">
                        <span className="meta-icon">{"\uD83C\uDFED"}</span>
                        <div>
                          <small>Manufacturer</small>
                          <span>{label.manufacturer_name}</span>
                        </div>
                      </div>
                      <div className="meta-item">
                        <span className="meta-icon">{"\uD83D\uDCC5"}</span>
                        <div>
                          <small>Published</small>
                          <span>{label.effective_time}</span>
        </div>
      </div>
      
      {showAiModal && session?.is_authenticated && (
        <div id="ai-config-modal" className="custom-modal" style={{ display: 'flex' }}>
          <div className="custom-modal-content" style={{ maxWidth: '600px', height: 'auto' }}>
            <div className="custom-modal-header">
              <h3>AI Configuration</h3>
              <span className="close-modal" id="close-ai-config" onClick={() => setShowAiModal(false)} style={{ cursor: 'pointer' }}>&times;</span>
            </div>
            <div className="custom-modal-body">
              <form id="ai-config-form" onSubmit={handleConfigSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>AI Provider</label>
                  <select name="ai_provider" defaultValue={session.ai_provider} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {!session.is_internal && (
                      <>
                        <option value="gemini">Gemini (Default)</option>
                        <option value="gemma">Gemma 3 27B</option>
                      </>
                    )}
                    <option value="openai">OpenAI-Compatible</option>
                    {session.is_internal && <option value="elsa">ELSA (Internal)</option>}
                  </select>
                </div>
                
                <div style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', marginBottom: '15px', background: '#f8fafc' }}>
                   <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Gemini Key</label>
                      <input type="password" name="custom_gemini_key" defaultValue={session.custom_gemini_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                   <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>OpenAI Key</label>
                      <input type="password" name="openai_api_key" defaultValue={session.openai_api_key} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                   <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Base URL</label>
                      <input type="text" name="openai_base_url" defaultValue={session.openai_base_url} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                   <div>
                      <label style={{ fontWeight: 600, fontSize: '0.9em' }}>Model Name</label>
                      <input type="text" name="openai_model_name" defaultValue={session.openai_model_name} style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                   </div>
                </div>

                <div style={{ textAlign: 'right', marginTop: '20px' }}>
                  <button type="submit" disabled={configLoading} style={{ background: '#6f42c1', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' }}>
                    {configLoading ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <Script src="/api/dashboard/static/js/session_manager.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/ui.js" strategy="afterInteractive" />
    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="selection-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>Sel</th>
                      <th>Trade Name</th>
                      <th>Generic Name</th>
                      <th>Manufacturer</th>
                      <th>Published</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.labels.map((label) => (
                      <tr key={label.set_id}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedSetIds.has(label.set_id)}
                            onChange={() => handleSelectionChange(label.set_id)}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{label.brand_name}</td>
                        <td>{label.generic_name}</td>
                        <td>{label.manufacturer_name}</td>
                        <td>{label.effective_time}</td>
                        <td><a href={`/dashboard/label/${label.set_id}`} className="hp-nav-btn hp-btn-outline" style={{ padding: '5px 15px', fontSize: '0.85em' }}>View</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="pagination" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
              <button 
                onClick={() => jumpToPage(page - 1)} 
                disabled={page <= 1}
                className="hp-nav-btn hp-btn-outline"
              >
                <span>{"\u2039"}</span> Previous
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9em', color: '#6c757d' }}>Page</span>
                <input 
                  type="number" 
                  value={page}
                  onChange={(e) => jumpToPage(parseInt(e.target.value))}
                  style={{ width: '60px', textAlign: 'center', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                />
                <span style={{ fontSize: '0.9em', color: '#6c757d' }}>of {Math.ceil(data.total / data.limit)}</span>
              </div>

              <button 
                onClick={() => jumpToPage(page + 1)} 
                disabled={page * data.limit >= data.total}
                className="hp-nav-btn hp-btn-outline"
              >
                Next <span>{"\u203A"}</span>
              </button>
            </div>
          </>
        ) : null}
      </div>
      
      <Script src="/api/dashboard/static/js/session_manager.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/ui.js" strategy="afterInteractive" />
      <Script src="/api/dashboard/static/js/favorites.js" strategy="afterInteractive" />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
