'use client';

import { LabelData } from './types';

export default function FaersView({ 
  activeTab, 
  faersCoverageFilter, 
  setFaersCoverageFilter 
}: { 
  activeTab: string;
  faersCoverageFilter: 'all' | 'not_presented';
  setFaersCoverageFilter: (filter: 'all' | 'not_presented') => void;
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
