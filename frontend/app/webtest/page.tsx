'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

interface TestResult {
    task_num: number;
    version: string;
    url: string;
    query_details: string;
    status: string;
    count: string;
    time_to_ready: number;
}

type SortConfig = {
    key: 'time_to_ready' | null;
    direction: 'asc' | 'desc' | null;
};

export default function WebTestingPage() {
    const [templates, setTemplates] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [totalTasks, setTotalTasks] = useState(0);
    const [results, setResults] = useState<TestResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // UI Features State
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

    useEffect(() => {
        if (selectedTemplate && status === 'idle') {
            const fetchInfo = async () => {
                try {
                    const res = await fetch(`/api/webtest/template_info?template_name=${encodeURIComponent(selectedTemplate)}`);
                    const data = await res.json();
                    if (data.tasks) {
                        setTotalTasks(data.total_tasks);
                        setResults(data.tasks);
                        setCurrentPage(1);
                        setVersionFilters([]); // Reset filters on new template
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
                    body: JSON.stringify({ url: results[i].url }),
                });
                const data = await response.json();
                setResults(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], status: data.status, count: data.count, time_to_ready: data.time };
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

    // Filtering, Sorting, and Pagination Logic
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

        return filtered;
    }, [results, versionFilters, sortConfig]);

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
                                        <th style={{ padding: '14px 20px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>Result Count</th>
                                        
                                        {/* Time to Ready with Sort */}
                                        <th 
                                            style={{ padding: '14px 20px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: sortConfig.key === 'time_to_ready' ? '#2563eb' : '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', cursor: 'pointer' }}
                                            onClick={() => toggleSort('time_to_ready')}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                Time to Ready
                                                <span style={{ fontSize: '0.8rem' }}>
                                                    {sortConfig.key === 'time_to_ready' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                </span>
                                            </div>
                                        </th>

                                        <th style={{ padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedResults.map((res) => (
                                        <tr key={res.task_num} style={{ borderBottom: '1px solid #f1f5f9' }} className="row-hover">
                                            <td style={{ padding: '14px 20px', color: '#94a3b8', fontWeight: 700 }}>{res.task_num}</td>
                                            <td style={{ 
                                                padding: '14px 20px', 
                                                fontWeight: 700, 
                                                color: '#1e293b',
                                                maxWidth: '300px',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }} title={res.query_details}>
                                                {res.query_details}
                                            </td>
                                            <td style={{ padding: '14px 20px' }}>
                                                {(() => {
                                                    const v = res.version.toLowerCase();
                                                    let styles = { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }; // Default Green
                                                    if (v.includes('test')) styles = { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' }; // Yellow
                                                    if (v.includes('dev')) styles = { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' }; // Red
                                                    
                                                    return (
                                                        <span style={{ 
                                                            backgroundColor: styles.bg, 
                                                            color: styles.text,
                                                            border: `1px solid ${styles.border}`,
                                                            padding: '2px 8px', 
                                                            borderRadius: '6px', 
                                                            fontSize: '0.7rem', 
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase'
                                                        }}>
                                                            {res.version}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td style={{ padding: '14px 20px' }}>
                                                <a 
                                                    href={res.url} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    style={{ 
                                                        color: '#2563eb', 
                                                        textDecoration: 'none', 
                                                        fontSize: '0.7rem', 
                                                        fontWeight: 600,
                                                        maxWidth: '250px',
                                                        display: 'inline-block',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}
                                                    title={res.url}
                                                >
                                                    {res.url}
                                                </a>
                                            </td>
                                            <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                                                <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1rem' }}>{res.count}</span>
                                            </td>
                                            <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                                                {res.time_to_ready > 0 ? (
                                                    <span style={{ color: res.time_to_ready > 15 ? '#ef4444' : (res.time_to_ready > 5 ? '#f59e0b' : '#10b981'), fontWeight: 800 }}>
                                                        {res.time_to_ready}s
                                                    </span>
                                                ) : <span style={{ color: '#e2e8f0' }}>&mdash;</span>}
                                            </td>
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', backgroundColor: res.status === 'Success' ? '#ecfdf5' : (res.status === 'pending' ? '#f8fafc' : '#fef2f2'), color: res.status === 'Success' ? '#059669' : (res.status === 'pending' ? '#94a3b8' : '#dc2626'), border: `1px solid ${res.status === 'Success' ? '#d1fae5' : (res.status === 'pending' ? '#e2e8f0' : '#fee2e2')}` }}>
                                                    {res.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
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
