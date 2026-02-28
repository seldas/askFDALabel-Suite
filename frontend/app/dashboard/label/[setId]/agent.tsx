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
                borderRadius: '4px', 
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', 
                border: '1px solid #e2e8f0',
                marginBottom: '30px'
            }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #1e293b', paddingBottom: '10px' }}>
                    Safety Signals Summary
                </h2>
                <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '24px', maxWidth: '800px' }}>
                    Consolidated safety signals derived from official FDA labeling and FAERS adverse event reports.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                    
                    {/* LIVER SAFETY CARD */}
                    <button id="btn-agent-dili" className="agent-card-science" style={{ textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderTop: '4px solid #0891b2', borderRadius: '4px', padding: '20px', cursor: 'pointer', transition: 'background 0.1s' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>DILI</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Drug-Induced Liver Injury</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Label Analysis:</span>
                                <span style={{ fontWeight: 700, color: tox.dili ? '#0f172a' : '#94a3b8' }}>{tox.dili ? 'DETECTED' : 'None'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>FAERS Monitoring:</span>
                                <span style={{ fontWeight: 700, color: '#0891b2' }}>Active</span>
                            </div>

                        </div>
                    </button>

                    {/* CARDIAC SAFETY CARD */}
                    <button id="btn-agent-dict" className="agent-card-science" style={{ textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderTop: '4px solid #e11d48', borderRadius: '4px', padding: '20px', cursor: 'pointer', transition: 'background 0.1s' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>DICT</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Drug-Induced Cardiotoxicity</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Label Analysis:</span>
                                <span style={{ fontWeight: 700, color: tox.dict ? '#0f172a' : '#94a3b8' }}>{tox.dict ? 'DETECTED' : 'None'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>FAERS Monitoring:</span>
                                <span style={{ fontWeight: 700, color: '#0891b2' }}>Active</span>
                            </div>
                        </div>
                    </button>

                    {/* RENAL SAFETY CARD */}
                    <button id="btn-agent-diri" className="agent-card-science" style={{ textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderTop: '4px solid #d97706', borderRadius: '4px', padding: '20px', cursor: 'pointer', transition: 'background 0.1s' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>DIRI</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Drug-Induced Renal Injury</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Label Analysis:</span>
                                <span style={{ fontWeight: 700, color: tox.diri ? '#0f172a' : '#94a3b8' }}>{tox.diri ? 'DETECTED' : 'None'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>FAERS Monitoring:</span>
                                <span style={{ fontWeight: 700, color: '#0891b2' }}>Active</span>
                            </div>
                        </div>
                    </button>

                    {/* PGX CARD */}
                    <button id="btn-agent-pgx" className="agent-card-science" style={{ textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderTop: '4px solid #7c3aed', borderRadius: '4px', padding: '20px', cursor: 'pointer', transition: 'background 0.1s' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>PGx</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Pharmacogenomics</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>FAERS Monitoring:</span>
                                <span style={{ fontWeight: 700, color: '#0891b2' }}>Active</span>
                            </div>
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
                    <div id="diliFaersCloud" style={{ minHeight: '300px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', padding: '20px', gap: '10px' }}>
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
                    <div id="dictFaersCloud" style={{ minHeight: '300px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', padding: '20px', gap: '10px' }}>
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
                    <div id="diriFaersCloud" style={{ minHeight: '300px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', padding: '20px', gap: '10px' }}>
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
