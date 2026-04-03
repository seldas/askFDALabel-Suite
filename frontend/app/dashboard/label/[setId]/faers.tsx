'use client';

import { useState, useEffect } from 'react';
import { LabelData } from './types';

interface LabelMatch {
  section: string;
  snippet: string;
}

interface AiMatch {
  term: string;
  found: boolean;
  section?: string;
  explanation: string;
}

interface EmergingAe {
  term: string;
  count: number;
  prev_count: number;
  soc: string;
  hlt: string;
  soc_abbrev: string;
  label_matches: LabelMatch[];
  ai_match?: AiMatch;
}

function EmergingAeAnalysis({ drugName, setId }: { drugName?: string, setId?: string }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [data, setData] = useState<EmergingAe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiMinCount, setAiMinCount] = useState(10);
  const [hasAiResult, setHasAiResult] = useState(false);

  useEffect(() => {
    if (setId && drugName) {
        checkExistingAiResults();
    }
  }, [setId, drugName]);

  const checkExistingAiResults = async () => {
    try {
        const resp = await fetch(`/api/dashboard/faers/ai_results?set_id=${setId}&drug_name=${encodeURIComponent(drugName || '')}`);
        const json = await resp.json();
        if (json.results) {
            setHasAiResult(true);
            setAiMinCount(json.min_count || 10);
            if (data) {
                applyAiResults(data, json.results);
            }
        }
    } catch (e) {
        console.error("Failed to check AI results", e);
    }
  };

  const applyAiResults = (currentData: EmergingAe[], aiResults: AiMatch[]) => {
    const updated = currentData.map(ae => {
        const aiMatch = aiResults.find(r => r.term.toUpperCase() === ae.term.toUpperCase());
        return { ...ae, ai_match: aiMatch };
    });
    setData(updated);
  };

  const runAnalysis = async () => {
    if (!drugName) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dashboard/faers/emerging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drug_name: drugName, set_id: setId })
      });
      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.error || 'Failed to fetch analysis');
      }
      const json = await resp.json();
      
      // If we have existing AI results, apply them now
      if (hasAiResult) {
          const aiResp = await fetch(`/api/dashboard/faers/ai_results?set_id=${setId}&drug_name=${encodeURIComponent(drugName || '')}`);
          const aiJson = await aiResp.json();
          if (aiJson.results) {
              applyAiResults(json.emerging, aiJson.results);
          } else {
              setData(json.emerging);
          }
      } else {
          setData(json.emerging);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runAiMatch = async () => {
    if (!data || !setId || !drugName) return;
    
    // Identify undocumented terms with count >= aiMinCount
    const targetTerms = data
        .filter(ae => ae.label_matches.length === 0 && ae.count >= aiMinCount)
        .map(ae => ({ term: ae.term, count: ae.count }));

    if (targetTerms.length === 0) {
        alert(`No undocumented terms found with report count >= ${aiMinCount}`);
        return;
    }

    setAiLoading(true);
    try {
        const resp = await fetch('/api/dashboard/faers/ai_rematch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                set_id: setId,
                drug_name: drugName,
                terms: targetTerms,
                min_count: aiMinCount
            })
        });
        if (!resp.ok) {
            const errJson = await resp.json();
            throw new Error(errJson.error || 'AI rematch failed');
        }
        const json = await resp.json();
        applyAiResults(data, json.results);
        setHasAiResult(true);
    } catch (err: any) {
        alert("AI Semantic Matching Error: " + err.message);
    } finally {
        setAiLoading(false);
    }
  };

  return (
    <div className="chart-card full-width" style={{ marginTop: '0', borderTop: 'none', paddingTop: '0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '16px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>🆕</span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Emerging Adverse Events (Last 5 Years Only)</h3>
        </div>
        <button 
          onClick={runAnalysis} 
          disabled={loading || !drugName}
          className="button"
          style={{ 
            backgroundColor: loading ? '#94a3b8' : '#0071bc', 
            color: 'white', 
            padding: '8px 20px', 
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: 800,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
          }}
        >
          {loading ? 'Analyzing...' : 'Run Emerging Scan'}
        </button>
      </div>

      <div style={{ 
          marginTop: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          background: '#eff6ff', 
          padding: '12px 20px', 
          borderRadius: '10px', 
          border: '1px solid #dbeafe' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🤖</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af' }}>AI Semantic Matcher</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#60a5fa' }}>Min Reports:</label>
                <input 
                    type="number" 
                    value={aiMinCount} 
                    onChange={(e) => setAiMinCount(parseInt(e.target.value) || 0)}
                    style={{ 
                        width: '60px', 
                        padding: '4px 8px', 
                        borderRadius: '6px', 
                        border: '1px solid #bfdbfe', 
                        fontSize: '0.75rem', 
                        fontWeight: 700 
                    }}
                />
            </div>
        </div>
        <button 
            onClick={runAiMatch}
            disabled={aiLoading || !data}
            style={{ 
                backgroundColor: aiLoading ? '#94a3b8' : '#3b82f6', 
                color: 'white', 
                padding: '6px 16px', 
                borderRadius: '6px', 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                border: 'none', 
                cursor: (aiLoading || !data) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}
        >
            {aiLoading ? 'Processing AI...' : (hasAiResult ? '🔄 AI Semantic Rematch' : '✨ AI Semantic Check')}
        </button>
      </div>
      
      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '12px', marginBottom: '20px', maxWidth: '900px', lineHeight: '1.5', padding: '0 4px' }}>
        Identifies reactions present in the <strong>recent 5 years</strong> of reports but absent in the previous 5 years. 
        String matching verifies exact label presence; <strong>AI Semantic Matcher</strong> uses LLMs to find undocumented terms mentioned via synonyms or clinical context.
      </p>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.8rem' }}>
            <strong>Analysis Error:</strong> {error}
        </div>
      )}

      {data && (
        <div className="table-container" style={{ marginTop: '0', overflowX: 'auto' }}>
          <table className="coverage-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', background: '#f1f5f9' }}>
                <th style={{ padding: '10px 12px', width: '22%' }}>Emerging AE (MedDRA PT)</th>
                <th style={{ padding: '10px 12px', width: '8%' }}>Reports</th>
                <th style={{ padding: '10px 12px', width: '18%' }}>SOC Hierarchy</th>
                <th style={{ padding: '10px 12px', width: '26%' }}>Direct Match Context</th>
                <th style={{ padding: '10px 12px', width: '26%' }}>AI Semantic Validation</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? data.map((ae, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>{ae.term}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, color: '#334155', fontSize: '0.75rem' }}>
                        {ae.count}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{ae.soc}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>{ae.hlt}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {ae.label_matches && ae.label_matches.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {ae.label_matches.map((match, mIdx) => (
                          <div key={mIdx} style={{ background: '#f0fdf4', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #22c55e' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534', marginBottom: '4px', textTransform: 'uppercase' }}>
                                Found in: {match.section}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#334155', lineHeight: 1.4, fontStyle: 'italic' }}>
                                "...{match.snippet}..."
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', background: '#fef2f2', padding: '6px 12px', borderRadius: '6px', width: 'fit-content', fontSize: '0.7rem', fontWeight: 800 }}>
                        <span style={{ fontSize: '1rem' }}>⚠</span> NOT FOUND (EXACT)
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {ae.ai_match ? (
                        <div style={{ 
                            background: ae.ai_match.found ? '#ecfdf5' : '#fff7ed', 
                            padding: '10px', 
                            borderRadius: '8px', 
                            border: `1px solid ${ae.ai_match.found ? '#10b981' : '#f97316'}` 
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.9rem' }}>{ae.ai_match.found ? '✅' : '❓'}</span>
                                <span style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: 800, 
                                    color: ae.ai_match.found ? '#065f46' : '#9a3412',
                                    textTransform: 'uppercase'
                                }}>
                                    {ae.ai_match.found ? `Semantic Match: ${ae.ai_match.section || 'General'}` : 'Still Undocumented'}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#334155', lineHeight: 1.4 }}>
                                {ae.ai_match.explanation}
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', padding: '10px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                            {ae.label_matches.length > 0 ? 'Verified by exact match' : (ae.count < aiMinCount ? 'Below AI count threshold' : 'Pending AI evaluation')}
                        </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>
                    No entirely new AE terms found in the recent period for this drug.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: '12px', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'right', fontWeight: 500 }}>
            Analysis Engine: Hybrid exact-string + semantic-AI. Results cached in project database.
          </div>
        </div>
      )}
    </div>
  );
}

export default function FaersView({ 
  activeTab, 
  faersCoverageFilter, 
  setFaersCoverageFilter,
  drugName,
  setId
}: { 
  activeTab: string;
  faersCoverageFilter: 'all' | 'not_presented';
  setFaersCoverageFilter: (filter: 'all' | 'not_presented') => void;
  drugName?: string;
  setId?: string;
}) {
  return (
    <div id="faers-view" className={`tab-content ${activeTab === 'faers-view' ? 'active' : ''}`} style={{ display: activeTab === 'faers-view' ? 'block' : 'none' }}>
        <div id="faers-loading" className="loader"></div>
        <div id="dashboard-content" className="dashboard-grid" style={{ display: 'none' }}>
            
            <EmergingAeAnalysis drugName={drugName} setId={setId} />

            {/* Hidden legacy coverage analysis as requested */}
            <div className="chart-card full-width" style={{ display: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <h3 style={{ margin: 0 }}>Label Coverage Analysis</h3>

                {/* Toggle */}
                <div
                    style={{
                    display: 'inline-flex',
                    gap: '4px',
                    padding: '4px',
                    background: '#f1f5f9',
                    borderRadius: '999px',
                    border: '1px solid #e2e8f0',
                    }}
                >
                    <button
                    type="button"
                    onClick={() => setFaersCoverageFilter('all')}
                    style={{
                        border: 'none',
                        cursor: 'pointer',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: faersCoverageFilter === 'all' ? 'white' : 'transparent',
                        boxShadow: faersCoverageFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                        color: faersCoverageFilter === 'all' ? '#0f172a' : '#64748b',
                    }}
                    >
                    All
                    </button>

                    <button
                    type="button"
                    onClick={() => setFaersCoverageFilter('not_presented')}
                    style={{
                        border: 'none',
                        cursor: 'pointer',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: faersCoverageFilter === 'not_presented' ? 'white' : 'transparent',
                        boxShadow: faersCoverageFilter === 'not_presented' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                        color: faersCoverageFilter === 'not_presented' ? '#0f172a' : '#64748b',
                    }}
                    >
                    Not Presented
                    </button>
                </div>
                </div>

                <div
                style={{
                    marginTop: '6px',
                    fontSize: '0.85rem',
                    color: '#475569',
                    fontWeight: 500
                }}
                >
                Note: For clarity, we exclude SOC-level terms and non-AE groupings (e.g., PRD, SMP) from the summary bar.
                </div>

                {/* SOC summary bar injected by faers.js */}
                <div id="soc-summary-bar" style={{ marginTop: '12px' }} />


                <div className="table-container">
                    <table id="coverageTable" className="coverage-table">
                        <thead>
                            <tr>
                            <th style={{ width: '50px' }}></th>
                            <th>Reaction</th>
                            <th>Count</th>
                            <th>SOC</th>
                            <th>HLT</th>
                            <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="coverageTable-body"></tbody>
                    </table>
                </div>
                <div className="pagination-controls" style={{ marginTop: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                        <button id="firstPage" className="button pagination-btn">&laquo;</button>
                        <button id="prevPage" className="button pagination-btn">&lsaquo;</button>
                        <input type="number" id="pageInput" defaultValue="1" style={{ width: '50px', textAlign: 'center' }} />
                        <span className="page-info">of <span id="totalPages">1</span></span>
                        <button id="nextPage" className="button pagination-btn">&rsaquo;</button>
                        <button id="lastPage" className="button pagination-btn">&raquo;</button>
                </div>
            </div>

            <div className="chart-card full-width">
                <h3>Adverse Events Trends (Time Series)</h3>
                <div className="canvas-container" style={{ height: '400px' }}>
                    <canvas id="trendComparisonChart"></canvas>
                </div>
            </div>
        </div>
    </div>
  );
}
