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
    content: string;
}

export default function WebTestingPage() {
    const [templates, setTemplates] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [taskId, setTaskId] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<TestResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const eventSourceRef = useRef<EventSource | null>(null);

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
        fetchTemplates();
    }, []);

    useEffect(() => {
        if (taskId && (status === 'running' || status === 'idle')) {
            const es = new EventSource(`/api/webtest/events/${taskId}`);
            eventSourceRef.current = es;

            es.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'init') {
                    setResults(data.results || []);
                } else if (data.type === 'progress') {
                    setProgress(data.data);
                } else if (data.type === 'result') {
                    setResults(prev => [...prev, data.data]);
                } else if (data.type === 'status') {
                    setStatus(data.data);
                    if (data.data === 'completed' || data.data === 'failed') {
                        es.close();
                    }
                }
            };

            es.onerror = () => {
                es.close();
            };

            return () => {
                es.close();
            };
        }
    }, [taskId, status]);

    const startTest = async () => {
        if (!selectedTemplate) {
            setError("Please select a testing template.");
            return;
        }

        try {
            setStatus('running');
            setResults([]);
            setProgress(0);
            setError(null);
            setCurrentPage(1);

            const response = await fetch('/api/webtest/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template_name: selectedTemplate }),
            });

            const data = await response.json();
            if (data.task_id) {
                setTaskId(data.task_id);
            } else {
                throw new Error(data.error || "Failed to start test");
            }
        } catch (err: any) {
            setError(err.message);
            setStatus('failed');
        }
    };

    const stopTest = async () => {
        if (!taskId) return;
        try {
            await fetch(`/api/webtest/stop/${taskId}`, { method: 'POST' });
        } catch (err) {
            console.error("Error stopping test", err);
        }
    };

    const downloadReport = () => {
        if (!taskId) return;
        window.location.href = `/api/webtest/report/${taskId}`;
    };

    // Pagination calculations
    const paginatedResults = useMemo(() => {
        const sorted = [...results].sort((a, b) => a.task_num - b.task_num);
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sorted.slice(startIndex, startIndex + itemsPerPage);
    }, [results, currentPage]);

    const totalPages = Math.ceil(results.length / itemsPerPage);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Header />
            
            <main style={{ flex: 1, padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>Web Application Auto-Testing</h1>
                        <p style={{ color: '#64748b' }}>Monitor FDALabel search result accuracy and system performance in real-time.</p>
                    </div>
                    <button 
                        onClick={fetchTemplates}
                        disabled={isRefreshing || status === 'running'}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>
                            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                        </svg>
                        Refresh Templates
                    </button>
                </div>

                {/* Configuration Panel */}
                <div style={{ 
                    background: '#fff', 
                    padding: '24px', 
                    borderRadius: '12px', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    marginBottom: '24px'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                                Select Performance Template
                            </label>
                            <select 
                                value={selectedTemplate}
                                onChange={(e) => setSelectedTemplate(e.target.value)}
                                disabled={status === 'running'}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    backgroundColor: '#fff',
                                    outline: 'none'
                                }}
                            >
                                {templates.length === 0 ? (
                                    <option value="">No templates found in /public/webtest</option>
                                ) : (
                                    templates.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))
                                )}
                            </select>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {status === 'running' ? (
                                <button 
                                    onClick={stopTest}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: '#ef4444',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Stop Testing
                                </button>
                            ) : (
                                <button 
                                    onClick={startTest}
                                    disabled={!selectedTemplate}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: selectedTemplate ? '#2563eb' : '#94a3b8',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: selectedTemplate ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    Start Automation
                                </button>
                            )}

                            {status === 'completed' && (
                                <button 
                                    onClick={downloadReport}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: '#10b981',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Download Results
                                </button>
                            )}
                        </div>
                    </div>
                    {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '12px' }}>{error}</p>}
                </div>

                {/* Results Table Section */}
                {(status !== 'idle' || taskId) && (
                    <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Extraction Results</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                                    Total: {results.length} tasks
                                </div>
                                <div style={{ width: '150px', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#2563eb', transition: 'width 0.3s ease' }}></div>
                                </div>
                                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#2563eb' }}>{progress}%</span>
                            </div>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead style={{ backgroundColor: '#f8fafc' }}>
                                    <tr>
                                        <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>#</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>Version</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>Task Details</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>Result Count</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>Time to Ready</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedResults.map((res, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 20px', fontWeight: 500 }}>{res.task_num}</td>
                                            <td style={{ padding: '12px 20px' }}><span style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{res.version}</span></td>
                                            <td style={{ padding: '12px 20px' }}>{res.query_details}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{res.count}</span>
                                            </td>
                                            <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                                                <span style={{ 
                                                    color: res.time_to_ready > 15 ? '#dc2626' : (res.time_to_ready > 5 ? '#d97706' : '#059669'),
                                                    fontWeight: 700
                                                }}>
                                                    {res.time_to_ready}s
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 20px' }}>
                                                <span style={{ 
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    backgroundColor: res.status === 'Success' ? '#ecfdf5' : '#fef2f2',
                                                    color: res.status === 'Success' ? '#059669' : '#dc2626'
                                                }}>
                                                    {res.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {results.length === 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                                Initializing testing environment...
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    style={{
                                        padding: '6px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '4px',
                                        backgroundColor: '#fff',
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === 1 ? 0.5 : 1
                                    }}
                                >
                                    Previous
                                </button>
                                
                                {[...Array(totalPages)].map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentPage(i + 1)}
                                        style={{
                                            padding: '6px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '4px',
                                            backgroundColor: currentPage === i + 1 ? '#2563eb' : '#fff',
                                            color: currentPage === i + 1 ? '#fff' : '#0f172a',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {i + 1}
                                    </button>
                                ))}

                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    style={{
                                        padding: '6px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '4px',
                                        backgroundColor: '#fff',
                                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === totalPages ? 0.5 : 1
                                    }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <Footer />
            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
