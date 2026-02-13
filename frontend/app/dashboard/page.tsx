'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DashboardClient from './DashboardClient';
import { useUser } from '../context/UserContext';

interface Project {
  id: number;
  title: string;
  role: string;
  count: number;
  is_default: boolean;
}

interface Favorite {
  set_id: string;
  brand_name: string;
  generic_name: string;
  manufacturer_name: string;
  effective_time: string;
}

interface Comparison {
  id: number;
  set_ids: string[];
  title: string;
  timestamp: string;
}

export default function DashboardPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [newImportProjectName, setNewImportProjectName] = useState('');
  const router = useRouter();
  const { session, loading, refreshSession } = useUser();
  
  // Project Management State
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectContent, setProjectLabels] = useState<Favorite[]>([]);
  const [projectComparisons, setProjectComparisons] = useState<Comparison[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  
  // Filtering & Pagination State
  const [projectSearch, setProjectSearch] = useState('');
  const [labelPage, setLabelPage] = useState(1);
  const [compPage, setCompPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Fetch Projects List
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/dashboard/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  };

  // Fetch Project Detail
  const fetchProjectDetail = async (projectId: number) => {
    setLoadingContent(true);
    setProjectSearch('');
    setLabelPage(1);
    setCompPage(1);
    try {
      const res = await fetch(`/api/dashboard/favorites_data?project_id=${projectId}`);
      const data = await res.json();
      setProjectLabels(data.favorites || []);
      setProjectComparisons(data.comparisons || []);
    } catch (e) {
      console.error("Failed to fetch project detail", e);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const res = await fetch(`/api/dashboard/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeProject?.id === id) setActiveProject(null);
        fetchProjects();
      }
    } catch (e) {
      alert("Failed to delete project");
    }
  };

  const handleExcelFile = async (file: File) => {
    if (!newImportProjectName.trim()) {
      alert("Please enter a name for the new project first.");
      return;
    }

    setUploading(true);
    setUploadedFile(file);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/dashboard/import_fdalabel', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        const url = new URL(data.redirect_url, window.location.origin);
        const importId = url.searchParams.get('import_id');
        
        const favRes = await fetch('/api/dashboard/favorite_all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            import_id: importId,
            new_project_name: newImportProjectName
          })
        });
        
        const favData = await favRes.json();
        if (favData.success) {
          setNewImportProjectName('');
          setUploadedFile(null);
          await fetchProjects();
          setShowProjects(true);
        } else {
          alert('Failed to save imported labels: ' + (favData.error || 'Unknown error'));
        }
      } else {
        alert('Error importing Excel: ' + data.error);
        setUploadedFile(null);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred during the import process.');
      setUploadedFile(null);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileInput = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (uploading) return;
    if (!newImportProjectName.trim()) {
      alert("Please enter a name for the new project first.");
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) handleExcelFile(file);
    };
    input.click();
  };

  // Memoized Filtered Content
  const filteredLabels = useMemo(() => {
    const q = projectSearch.toLowerCase();
    return projectContent.filter(f => 
      (f.brand_name?.toLowerCase() || '').includes(q) || 
      (f.generic_name?.toLowerCase() || '').includes(q) || 
      (f.manufacturer_name?.toLowerCase() || '').includes(q)
    );
  }, [projectContent, projectSearch]);

  const filteredComparisons = useMemo(() => {
    const q = projectSearch.toLowerCase();
    return projectComparisons.filter(c => (c.title?.toLowerCase() || '').includes(q));
  }, [projectComparisons, projectSearch]);

  // Paginated Content
  const paginatedLabels = filteredLabels.slice((labelPage - 1) * ITEMS_PER_PAGE, labelPage * ITEMS_PER_PAGE);
  const paginatedComparisons = filteredComparisons.slice((compPage - 1) * ITEMS_PER_PAGE, compPage * ITEMS_PER_PAGE);

  useEffect(() => {
    if (showProjects) fetchProjects();
  }, [showProjects]);

  useEffect(() => {
    if (activeProject) fetchProjectDetail(activeProject.id);
  }, [activeProject]);

  return (
    <main className="hp-main-layout" suppressHydrationWarning>
      <DashboardClient />
      
      {/* Header Controls */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <a href="/" className="hp-nav-btn hp-btn-outline" style={{ 
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderRadius: '12px',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          textDecoration: 'none',
          color: '#475569',
          fontWeight: 600,
          fontSize: '0.9rem',
          border: '1px solid #e2e8f0',
          transition: 'all 0.2s',
          height: '42px'
        }}>
          <span>{"\uD83C\uDFE0"}</span> Suite Home
        </a>
      </div>

      <div className="hp-container">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'flex-start', 
          padding: '4rem 2rem',
          textAlign: 'center',
          minHeight: '100vh'
        }}>
          <div className="hp-hero" style={{ marginBottom: '3rem' }}>
            <h1 style={{ fontSize: '3.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '1rem', letterSpacing: '-0.025em' }}>AFDL Dashboard</h1>
            <p className="hp-hero-subtitle" style={{ fontSize: '1.25rem', color: '#64748b', fontWeight: '500' }}>The Intelligence Layer for Drug Safety & Analysis</p>
          </div>

          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '2.5rem',
            width: '100%',
            maxWidth: '1000px',
            marginBottom: '4rem'
          }}>
            {/* Panel 1: Existed Projects... */}
            <div 
              onClick={() => {
                if (!session?.is_authenticated) {
                  router.push('/api/dashboard/auth/login?next=/dashboard');
                  return;
                }
                setShowProjects(!showProjects);
              }}
              className="dashboard-action-panel"
              style={{ 
                cursor: 'pointer',
                padding: '1.5rem 2rem',
                borderRadius: '24px',
                boxShadow: showProjects ? '0 0 0 2px #6366f1, 0 10px 25px -5px rgba(0, 0, 0, 0.1)' : '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                background: 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                color: 'inherit',
                minHeight: '240px',
                width: '320px'
              }}
            >
              <div style={{ 
                width: '90px', 
                height: '90px', 
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                marginBottom: '1.25rem',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.1)',
                border: '1px solid #bae6fd'
              }}>
                💼
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.75rem' }}>
                Existed Projects...
              </div>
              <div style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5', maxWidth: '240px' }}>
                {showProjects ? 'Click to hide projects' : 'Browse your clinical workspaces.'}
              </div>
            </div>

            {/* Panel 2: Create from Import */}
            <div 
              className={`dashboard-action-panel ${uploading ? 'uploading' : ''}`}
              style={{ 
                padding: '1.5rem 2rem',
                borderRadius: '24px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                background: 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '240px',
                width: '500px'
              }}
            >
              <div style={{ 
                width: '90px', 
                height: '90px', 
                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                marginBottom: '1.25rem',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.1)',
                border: '1px solid #ddd6fe'
              }}>
                {uploading ? (
                  <div className="loader" style={{ width: '40px', height: '40px' }}></div>
                ) : (
                  '✨'
                )}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.25rem' }}>
                Create from Import
              </div>
              
              <div style={{ 
                display: 'flex', 
                gap: '10px', 
                width: '100%', 
                maxWidth: '460px', 
                alignItems: 'flex-start',
                justifyContent: 'center', 
                margin: '0 auto 1.5rem auto' 
              }}>
                {/* Input Container */}
                <div style={{ flex: '1', position: 'relative' }}>
                  <input 
                    type="text" 
                    id="new-project-input"
                    value={newImportProjectName}
                    onChange={(e) => setNewImportProjectName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder=" "
                    disabled={uploading}
                    style={{
                      width: '100%',
                      height: '52px',
                      padding: '1.4rem 1rem 0.4rem',
                      borderRadius: '12px',
                      border: `2px solid ${newImportProjectName ? '#6366f1' : '#e2e8f0'}`,
                      fontSize: '0.95rem',
                      fontWeight: '500',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                      background: '#fff',
                      color: '#1e293b',
                      boxSizing: 'border-box'
                    }}
                    className="project-name-input"
                  />
                  <label 
                    htmlFor="new-project-input"
                    style={{
                      position: 'absolute',
                      left: '1rem',
                      top: newImportProjectName ? '6px' : '15px',
                      fontSize: newImportProjectName ? '0.75rem' : '0.95rem',
                      color: newImportProjectName ? '#6366f1' : '#94a3b8',
                      fontWeight: '600',
                      pointerEvents: 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Project name
                  </label>
                </div>

                {/* Button */}
                <button 
                  onClick={triggerFileInput}
                  disabled={uploading || !newImportProjectName.trim()}
                  style={{ 
                    height: '52px',
                    padding: '0 24px',
                    borderRadius: '12px',
                    background: !newImportProjectName.trim() ? '#e2e8f0' : '#6366f1',
                    color: !newImportProjectName.trim() ? '#94a3b8' : 'white',
                    border: 'none',
                    fontWeight: '700',
                    cursor: !newImportProjectName.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    fontSize: '0.9rem',
                    boxShadow: newImportProjectName.trim() ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>📊</span>
                  {uploading ? '...' : 'Select File'}
                </button>
              </div>
            </div>
          </div>

          {/* Projects Browser Section */}
          {showProjects && (
            <div style={{ width: '100%', maxWidth: '1000px', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProject(activeProject?.id === p.id ? null : p)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '50px',
                      border: '1px solid',
                      borderColor: activeProject?.id === p.id ? '#6366f1' : '#e2e8f0',
                      background: activeProject?.id === p.id ? '#6366f1' : 'white',
                      color: activeProject?.id === p.id ? 'white' : '#475569',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>📁</span> {p.title}
                    <span style={{ fontSize: '0.8em', opacity: 0.8 }}>({p.count})</span>
                  </button>
                ))}
              </div>

              {activeProject && (
                <div style={{ 
                  textAlign: 'left', 
                  background: 'white', 
                  borderRadius: '24px', 
                  padding: '2rem', 
                  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                  border: '1px solid #f1f5f9',
                  animation: 'slideUp 0.3s ease-out'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#1e293b' }}>{activeProject.title}</h2>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Workspace • {activeProject.role}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Filter records..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          style={{ padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', width: '200px' }}
                        />
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                      </div>
                      {!activeProject.is_default && (
                        <button 
                          onClick={() => handleDeleteProject(activeProject.id)}
                          style={{ padding: '8px 12px', borderRadius: '8px', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {loadingContent ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}><div className="loader" style={{ margin: '0 auto' }}></div></div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                      {/* Labels Column */}
                      <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>💊</span> Labels ({filteredLabels.length})
                        </h3>
                        {filteredLabels.length === 0 ? (
                          <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>No matches found.</p>
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paginatedLabels.map(f => (
                                <div key={f.set_id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #f1f5f9', background: '#fcfcfd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ maxWidth: '75%' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{f.brand_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{f.manufacturer_name}</div>
                                  </div>
                                  <a href={`/api/dashboard/label/${f.set_id}`} target="_blank" style={{ fontSize: '0.8rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>View &rarr;</a>
                                </div>
                              ))}
                            </div>
                            {filteredLabels.length > ITEMS_PER_PAGE && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '15px' }}>
                                <button disabled={labelPage === 1} onClick={() => setLabelPage(p => p - 1)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>&lt;</button>
                                <span style={{ fontSize: '0.85rem', color: '#64748b', alignSelf: 'center' }}>Page {labelPage} of {Math.ceil(filteredLabels.length / ITEMS_PER_PAGE)}</span>
                                <button disabled={labelPage >= Math.ceil(filteredLabels.length / ITEMS_PER_PAGE)} onClick={() => setLabelPage(p => p + 1)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>&gt;</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Comparisons Column */}
                      <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>⚖️</span> Comparisons ({filteredComparisons.length})
                        </h3>
                        {filteredComparisons.length === 0 ? (
                          <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>No matches found.</p>
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paginatedComparisons.map(c => (
                                <div key={c.id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #f1f5f9', background: '#fcfcfd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ maxWidth: '75%' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{c.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.set_ids.length} labels</div>
                                  </div>
                                  <a 
                                    href={`/labelcomp?${c.set_ids.map(id => `set_ids=${id}`).join('&')}`} 
                                    target="_blank" 
                                    style={{ fontSize: '0.8rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}
                                  >
                                    Compare &rarr;
                                  </a>
                                </div>
                              ))}
                            </div>
                            {filteredComparisons.length > ITEMS_PER_PAGE && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '15px' }}>
                                <button disabled={compPage === 1} onClick={() => setCompPage(p => p - 1)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>&lt;</button>
                                <span style={{ fontSize: '0.85rem', color: '#64748b', alignSelf: 'center' }}>Page {compPage} of {Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE)}</span>
                                <button disabled={compPage >= Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE)} onClick={() => setCompPage(p => p + 1)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>&gt;</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .dashboard-action-panel:hover {
          transform: translateY(-8px);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1) !important;
          border-color: #6366f1 !important;
        }
        .project-name-input:focus {
          border-color: #6366f1 !important;
          background: white !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }
        .project-name-input:focus + label {
          top: 0.3rem !important;
          font-size: 0.65rem !important;
          color: #6366f1 !important;
        }
        .loader {
          border: 4px solid #f3f3f3;
          border-radius: 50%;
          border-top: 4px solid #6366f1;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
