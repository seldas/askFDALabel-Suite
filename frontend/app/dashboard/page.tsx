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
  is_mutable: boolean;
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
  const [activeDropdown, setActiveDropdown] = useState<'user' | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  
  // Project Management State
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectContent, setProjectLabels] = useState<Favorite[]>([]);
  const [projectComparisons, setProjectComparisons] = useState<Comparison[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(false);
  
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
      setDuplicatesRemoved(data.duplicates_removed || false);
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
    <main className="hp-main-layout" suppressHydrationWarning style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <DashboardClient />
      
      {/* Main Header */}
      <header className="header-main" style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
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
            transition: 'all 0.2s ease'
          }}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
               <polyline points="9 22 9 12 15 12 15 22"></polyline>
             </svg>
             Suite Home
          </a>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em' }}>
            Labeling Dashboard
          </h1>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {loading ? (
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
              <div className="custom-dropdown" onClick={(e) => e.stopPropagation()}>
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
                      <a href="/dashboard" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>My Dashboard</a>
                      <a href="/api/dashboard/auth/change_password" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#334155', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Change Password</a>
                      <a href="/api/dashboard/auth/logout" style={{ display: 'block', padding: '8px 16px', fontSize: '0.875rem', color: '#ef4444', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>Sign Out</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <a href="/api/dashboard/auth/login?next=/dashboard" style={{ color: 'white', fontSize: '0.875rem', textDecoration: 'none', background: 'rgba(255,255,255,0.1)', padding: '6px 16px', borderRadius: '20px' }}>Sign In</a>
          )}
        </nav>
      </header>

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
                marginBottom: '1.25rem',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.1)',
                border: '1px solid #bae6fd'
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
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
                marginBottom: '1.25rem',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.1)',
                border: '1px solid #ddd6fe'
              }}>
                {uploading ? (
                  <div className="loader" style={{ width: '40px', height: '40px' }}></div>
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
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
            <div style={{ width: '100%', maxWidth: '1200px', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: projects.length > 10 ? 'repeat(auto-fill, minmax(200px, 1fr))' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1.25rem', 
                marginBottom: '3rem',
                maxHeight: projects.length > 10 ? '400px' : 'none',
                overflowY: projects.length > 10 ? 'auto' : 'visible',
                padding: '10px',
                border: projects.length > 10 ? '1px solid #e2e8f0' : 'none',
                borderRadius: '16px',
                backgroundColor: projects.length > 10 ? '#f8fafc' : 'transparent'
              }}>
                {projects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setActiveProject(activeProject?.id === p.id ? null : p)}
                    style={{
                      padding: projects.length > 10 ? '1rem' : '1.5rem',
                      borderRadius: '16px',
                      border: '2px solid',
                      borderColor: activeProject?.id === p.id ? '#6366f1' : '#e2e8f0',
                      background: activeProject?.id === p.id ? '#f5f3ff' : 'white',
                      color: '#1e293b',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      boxShadow: activeProject?.id === p.id ? '0 10px 15px -3px rgba(99, 102, 241, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                      position: 'relative'
                    }}
                    className="project-selection-card"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', width: '100%' }}>
                        <span style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}>
                          {p.title === 'Favorite' ? '⭐' : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="#6366f1" style={{ opacity: 0.8 }}>
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                            </svg>
                          )}
                        </span>
                        <div style={{ fontWeight: 700, fontSize: projects.length > 10 ? '0.9rem' : '1.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.title}</div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', gap: '10px' }}>
                        <span>{p.count} labels</span>
                        <span>•</span>
                        <span style={{ textTransform: 'uppercase' }}>{p.role}</span>
                    </div>
                    {activeProject?.id === p.id && (
                        <div style={{ position: 'absolute', top: '10px', right: '10px', color: '#6366f1' }}>✓</div>
                    )}
                  </div>
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
                      {activeProject.is_mutable && (
                        <button 
                          onClick={() => handleDeleteProject(activeProject.id)}
                          style={{ padding: '8px 12px', borderRadius: '8px', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {duplicatesRemoved && (
                    <div style={{ 
                      marginBottom: '1.5rem', 
                      padding: '10px 15px', 
                      backgroundColor: '#fffbeb', 
                      border: '1px solid #fef3c7', 
                      borderRadius: '12px',
                      color: '#92400e',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span>⚠️</span>
                      <span>Some duplicate labels were identified and automatically removed to maintain project integrity.</span>
                    </div>
                  )}

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
                                  <a href={`/dashboard/label/${f.set_id}`} target="_blank" style={{ fontSize: '0.8rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>View &rarr;</a>
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
        .project-selection-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
          border-color: #6366f1 !important;
        }
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
