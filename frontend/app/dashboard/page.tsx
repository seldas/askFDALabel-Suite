'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useUser } from '../context/UserContext';
import Header from "../components/Header";
import ProjectSummary, { type ProjectStats } from './components/ProjectSummary';
import AEProfileModal from './components/AEProfileModal';
import Link from 'next/link';

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

type SortMode = 'none' | 'asc' | 'desc';

export default function DashboardPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [newImportProjectName, setNewImportProjectName] = useState('');
  const [isDraggingExcel, setIsDraggingExcel] = useState(false);

  const router = useRouter();
  const { session, loading, refreshSession, openAuthModal } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | 'analyze' | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Project Management State
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectContent, setProjectLabels] = useState<Favorite[]>([]);
  const [projectComparisons, setProjectComparisons] = useState<Comparison[]>([]);
  const [projectTab, setProjectTab] = useState<'labels' | 'comparisons'>('labels');
  const [loadingContent, setLoadingContent] = useState(false);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(false);
  const [showAEProfileModal, setShowAEProfileModal] = useState(false);

  // Filtering & Pagination State
  
  const [projectSearch, setProjectSearch] = useState('');
  const [labelPage, setLabelPage] = useState(1);
  const [compPage, setCompPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [effTimeSort, setEffTimeSort] = useState<SortMode>('none');

  // robust-ish parser: supports YYYY-MM-DD, YYYY/MM/DD, ISO, and returns null if unknown
  const parseEffTime = (v?: string | null): number | null => {
    if (!v) return null;
    const s = String(v).trim();
    if (!s || s.toLowerCase() === 'n/a') return null;

    // Normalize slashes to dashes for Safari-friendliness
    const normalized = s.replace(/\//g, '-');

    // If looks like YYYY-MM-DD, use Date.parse directly
    const t = Date.parse(normalized);
    if (!Number.isNaN(t)) return t;

    return null;
  };

  // Memoized Filtered Content
  const filteredLabels = useMemo(() => {
    const q = projectSearch.toLowerCase();

    const base = projectContent.filter((f) =>
      (f.brand_name?.toLowerCase() || '').includes(q) ||
      (f.generic_name?.toLowerCase() || '').includes(q) ||
      (f.manufacturer_name?.toLowerCase() || '').includes(q)
    );

    if (effTimeSort === 'none') return base;

    const dir = effTimeSort === 'asc' ? 1 : -1;

    return [...base].sort((a, b) => {
      const ta = parseEffTime(a.effective_time);
      const tb = parseEffTime(b.effective_time);

      // Put null/unknown at the bottom regardless of direction
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;

      return (ta - tb) * dir;
    });
  }, [projectContent, projectSearch, effTimeSort]);


  const filteredComparisons = useMemo(() => {
    const q = projectSearch.toLowerCase();
    return projectComparisons.filter(c => (c.title?.toLowerCase() || '').includes(q));
  }, [projectComparisons, projectSearch]);

  const toggleEffTimeSort = () => {
    setEffTimeSort((prev) => (prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none'));
  };

  const [showProjectStats, setShowProjectStats] = useState(false);
  const [projectStatsLoading, setProjectStatsLoading] = useState(false);
  const [projectStatsError, setProjectStatsError] = useState<string | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);

  const closeProjectStatsModal = useCallback(() => {
    setShowProjectStats(false);
    setProjectStatsError(null);
  }, []);

  const openProjectStatsModal = useCallback(async () => {
    if (!activeProject) return;

    setShowProjectStats(true);
    setProjectStatsError(null);
    setProjectStatsLoading(true);

    try {
      const res = await fetch(`/api/dashboard/project_stats?project_id=${activeProject.id}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        // try to read backend error message if provided
        let msg = `Failed to load project statistics (HTTP ${res.status}).`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      setProjectStats(data);
    } catch (e: any) {
      setProjectStatsError(e?.message || 'Failed to load project statistics.');
      setProjectStats(null);
    } finally {
      setProjectStatsLoading(false);
    }
  }, [activeProject]);

  // ESC-to-close for modal
  useEffect(() => {
    if (!showProjectStats) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeProjectStatsModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showProjectStats, closeProjectStatsModal]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkInternalStatus = async () => {
      try {
        const response = await fetch("/api/check-fdalabel", { method: 'POST' });
        const data = await response.json();
        setIsInternal(data.isInternal);
      } catch (error) {
        setIsInternal(false);
      }
    };
    checkInternalStatus();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/dashboard/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  };

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

  const sanitizeFilename = (name: string) =>
  name
    .replace(/[\/\\?%*:|"<>]/g, '-')   // Windows-illegal
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const handleExportProject = async (projectId: number, projectTitle: string) => {
    if (!session?.is_authenticated) {
      openAuthModal('login');
      return;
    }

    try {
      // You implement this endpoint on your backend (see notes below).
      const res = await fetch(`/api/dashboard/export_project?project_id=${projectId}`, {
        method: 'GET',
        headers: {
          // optional; some servers use this to decide to return binary
          Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });

      if (!res.ok) {
        let msg = `Export failed (HTTP ${res.status}).`;
        try {
          const j = await res.json();
          msg = j?.error ? `Export failed: ${j.error}` : msg;
        } catch {}
        alert(msg);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(projectTitle || 'project')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Export failed due to a network or server error.');
    }
  };


  // --- helpers for import UX ---
  const filenameToProjectName = (name: string) => {
    const base = name.replace(/\.[^/.]+$/, ''); // remove extension
    return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const isExcel = (file: File) => {
    const n = file.name.toLowerCase();
    return n.endsWith('.xlsx') || n.endsWith('.xls');
  };

  const chooseFileForImport = useCallback((file: File) => {
    if (!isExcel(file)) {
      alert('Please drop/select an Excel file (.xlsx or .xls).');
      return;
    }
    setUploadedFile(file);

    // If user hasn't typed a name, auto-fill from filename.
    setNewImportProjectName((prev) => prev.trim() ? prev : filenameToProjectName(file.name));
  }, []);

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

  // Button click now behaves as:
  // - if file already chosen -> Import (runs handleExcelFile)
  // - else -> Select file
  const handleImportButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (uploading) return;

    if (!session?.is_authenticated) {
      openAuthModal('login');
      return;
    }

    // If file exists, run import
    if (uploadedFile) {
      if (!newImportProjectName.trim()) {
        alert("Please enter a name for the new project first.");
        return;
      }
      handleExcelFile(uploadedFile);
      return;
    }

    // Otherwise open file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      if (file) chooseFileForImport(file);
    };
    input.click();
  };

  // Drag & drop handlers for the panel
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.is_authenticated || uploading) return;
    setIsDraggingExcel(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.is_authenticated || uploading) return;
    setIsDraggingExcel(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingExcel(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingExcel(false);

    if (!session?.is_authenticated) {
      openAuthModal('login');
      return;
    }
    if (uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) chooseFileForImport(file);
  };

  const paginatedLabels = filteredLabels.slice((labelPage - 1) * ITEMS_PER_PAGE, labelPage * ITEMS_PER_PAGE);
  const paginatedComparisons = filteredComparisons.slice((compPage - 1) * ITEMS_PER_PAGE, compPage * ITEMS_PER_PAGE);
  const formatEffectiveTime = (s?: string) => {
    if (!s) return '—';

    // common: "20240118" or "2024-01-18" or ISO
    const digits = s.replace(/[^\d]/g, '');
    if (digits.length === 8) {
      const y = digits.slice(0, 4);
      const m = digits.slice(4, 6);
      const d = digits.slice(6, 8);
      return `${y}-${m}-${d}`;
    }

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      // stable, simple format
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    return s;
  };

  useEffect(() => {
    if (activeProject) {
      setProjectTab('labels');
      fetchProjectDetail(activeProject.id);
    }
  }, [activeProject]);

  useEffect(() => {
    if (showProjects) fetchProjects();
  }, [showProjects]);

  return (
    <main className="hp-main-layout" suppressHydrationWarning style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>


      {/* Unified Header & Menu */}
      <Header activeApp="dashboard" />

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
            <h1 className="hero-title-animated" style={{ fontSize: '3.5rem', fontWeight: '800', marginBottom: '1rem', letterSpacing: '-0.025em' }}>AFDL Dashboard</h1>
            <p className="hp-hero-subtitle hero-subtitle-animated" style={{ fontSize: '1.25rem', color: '#64748b', fontWeight: '500' }}>The Intelligence Layer for Drug Safety & Analysis</p>
            {!loading && !session?.is_authenticated && (
              <div className="animate-fade-in" style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fee2e2',
                borderRadius: '12px',
                color: '#dc2626',
                fontSize: '0.95rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                Authentication Required: All dashboard functions require login.
              </div>
            )}
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
                  openAuthModal('login');
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

            {/* Panel 2: Create from Import (now supports drag & drop) */}
            <div
              className={`dashboard-action-panel ${uploading ? 'uploading' : ''} ${isDraggingExcel ? 'dragging' : ''}`}
              onClick={() => {
                if (!session?.is_authenticated) openAuthModal('login');
              }}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              style={{
                padding: '1.5rem 2rem',
                borderRadius: '24px',
                boxShadow: isDraggingExcel
                  ? '0 0 0 3px rgba(99,102,241,0.35), 0 25px 50px -12px rgba(0,0,0,0.12)'
                  : '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                border: isDraggingExcel ? '2px dashed #6366f1' : '1px solid #e2e8f0',
                background: isDraggingExcel ? '#f5f3ff' : 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '240px',
                width: '500px',
                cursor: !session?.is_authenticated ? 'pointer' : 'default'
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

              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>
                Create from Import
              </div>

              <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '0.9rem' }}>
                {uploadedFile
                  ? `Selected: ${uploadedFile.name}`
                  : (isDraggingExcel ? 'Drop Excel file to use it' : 'Drag & drop an Excel file here, or select one')}
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

                {/* Button: Select File -> Import when file is present */}
                <button
                  onClick={handleImportButtonClick}
                  disabled={uploading || !session?.is_authenticated || (!uploadedFile && !newImportProjectName.trim())}
                  style={{
                    height: '52px',
                    padding: '0 24px',
                    borderRadius: '12px',
                    background: (!session?.is_authenticated || uploading)
                      ? '#e2e8f0'
                      : (uploadedFile || newImportProjectName.trim())
                        ? '#6366f1'
                        : '#e2e8f0',
                    color: (!session?.is_authenticated || uploading)
                      ? '#94a3b8'
                      : (uploadedFile || newImportProjectName.trim())
                        ? 'white'
                        : '#94a3b8',
                    border: 'none',
                    fontWeight: '700',
                    cursor: (!session?.is_authenticated || uploading)
                      ? 'not-allowed'
                      : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    fontSize: '0.9rem',
                    boxShadow: (session?.is_authenticated && (uploadedFile || newImportProjectName.trim()) && !uploading)
                      ? '0 4px 12px rgba(99, 102, 241, 0.2)'
                      : 'none'
                  }}
                  title={!session?.is_authenticated ? 'Login required' : undefined}
                >
                  <span style={{ fontSize: '1.1rem' }}>📊</span>
                  {uploading ? '...' : (uploadedFile ? 'Import' : 'Select File')}
                </button>
              </div>
            </div>
          </div>

          {/* Projects Browser Section */}
          {showProjects && (
            <div style={{ width: '100%', maxWidth: '1200px', animation: 'fadeIn 0.3s ease-out' }}>
              {/* (unchanged existing projects UI) */}
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
                        {p.title === 'Favorite' ? (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#eab308">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
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
                <div
                  style={{
                    textAlign: 'left',
                    background: 'white',
                    borderRadius: '24px',
                    padding: '0',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                    border: '1px solid #f1f5f9',
                    overflow: 'hidden',
                    animation: 'slideUp 0.3s ease-out'
                  }}
                >
                  {/* Top Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1.25rem 1.5rem',
                      borderBottom: '1px solid #f1f5f9',
                      gap: '14px',
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* Left: Project Actions + Tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      {/* ✅ Simple Project Overview Button */}
                      <button
                        type="button"
                        onClick={openProjectStatsModal}
                        title="Overview"
                        style={{
                          border: '1px solid #e2e8f0',
                          background: '#ffffff',
                          borderRadius: '10px',
                          width: '42px',
                          height: '42px',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.2s ease',
                          color: '#475569'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.backgroundColor = '#f1f5f9';
                          e.currentTarget.style.color = '#1e293b';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.backgroundColor = '#ffffff';
                          e.currentTarget.style.color = '#475569';
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10"></line>
                          <line x1="12" y1="20" x2="12" y2="4"></line>
                          <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                      </button>

                      {/* Tabs */}
                      <div
                        style={{
                          display: 'inline-flex',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '999px',
                          padding: '4px',
                          gap: '4px'
                        }}
                      >
                        <button
                          onClick={() => setProjectTab('labels')}
                          style={{
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: '999px',
                            padding: '8px 12px',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            background: projectTab === 'labels' ? '#6366f1' : 'transparent',
                            color: projectTab === 'labels' ? 'white' : '#334155'
                          }}
                        >
                          Labels ({filteredLabels.length})
                        </button>

                        <button
                          onClick={() => setProjectTab('comparisons')}
                          style={{
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: '999px',
                            padding: '8px 12px',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            background: projectTab === 'comparisons' ? '#6366f1' : 'transparent',
                            color: projectTab === 'comparisons' ? 'white' : '#334155'
                          }}
                        >
                          Comparisons ({filteredComparisons.length})
                        </button>
                      </div>
                    </div>


                    {/* Right: Filter + Export + Delete */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        flexWrap: 'wrap'
                      }}
                    >
                      {/* Search input (icon overlays inside this wrapper only) */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          placeholder={projectTab === 'labels' ? 'Filter labels...' : 'Filter comparisons...'}
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          style={{
                            padding: '10px 12px 10px 38px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.9rem',
                            outline: 'none',
                            width: '240px',
                            transition: 'all 0.2s ease',
                            background: '#ffffff',
                            color: '#1e293b'
                          }}
                          onFocus={e => e.currentTarget.style.borderColor = '#6366f1'}
                          onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </span>
                      </div>

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Analyze Dropdown */}
                        <div ref={dropdownRef} className="custom-dropdown" style={{ position: 'relative' }}>
                          <button
                            onClick={() => setActiveDropdown(activeDropdown === 'analyze' ? null : 'analyze')}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: '#ffffff',
                              color: '#4338ca',
                              border: '1px solid #e0e7ff',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#e0e7ff'; }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18h8"></path><path d="M3 22h18"></path><path d="M14 22a7 7 0 1 0 0-14h-1"></path><path d="M9 14h2"></path><path d="M9 12a2 2 0 1 1-4 0V7a2 2 0 1 1 4 0v5Z"></path><path d="M12 7V3a2 2 0 1 0-4 0v4"></path></svg>
                            Analyze
                            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>▼</span>
                          </button>

                          {activeDropdown === 'analyze' && (
                            <div 
                              className="dropdown-menu" 
                              style={{ 
                                right: 0, 
                                top: '100%', 
                                marginTop: '8px', 
                                width: '200px',
                                zIndex: 2000,
                                display: 'block',
                                borderRadius: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                border: '1px solid #e2e8f0'
                              }}
                            >
                              <div className="dropdown-header" style={{ padding: '10px 14px', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>
                                Project Tools
                              </div>
                              <button
                                className="dropdown-item"
                                onClick={() => {
                                  setShowAEProfileModal(true);
                                  setActiveDropdown(null);
                                }}
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '10px',
                                  width: '100%',
                                  padding: '12px 14px',
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  fontSize: '0.85rem',
                                  color: '#334155'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18h8"></path><path d="M3 22h18"></path><path d="M14 22a7 7 0 1 0 0-14h-1"></path><path d="M9 14h2"></path><path d="M9 12a2 2 0 1 1-4 0V7a2 2 0 1 1 4 0v5Z"></path><path d="M12 7V3a2 2 0 1 0-4 0v4"></path></svg>
                                AE Profiles
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleExportProject(activeProject.id, activeProject.title)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            color: '#0891b2',
                            border: '1px solid #cffafe',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                          onMouseOver={e => { e.currentTarget.style.background = '#ecfeff'; e.currentTarget.style.borderColor = '#a5f3fc'; }}
                          onMouseOut={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#cffafe'; }}
                          title="Export this project to Excel"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          Export
                        </button>

                        {activeProject.is_mutable && (
                          <button
                            onClick={() => handleDeleteProject(activeProject.id)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: '#ffffff',
                              color: '#be123c',
                              border: '1px solid #fecdd3',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#fff1f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#fecdd3'; }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Optional warning */}
                  {duplicatesRemoved && (
                    <div
                      style={{
                        margin: '1rem 1.5rem 0 1.5rem',
                        padding: '10px 15px',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fef3c7',
                        borderRadius: '12px',
                        color: '#92400e',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>⚠️</span>
                      <span>Some duplicate labels were identified and automatically removed to maintain project integrity.</span>
                    </div>
                  )}

                  {/* Body */}
                  <div style={{ padding: '1.25rem 1.5rem 1.5rem 1.5rem' }}>
                    {loadingContent ? (
                      <div style={{ padding: '40px', textAlign: 'center' }}>
                        <div className="loader" style={{ margin: '0 auto' }} />
                      </div>
                    ) : (
                      <>
                        {projectTab === 'labels' ? (
                          <>
                            {/* Table */}
                            <div
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                background: 'white',
                              }}
                            >
                              {/* Header row */}
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '2.2fr 2fr 1.1fr 2.2fr 0.9fr',
                                  gap: '12px',
                                  padding: '12px 14px',
                                  background: '#f8fafc',
                                  borderBottom: '1px solid #e2e8f0',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  color: '#475569',
                                  letterSpacing: '0.02em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                <div>Brand</div>
                                <div>Company</div>

                                {/* ✅ Sortable Eff. Time header */}
                                <div
                                  onClick={() => {
                                    toggleEffTimeSort();
                                    setLabelPage(1); // helpful so user sees start of newly sorted list
                                  }}
                                  title={
                                    effTimeSort === 'none'
                                      ? 'Sort by Effective Time'
                                      : effTimeSort === 'asc'
                                      ? 'Sorted ascending (click for descending)'
                                      : 'Sorted descending (click to clear)'
                                  }
                                  style={{
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  Eff. Time
                                  <span style={{ fontSize: '0.9rem', opacity: effTimeSort === 'none' ? 0.35 : 0.95 }}>
                                    {effTimeSort === 'none' ? '⇅' : effTimeSort === 'asc' ? '↑' : '↓'}
                                  </span>
                                </div>

                                <div>Set ID</div>
                                <div style={{ textAlign: 'right' }}>Action</div>
                              </div>

                              {/* Rows */}
                              {paginatedLabels.length === 0 ? (
                                <div style={{ padding: '16px', color: '#94a3b8', fontStyle: 'italic' }}>No labels found.</div>
                              ) : (
                                paginatedLabels.map((f) => (
                                  <div
                                    key={f.set_id}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '2.2fr 2fr 1.1fr 2.2fr 0.9fr',
                                      gap: '12px',
                                      padding: '12px 14px',
                                      borderBottom: '1px solid #f1f5f9',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {f.brand_name || '—'}
                                    </div>
                                    <div style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {f.manufacturer_name || '—'}
                                    </div>
                                    <div
                                      style={{
                                        color: '#475569',
                                        fontFamily:
                                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                        fontSize: '0.85rem',
                                      }}
                                    >
                                      {formatEffectiveTime(f.effective_time)}
                                    </div>
                                    <div
                                      style={{
                                        color: '#475569',
                                        fontFamily:
                                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                        fontSize: '0.85rem',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {f.set_id}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                      <a
                                        href={`/dashboard/label/${f.set_id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          padding: '8px 12px',
                                          borderRadius: '10px',
                                          background: '#eef2ff',
                                          color: '#4338ca',
                                          textDecoration: 'none',
                                          fontWeight: 800,
                                          fontSize: '0.85rem',
                                          border: '1px solid #e0e7ff',
                                        }}
                                      >
                                        View →
                                      </a>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Pagination (labels) */}
                            {filteredLabels.length > ITEMS_PER_PAGE && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '14px' }}>
                                <button
                                  disabled={labelPage === 1}
                                  onClick={() => setLabelPage((p) => p - 1)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  ← Prev
                                </button>
                                <span style={{ fontSize: '0.9rem', color: '#64748b', alignSelf: 'center', fontWeight: 700 }}>
                                  Page {labelPage} of {Math.ceil(filteredLabels.length / ITEMS_PER_PAGE)}
                                </span>
                                <button
                                  disabled={labelPage >= Math.ceil(filteredLabels.length / ITEMS_PER_PAGE)}
                                  onClick={() => setLabelPage((p) => p + 1)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  Next →
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {/* Comparisons view (lightweight) */}
                            {filteredComparisons.length === 0 ? (
                              <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '10px 4px' }}>
                                No comparisons saved for this project.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {paginatedComparisons.map((c) => (
                                  <div
                                    key={c.id}
                                    style={{
                                      padding: '12px 14px',
                                      borderRadius: '14px',
                                      border: '1px solid #e2e8f0',
                                      background: '#ffffff',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <div style={{ maxWidth: '70%' }}>
                                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.title}</div>
                                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                        {c.set_ids.length} labels
                                      </div>
                                    </div>

                                    <a
                                      href={`/askfdalabel/labelcomp?${c.set_ids.map(id => `set_ids=${id}`).join('&')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: '10px',
                                        background: '#eef2ff',
                                        color: '#4338ca',
                                        textDecoration: 'none',
                                        fontWeight: 800,
                                        fontSize: '0.85rem',
                                        border: '1px solid #e0e7ff',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      Open →
                                    </a>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Pagination (comparisons) */}
                            {filteredComparisons.length > ITEMS_PER_PAGE && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '14px' }}>
                                <button
                                  disabled={compPage === 1}
                                  onClick={() => setCompPage((p) => p - 1)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 700
                                  }}
                                >
                                  ← Prev
                                </button>
                                <span style={{ fontSize: '0.9rem', color: '#64748b', alignSelf: 'center', fontWeight: 700 }}>
                                  Page {compPage} of {Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE)}
                                </span>
                                <button
                                  disabled={compPage >= Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE)}
                                  onClick={() => setCompPage((p) => p + 1)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 700
                                  }}
                                >
                                  Next →
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  
                </div>
              )}
              <ProjectSummary
                open={showProjectStats}
                onClose={closeProjectStatsModal}
                projectTitle={activeProject?.title || ''}
                projectRole={activeProject?.role || ''}
                loading={projectStatsLoading}
                error={projectStatsError}
                stats={projectStats}
                formatEffectiveTime={formatEffectiveTime}
              />
              <AEProfileModal
                isOpen={showAEProfileModal}
                onClose={() => setShowAEProfileModal(false)}
                projectId={activeProject?.id || 0}
                projectName={activeProject?.title || ''}
              />
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
        .dashboard-action-panel.dragging:hover {
          transform: translateY(-2px);
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
