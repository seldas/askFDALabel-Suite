'use client';

export default function AgentView({ 
  activeTab 
}: { 
  activeTab: string;
}) {
  return (
    <div id="tox-view" className={`tab-content ${activeTab === 'tox-view' ? 'active' : ''}`} style={{ display: activeTab === 'tox-view' ? 'block' : 'none' }}>
        <div id="tox-index" style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button id="btn-agent-dili" className="agent-card">
                <h3 style={{ margin: 0, color: '#17a2b8', fontSize: '2em' }}>DILI</h3>
                <p style={{ margin: '10px 0 0', color: '#555' }}>Liver Injury</p>
            </button>
            <button id="btn-agent-dict" className="agent-card">
                <h3 style={{ margin: 0, color: '#dc3545', fontSize: '2em' }}>DICT</h3>
                <p style={{ margin: '10px 0 0', color: '#555' }}>Cardiotoxicity</p>
            </button>
            <button id="btn-agent-diri" className="agent-card">
                <h3 style={{ margin: 0, color: '#ffc107', fontSize: '2em' }}>DIRI</h3>
                <p style={{ margin: '10px 0 0', color: '#555' }}>Renal Injury</p>
            </button>
            <button id="btn-agent-pgx" className="agent-card">
                <h3 style={{ margin: 0, color: '#6610f2', fontSize: '2em' }}>PGx</h3>
                <p style={{ margin: '10px 0 0', color: '#555' }}>Genomics</p>
            </button>
            </div>
        </div>

        {/* DILI Module */}
        <div id="dili-module" style={{ display: 'none' }}>
            <div id="dili-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="dili-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
            <div id="dili-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3>Official Label Analysis</h3>
                    <div id="dili-label-signals"></div>
                </div>
                <div className="chart-card full-width">
                    <h3>FAERS Liver-Related Events</h3>
                    <div className="canvas-container" style={{ height: '400px' }}>
                        <canvas id="diliFaersChart"></canvas>
                    </div>
                </div>
            </div>
            <div id="dili-error" style={{ display: 'none' }}><p>Error loading DILI data.</p></div>
        </div>

        {/* DICT Module */}
        <div id="dict-module" style={{ display: 'none' }}>
            <div id="dict-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="dict-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
            <div id="dict-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3>Official Label Analysis</h3>
                    <div id="dict-label-signals"></div>
                </div>
                <div className="chart-card full-width">
                    <h3>FAERS Cardiac-Related Events</h3>
                    <div className="canvas-container" style={{ height: '400px' }}>
                        <canvas id="dictFaersChart"></canvas>
                    </div>
                </div>
            </div>
            <div id="dict-error" style={{ display: 'none' }}><p>Error loading DICT data.</p></div>
        </div>

        {/* DIRI Module */}
        <div id="diri-module" style={{ display: 'none' }}>
            <div id="diri-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="diri-risk-panel" style={{ display: 'none', marginBottom: '20px' }}></div>
            <div id="diri-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3>Official Label Analysis</h3>
                    <div id="diri-label-signals"></div>
                </div>
                <div className="chart-card full-width">
                    <h3>FAERS Renal-Related Events</h3>
                    <div className="canvas-container" style={{ height: '400px' }}>
                        <canvas id="diriFaersChart"></canvas>
                    </div>
                </div>
            </div>
            <div id="diri-error" style={{ display: 'none' }}><p>Error loading DIRI data.</p></div>
        </div>

        {/* PGx Module */}
        <div id="pgx-module" style={{ display: 'none' }}>
            <div id="pgx-loading" className="loader" style={{ display: 'none' }}></div>
            <div id="pgx-content" className="dashboard-grid" style={{ display: 'none' }}>
                <div className="chart-card full-width">
                    <h3>Pharmacogenomic Biomarkers</h3>
                    <div id="pgx-results-container"></div>
                </div>
            </div>
            <div id="pgx-error" style={{ display: 'none' }}><p>Error loading PGx data.</p></div>
        </div>
    </div>
  );
}
