'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

interface TestResult {
    task_num: number;
    version: string;
    url: string;
    query_details: string;
    status: string;
    time: number;
    content: string;
}

export default function WebTestingPage() {
    const [templates, setTemplates] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [taskId, setTaskId] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<TestResult[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    const logEndRef = useRef<HTMLDivElement>(null);
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
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    useEffect(() => {
        if (taskId && status === 'running') {
            const es = new EventSource(`/api/webtest/events/${taskId}`);
            eventSourceRef.current = es;

            es.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'init') {
                    setLogs(data.logs || []);
                    setResults(data.results || []);
                } else if (data.type === 'log') {
                    setLogs(prev => [...prev, data.data]);
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
                console.error("EventSource failed.");
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
            setLogs([]);
            setProgress(0);
            setError(null);

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Header />
            
            <main style={{ flex: 1, padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>Web Application Auto-Testing</h1>
                        <p style={{ color: '#64748b' }}>Interactive portal for running automated browser tests against FDALabel instances.</p>
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
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20V16"/></svg>
                        Test Configuration
                    </h2>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                                Select Testing Template (from server)
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
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                                Templates are loaded from <code>./frontend/public/webtest</code>
                            </p>
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

                {/* Status and Logs */}
                {(status !== 'idle' || taskId) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', marginBottom: '24px' }}>
                        {/* Results Table */}
                        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Real-time Results</h3>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }}>{progress}% Complete</div>
                            </div>
                            
                            <div style={{ height: '400px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                    <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                                        <tr>
                                            <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>#</th>
                                            <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>Version</th>
                                            <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>Task</th>
                                            <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>Status</th>
                                            <th style={{ padding: '12px 20px', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((res, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 20px' }}>{res.task_num}</td>
                                                <td style={{ padding: '12px 20px' }}><span style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{res.version}</span></td>
                                                <td style={{ padding: '12px 20px' }}>{res.query_details}</td>
                                                <td style={{ padding: '12px 20px' }}>
                                                    <span style={{ 
                                                        color: res.status === 'Success' ? '#059669' : '#dc2626',
                                                        fontWeight: 600
                                                    }}>
                                                        {res.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 20px' }}>{res.time}s</td>
                                            </tr>
                                        ))}
                                        {results.length === 0 && (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                                    Waiting for test results...
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Live Logs */}
                        <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '12px 16px', backgroundColor: '#334155', color: '#fff', fontSize: '0.875rem', fontWeight: 600 }}>
                                Live Execution Logs
                            </div>
                            <div style={{ 
                                flex: 1, 
                                padding: '16px', 
                                color: '#cbd5e1', 
                                fontFamily: 'monospace', 
                                fontSize: '0.75rem', 
                                overflowY: 'auto',
                                height: '400px'
                            }}>
                                {logs.map((log, i) => (
                                    <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        </div>
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
