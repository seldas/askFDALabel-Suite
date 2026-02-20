'use client';

import { LabelData } from './types';

export default function AgentView({ 
  data,
  activeTab 
}: { 
  data: LabelData;
  activeTab: string;
}) {
  const tox = data.tox_summary;

  return (
    <div id="tox-view" className={`tab-content ${activeTab === 'tox-view' ? 'active' : ''}`} style={{ display: activeTab === 'tox-view' ? 'block' : 'none' }}>
        
        {/* CONSOLIDATED SAFETY DASHBOARD */}
        <div id="tox-index" style={{ padding: '0 0 30px 0' }}>
            <div style={{ 
                background: 'white', 
                padding: '30px', 
                borderRadius: '16px', 
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)', 
                border: '1px solid #f1f5f9',
                marginBottom: '30px'
            }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: '#fef2f2', padding: '8px', borderRadius: '10px' }}>🛡️</span>
                    Safety Intelligence Dashboard
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '24px' }}>
                    Consolidated safety signals from Official Labeling, FAERS Adverse Event reports, and AI-driven clinical analysis.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    
                    {/* LIVER SAFETY CARD */}
                    <button id="btn-agent-dili" className="agent-card-modern" style={{ position: 'relative', textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                            <div style={{ background: '#ecfeff', color: '#0891b2', padding: '10px', borderRadius: '12px', fontSize: '1.5rem' }}>🧪</div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liver Safety</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>DILI</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: tox.dili ? '#059669' : '#94a3b8' }}>{tox.dili ? '●' : '○'}</span>
                                Label Analysis {tox.dili ? 'Available' : 'Pending'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: '#0891b2' }}>●</span>
                                FAERS Monitoring
                            </div>
                        </div>
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0891b2' }}>VIEW DETAILS →</span>
                            {tox.dili && <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>CONSULTED</span>}
                        </div>
                    </button>

                    {/* CARDIAC SAFETY CARD */}
                    <button id="btn-agent-dict" className="agent-card-modern" style={{ position: 'relative', textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                            <div style={{ background: '#fff1f2', color: '#e11d48', padding: '10px', borderRadius: '12px', fontSize: '1.5rem' }}>❤️</div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cardiac Safety</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>DICT</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: tox.dict ? '#059669' : '#94a3b8' }}>{tox.dict ? '●' : '○'}</span>
                                Label Analysis {tox.dict ? 'Available' : 'Pending'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: '#e11d48' }}>●</span>
                                FAERS Monitoring
                            </div>
                        </div>
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e11d48' }}>VIEW DETAILS →</span>
                            {tox.dict && <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>CONSULTED</span>}
                        </div>
                    </button>

                    {/* RENAL SAFETY CARD */}
                    <button id="btn-agent-diri" className="agent-card-modern" style={{ position: 'relative', textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                            <div style={{ background: '#fffbeb', color: '#d97706', padding: '10px', borderRadius: '12px', fontSize: '1.5rem' }}>💧</div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Renal Safety</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>DIRI</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: tox.diri ? '#059669' : '#94a3b8' }}>{tox.diri ? '●' : '○'}</span>
                                Label Analysis {tox.diri ? 'Available' : 'Pending'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: '#d97706' }}>●</span>
                                FAERS Monitoring
                            </div>
                        </div>
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706' }}>VIEW DETAILS →</span>
                            {tox.diri && <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>CONSULTED</span>}
                        </div>
                    </button>

                    {/* PGX CARD */}
                    <button id="btn-agent-pgx" className="agent-card-modern" style={{ position: 'relative', textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                            <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '10px', borderRadius: '12px', fontSize: '1.5rem' }}>🧬</div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Genomics</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>PGx</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: '#7c3aed' }}>●</span>
                                Biomarker Search
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                <span style={{ color: '#94a3b8' }}>○</span>
                                FDA Table Sync
                            </div>
                        </div>
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed' }}>VIEW DETAILS →</span>
                        </div>
                    </button>

                </div>
            </div>
        </div>

        {/* DILI Module */}
        <div id="dili-module" style={{ display: 'none', marginBottom: '40px' }}>
            <div id="dili-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
            <div id="dili-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="dili-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #ecfeff', paddingBottom: '10px' }}>Official Label Analysis</h3>
                    <div id="dili-label-signals"></div>
                </div>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #ecfeff', paddingBottom: '10px' }}>FAERS Liver-Related Events</h3>
                    <div className="canvas-container" style={{ height: '400px' }}>
                        <canvas id="diliFaersChart"></canvas>
                    </div>
                </div>
            </div>
            <div id="dili-error" style={{ display: 'none' }}><p>Error loading DILI data.</p></div>
        </div>

        {/* DICT Module */}
        <div id="dict-module" style={{ display: 'none', marginBottom: '40px' }}>
            <div id="dict-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
            <div id="dict-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="dict-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #fff1f2', paddingBottom: '10px' }}>Official Label Analysis</h3>
                    <div id="dict-label-signals"></div>
                </div>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #fff1f2', paddingBottom: '10px' }}>FAERS Cardiac-Related Events</h3>
                    <div className="canvas-container" style={{ height: '400px' }}>
                        <canvas id="dictFaersChart"></canvas>
                    </div>
                </div>
            </div>
            <div id="dict-error" style={{ display: 'none' }}><p>Error loading DICT data.</p></div>
        </div>

        {/* DIRI Module */}
        <div id="diri-module" style={{ display: 'none', marginBottom: '40px' }}>
            <div id="diri-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
            <div id="diri-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="diri-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #fffbeb', paddingBottom: '10px' }}>Official Label Analysis</h3>
                    <div id="diri-label-signals"></div>
                </div>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #fffbeb', paddingBottom: '10px' }}>FAERS Renal-Related Events</h3>
                    <div className="canvas-container" style={{ height: '400px' }}>
                        <canvas id="diriFaersChart"></canvas>
                    </div>
                </div>
            </div>
            <div id="diri-error" style={{ display: 'none' }}><p>Error loading DIRI data.</p></div>
        </div>

        {/* PGx Module */}
        <div id="pgx-module" style={{ display: 'none', marginBottom: '40px' }}>
            <div id="pgx-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="pgx-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3 style={{ borderBottom: '2px solid #f5f3ff', paddingBottom: '10px' }}>Pharmacogenomic Biomarkers</h3>
                    <div id="pgx-results-container"></div>
                </div>
            </div>
            <div id="pgx-error" style={{ display: 'none' }}><p>Error loading PGx data.</p></div>
        </div>

        <style jsx>{`
            .agent-card-modern:hover {
                transform: translateY(-4px);
                border-color: #cbd5e1 !important;
                box-shadow: 0 10px 25px rgba(0,0,0,0.06);
            }
            .agent-card-modern:active {
                transform: translateY(0);
            }
        `}</style>
    </div>
  );
}
