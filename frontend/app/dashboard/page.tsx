'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useUser } from '../context/UserContext';
import Header from "../components/Header";
import ProjectSummary, { type ProjectStats } from './components/ProjectSummary';
import AEProfileModal from './components/AEProfileModal';
import Link from 'next/link';
import './dashboard.css';

interface Project {
  id: number;
  title: string;
  role: string;
  count: number;
  is_default: boolean;
  is_mutable: boolean;
}

interface Favorite {
  id: number;
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
  description: string;
  timestamp: string;
}

type SortMode = 'none' | 'asc' | 'desc';

function TruncatedText({ text, limit = 100 }: { text: string, limit?: number }) {
  if (!text) return <span>—</span>;
  if (text.length <= limit) return <span>{text}</span>;
  return (
    <span title={text} style={{ cursor: 'help' }}>
      {text.slice(0, limit)}...
    </span>
  );
}

export function DashboardContent() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [newImportProjectName, setNewImportProjectName] = useState('');
  const [isDraggingExcel, setIsDraggingExcel] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading, refreshSession, openAuthModal } = useUser();
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | 'analyze' | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Project Management State
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
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

  useEffect(() => {
    setLabelPage(1);
    setCompPage(1);
  }, [projectSearch]);

  const parseEffTime = (v?: string | null): number | null => {
    if (!v) return null;
    const s = String(v).trim();
    if (!s || s.toLowerCase() === 'n/a') return null;
    const normalized = s.replace(/\//g, '-');
    const t = Date.parse(normalized);
    if (!Number.isNaN(t)) return t;
    return null;
  };

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
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return (ta - tb) * dir;
    });
  }, [projectContent, projectSearch, effTimeSort]);

  const filteredComparisons = useMemo(() => {
    const q = projectSearch.toLowerCase();
    return projectComparisons.filter(c => 
        (c.title?.toLowerCase() || '').includes(q) || 
        (c.description?.toLowerCase() || '').includes(q)
    );
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
        let msg = `Failed to load project statistics (HTTP ${res.status}).`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
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
    setProjectsLoading(true);
    try {
      const res = await fetch('/api/dashboard/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.is_authenticated) {
      fetchProjects();
    }
  }, [session]);

  useEffect(() => {
    const pid = searchParams.get('projectId');
    if (pid && projects.length > 0 && !activeProject) {
        const project = projects.find(p => p.id === parseInt(pid));
        if (project) {
            setActiveProject(project);
        }
    }
  }, [projects, searchParams]);

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

  useEffect(() => {
    if (activeProject) {
      setProjectTab('labels');
      fetchProjectDetail(activeProject.id);
    }
  }, [activeProject]);

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

  const handleDeleteLabel = async (favId: number) => {
    if (!confirm("Remove this label from workspace?")) return;
    try {
      const res = await fetch(`/api/dashboard/favorites/${favId}`, { method: 'DELETE' });
      if (res.ok && activeProject) fetchProjectDetail(activeProject.id);
    } catch (e) {
      alert("Delete failed");
    }
  };

  const handleDeleteComparison = async (compId: number) => {
    if (!confirm("Delete this comparison?")) return;
    try {
      const res = await fetch(`/api/dashboard/comparisons/${compId}`, { method: 'DELETE' });
      if (res.ok && activeProject) fetchProjectDetail(activeProject.id);
    } catch (e) {
      alert("Delete failed");
    }
  };

  const sanitizeFilename = (name: string) => name.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

  const handleExportProject = async (projectId: number, projectTitle: string) => {
    try {
      const res = await fetch(`/api/dashboard/export_project?project_id=${projectId}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(projectTitle || 'project')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { alert('Export failed'); }
  };

  const handleExcelFile = async (file: File) => {
    if (!newImportProjectName.trim()) { alert("Please enter a project name."); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/dashboard/import_fdalabel', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const url = new URL(data.redirect_url, window.location.origin);
        const importId = url.searchParams.get('import_id');
        const favRes = await fetch('/api/dashboard/favorite_all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import_id: importId, new_project_name: newImportProjectName })
        });
        const favData = await favRes.json();
        if (favData.success) {
          setNewImportProjectName('');
          setUploadedFile(null);
          await fetchProjects();
        }
      }
    } catch (error) { alert('Import error'); } finally { setUploading(false); }
  };

  const handleImportButtonClick = () => {
    if (uploadedFile) { handleExcelFile(uploadedFile); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setUploadedFile(file);
        setNewImportProjectName(prev => prev.trim() ? prev : file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
      }
    };
    input.click();
  };

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingExcel(true); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingExcel(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingExcel(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingExcel(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setUploadedFile(file);
      setNewImportProjectName(prev => prev.trim() ? prev : file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const formatEffectiveTime = (s?: string) => {
    if (!s) return '—';
    const digits = s.replace(/[^\d]/g, '');
    if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : s;
  };

  const paginatedLabels = filteredLabels.slice((labelPage - 1) * ITEMS_PER_PAGE, labelPage * ITEMS_PER_PAGE);
  const paginatedComparisons = filteredComparisons.slice((compPage - 1) * ITEMS_PER_PAGE, compPage * ITEMS_PER_PAGE);

  return (
    <div className="dashboard-container">
      <main className="hp-main-layout" suppressHydrationWarning style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header activeApp="dashboard" />

        <div className="dashboard-layout" style={{ flex: 1 }}>
          {/* Sidebar: Workspaces */}
          <aside className="dashboard-sidebar">
            <div className="workspace-header">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>Workspaces</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{projects.length} clinical projects</p>
            </div>

            <div className="workspace-list">
              {projectsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="loader" style={{ width: '30px', height: '30px' }}></div></div>
              ) : projects.length > 0 ? (
                projects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setActiveProject(activeProject?.id === p.id ? null : p)}
                    style={{
                      padding: '1rem',
                      borderRadius: '12px',
                      border: '2px solid',
                      borderColor: activeProject?.id === p.id ? '#6366f1' : '#f1f5f9',
                      background: activeProject?.id === p.id ? '#f5f3ff' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                    className="project-selection-card"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      {p.title === 'Favorite' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#eab308"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={activeProject?.id === p.id ? "#6366f1" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                      )}
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: activeProject?.id === p.id ? '#1e1b4b' : '#334155' }}>{p.title}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{p.count} labels • {p.role.toUpperCase()}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>No projects found.</div>
              )}
            </div>

            <div className="sidebar-footer-actions">
              <button
                onClick={() => { setActiveProject(null); setShowProjects(false); }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: !activeProject ? '#f1f5f9' : 'white',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Create New Workspace
              </button>
            </div>
          </aside>

          {/* Main: Active Workspace or Setup */}
          <main className="dashboard-main">
            {activeProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                {/* Active Project Hero Header */}
                <div className="active-workspace-hero">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h1 style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>{activeProject.title}</h1>
                        <span style={{ padding: '4px 10px', background: '#eef2ff', color: '#6366f1', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>{activeProject.role}</span>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontWeight: 500 }}>
                        Workspace: Managing <strong>{activeProject.count}</strong> pharmaceutical product labels.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={openProjectStatsModal}
                        style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                        Stats
                      </button>
                      {activeProject.is_mutable && (
                        <button
                          onClick={() => handleDeleteProject(activeProject.id)}
                          style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Toolbar & Tabs */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2.5rem' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
                      <button
                        onClick={() => setProjectTab('labels')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: projectTab === 'labels' ? 'white' : 'transparent', color: projectTab === 'labels' ? '#0f172a' : '#64748b', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: projectTab === 'labels' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                      >
                        Labels ({filteredLabels.length})
                      </button>
                      <button
                        onClick={() => setProjectTab('comparisons')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: projectTab === 'comparisons' ? 'white' : 'transparent', color: projectTab === 'comparisons' ? '#0f172a' : '#64748b', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: projectTab === 'comparisons' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                      >
                        Comparisons ({filteredComparisons.length})
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          placeholder="Filter project content..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          style={{ padding: '10px 12px 10px 38px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '240px', outline: 'none' }}
                        />
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      </div>

                      <div ref={dropdownRef} style={{ position: 'relative' }}>
                        <button
                          onClick={() => setActiveDropdown(activeDropdown === 'analyze' ? null : 'analyze')}
                          style={{ padding: '10px 16px', borderRadius: '10px', background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          Launch Analysis ▼
                        </button>
                        {activeDropdown === 'analyze' && (
                          <div className="dropdown-menu visible" style={{ right: 0, top: '100%', marginTop: '8px', width: '220px', display: 'block', position: 'absolute', zIndex: 1000 }}>
                            <button className="dropdown-item" onClick={() => { handleExportProject(activeProject.id, activeProject.title); setActiveDropdown(null); }}>Export Project (XLSX)</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Table Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                  {projectTab === 'labels' ? (
                    <div>
                      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Product Name</th>
                              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Manufacturer</th>
                              <th 
                                  style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', cursor: 'pointer' }}
                                  onClick={toggleEffTimeSort}
                              >
                                  Effective Time {effTimeSort === 'asc' ? '↑' : effTimeSort === 'desc' ? '↓' : '↕'}
                              </th>
                              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedLabels.map((item, idx) => (
                              <tr key={`${item.set_id}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px' }}>
                                  <Link href={`/dashboard/label/${item.set_id}`} style={{ fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
                                      <TruncatedText text={item.brand_name || 'N/A'} />
                                  </Link>
                                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                                      <TruncatedText text={item.generic_name || ''} limit={120} />
                                  </div>
                                </td>
                                <td style={{ padding: '16px', fontSize: '0.85rem', color: '#475569' }}>{item.manufacturer_name || 'N/A'}</td>
                                <td style={{ padding: '16px', fontSize: '0.85rem', color: '#475569' }}>{formatEffectiveTime(item.effective_time)}</td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                  <button onClick={() => handleDeleteLabel(item.id)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H5c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Toolbar (Labels) */}
                      {filteredLabels.length > ITEMS_PER_PAGE && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '1.5rem', paddingBottom: '1rem' }}>
                          <button
                            disabled={labelPage === 1}
                            onClick={() => setLabelPage(p => Math.max(1, p - 1))}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: labelPage === 1 ? '#f8fafc' : 'white', cursor: labelPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: labelPage === 1 ? '#cbd5e1' : '#475569' }}
                          >
                            Previous
                          </button>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>
                            Page {labelPage} of {Math.ceil(filteredLabels.length / ITEMS_PER_PAGE)}
                          </span>
                          <button
                            disabled={labelPage >= Math.ceil(filteredLabels.length / ITEMS_PER_PAGE)}
                            onClick={() => setLabelPage(p => p + 1)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: labelPage >= Math.ceil(filteredLabels.length / ITEMS_PER_PAGE) ? '#f8fafc' : 'white', cursor: labelPage >= Math.ceil(filteredLabels.length / ITEMS_PER_PAGE) ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: labelPage >= Math.ceil(filteredLabels.length / ITEMS_PER_PAGE) ? '#cbd5e1' : '#475569' }}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Comparison Description</th>
                              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedComparisons.map((c, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px' }}>
                                  <Link href={`/dashboard/results?id=${c.id}`} style={{ fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
                                      <TruncatedText text={c.title || c.description} />
                                  </Link>
                                </td>
                                <td style={{ padding: '16px', fontSize: '0.85rem', color: '#475569' }}>{new Date(c.timestamp).toLocaleDateString()}</td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                  <button onClick={() => handleDeleteComparison(c.id)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H5c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Toolbar (Comparisons) */}
                      {filteredComparisons.length > ITEMS_PER_PAGE && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '1.5rem', paddingBottom: '1rem' }}>
                          <button
                            disabled={compPage === 1}
                            onClick={() => setCompPage(p => Math.max(1, p - 1))}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: compPage === 1 ? '#f8fafc' : 'white', cursor: compPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: compPage === 1 ? '#cbd5e1' : '#475569' }}
                          >
                            Previous
                          </button>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>
                            Page {compPage} of {Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE)}
                          </span>
                          <button
                            disabled={compPage >= Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE)}
                            onClick={() => setCompPage(p => p + 1)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: compPage >= Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE) ? '#f8fafc' : 'white', cursor: compPage >= Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE) ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: compPage >= Math.ceil(filteredComparisons.length / ITEMS_PER_PAGE) ? '#cbd5e1' : '#475569' }}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '4rem', textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ marginBottom: '3rem' }}>
                  <h1 className="hero-title-animated" style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.025em', marginBottom: '1rem' }}>Dashboard</h1>
                  <p style={{ fontSize: '1.1rem', color: '#64748b', fontWeight: 500, lineHeight: 1.6 }}>
                    Select an existing project from the sidebar to manage your labels, or create a new workspace by importing an Excel/CSV file from FDALabel.
                  </p>
                </div>

                <div
                  className={`dashboard-action-panel ${uploading ? 'uploading' : ''} ${isDraggingExcel ? 'dragging' : ''}`}
                  onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                  style={{ padding: '3rem', borderRadius: '32px', background: 'white', border: isDraggingExcel ? '2px dashed #6366f1' : '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}
                >
                  <div style={{ width: '80px', height: '80px', background: '#f5f3ff', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem auto', color: '#6366f1' }}>
                    {uploading ? <div className="loader"></div> : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>Create from Import</h2>
                  <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '2rem' }}>{uploadedFile ? `Selected: ${uploadedFile.name}` : "Drag & drop FDALabel export file here"}</p>

                  <div style={{ display: 'flex', gap: '12px', maxWidth: '500px', margin: '0 auto' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input type="text" value={newImportProjectName} onChange={(e) => setNewImportProjectName(e.target.value)} placeholder="Project name..." style={{ width: '100%', height: '52px', padding: '0 1rem', borderRadius: '12px', border: '2px solid #e2e8f0', outline: 'none', fontWeight: 600 }} />
                    </div>
                    <button onClick={handleImportButtonClick} disabled={uploading || (!uploadedFile && !newImportProjectName.trim())} style={{ height: '52px', padding: '0 24px', borderRadius: '12px', background: '#6366f1', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                      {uploading ? '...' : (uploadedFile ? 'Import' : 'Select File')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Global Dashboard Modals */}
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
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div className="loader"></div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
