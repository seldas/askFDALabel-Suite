'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useUser } from '../context/UserContext';
import { 
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, ResponsiveContainer, ComposedChart 
} from 'recharts';

interface TestResult {
    task_num: number;
    version: string;
    url: string;
    query_details: string;
    status: string;
    count: string;
    time_to_ready: number;
    prev_count?: string;
    prev_time?: number;
}

interface HistoryItem {
    Date: string;
    URL: string;
    Count: string;
    Delay: number;
    Timestamp?: number;
    Notes?: string;
}

type SortConfig = {
    key: 'time_to_ready' | null;
    direction: 'asc' | 'desc' | null;
};

export default function WebTestingPage() {
    const { session, openAuthModal } = useUser();
    const [templates, setTemplates] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [totalTasks, setTotalTasks] = useState(0);
    const [results, setResults] = useState<TestResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [savedFilename, setSavedFilename] = useState<string | null>(null);
    const [lastRunDate, setLastRunDate] = useState<string | null>(null);

    const [selectedTask, setSelectedTask] = useState<TestResult | null>(null);
    const [isGrouped, setIsGrouped] = useState(false);
    const [taskHistory, setTaskHistory] = useState<any[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    const chartVersions = useMemo(() => {
        if (!isGrouped) return [];
        const versions = new Set<string>();
        taskHistory.forEach(h => {
            Object.keys(h).forEach(k => {
                if (k.startsWith('count_')) {
                    versions.add(k.replace('count_', ''));
                }
            });
        });
        return Array.from(versions);
    }, [taskHistory, isGrouped]);

    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: null });
    const [versionFilters, setVersionFilters] = useState<string[]>([]);
    const [showVersionFilter, setShowVersionFilter] = useState(false);
    
    const itemsPerPage = 10;
    const stopRef = useRef(false);
    const versionFilterRef = useRef<HTMLDivElement>(null);

    const fetchTemplates = async () => {
        setIsRefreshing(true);
        try {
            const response = await fetch('/api/webtest/templates');
            const data = await response.json();
            setTemplates(data || []);
            if (data.length > 0 && !selectedTemplate) {
                setSelectedTemplate(data[0]);
            }
        } catch (err) {
            console.error("Failed to fetch templates", err);
        } finally {
            setIsRefreshing(false);
        }
    };

    const fetchTaskHistory = async (task: TestResult) => {
        if (!selectedTemplate) return;
        setIsHistoryLoading(true);
        try {
            const endpoint = isGrouped ? '/api/webtest/group_history' : '/api/webtest/task_history';
            const params = isGrouped 
                ? `template_name=${encodeURIComponent(selectedTemplate)}&query_details=${encodeURIComponent(task.query_details)}`
                : `template_name=${encodeURIComponent(selectedTemplate)}&url=${encodeURIComponent(task.url)}`;
            
            const res = await fetch(`${endpoint}?${params}`);
            const data = await res.json();
            
            if (data.error) {
                console.error("Task history error:", data.error);
                setTaskHistory([]);
                return;
            }

            if (!Array.isArray(data)) {
                console.error("Task history is not an array:", data);
                setTaskHistory([]);
                return;
            }

            if (isGrouped) {
                // Group by Version and Date for chart
                // For multi-version chart, we need data like: { Date: '...', VersionA: count, VersionB: count }
                const dateMap = new Map();
                data.forEach((h: any) => {
                    const date = h.Date.split(' ')[0]; // Group by day for simpler chart
                    if (!dateMap.has(date)) {
                        dateMap.set(date, { Date: date, DisplayDate: date.replace('2026-', ''), Timestamp: new Date(h.Date).getTime() });
                    }
                    const entry = dateMap.get(date);
                    entry[`count_${h.Version}`] = parseInt(h.Count) || 0;
                    entry[`delay_${h.Version}`] = h.Delay;
                });
                const formatted = Array.from(dateMap.values()).sort((a, b) => a.Timestamp - b.Timestamp);
                setTaskHistory(formatted);
            } else {
                // Convert Count to number for chart and add timestamp
                const formatted = data.map((h: any) => ({
                    ...h,
                    CountNum: parseInt(h.Count) || 0,
                    Timestamp: new Date(h.Date).getTime(),
                    DisplayDate: h.Date.split(' ')[0].replace('2026-', ''),
                    Notes: h.Notes
                }));
                setTaskHistory(formatted);
            }
        } catch (err) {
            console.error("Failed to fetch task history", err);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (selectedTask) {
            fetchTaskHistory(selectedTask);
        }
    }, [selectedTask, isGrouped]);

    useEffect(() => {
        if (selectedTemplate && status === 'idle') {
            const fetchInfo = async () => {
                try {
                    const res = await fetch(`/api/webtest/template_info?template_name=${encodeURIComponent(selectedTemplate)}`);
                    const data = await res.json();
                    if (data.tasks) {
                        setTotalTasks(data.total_tasks);
                        setResults(data.tasks);
                        setLastRunDate(data.last_run_date || 'N/A');
                        setCurrentPage(1);
                        setVersionFilters([]); // Reset filters on new template
                        setSelectedTask(null);
                        setTaskHistory([]);
                    }
                } catch (err) {
                    console.error("Error fetching template info", err);
                }
            };
            fetchInfo();
        }
    }, [selectedTemplate, status]);

    useEffect(() => {
        fetchTemplates();
        
        const handleClickOutside = (event: MouseEvent) => {
            if (versionFilterRef.current && !versionFilterRef.current.contains(event.target as Node)) {
                setShowVersionFilter(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const startAutomation = async () => {
        if (!session?.is_authenticated) {
            openAuthModal('login');
            return;
        }
        if (results.length === 0) return;
        setStatus('running');
        stopRef.current = false;
        setError(null);

        for (let i = 0; i < results.length; i++) {
            if (stopRef.current) {
                setStatus('idle');
                return;
            }
            if (results[i].status !== 'pending' && results[i].status !== 'Inaccessible') continue;

            try {
                const response = await fetch('/api/webtest/probe_single', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        url: results[i].url,
                        version: results[i].version,
                        template_name: selectedTemplate
                    }),
                });
                
                if (response.status === 401) {
                    setStatus('idle');
                    openAuthModal('login');
                    return;
                }

                const data = await response.json();
                setResults(prev => {
                    const next = [...prev];
                    next[i] = { 
                        ...next[i], 
                        status: data.status, 
                        count: data.count, 
                        time_to_ready: data.time 
                    };
                    return next;
                });
            } catch (err) {
                setResults(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], status: 'Error' };
                    return next;
                });
            }
        }

        setStatus('completed');
        setSaveStatus('saving');

        // AUTO-SAVE logic: Trigger after full completion
        try {
            const saveResp = await fetch('/api/webtest/save_results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    template_name: selectedTemplate,
                    results: results 
                }),
            });
            const saveData = await saveResp.json();
            if (saveData.success) {
                setSaveStatus('success');
                setSavedFilename(saveData.filename);
            } else {
                setSaveStatus('error');
            }
        } catch (saveErr) {
            console.error("Auto-save failed", saveErr);
            setSaveStatus('error');
        }
    };


    const downloadReport = async () => {
        const res = await fetch('/api/webtest/report_from_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `webtest_report.xlsx`;
            a.click();
        }
    };

    // Derived Data: Available Versions
    const availableVersions = useMemo(() => {
        const v = new Set(results.map(r => r.version));
        return Array.from(v).filter(x => x !== 'N/A' && x !== '');
    }, [results]);

    // Filtering, Sorting, and Grouping Logic
    const processedResults = useMemo(() => {
        let filtered = [...results];

        // 1. Filter by Version
        if (versionFilters.length > 0) {
            filtered = filtered.filter(r => versionFilters.includes(r.version));
        }

        // 2. Sort by Time to Ready
        if (sortConfig.key === 'time_to_ready' && sortConfig.direction) {
            filtered.sort((a, b) => {
                const valA = a.time_to_ready || 0;
                const valB = b.time_to_ready || 0;
                return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            });
        }

        // 3. Group by Query Details if enabled
        if (isGrouped) {
            const groups: Map<string, any> = new Map();
            filtered.forEach(r => {
                const key = r.query_details;
                if (!groups.has(key)) {
                    groups.set(key, {
                        ...r,
                        isGroup: true,
                        versions: [r.version],
                        tasks: [r],
                        // For display, use the "best" or "first" available info
                        all_counts: { [r.version]: r.count },
                        all_times: { [r.version]: r.time_to_ready }
                    });
                } else {
                    const g = groups.get(key);
                    if (!g.versions.includes(r.version)) {
                        g.versions.push(r.version);
                    }
                    g.tasks.push(r);
                    // Update to latest count/time for this version
                    g.all_counts[r.version] = r.count;
                    g.all_times[r.version] = r.time_to_ready;
                    // If any task in group is running/success, update aggregate
                    if (r.status === 'Success' && g.status !== 'Success') g.status = 'Success';
                }
            });
            return Array.from(groups.values());
        }

        return filtered;
    }, [results, versionFilters, sortConfig, isGrouped]);

    const paginatedResults = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedResults.slice(startIndex, startIndex + itemsPerPage);
    }, [processedResults, currentPage]);

    const totalPages = Math.ceil(processedResults.length / itemsPerPage);
    const processedCount = results.filter(r => r.status !== 'pending').length;

    const toggleSort = (key: 'time_to_ready') => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : (prev.key === key && prev.direction === 'desc' ? null : 'asc')
        }));
    };

    const toggleVersionFilter = (version: string) => {
        setVersionFilters(prev => 
            prev.includes(version) ? prev.filter(v => v !== version) : [...prev, version]
        );
        setCurrentPage(1);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Header />
            
            <main style={{ flex: 1, padding: '40px 20px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>
                <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>Web Application Auto-Testing</h1>
                        <p style={{ color: '#64748b' }}>Interactive portal for monitoring FDALabel performance and accuracy.</p>
                    </div>
                    <button 
                        onClick={fetchTemplates}
                        disabled={isRefreshing || status === 'running'}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>
                            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                        </svg>
                        Refresh Templates
                    </button>
                </div>

                {/* Top Control Panel */}
                <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                Select Performance Template
                            </label>
                            <select 
                                value={selectedTemplate}
                                onChange={(e) => setSelectedTemplate(e.target.value)}
                                disabled={status === 'running'}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #f1f5f9', fontSize: '0.95rem', fontWeight: 600, outline: 'none', appearance: 'none', background: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E") no-repeat right 12px center #fff' }}
                            >
                                {templates.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        {selectedTemplate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '10px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Status</span>
                                    <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', backgroundColor: status === 'running' ? '#dbeafe' : (status === 'completed' ? '#d1fae5' : '#f1f5f9'), color: status === 'running' ? '#1e40af' : (status === 'completed' ? '#065f46' : '#475569') }}>{status}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Progress</span>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                                        <span style={{ color: '#2563eb' }}>{processedCount}</span> / {totalTasks}
                                    </div>
                                </div>
                                {status === 'running' && <div className="loader" style={{ width: '20px', height: '20px', borderWidth: '3px' }}></div>}
                            </div>
                        )}
                        
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => { setIsGrouped(!isGrouped); setCurrentPage(1); }}
                                style={{ 
                                    padding: '12px 24px', 
                                    backgroundColor: isGrouped ? '#6366f1' : '#fff', 
                                    color: isGrouped ? '#fff' : '#6366f1', 
                                    borderRadius: '10px', 
                                    fontWeight: 700, 
                                    border: '2px solid #6366f1', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                {isGrouped ? 'Ungroup Tasks' : 'Group by Task'}
                            </button>

                            {status === 'running' ? (
                                <button onClick={() => { stopRef.current = true; }} style={{ padding: '12px 24px', backgroundColor: '#ef4444', color: '#fff', borderRadius: '10px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }}>Stop</button>
                            ) : (
                                <button onClick={startAutomation} disabled={!selectedTemplate || totalTasks === 0} style={{ padding: '12px 24px', backgroundColor: (selectedTemplate && totalTasks > 0) ? '#2563eb' : '#cbd5e1', color: '#fff', borderRadius: '10px', fontWeight: 700, border: 'none', cursor: (selectedTemplate && totalTasks > 0) ? 'pointer' : 'not-allowed', boxShadow: (selectedTemplate && totalTasks > 0) ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none' }}>Start Automation</button>
                            )}
                            {processedCount > 0 && <button onClick={downloadReport} style={{ padding: '12px 24px', backgroundColor: '#10b981', color: '#fff', borderRadius: '10px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}>Download Excel</button>}
                        </div>
                    </div>
                </div>

                {/* Table Header with Integrated Pagination */}
                {selectedTemplate && (
                    <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Extraction Results</h3>
                                
                                {saveStatus === 'success' && (
                                    <span style={{ backgroundColor: '#ecfdf5', color: '#059669', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid #d1fae5', textTransform: 'uppercase' }}>
                                        Auto-saved!
                                    </span>
                                )}
                                {saveStatus === 'error' && (
                                    <span style={{ backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid #fee2e2', textTransform: 'uppercase' }}>
                                        Not Saved
                                    </span>
                                )}
                                {saveStatus === 'saving' && (
                                    <span style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 700, fontStyle: 'italic' }}>
                                        Saving...
                                    </span>
                                )}

                                {processedResults.length !== results.length && (
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                        Filtered: {processedResults.length} / {results.length}
                                    </span>
                                )}
                            </div>

                            {/* Styled Pagination Bar */}
                            {totalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                        disabled={currentPage === 1}
                                        className="pag-btn"
                                        style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.3 : 1, fontSize: '0.75rem', fontWeight: 700 }}
                                    >
                                        &larr;
                                    </button>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', padding: '0 10px', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                                        Page {currentPage} of {totalPages}
                                    </div>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                        disabled={currentPage === totalPages}
                                        className="pag-btn"
                                        style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.3 : 1, fontSize: '0.75rem', fontWeight: 700 }}
                                    >
                                        &rarr;
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div style={{ overflowX: 'auto', minHeight: '550px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead style={{ backgroundColor: '#f8fafc' }}>
                                    <tr>
                                        <th style={{ padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>#</th>
                                        <th style={{ padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>Task Details</th>
                                        
                                        {/* Version Column with Checkbox Filter */}
                                        <th style={{ padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={() => setShowVersionFilter(!showVersionFilter)}>
                                                Version 
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill={versionFilters.length > 0 ? '#2563eb' : 'currentColor'} stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                                            </div>
                                            {showVersionFilter && (
                                                <div ref={versionFilterRef} style={{ position: 'absolute', top: '100%', left: '20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 100, minWidth: '150px', textTransform: 'none' }}>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase' }}>Filter Version</div>
                                                    {availableVersions.map(v => (
                                                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '0.8rem', color: '#1e293b', fontWeight: 600 }}>
                                                            <input type="checkbox" checked={versionFilters.includes(v)} onChange={() => toggleVersionFilter(v)} style={{ cursor: 'pointer' }} />
                                                            {v}
                                                        </label>
                                                    ))}
                                                    {versionFilters.length > 0 && (
                                                        <button onClick={() => { setVersionFilters([]); setCurrentPage(1); }} style={{ marginTop: '8px', width: '100%', padding: '4px', fontSize: '0.7rem', background: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>Clear All</button>
                                                    )}
                                                </div>
                                            )}
                                        </th>

                                        <th style={{ padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>Result Link</th>
                                        
                                        {/* Result Count Split Header */}
                                        <th style={{ padding: '14px 20px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                            Result Count
                                            <div style={{ display: 'flex', marginTop: '4px', borderTop: '1px solid #f1f5f9', fontSize: '0.6rem' }}>
                                                <div style={{ flex: 1, padding: '2px', borderRight: '1px solid #f1f5f9' }}>Prev</div>
                                                <div style={{ flex: 1, padding: '2px', color: '#2563eb' }}>Current</div>
                                            </div>
                                        </th>
                                        
                                        {/* Time to Ready Split Header with Sort */}
                                        <th 
                                            style={{ padding: '14px 20px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', color: sortConfig.key === 'time_to_ready' ? '#2563eb' : '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', cursor: 'pointer' }}
                                        >
                                            <div onClick={() => toggleSort('time_to_ready')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                Time to Ready
                                                <span style={{ fontSize: '0.8rem' }}>
                                                    {sortConfig.key === 'time_to_ready' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', marginTop: '4px', borderTop: '1px solid #f1f5f9', fontSize: '0.6rem' }}>
                                                <div style={{ flex: 1, padding: '2px', borderRight: '1px solid #f1f5f9' }}>Prev</div>
                                                <div style={{ flex: 1, padding: '2px', color: '#2563eb' }}>Current</div>
                                            </div>
                                        </th>

                                        <th style={{ padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedResults.map((res: any) => {
                                        const isConsistent = res.isGroup && res.versions.length > 1 && 
                                            res.versions.every((v: string) => res.all_counts[v] === res.all_counts[res.versions[0]]);

                                        return (
                                            <tr 
                                                key={res.isGroup ? `group-${res.query_details}` : res.task_num} 
                                                style={{ 
                                                    borderBottom: '1px solid #f1f5f9',
                                                    backgroundColor: selectedTask?.query_details === res.query_details ? '#f1f5f9' : 'transparent',
                                                    cursor: 'pointer'
                                                }} 
                                                className="row-hover"
                                                onClick={() => setSelectedTask(res)}
                                            >
                                                <td style={{ padding: '14px 20px', color: '#94a3b8', fontWeight: 700 }}>
                                                    {res.isGroup ? 'GRP' : res.task_num}
                                                </td>
                                                <td style={{ 
                                                    padding: '14px 20px', 
                                                    fontWeight: 700, 
                                                    color: '#1e293b',
                                                    wordBreak: 'break-word',
                                                    whiteSpace: 'pre-wrap',
                                                    minWidth: '200px'
                                                }} title={res.query_details}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: 'column' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            {res.query_details}
                                                            {isConsistent && (
                                                                <span style={{ 
                                                                    backgroundColor: '#f0f9ff', 
                                                                    color: '#0369a1', 
                                                                    fontSize: '0.6rem', 
                                                                    padding: '1px 6px', 
                                                                    borderRadius: '4px', 
                                                                    border: '1px solid #bae6fd',
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.02em',
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    Matched
                                                                </span>
                                                            )}
                                                        </div>
                                                        {res.isGroup && (
                                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>
                                                                {res.tasks.length} versions grouped
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 20px' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {(res.isGroup ? res.versions : [res.version]).map((v: string, idx: number) => {
                                                            const vLower = v.toLowerCase();
                                                            let styles = { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }; 
                                                            if (vLower.includes('test')) styles = { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' };
                                                            if (vLower.includes('dev')) styles = { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' };
                                                            
                                                            return (
                                                                <span key={idx} style={{ 
                                                                    backgroundColor: styles.bg, 
                                                                    color: styles.text,
                                                                    border: `1px solid ${styles.border}`,
                                                                    padding: '2px 8px', 
                                                                    borderRadius: '6px', 
                                                                    fontSize: '0.65rem', 
                                                                    fontWeight: 800,
                                                                    textTransform: 'uppercase'
                                                                }}>
                                                                    {v}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 20px' }}>
                                                    <div style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {res.isGroup ? (
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Multiple Links</span>
                                                        ) : (
                                                            <a 
                                                                href={res.url} 
                                                                target="_blank" 
                                                                rel="noreferrer" 
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.7rem', fontWeight: 600 }}
                                                                title={res.url}
                                                            >
                                                                {res.url}
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                                
                                                {/* Count Comparison Cells */}
                                                <td style={{ padding: '0', textAlign: 'center', borderLeft: '1px solid #f1f5f9', minWidth: '140px' }}>
                                                    {res.isGroup ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px' }}>
                                                            {isConsistent ? (
                                                                <div style={{ padding: '4px', textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>ALL VERSIONS</div>
                                                                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{res.all_counts[res.versions[0]]}</div>
                                                                </div>
                                                            ) : (
                                                                res.versions.map((v: string) => (
                                                                    <div key={v} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', borderBottom: '1px solid #f8fafc' }}>
                                                                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{v}:</span>
                                                                        <span style={{ fontWeight: 800 }}>{res.all_counts[v] || 'N/A'}</span>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', height: '100%' }}>
                                                            <div style={{ flex: 1, padding: '14px 10px', color: '#94a3b8', borderRight: '1px solid #f8fafc', fontWeight: 600 }}>
                                                                {res.prev_count || 'N/A'}
                                                            </div>
                                                            <div style={{ flex: 1, padding: '14px 10px', fontWeight: 900, color: '#0f172a' }}>
                                                                {res.count}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Time Comparison Cells */}
                                                <td style={{ padding: '0', textAlign: 'center', borderLeft: '1px solid #f1f5f9', minWidth: '140px' }}>
                                                    {res.isGroup ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px' }}>
                                                            {res.versions.map((v: string) => (
                                                                <div key={v} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', borderBottom: '1px solid #f8fafc' }}>
                                                                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>{v}:</span>
                                                                    <span style={{ fontWeight: 800, color: res.all_times[v] > 15 ? '#ef4444' : (res.all_times[v] > 5 ? '#f59e0b' : '#10b981') }}>
                                                                        {res.all_times[v] > 0 ? `${res.all_times[v]}s` : '--'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', height: '100%' }}>
                                                            <div style={{ flex: 1, padding: '14px 10px', color: '#94a3b8', borderRight: '1px solid #f8fafc', fontSize: '0.75rem' }}>
                                                                {res.prev_time ? `${res.prev_time}s` : '—'}
                                                            </div>
                                                            <div style={{ flex: 1, padding: '14px 10px', fontWeight: 800 }}>
                                                                {res.time_to_ready > 0 ? (
                                                                    <span style={{ color: res.time_to_ready > 15 ? '#ef4444' : (res.time_to_ready > 5 ? '#f59e0b' : '#10b981') }}>
                                                                        {res.time_to_ready}s
                                                                    </span>
                                                                ) : <span style={{ color: '#e2e8f0' }}>&mdash;</span>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                <td style={{ padding: '14px 20px', borderLeft: '1px solid #f1f5f9' }}>
                                                    <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', backgroundColor: res.status === 'Success' ? '#ecfdf5' : (res.status === 'pending' ? '#f8fafc' : '#fef2f2'), color: res.status === 'Success' ? '#059669' : (res.status === 'pending' ? '#94a3b8' : '#dc2626'), border: `1px solid ${res.status === 'Success' ? '#d1fae5' : (res.status === 'pending' ? '#e2e8f0' : '#fee2e2')}` }}>
                                                        {res.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedResults.length === 0 && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '80px', textAlign: 'center', color: '#94a3b8' }}>
                                                {versionFilters.length > 0 ? 'No results match the selected version filters.' : 'Initializing testing environment...'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Table Footer Explanation */}
                        <div style={{ padding: '12px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                    <span style={{ backgroundColor: '#f0f9ff', color: '#0369a1', fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bae6fd', textTransform: 'uppercase', marginRight: '8px' }}>Matched</span>
                                    Indicates that all grouped versions (e.g. PROD, DEV, TEST) returned identical result counts for this query.
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                    Click a row to view full historical trends.
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                <span style={{ fontWeight: 800, color: '#475569', marginRight: '8px' }}>NOTE:</span> 
                                "PREV" columns display results from the last historical record 
                                {lastRunDate && lastRunDate !== 'N/A' ? ` (Query Date: ${lastRunDate})` : ''}.
                            </div>
                        </div>
                    </div>
                )}

                {/* History Panel */}
                {selectedTask && (
                    <div style={{ marginTop: '30px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', padding: '24px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                    Task History: <span style={{ color: '#2563eb' }}>{selectedTask.query_details}</span>
                                </h3>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>Performance trends over time for this specific query.</p>
                            </div>
                            <button 
                                onClick={() => setSelectedTask(null)}
                                style={{ padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}
                            >
                                Clear Selection
                            </button>
                        </div>

                        {isHistoryLoading ? (
                            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                <div className="loader" style={{ width: '30px', height: '30px', marginRight: '15px' }}></div>
                                Fetching historical data...
                            </div>
                        ) : taskHistory.length > 0 ? (
                            <div style={{ height: '400px', width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={taskHistory}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis 
                                            dataKey={isGrouped ? "DisplayDate" : "Timestamp"} 
                                            type={isGrouped ? "category" : "number"}
                                            domain={['auto', 'auto']}
                                            tickFormatter={(val) => isGrouped ? val : new Date(val).toLocaleDateString()}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                        />
                                        <YAxis 
                                            axisLine={false}
                                            tickLine={false}
                                            domain={['auto', 'auto']}
                                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                            label={{ value: 'Label Count', angle: -90, position: 'insideLeft', style: { fill: '#6366f1', fontWeight: 800, fontSize: 12 } }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    
                                                    if (isGrouped) {
                                                        // Group versions by identical count values
                                                        const valueGroups: Map<number, { versions: string[], color: string }> = new Map();
                                                        chartVersions.forEach((v, idx) => {
                                                            const val = data[`count_${v}`] ?? 0;
                                                            const color = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][idx % 6];
                                                            if (!valueGroups.has(val)) {
                                                                valueGroups.set(val, { versions: [], color });
                                                            }
                                                            valueGroups.get(val)!.versions.push(v);
                                                        });

                                                        return (
                                                            <div style={{ backgroundColor: '#fff', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                                                                <p style={{ margin: '0 0 8px 0', fontWeight: 800, color: '#1e293b', fontSize: '0.85rem' }}>{data.Date}</p>
                                                                {Array.from(valueGroups.entries()).map(([val, { versions, color }]) => (
                                                                    <div key={val} style={{ margin: '6px 0', display: 'flex', flexDirection: 'column' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color }}></div>
                                                                            <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.8rem' }}>{val}</span>
                                                                        </div>
                                                                        <div style={{ marginLeft: '14px', color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>
                                                                            {versions.join(' • ')}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div style={{ backgroundColor: '#fff', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                                                            <p style={{ margin: '0 0 8px 0', fontWeight: 800, color: '#1e293b', fontSize: '0.85rem' }}>{data.Date}</p>
                                                            <p style={{ margin: '4px 0', color: '#6366f1', fontWeight: 700, fontSize: '0.8rem' }}>Result Count: {data.Count}</p>
                                                            {data.Notes && <p style={{ margin: '8px 0 0 0', padding: '6px 0 0 0', borderTop: '1px solid #f1f5f9', color: '#64748b', fontSize: '0.75rem', fontStyle: 'italic' }}>{data.Notes}</p>}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                        {isGrouped ? (
                                            chartVersions.map((v, i) => {
                                                const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                                                return (
                                                    <Bar 
                                                        key={v}
                                                        dataKey={`count_${v}`} 
                                                        name={`Version ${v}`} 
                                                        fill={colors[i % colors.length]} 
                                                        radius={[4, 4, 0, 0]}
                                                        barSize={30}
                                                    />
                                                );
                                            })
                                        ) : (
                                            <Line 
                                                type="monotone" 
                                                dataKey="CountNum" 
                                                name="Result Count" 
                                                stroke="#6366f1" 
                                                strokeWidth={3}
                                                dot={{ r: 6, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 8 }}
                                            />
                                        )}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', border: '2px dashed #f1f5f9', borderRadius: '12px', backgroundColor: '#fafafa' }}>
                                No historical data found for this task. Run the automation to start tracking.
                            </div>
                        )}
                    </div>
                )}
            </main>

            <Footer />
            <style jsx global>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .loader { border: 3px solid #f3f3f3; border-radius: 50%; border-top: 3px solid #2563eb; animation: spin 1s linear infinite; }
                .row-hover:hover { background-color: #fcfdfe; }
                .pag-btn:hover:not(:disabled) { background-color: #e2e8f0 !important; }
            `}</style>
        </div>
    );
}
