'use client';

import { useState, useEffect } from 'react';
import { LabelData } from './types';

interface EmergingAe {
  term: string;
  count: number;
  prev_count: number;
  soc: string;
  hlt: string;
  soc_abbrev: string;
}

function EmergingAeAnalysis({ drugName }: { drugName?: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EmergingAe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (!drugName) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/dashboard/faers/emerging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drug_name: drugName })
      });
      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.error || 'Failed to fetch analysis');
      }
      const json = await resp.json();
      setData(json.emerging);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chart-card full-width" style={{ marginTop: '20px', borderTop: '2px solid #f1f5f9', paddingTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>🆕</span>
            <h3 style={{ margin: 0 }}>Emerging Adverse Events (New in Last 5 Years)</h3>
        </div>
        <button 
          onClick={runAnalysis} 
          disabled={loading || !drugName}
          className="button"
          style={{ 
            backgroundColor: loading ? '#94a3b8' : '#0071bc', 
            color: 'white', 
            padding: '10px 24px', 
            borderRadius: '12px',
            fontSize: '0.85rem',
            fontWeight: 800,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          {loading ? 'Analyzing...' : 'Run Emerging AE Scan'}
        </button>
      </div>
      
      <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '10px', maxWidth: '800px', lineHeight: '1.5' }}>
        This tool compares reports from the <strong>recent 5 years</strong> against reports from <strong>6-10 years ago</strong>. 
        It highlights MedDRA Preferred Terms that have appeared recently but were absent in the previous decade.
      </p>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '12px', borderRadius: '8px', marginTop: '16px', fontSize: '0.85rem' }}>
            <strong>Analysis Error:</strong> {error}
        </div>
      )}

      {data && (
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="coverage-table">
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Reaction Term (MedDRA PT)</th>
                <th style={{ padding: '12px' }}>Recent Count</th>
                <th style={{ padding: '12px' }}>SOC (System Organ Class)</th>
                <th style={{ padding: '12px' }}>HLT (High Level Term)</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? data.map((ae, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>{ae.term}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, color: '#334155' }}>
                        {ae.count}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>{ae.soc}</td>
                  <td style={{ padding: '12px', fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{ae.hlt}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>
                    No entirely new AE terms found in the recent period for this drug.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>
            Results enriched with MedDRA Hierarchy (MDHIER) data.
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
  drugName
}: { 
  activeTab: string;
  faersCoverageFilter: 'all' | 'not_presented';
  setFaersCoverageFilter: (filter: 'all' | 'not_presented') => void;
  drugName?: string;
}) {
  return (
    <div id="faers-view" className={`tab-content ${activeTab === 'faers-view' ? 'active' : ''}`} style={{ display: activeTab === 'faers-view' ? 'block' : 'none' }}>
        <div id="faers-loading" className="loader"></div>
        <div id="dashboard-content" className="dashboard-grid" style={{ display: 'none' }}>
            <div className="chart-card full-width">
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

            <EmergingAeAnalysis drugName={drugName} />

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
