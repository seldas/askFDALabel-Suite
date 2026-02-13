'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '../context/UserContext';
import Link from 'next/link';

interface LabelMetadata {
  set_id: string;
  brand_name: string;
  generic_name: string;
  manufacturer_name: string;
  effective_time: string;
  label_format: string;
}

interface ComparisonSection {
  title: string;
  key: string;
  nesting_level: number;
  contents: (string | null)[];
  is_same: boolean;
  is_empty: boolean;
  diff_html: string | null;
}

interface LabelCompData {
  labels: string[];
  comparison_data: ComparisonSection[];
  selected_labels_metadata: LabelMetadata[];
  drug_name: string | null;
  current_set_ids: string[];
  existing_summary: string | null;
  is_authenticated: boolean;
}

interface Project {
  id: number;
  title: string;
  count: number;
  role: string;
}

function LabelCompContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session } = useUser();
  const [data, setData] = useState<LabelCompData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'projects' | 'setid'>('projects');
  const [setIdInput, setSetIdInput] = useState('');
  
  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectLabels, setProjectLabels] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingLabels, setLoadingLabels] = useState(false);

  // Multi-select and Filter states
  const [selectedLabelsForAdd, setSelectedLabelsForAdd] = useState<any[]>([]);
  const [labelFilter, setLabelFilter] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryCollapsed, setAiSummaryCollapsed] = useState(false);

  // Collapse State
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const setIds = useMemo(() => searchParams.getAll('set_ids'), [searchParams]);

  useEffect(() => {
    if (setIds.length === 0) {
      setData(null);
      setAiSummary(null);
      return;
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/labelcomp/?json=1&${searchParams.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch comparison data');
        const json = await res.json();
        setData(json);
        setAiSummary(json.existing_summary);
        
        // Initialize all sections as expanded
        const initialCollapseState: Record<string, boolean> = {};
        json.comparison_data.forEach((s: ComparisonSection) => {
            initialCollapseState[s.key] = false;
        });
        setCollapsedSections(initialCollapseState);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [searchParams, setIds]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({
        ...prev,
        [key]: !prev[key]
    }));
  };

  const expandAll = () => {
    const newState: Record<string, boolean> = {};
    data?.comparison_data.forEach(s => newState[s.key] = false);
    setCollapsedSections(newState);
  };

  const collapseAll = () => {
    const newState: Record<string, boolean> = {};
    data?.comparison_data.forEach(s => newState[s.key] = true);
    setCollapsedSections(newState);
  };

  useEffect(() => {
    if (!showAddModal) {
      setSelectedLabelsForAdd([]);
      setLabelFilter('');
    }
  }, [showAddModal]);

  // Load projects when modal opens
  useEffect(() => {
    if (showAddModal && session?.is_authenticated) {
      fetchProjects();
    } else if (showAddModal && !session?.is_authenticated) {
        setAddTab('setid');
    }
  }, [showAddModal, session]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/dashboard/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchProjectLabels = async (project: Project) => {
    setLoadingLabels(true);
    setSelectedProject(project);
    try {
      const res = await fetch(`/api/dashboard/favorites_data?project_id=${project.id}`);
      const data = await res.json();
      setProjectLabels(data.favorites || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLabels(false);
    }
  };

  const toggleLabelSelection = (label: any) => {
    const isSelected = selectedLabelsForAdd.find(l => l.set_id === label.set_id);
    if (isSelected) {
      setSelectedLabelsForAdd(prev => prev.filter(l => l.set_id !== label.set_id));
    } else {
      if (selectedLabelsForAdd.length >= 10) {
        alert('Maximum 10 labels can be selected.');
        return;
      }
      setSelectedLabelsForAdd(prev => [...prev, label]);
    }
  };

  const handleBulkAdd = () => {
    if (selectedLabelsForAdd.length === 0) return;
    
    if (selectedLabelsForAdd.length >= 4) {
      setShowConfirmDialog(true);
    } else {
      confirmBulkAdd();
    }
  };

  const confirmBulkAdd = () => {
    const params = new URLSearchParams(searchParams.toString());
    let addedCount = 0;
    
    selectedLabelsForAdd.forEach(label => {
      if (!setIds.includes(label.set_id)) {
        params.append('set_ids', label.set_id);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      router.push(`/labelcomp?${params.toString()}`);
    }
    
    setShowAddModal(false);
    setShowConfirmDialog(false);
    setSelectedLabelsForAdd([]);
  };

  const handleAddLabel = (setId: string) => {
    const cleanId = setId.trim();
    if (!cleanId) return;
    
    if (setIds.includes(cleanId)) {
      alert('This label is already in the comparison.');
      return;
    }
    if (setIds.length >= 5) {
      alert('You can compare up to 5 labels at a time.');
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.append('set_ids', cleanId);
    router.push(`/labelcomp?${params.toString()}`);
    setShowAddModal(false);
    setSetIdInput('');
    setSelectedProject(null);
    setProjectLabels([]);
  };

  const handleRemoveLabel = (setId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const newIds = setIds.filter(id => id !== setId);
    params.delete('set_ids');
    newIds.forEach(id => params.append('set_ids', id));
    router.push(`/labelcomp?${params.toString()}`);
  };

  const generateAiSummary = async (force = false) => {
    if (!data) return;
    setSummaryGenerating(true);
    try {
      const diffData = data.comparison_data
        .filter(s => !s.is_same && !s.is_empty)
        .map(s => ({
          title: s.title,
          content1: s.contents[0],
          content2: s.contents[1]
        }));

      const res = await fetch('/api/labelcomp/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set_ids: data.current_set_ids,
          comparison_data: diffData,
          label_names: data.selected_labels_metadata.map(m => m.brand_name),
          force_refresh: force
        })
      });
      const result = await res.json();
      if (result.summary) setAiSummary(result.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setSummaryGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <header className="header-main" style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link href="/" style={{ 
            backgroundColor: 'white', 
            padding: '5px', 
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none'
          }}>
             <img src="/askfdalabel_icon.svg" alt="Logo" style={{ height: '24px' }} />
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em' }}>
            Label Comparison
          </h1>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/" style={{ color: 'white', fontSize: '0.875rem', textDecoration: 'none', opacity: 0.9 }}>Suite Home</Link>
        </nav>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ color: '#002e5d', fontSize: '1.75rem', fontWeight: 800 }}>Side-by-Side Analysis</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
                <button onClick={expandAll} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', borderRight: '1px solid #e2e8f0' }}>Expand All</button>
                <button onClick={collapseAll} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Collapse All</button>
            </div>
            <button 
                onClick={() => setShowAddModal(true)}
                style={{ 
                backgroundColor: '#10b981', 
                color: 'white', 
                border: 'none', 
                padding: '10px 24px', 
                borderRadius: '8px', 
                fontWeight: 700, 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
                }}
            >
                <span style={{ fontSize: '1.2rem' }}>+</span> Add Label
            </button>
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '4rem' }}>Loading comparison data...</div>}
        {error && <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>Error: {error}</div>}
        
        {data && data.selected_labels_metadata.length > 0 && (
          <section style={{ display: 'grid', gridTemplateColumns: `repeat(${data.selected_labels_metadata.length}, 1fr)`, gap: '1.5rem', marginBottom: '3rem' }}>
            {data.selected_labels_metadata.map((meta) => (
              <div key={meta.set_id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative' }}>
                <button 
                  onClick={() => handleRemoveLabel(meta.set_id)}
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  &times;
                </button>
                <h3 style={{ color: '#002e5d', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{meta.brand_name}</h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
                  <p style={{ margin: '2px 0' }}><strong>Manufacturer:</strong> {meta.manufacturer_name}</p>
                  <p style={{ margin: '2px 0' }}><strong>Published:</strong> {meta.effective_time}</p>
                </div>
                <Link 
                  href={`/dashboard/label/${meta.set_id}`}
                  target="_blank"
                  style={{ 
                    display: 'block', 
                    marginTop: '1rem', 
                    fontSize: '0.85rem', 
                    color: '#3b82f6', 
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  View Full Label &rarr;
                </Link>
              </div>
            ))}
          </section>
        )}

        {/* AI Summary Section */}
        {data && data.selected_labels_metadata.length >= 2 && (
          <section style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '3rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiSummaryCollapsed ? '0' : '1.5rem' }}>
              <h3 
                onClick={() => setAiSummaryCollapsed(!aiSummaryCollapsed)}
                style={{ color: '#002e5d', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontSize: '0.8rem', transform: aiSummaryCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                <span>✨</span> AI Comparison Insight
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {session?.is_authenticated && (
                    <button 
                    onClick={() => generateAiSummary()}
                    disabled={summaryGenerating}
                    style={{ 
                        backgroundColor: '#002e5d', 
                        color: 'white', 
                        border: 'none', 
                        padding: '8px 16px', 
                        borderRadius: '6px', 
                        fontSize: '0.85rem', 
                        cursor: 'pointer',
                        opacity: summaryGenerating ? 0.7 : 1
                    }}
                    >
                    {summaryGenerating ? 'Analyzing...' : aiSummary ? 'Regenerate Summary' : 'Generate Summary'}
                    </button>
                )}
              </div>
            </div>
            
            {!aiSummaryCollapsed && (
                <div className="ai-summary-content" style={{ color: '#475569', lineHeight: 1.7, animation: 'fadeIn 0.2s' }}>
                {aiSummary ? (
                    <div dangerouslySetInnerHTML={{ __html: aiSummary }} />
                ) : (
                    <p style={{ fontStyle: 'italic' }}>
                    {session?.is_authenticated 
                        ? 'Click "Generate Summary" to let AI analyze the key differences between these labels.' 
                        : 'Sign in to generate an AI-powered comparison summary.'}
                    </p>
                )}
                </div>
            )}
          </section>
        )}

        {data && data.comparison_data.length > 0 ? (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {data.comparison_data.map((section, idx) => (
              <div key={idx} style={{ 
                borderBottom: '1px solid #f1f5f9', 
                marginLeft: `${section.nesting_level * 20}px`,
                backgroundColor: section.is_same ? '#fcfcfd' : 'white'
              }}>
                <div 
                    onClick={() => toggleSection(section.key)}
                    style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '1rem 1.5rem',
                        cursor: 'pointer',
                        userSelect: 'none'
                    }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', transform: collapsedSections[section.key] ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                    <h4 style={{ margin: 0, color: section.is_same ? '#64748b' : '#002e5d', fontSize: '1rem', fontWeight: 700 }}>
                        {section.title}
                        {!section.is_empty && (
                        <span style={{ 
                            marginLeft: '10px', 
                            fontSize: '0.7rem', 
                            padding: '2px 8px', 
                            borderRadius: '4px',
                            backgroundColor: section.is_same ? '#f1f5f9' : '#fef2f2',
                            color: section.is_same ? '#94a3b8' : '#ef4444'
                        }}>
                            {section.is_same ? 'IDENTICAL' : 'CHANGES DETECTED'}
                        </span>
                        )}
                    </h4>
                  </div>
                </div>

                {!collapsedSections[section.key] && (
                    <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', animation: 'fadeIn 0.2s' }}>
                        {(section as any).is_major_change ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ 
                                    backgroundColor: '#fff7ed', 
                                    border: '1px solid #fed7aa', 
                                    borderRadius: '8px', 
                                    padding: '1rem', 
                                    color: '#9a3412',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                                    <div>
                                        <div style={{ fontWeight: 800 }}>Significant Section Overhaul</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Extensively rewritten. Granular highlighting disabled for readability.</div>
                                    </div>
                                </div>
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: `repeat(${data.labels.length}, 1fr)`, 
                                    gap: '1rem' 
                                }}>
                                    {section.contents.map((content, cIdx) => {
                                        const meta = data.selected_labels_metadata[cIdx];
                                        return (
                                            <div key={cIdx} style={{ 
                                                fontSize: '0.9rem', 
                                                color: '#334155', 
                                                lineHeight: 1.6,
                                                padding: '2.25rem 1rem 1rem 1rem',
                                                backgroundColor: cIdx % 2 === 0 ? '#f8fafc' : '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                position: 'relative'
                                            }}>
                                                <div style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: '#002e5d', color: 'white', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                    {meta.brand_name}
                                                </div>
                                                {content ? <div dangerouslySetInnerHTML={{ __html: content }} /> : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not specified.</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: `repeat(${data.labels.length}, 1fr)`, 
                                gap: '1rem' 
                            }}>
                                {section.contents.map((content, cIdx) => {
                                    const meta = data.selected_labels_metadata[cIdx];
                                    const manufacturerSnippet = meta.manufacturer_name ? `${meta.manufacturer_name.substring(0, 5)}...` : 'N/A';
                                    const tagLabel = `${meta.brand_name} [${manufacturerSnippet}]`;
                                    
                                    // Use nuanced content if available, otherwise original content
                                    const displayContent = (section as any).nuanced_contents?.[cIdx] || content;

                                    return (
                                        <div key={cIdx} style={{ 
                                            fontSize: '0.9rem', 
                                            color: '#334155', 
                                            lineHeight: 1.6,
                                            padding: '2.25rem 1rem 1rem 1rem',
                                            backgroundColor: cIdx % 2 === 0 ? '#f8fafc' : '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            position: 'relative',
                                            minHeight: '100px'
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                left: '8px',
                                                backgroundColor: section.is_same ? '#64748b' : '#002e5d',
                                                color: 'white',
                                                fontSize: '0.65rem',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                maxWidth: '90%',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                zIndex: 1
                                            }} title={tagLabel}>
                                                {tagLabel}
                                            </div>
                                            {displayContent ? (
                                                <div dangerouslySetInnerHTML={{ __html: displayContent }} />
                                            ) : (
                                                <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not specified in this label.</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
              </div>
            ))}
          </div>
        ) : !loading && (
          <div style={{ textAlign: 'center', padding: '5rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚖️</div>
            <h3>No labels selected for comparison</h3>
            <p>Use the "Add Label" button above to start your side-by-side research.</p>
          </div>
        )}
      </main>

      {/* Add Label Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '700px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
            
            {/* Bulk Add Button (Top Right) */}
            {selectedLabelsForAdd.length > 0 && (
                <button 
                    onClick={handleBulkAdd}
                    style={{ 
                        position: 'absolute', 
                        top: '2rem', 
                        right: '4.5rem', 
                        backgroundColor: '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        padding: '8px 20px', 
                        borderRadius: '6px', 
                        fontWeight: 700, 
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                        zIndex: 10
                    }}
                >
                    Add {selectedLabelsForAdd.length} Selected
                </button>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#002e5d' }}>Add Labels to Compare</h3>
              <button onClick={() => { setShowAddModal(false); setSelectedProject(null); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            {/* Selected Badges Row */}
            {selectedLabelsForAdd.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', alignSelf: 'center', marginRight: '4px' }}>SELECTED:</span>
                    {selectedLabelsForAdd.map((l, i) => (
                        <div key={l.set_id} className="badge-container">
                            <div 
                                style={{ 
                                    width: '24px', 
                                    height: '24px', 
                                    borderRadius: '50%', 
                                    backgroundColor: '#002e5d', 
                                    color: 'white', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 800,
                                    cursor: 'help'
                                }}
                            >
                                {i + 1}
                            </div>
                            <div className="badge-tooltip">
                                <div style={{ color: '#94a3b8', fontSize: '0.6rem', marginBottom: '2px', fontWeight: 700, textTransform: 'uppercase' }}>Selected Label</div>
                                <div style={{ fontWeight: 600 }}>{l.brand_name}</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '4px' }}>{l.manufacturer_name}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Global Filter Bar */}
            <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                <input 
                    type="text" 
                    placeholder="Search all labels in current project..."
                    value={labelFilter}
                    onChange={(e) => setLabelFilter(e.target.value)}
                    style={{ 
                        width: '100%', 
                        padding: '10px 12px 10px 35px', 
                        borderRadius: '8px', 
                        border: '1px solid #e2e8f0', 
                        fontSize: '0.9rem',
                        outline: 'none'
                    }}
                />
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                <button 
                    onClick={() => setAddTab('projects')}
                    style={{ 
                        padding: '8px 16px', 
                        borderRadius: '20px', 
                        border: 'none', 
                        backgroundColor: addTab === 'projects' ? '#002e5d' : 'transparent',
                        color: addTab === 'projects' ? 'white' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    My Projects
                </button>
                <button 
                    onClick={() => setAddTab('setid')}
                    style={{ 
                        padding: '8px 16px', 
                        borderRadius: '20px', 
                        border: 'none', 
                        backgroundColor: addTab === 'setid' ? '#002e5d' : 'transparent',
                        color: addTab === 'setid' ? 'white' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    SET-ID Input
                </button>
            </div>

            {addTab === 'projects' ? (
                <div>
                    {!session?.is_authenticated ? (
                        <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>Please sign in to access your projects.</p>
                    ) : selectedProject ? (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <button onClick={() => setSelectedProject(null)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem' }}>&larr; Back to Projects</button>
                                <h4 style={{ margin: 0, fontWeight: 800 }}>📁 {selectedProject.title}</h4>
                            </div>
                            {loadingLabels ? (
                                <p style={{ textAlign: 'center', padding: '2rem' }}>Loading labels...</p>
                            ) : (
                                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                    {projectLabels
                                      .filter(label => 
                                        !labelFilter || 
                                        label.brand_name.toLowerCase().includes(labelFilter.toLowerCase()) || 
                                        label.manufacturer_name.toLowerCase().includes(labelFilter.toLowerCase())
                                      )
                                      .map(label => {
                                        const isSelected = selectedLabelsForAdd.find(l => l.set_id === label.set_id);
                                        return (
                                            <div 
                                                key={label.set_id} 
                                                onClick={() => toggleLabelSelection(label)}
                                                style={{ 
                                                    padding: '12px', 
                                                    borderBottom: '1px solid #f1f5f9', 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center',
                                                    cursor: 'pointer',
                                                    backgroundColor: isSelected ? '#f0f9ff' : 'transparent',
                                                    transition: 'background-color 0.2s'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? '#0369a1' : 'inherit' }}>{label.brand_name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{label.manufacturer_name}</div>
                                                </div>
                                                <div style={{ 
                                                    width: '20px', 
                                                    height: '20px', 
                                                    borderRadius: '4px', 
                                                    border: `2px solid ${isSelected ? '#0369a1' : '#cbd5e1'}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: isSelected ? '#0369a1' : 'white'
                                                }}>
                                                    {isSelected && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                                                </div>
                                            </div>
                                        );
                                      })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                            {loadingProjects ? <p style={{ textAlign: 'center', padding: '2rem' }}>Loading projects...</p> : projects.map(p => (
                                <div key={p.id} onClick={() => fetchProjectLabels(p)} style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', '&:hover': { backgroundColor: '#f8fafc' } }}>
                                    <div style={{ fontWeight: 700, color: '#002e5d' }}>{p.title === 'Favorite' ? '⭐' : '📁'} {p.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{p.count} labels • {p.role}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>Enter the unique SPL SET-ID (UUID) of the label you wish to add.</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                            type="text" 
                            placeholder="e.g. 01e46f58-8bda-4ff3-ab21-..."
                            value={setIdInput}
                            onChange={(e) => setSetIdInput(e.target.value)}
                            style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}
                        />
                        <button 
                            onClick={() => handleAddLabel(setIdInput)}
                            style={{ backgroundColor: '#002e5d', color: 'white', border: 'none', padding: '0 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Add
                        </button>
                    </div>
                </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔬</div>
                <h3 style={{ margin: '0 0 1rem 0', color: '#002e5d' }}>Complex Comparison</h3>
                <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                    You have selected <strong>{selectedLabelsForAdd.length} labels</strong>. Comparing many documents simultaneously may take longer to process. Proceed with analysis?
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setShowConfirmDialog(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={confirmBulkAdd} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#002e5d', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Proceed</button>
                </div>
            </div>
        </div>
      )}

      <style jsx global>{`
        .badge-container {
          position: relative;
          display: inline-block;
        }
        .badge-tooltip {
          visibility: hidden;
          width: 220px;
          background-color: #1e293b;
          color: #fff;
          text-align: center;
          border-radius: 8px;
          padding: 10px 14px;
          position: absolute;
          z-index: 100;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%) translateY(5px);
          opacity: 0;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          font-size: 0.8rem;
          line-height: 1.4;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
          pointer-events: none;
        }
        .badge-tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 6px;
          border-style: solid;
          border-color: #1e293b transparent transparent transparent;
        }
        .badge-container:hover .badge-tooltip {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        .ai-summary-content h3 { color: #002e5d; margin-top: 0; font-size: 1.25rem; }
        .ai-summary-content h4 { color: #0071bc; margin: 1.5rem 0 0.5rem 0; font-size: 1rem; font-weight: 700; }
        .ai-summary-content ul { padding-left: 1.5rem; margin-bottom: 1rem; }
        .ai-summary-content li { margin-bottom: 0.5rem; }
        .summary-section { margin-bottom: 1.5rem; }

        .diff-table-wrapper { width: 100%; overflow-x: auto; }
        .diff { width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 0.85rem; }
        .diff td, .diff th { padding: 8px; border: 1px solid #e2e8f0; vertical-align: top; }
        .diff_header { background-color: #f1f5f9; color: #64748b; font-weight: 700; text-align: center; }
        .diff_next { display: none; }
        .diff_add, ins.diff-add { background-color: #dcfce7; color: #166534; text-decoration: none; border-radius: 2px; padding: 0 2px; }
        .diff_chg { background-color: #fef9c3; color: #854d0e; }
        .diff_sub, del.diff-sub { background-color: #fee2e2; color: #991b1b; text-decoration: line-through; border-radius: 2px; padding: 0 2px; }
      `}</style>
    </div>
  );
}

export default function LabelCompPage() {
  return (
    <Suspense fallback={<div>Loading Page...</div>}>
      <LabelCompContent />
    </Suspense>
  );
}
