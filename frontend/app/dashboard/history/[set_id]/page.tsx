'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import '../../../globals.css';
import { withAppBase } from '../../../utils/appPaths';

interface HistoryRecord {
    spl_id: string;
    set_id: string;
    product_names: string;
    generic_names: string;
    revised_date: string;
    version_number: number;
    is_latest: boolean;
    has_analysis: boolean;
    executive_summary: string | null;
    is_regulatory_notable: boolean;
    last_analyzed_at: string | null;
}

interface DiffItem {
    key: string;
    title: string;
    diff_new: string;
    diff_old: string;
    is_addition: boolean;
    is_deletion: boolean;
}

const HistoryTrackPage = () => {
    const params = useParams();
    const set_id = params.set_id as string;
    const router = useRouter();

    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDiffLoading, setIsDiffLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedSplId, setSelectedSplId] = useState<string | null>(null);
    const [diffResults, setDiffResults] = useState<DiffItem[]>([]);

    const fetchHistory = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/history/${set_id}`);
            const data = await res.json();
            if (data.results) {
                setHistory(data.results);
                if (data.results.length > 0 && !selectedSplId) {
                    setSelectedSplId(data.results[0].spl_id);
                }
            } else if (data.error) {
                setError(data.error);
            }
        } catch (err) {
            console.error("History fetch error", err);
            setError("Failed to load version history.");
        } finally {
            setIsLoading(false);
        }
    }, [set_id, selectedSplId]);

    // Fetch lineage
    useEffect(() => {
        if (set_id) fetchHistory();
    }, [set_id, fetchHistory]);

    const handleAnalyze = async () => {
        if (!selectedSplId || !previousRecord) return;
        
        setIsAnalyzing(true);
        try {
            const res = await fetch('/api/history/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_spl_id: selectedSplId,
                    previous_spl_id: previousRecord.spl_id,
                    force_refresh: true
                })
            });
            const data = await res.json();
            if (data.success) {
                // Refresh history to show the summary
                await fetchHistory();
            } else {
                alert("Analysis failed: " + (data.error || "Unknown error"));
            }
        } catch (err) {
            console.error("Analysis trigger error", err);
            alert("Failed to start analysis.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const activeRecord = useMemo(() => 
        history.find(h => h.spl_id === selectedSplId), 
    [history, selectedSplId]);

    const previousRecord = useMemo(() => {
        if (!selectedSplId) return null;
        const idx = history.findIndex(h => h.spl_id === selectedSplId);
        if (idx < history.length - 1) {
            return history[idx + 1]; // sorted DESC, so NEXT is older
        }
        return null;
    }, [history, selectedSplId]);

    // Fetch diff whenever selectedSplId changes
    useEffect(() => {
        const fetchDiff = async () => {
            if (!selectedSplId || !previousRecord) {
                setDiffResults([]);
                return;
            }
            setIsDiffLoading(true);
            try {
                const res = await fetch(`/api/history/diff/${selectedSplId}/${previousRecord.spl_id}`);
                const data = await res.json();
                if (data.diff) {
                    setDiffResults(data.diff);
                } else {
                    setDiffResults([]);
                }
            } catch (err) {
                console.error("Diff fetch error", err);
            } finally {
                setIsDiffLoading(false);
            }
        };
        fetchDiff();
    }, [selectedSplId, previousRecord]);

    if (isLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <Header />
                <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="loader"></div>
                </main>
                <Footer />
            </div>
        );
    }

    if (error || history.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <Header />
                <main style={{ flex: 1, padding: '40px', textAlign: 'center' }}>
                    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>History Not Found</h2>
                        <p style={{ color: '#64748b' }}>{error || "No version history exists for this SetID in the local archive."}</p>
                        <button 
                            onClick={() => router.back()}
                            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Go Back
                        </button>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Header />

            <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 120px)' }}>
                {/* SIDEBAR TIMELINE */}
                <aside style={{ 
                    width: '320px', 
                    borderRight: '1px solid #e2e8f0', 
                    backgroundColor: '#fff', 
                    display: 'flex', 
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>Version Timeline</h2>
                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>{history[0].product_names?.split(';')[0]}</p>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                        <div style={{ position: 'relative', paddingLeft: '40px' }}>
                            {/* The vertical line */}
                            <div style={{ 
                                position: 'absolute', 
                                left: '24px', 
                                top: '20px', 
                                bottom: '20px', 
                                width: '2px', 
                                backgroundColor: '#e2e8f0' 
                            }}></div>

                            {history.map((record, i) => (
                                <div 
                                    key={record.spl_id}
                                    onClick={() => setSelectedSplId(record.spl_id)}
                                    style={{
                                        position: 'relative',
                                        padding: '16px 20px 16px 0',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {/* The Node Dot */}
                                    <div style={{
                                        position: 'absolute',
                                        left: '-22px',
                                        top: '22px',
                                        width: '14px',
                                        height: '14px',
                                        borderRadius: '50%',
                                        backgroundColor: selectedSplId === record.spl_id ? '#1e40af' : '#fff',
                                        border: `2px solid ${selectedSplId === record.spl_id ? '#1e40af' : '#cbd5e1'}`,
                                        zIndex: 2,
                                        boxShadow: selectedSplId === record.spl_id ? '0 0 0 4px rgba(30, 64, 175, 0.1)' : 'none'
                                    }}></div>

                                    <div style={{
                                        padding: '12px',
                                        borderRadius: '8px',
                                        backgroundColor: selectedSplId === record.spl_id ? '#eff6ff' : 'transparent',
                                        border: `1px solid ${selectedSplId === record.spl_id ? '#bfdbfe' : 'transparent'}`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ 
                                                fontSize: '0.85rem', 
                                                fontWeight: 700, 
                                                color: selectedSplId === record.spl_id ? '#1e40af' : '#334155' 
                                            }}>
                                                v{record.version_number} {record.is_latest && <span style={{ fontSize: '0.7rem', color: '#10b981', marginLeft: '4px' }}>● LATEST</span>}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{record.revised_date}</span>
                                        </div>
                                        {record.has_analysis && (
                                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                                                <div style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    backgroundColor: record.is_regulatory_notable ? '#fee2e2' : '#f1f5f9', 
                                                    color: record.is_regulatory_notable ? '#dc2626' : '#64748b',
                                                    borderRadius: '4px',
                                                    fontWeight: 600
                                                }}>
                                                    {record.is_regulatory_notable ? '⚠️ MAJOR' : 'MINORE'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT AREA */}
                <main style={{ flex: 1, backgroundColor: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ 
                        padding: '20px 40px', 
                        borderBottom: '1px solid #f1f5f9', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        position: 'sticky',
                        top: 0,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 10
                    }}>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                                Version Comparison
                            </h1>
                            <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
                                Comparing <strong>v{activeRecord?.version_number}</strong> ({activeRecord?.revised_date}) 
                                {previousRecord ? (
                                    <> vs <strong>v{previousRecord.version_number}</strong> ({previousRecord.revised_date})</>
                                ) : (
                                    <> (Initial Version)</>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => window.open(withAppBase(`/dashboard/label/${activeRecord?.set_id}?spl_id=${activeRecord?.spl_id}`), '_blank')}
                                style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                Full XML
                            </button>
                            <button 
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !previousRecord}
                                style={{ 
                                    padding: '8px 16px', 
                                    backgroundColor: isAnalyzing ? '#94a3b8' : '#1e40af', 
                                    color: '#fff', 
                                    border: 'none', 
                                    borderRadius: '8px', 
                                    fontWeight: 600, 
                                    fontSize: '0.85rem', 
                                    cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isAnalyzing ? 'Analyzing...' : 'Analyze Changes 🚀'}
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: '40px' }}>
                        {activeRecord?.has_analysis && activeRecord.executive_summary && (
                            <div style={{ 
                                backgroundColor: '#fffbeb', 
                                border: '1px solid #fde68a', 
                                borderRadius: '12px', 
                                padding: '24px',
                                marginBottom: '30px',
                                position: 'relative'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>✨</span>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        AI Change Summary
                                    </h3>
                                </div>
                                <p style={{ color: '#92400e', lineHeight: 1.6, fontSize: '0.95rem' }}>
                                    {activeRecord.executive_summary}
                                </p>
                            </div>
                        )}

                        {!previousRecord ? (
                            <div style={{ padding: '100px 0', textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🚀</div>
                                <h2 style={{ color: '#1e293b', fontSize: '1.25rem' }}>Initial Label Version</h2>
                                <p style={{ color: '#64748b', maxWidth: '400px', margin: '10px auto' }}>
                                    This is the earliest recorded version for this product in our archive. No previous versions available for comparison.
                                </p>
                            </div>
                        ) : isDiffLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
                                <div className="loader"></div>
                            </div>
                        ) : diffResults.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '100px 0', color: '#64748b' }}>
                                <h3 style={{ fontSize: '1.1rem' }}>No Substantive Changes Detected</h3>
                                <p>This version update appears to be purely administrative or formatting-related.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                                {diffResults.map((item) => (
                                    <div key={item.key} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                        <div style={{ 
                                            backgroundColor: '#f8fafc', 
                                            padding: '12px 20px', 
                                            borderBottom: '1px solid #e2e8f0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                                                {item.title}
                                            </h3>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                                                {item.is_addition ? 'NEW SECTION' : item.is_deletion ? 'REMOVED SECTION' : 'MODIFIED'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', minHeight: '100px' }}>
                                            <div style={{ 
                                                flex: 1, 
                                                padding: '20px', 
                                                backgroundColor: '#fff', 
                                                borderRight: '1px solid #f1f5f9',
                                                fontSize: '0.9rem',
                                                lineHeight: 1.6,
                                                color: '#475569'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 700 }}>PREVIOUS (v{previousRecord?.version_number})</div>
                                                <div 
                                                    className="diff-content diff-old"
                                                    dangerouslySetInnerHTML={{ __html: item.diff_old || '<i style="color: #cbd5e1">Section did not exist</i>' }}
                                                />
                                            </div>
                                            <div style={{ 
                                                flex: 1, 
                                                padding: '20px', 
                                                backgroundColor: '#fff',
                                                fontSize: '0.9rem',
                                                lineHeight: 1.6,
                                                color: '#0f172a'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 700 }}>CURRENT (v{activeRecord?.version_number})</div>
                                                <div 
                                                    className="diff-content diff-new"
                                                    dangerouslySetInnerHTML={{ __html: item.diff_new || '<i style="color: #cbd5e1">Section removed</i>' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <Footer />
        </div>
    );
};

export default HistoryTrackPage;
