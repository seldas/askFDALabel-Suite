'use client';

import styles from './FaersView.module.css';
import './agents_style.module.css'

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
    <div id="faers-view" className={`${styles.faersView} ${activeTab === 'faers-view' ? 'active' : ''}`} style={{ display: activeTab === 'faers-view' ? 'flex' : 'none' }}>
        <div id="faers-loading" className="loader" style={{ margin: '40px auto' }}></div>
        <div id="dashboard-content" className={styles.dashboardGrid} style={{ display: 'none' }}>
            <div className={`${styles.chartCard} ${styles.fullWidth}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Label Coverage Analysis</h3>

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


            <div className={styles.tableContainer}>
                <table id="coverageTable">
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
            <div className={styles.paginationControls}>
                    <button id="firstPage" className="pagination-btn">&laquo;</button>
                    <button id="prevPage" className="pagination-btn">&lsaquo;</button>
                    <input type="number" id="pageInput" defaultValue="1" />
                    <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>of <span id="totalPages">1</span></span>
                    <button id="nextPage" className="pagination-btn">&rsaquo;</button>
                    <button id="lastPage" className="pagination-btn">&raquo;</button>
            </div>
            </div>
            <div className={`${styles.chartCard} ${styles.fullWidth}`}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: 800 }}>Adverse Events Trends (Time Series)</h3>
                <div style={{ height: '400px', width: '100%' }}>
                    <canvas id="trendComparisonChart"></canvas>
                </div>
            </div>
        </div>
    </div>
  );
}
