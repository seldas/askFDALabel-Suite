"use client"
import React, { useState, useEffect } from 'react';
import Header from "../components/Header";
import Footer from '../components/Footer';
import "../globals.css";
import { withAppBase, withApiBase } from '../utils/appPaths';

interface LocalQueryResult {
    set_id: string;
    brand_name: string;
    generic_name: string;
    manufacturer: string;
    appr_num: string;
    ndc: string;
    revised_date: string;
    market_category: string;
    doc_type: string;
    source: string;
}

const LocalQueryPage = () => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [userWantsSuggestions, setUserWantsSuggestions] = useState(true);
    const [results, setResults] = useState<LocalQueryResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [humanRxOnly, setHumanRxOnly] = useState(false);
    const [rldOnly, setRldOnly] = useState(false);

    // Debounced Autocomplete
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (query.trim().length < 2 || !userWantsSuggestions) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }

            try {
                const res = await fetch(`/api/localquery/autocomplete?query=${encodeURIComponent(query)}&human_rx_only=${humanRxOnly}&rld_only=${rldOnly}`);
                const data = await res.json();
                if (data.suggestions) {
                    setSuggestions(data.suggestions);
                    setShowSuggestions(data.suggestions.length > 0);
                }
            } catch (err) {
                console.error("Autocomplete fetch error", err);
            }
        };

        const timeoutId = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timeoutId);
    }, [query, userWantsSuggestions]);

    const handleSearch = async (e?: React.FormEvent, selectedQuery?: string) => {
        if (e) e.preventDefault();
        const finalQuery = selectedQuery || query;
        if (!finalQuery.trim()) return;

        setQuery(finalQuery);
        setShowSuggestions(false);
        setUserWantsSuggestions(false); // Disable suggestions after a search is triggered
        setIsLoading(true);
        setHasSearched(true);
        try {
            const response = await fetch(`/api/localquery/search?query=${encodeURIComponent(finalQuery)}&human_rx_only=${humanRxOnly}&rld_only=${rldOnly}`);
            const data = await response.json();
            if (data.results) {
                setResults(data.results);
            } else {
                setResults([]);
            }
        } catch (error) {
            console.error("Local search error:", error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (val: string) => {
        setQuery(val);
        setUserWantsSuggestions(true); // Re-enable suggestions when user types
    };

    const handleRandom = async () => {
        setIsLoading(true);
        setHasSearched(true);
        setQuery('');
        setUserWantsSuggestions(false);
        try {
            const response = await fetch(`/api/localquery/random?human_rx_only=${humanRxOnly}&rld_only=${rldOnly}`);
            const data = await response.json();
            if (data.results) {
                setResults(data.results);
            }
        } catch (error) {
            console.error("Random fetch error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = () => {
        if (results.length === 0) {
            alert("No results to export.");
            return;
        }
        const setIds = results.map(r => r.set_id).join(',');
        window.location.href = withApiBase(`/api/localquery/export?set_ids=${encodeURIComponent(setIds)}`);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Header />
            
            <main style={{ flex: 1, padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                <div style={{ marginBottom: '40px', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
                        Label Archive
                    </h1>
                    <div style={{ 
                        maxWidth: '800px', 
                        margin: '0 auto', 
                        padding: '15px 25px', 
                        backgroundColor: '#fffbeb', 
                        border: '1px solid #fef3c7', 
                        borderRadius: '12px',
                        color: '#92400e',
                        fontSize: '0.95rem',
                        lineHeight: '1.5'
                    }}>
                        <p style={{ fontWeight: 700, marginBottom: '5px' }}>⚠️ Development Use Only</p>
                        <p>
                            This is a <strong>static labeling repository</strong> intended for rapid local testing and development.
                            It contains a snapshot of FDA labeling data last updated on <strong>February 27, 2026</strong>.
                            Newer updates published after this date are not reflected in this local index.
                        </p>                    </div>
                </div>

                <div style={{ 
                    background: '#fff', 
                    padding: '30px', 
                    borderRadius: '16px', 
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    marginBottom: '30px',
                    position: 'relative' // For absolute positioning of suggestions
                }}>
                    <form onSubmit={(e) => handleSearch(e)} style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <input 
                                type="text" 
                                value={query}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onFocus={() => suggestions.length > 0 && userWantsSuggestions && setShowSuggestions(true)}
                                placeholder="Enter Generic name, Brand name, Set ID, or App #..."
                                style={{
                                    width: '100%',
                                    padding: '14px 20px',
                                    borderRadius: '10px',
                                    border: '2px solid #e2e8f0',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                            {showSuggestions && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: '#fff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    marginTop: '4px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    zIndex: 100,
                                    maxHeight: '300px',
                                    overflowY: 'auto'
                                }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        padding: '8px 20px',
                                        borderBottom: '1px solid #f1f5f9',
                                        backgroundColor: '#f8fafc'
                                    }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Suggestions</span>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowSuggestions(false);
                                                setUserWantsSuggestions(false);
                                            }}
                                            style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: '#ef4444',
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '4px 8px',
                                                borderRadius: '4px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            Close ✕
                                        </button>
                                    </div>
                                    {suggestions.map((s, i) => (
                                        <div 
                                            key={i}
                                            onClick={() => handleSearch(undefined, s)}
                                            style={{
                                                padding: '10px 20px',
                                                cursor: 'pointer',
                                                borderBottom: i === suggestions.length - 1 ? 'none' : '1px solid #f1f5f9',
                                                fontSize: '0.95rem'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                                        >
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button 
                            type="submit" 
                            disabled={isLoading || !query.trim()}
                            style={{
                                padding: '0 30px',
                                backgroundColor: '#2563eb',
                                color: '#fff',
                                borderRadius: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: 'none',
                                height: '52px',
                                transition: 'background-color 0.2s'
                            }}
                        >
                            {isLoading && query ? 'Searching...' : 'Search'}
                        </button>
                        <button 
                            type="button"
                            onClick={handleRandom}
                            disabled={isLoading}
                            style={{
                                padding: '0 20px',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                borderRadius: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: '1px solid #e2e8f0',
                                height: '52px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 18h2c4.3 0 6-7 10-7h2"></path>
                                <path d="M2 6h2c4.3 0 6 7 10 7h2"></path>
                                <path d="m18 9 3 3-3 3"></path>
                                <path d="m18 3 3 3-3 3"></path>
                                <path d="M22 18h-4"></path>
                            </svg>
                            {isLoading && !query ? 'Fetching...' : 'Quick Access'}
                        </button>
                    </form>

                    <div style={{ display: 'flex', gap: '30px', marginTop: '20px', paddingLeft: '5px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.95rem', color: '#334155', fontWeight: 700 }}>
                            <input 
                                type="checkbox" 
                                checked={humanRxOnly} 
                                onChange={(e) => setHumanRxOnly(e.target.checked)}
                                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            Human Prescription Only
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.95rem', color: '#334155', fontWeight: 700 }}>
                            <input 
                                type="checkbox" 
                                checked={rldOnly} 
                                onChange={(e) => setRldOnly(e.target.checked)}
                                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            RLD / RS Only
                        </label>
                    </div>
                </div>

                {hasSearched && (
                    <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                                    Results ({results.length})
                                </h2>
                                {results.length > 0 && (
                                    <button 
                                        onClick={handleExport}
                                        style={{
                                            padding: '8px 16px',
                                            backgroundColor: '#10b981',
                                            color: '#fff',
                                            borderRadius: '8px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            border: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                        Export to Dashboard
                                    </button>
                                )}
                            </div>
                            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                Source: Local Label Database
                            </span>
                        </div>

                        {results.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ backgroundColor: '#f8fafc', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <tr>
                                            <th style={{ padding: '12px 20px' }}>Product / Generic</th>
                                            <th style={{ padding: '12px 20px' }}>Manufacturer</th>
                                            <th style={{ padding: '12px 20px' }}>App # / NDC</th>
                                            <th style={{ padding: '12px 20px' }}>Date</th>
                                            <th style={{ padding: '12px 20px' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ fontSize: '0.9rem', color: '#334155' }}>
                                        {results.map((r, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{ fontWeight: 700, color: '#1e40af' }}>{r.brand_name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.generic_name}</div>
                                                </td>
                                                <td style={{ padding: '16px 20px' }}>{r.manufacturer}</td>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div>{r.appr_num}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.ndc}</div>
                                                </td>
                                                <td style={{ padding: '16px 20px' }}>{r.revised_date}</td>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <a 
                                                        href={withAppBase(`/dashboard/label/${r.set_id}`)} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        style={{ 
                                                            color: '#2563eb', 
                                                            textDecoration: 'none', 
                                                            fontWeight: 600,
                                                            padding: '6px 12px',
                                                            borderRadius: '6px',
                                                            backgroundColor: '#eff6ff',
                                                            display: 'inline-block'
                                                        }}
                                                    >
                                                        View Analysis ↗
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                                {isLoading ? 'Searching...' : 'No matching labels found in the local database.'}
                            </div>
                        )}
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default LocalQueryPage;
