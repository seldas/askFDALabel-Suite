'use client';

import { useState, useEffect } from 'react';

interface PeerItem {
  term: string;
  count: number;
}

interface PeerCounts {
  names: PeerItem[];
  epcs: PeerItem[];
  source: string;
}

interface MatrixRow {
  term: string;
  soc: string;
  target: 'B' | 'W' | 'A' | 'N';
  consensus: 'B' | 'W' | 'A' | 'N';
  coverage: string;
  peers: ('B' | 'W' | 'A' | 'N')[];
  is_discrepancy: boolean;
}

interface Anomaly {
  term: string;
  soc: string;
  target_code: string;
  consensus_code: string;
  peer_coverage: number;
  peer_max_level: number;
  note?: string;
  weight: number;
}

interface TieredResults {
  matrix: MatrixRow[];
  tiers: {
    critical: Anomaly[];
    moderate: Anomaly[];
    minor: Anomaly[];
  };
  peer_count: number;
  target_set_id: string;
}

export default function DeepDiveView({ 
  activeTab, 
  setId 
}: { 
  activeTab: string;
  setId: string;
}) {
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [countsData, setCountsData] = useState<PeerCounts | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [source, setSource] = useState<'local' | 'oracle' | 'openfda'>('local');

  // Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<TieredResults | null>(null);
  const [selectedBaseline, setSelectedBaseline] = useState<{term: string, type: 'name' | 'epc'} | null>(null);
  
  // UI Toggles
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  
  // Memo State
  const [selectedSignals, setSelectedSignals] = useState<Set<string>>(new Set());
  const [showMemo, setShowMemo] = useState(false);
  const [memoText, setMemoText] = useState('');

  const toggleSignal = (term: string) => {
    const next = new Set(selectedSignals);
    if (next.has(term)) next.delete(term);
    else next.add(term);
    setSelectedSignals(next);
  };

  const generateMemo = () => {
    if (!results || selectedSignals.size === 0) return;
    
    let draft = `LABEL REVIEW MEMO\nDate: ${new Date().toLocaleDateString()}\nBaseline: ${selectedBaseline?.term} (${results.peer_count} peers)\n\nCRITICAL FINDINGS:\n`;
    
    const allAnomalies = [...results.tiers.critical, ...results.tiers.moderate, ...results.tiers.minor];
    allAnomalies.filter(s => selectedSignals.has(s.term)).forEach(s => {
      draft += `- [${s.term}]: ${s.note || 'Regulatory discrepancy observed.'}\n`;
      draft += `  Context: Found in ${Math.round(s.peer_coverage)}% of class peers. Target label status: ${getLevelLabel(s.target_code)}.\n\n`;
    });
    
    setMemoText(draft);
    setShowMemo(true);
  };

  const fetchCounts = async (currentSource: string) => {
    setLoadingCounts(true);
    setCountsError(null);
    try {
      const resp = await fetch(`/api/dashboard/deep_dive/peers_count/${setId}?source=${currentSource}`);
      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.error || 'Failed to fetch peer counts');
      }
      const json = await resp.json();
      setCountsData(json);
    } catch (err: any) {
      setCountsError(err.message);
    } finally {
      setLoadingCounts(false);
    }
  };

  const runAnalysis = async (term: string, type: 'name' | 'epc') => {
    setAnalyzing(true);
    setSelectedBaseline({ term, type });
    setResults(null);
    setSelectedSignals(new Set());
    
    try {
      const params = new URLSearchParams({
        source: source,
        [type === 'name' ? 'generic_names' : 'epcs']: term
      });
      
      const resp = await fetch(`/api/dashboard/deep_dive/analysis/${setId}?${params.toString()}`);
      if (!resp.ok) throw new Error('Analysis failed');
      
      const data = await resp.json();
      setResults(data);
      
      // Auto-select critical gaps
      const criticalSet = new Set<string>();
      data.tiers.critical.forEach((s: any) => criticalSet.add(s.term));
      setSelectedSignals(criticalSet);

      setTimeout(() => {
        document.getElementById('analysis-results-anchor')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'deep-dive-view' && setId) {
      fetchCounts(source);
    }
  }, [activeTab, setId, source]);

  if (activeTab !== 'deep-dive-view') return null;

  const getLevelColor = (code: string) => {
    switch (code) {
      case 'B': return { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' };
      case 'W': return { bg: '#ffedd5', text: '#9a3412', border: '#f97316' };
      case 'A': return { bg: '#fef9c3', text: '#854d0e', border: '#eab308' };
      default:  return { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0' };
    }
  };

  const getLevelLabel = (code: string) => {
    switch (code) {
      case 'B': return 'Boxed Warning';
      case 'W': return 'Warning';
      case 'A': return 'Adverse Rxn';
      default: return 'None';
    }
  };

  const renderAnomalyCard = (s: Anomaly, tier: 'critical' | 'moderate' | 'minor') => {
    const isSelected = selectedSignals.has(s.term);
    const tierColors = {
      critical: { bg: '#fff1f2', border: '#fecaca', text: '#9f1239', accent: '#e11d48' },
      moderate: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', accent: '#f59e0b' },
      minor: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', accent: '#94a3b8' }
    };
    const color = tierColors[tier];

    return (
      <div 
        key={s.term} 
        onClick={() => toggleSignal(s.term)}
        style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          background: isSelected ? 'white' : color.bg, padding: '12px 16px', borderRadius: '10px', 
          border: '2px solid', borderColor: isSelected ? color.accent : color.border, 
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          cursor: 'pointer', transition: 'all 0.2s ease',
          marginBottom: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input type="checkbox" checked={isSelected} readOnly style={{ width: '16px', height: '16px', accentColor: color.accent }} />
          <div>
            <div style={{ fontWeight: 800, color: color.text, fontSize: '0.95rem' }}>{s.term}</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>{s.soc}</div>
            <div style={{ fontSize: '0.75rem', color: color.accent, fontWeight: 700, marginTop: '2px' }}>{s.note || 'Observed discrepancy'}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Peer Consensus</div>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{Math.round(s.peer_coverage)}% {s.consensus_code}</span>
        </div>
      </div>
    );
  };

  return (
    <div id="deep-dive-view" className="tab-content active" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* 1. SELECTION AREA */}
      <div className="chart-card full-width" style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Regulatory Intelligence</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Select a drug or class to perform a canonical MedDRA gap analysis</p>
          </div>
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
            {(['local', 'oracle', 'openfda'] as const).map((s) => (
              <button key={s} onClick={() => setSource(s)} className={`source-btn ${source === s ? 'active' : ''}`}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px' }}>
          <div className="peer-group-col">
            <div className="col-header">Generic Peer Groups</div>
            <div className="col-body">
              {loadingCounts ? <div className="loader"></div> : countsData?.names.map(item => (
                <div key={item.term} onClick={() => runAnalysis(item.term, 'name')} className={`analysis-trigger-card ${selectedBaseline?.term === item.term ? 'active' : ''}`}>
                  <span className="term-name">{item.term}</span>
                  <span className="peer-badge">{item.count} Peers</span>
                </div>
              ))}
            </div>
          </div>
          <div className="peer-group-col">
            <div className="col-header">Pharmacologic Class (EPC)</div>
            <div className="col-body">
              {loadingCounts ? <div className="loader"></div> : countsData?.epcs.map(item => (
                <div key={item.term} onClick={() => runAnalysis(item.term, 'epc')} className={`analysis-trigger-card ${selectedBaseline?.term === item.term ? 'active' : ''}`}>
                  <span className="term-name" style={{fontSize: '0.8rem'}}>{item.term}</span>
                  <span className="peer-badge">{item.count} Labels</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="analysis-results-anchor"></div>

      {/* 2. ANALYSIS RESULTS AREA */}
      {analyzing && (
        <div className="analyzing-placeholder">
          <div className="loader"></div>
          <h4>Analyzing Compliance Matrix...</h4>
          <p>Aggregating MedDRA terms by Preferred Term (PT) and checking regulatory presence.</p>
        </div>
      )}

      {results && !analyzing && (
        <div className="animate-fade-in">
          
          {/* TIERED ANOMALIES */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Signal Anomalies & Gaps</h2>
              <button onClick={generateMemo} disabled={selectedSignals.size === 0} className="memo-btn">
                📝 DRAFT MEMO ({selectedSignals.size})
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
              {/* Critical Tier */}
              <div className="tier-container">
                <div className="tier-header critical">CRITICAL GAPS</div>
                <div className="tier-body">
                  {results.tiers.critical.length > 0 ? results.tiers.critical.map(s => renderAnomalyCard(s, 'critical')) : <p className="empty-tier">No critical gaps identified.</p>}
                </div>
              </div>
              {/* Moderate Tier */}
              <div className="tier-container">
                <div className="tier-header moderate">MODERATE DISCREPANCIES</div>
                <div className="tier-body">
                  {results.tiers.moderate.length > 0 ? results.tiers.moderate.map(s => renderAnomalyCard(s, 'moderate')) : <p className="empty-tier">No moderate discrepancies.</p>}
                </div>
              </div>
            </div>
          </div>

          {/* COMPLIANCE MATRIX */}
          <div className="matrix-card">
            <div className="matrix-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <h4 style={{ margin: 0, fontWeight: 800 }}>Regulatory Compliance Matrix</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showOnlyDiscrepancies} onChange={(e) => setShowOnlyDiscrepancies(e.target.checked)} />
                  Discrepancies Only
                </label>
              </div>
              <div className="matrix-legend">
                {['B','W','A','N'].map(c => <span key={c}><span className={`legend-dot ${c}`}></span> {getLevelLabel(c)}</span>)}
              </div>
            </div>
            
            <div className="matrix-scroll">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>MedDRA Term (PT)</th>
                    <th className="sticky-col">Target</th>
                    <th className="sticky-col">Consensus</th>
                    <th style={{textAlign: 'center'}}>Peers ({results.peer_count})</th>
                  </tr>
                </thead>
                <tbody>
                  {results.matrix
                    .filter(row => !showOnlyDiscrepancies || row.is_discrepancy)
                    .map((row, idx) => {
                      const tColor = getLevelColor(row.target);
                      const cColor = getLevelColor(row.consensus);
                      return (
                        <tr key={idx} className={row.is_discrepancy ? 'row-discrepancy' : ''}>
                          <td className="term-cell">
                            <div className="pt-name">{row.term}</div>
                            <div className="soc-name">{row.soc}</div>
                          </td>
                          <td className="status-cell">
                            <span className="status-badge" style={{ background: tColor.bg, color: tColor.text, borderColor: tColor.border }}>{row.target}</span>
                          </td>
                          <td className="status-cell">
                            <span className="status-badge" style={{ background: cColor.bg, color: cColor.text, borderColor: cColor.border }}>{row.consensus}</span>
                            <div className="coverage-text">{row.coverage}</div>
                          </td>
                          <td className="peer-strip-cell">
                            <div className="peer-strip">
                              {row.peers.map((p, pIdx) => {
                                const pColor = getLevelColor(p);
                                return <span key={pIdx} className="peer-dot" style={{ background: pColor.bg, borderColor: pColor.border, opacity: p === 'N' ? 0.2 : 1 }} title={getLevelLabel(p)}></span>;
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Memo Modal */}
      {showMemo && (
        <div className="memo-modal-overlay">
          <div className="memo-modal">
            <div className="modal-header">
              <h3>Draft Reviewer Memo</h3>
              <button onClick={() => setShowMemo(false)}>&times;</button>
            </div>
            <textarea value={memoText} onChange={(e) => setMemoText(e.target.value)} />
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowMemo(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => { navigator.clipboard.writeText(memoText); alert('Copied!'); }}>Copy to Clipboard</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .source-btn { padding: 6px 12px; borderRadius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; border: none; background: transparent; color: #64748b; text-transform: uppercase; transition: all 0.2s; }
        .source-btn.active { background: white; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .peer-group-col { background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
        .col-header { padding: 12px 20px; border-bottom: 1px solid #e2e8f0; background: rgba(255,255,255,0.5); font-weight: 800; font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
        .col-body { padding: 16px; display: flex; flexDirection: column; gap: 10px; }
        .analysis-trigger-card { display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 16px; borderRadius: 10px; border: 2px solid #f1f5f9; cursor: pointer; transition: all 0.2s; }
        .analysis-trigger-card:hover { transform: translateX(4px); border-color: #3b82f6; }
        .analysis-trigger-card.active { border-color: #3b82f6; background: #eff6ff; }
        .term-name { fontWeight: 700; color: #1e293b; }
        .peer-badge { font-size: 0.8rem; font-weight: 800; background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 6px; }
        .analyzing-placeholder { text-align: center; padding: 60px; background: white; border-radius: 16px; border: 1px solid #e2e8f0; }
        .memo-btn { background: #e11d48; color: white; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(225,29,72,0.2); }
        .memo-btn:disabled { background: #fca5a5; cursor: not-allowed; box-shadow: none; }
        .tier-container { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; }
        .tier-header { padding: 12px 20px; font-weight: 900; font-size: 0.75rem; letter-spacing: 0.05em; }
        .tier-header.critical { background: #fee2e2; color: #9f1239; }
        .tier-header.moderate { background: #fffbeb; color: #92400e; }
        .tier-body { padding: 16px; flex: 1; }
        .empty-tier { color: #94a3b8; font-style: italic; font-size: 0.85rem; text-align: center; margin: 20px 0; }
        .matrix-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .matrix-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
        .matrix-legend { display: flex; gap: 12px; font-size: 0.7rem; font-weight: 700; color: #64748b; }
        .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
        .legend-dot.B { background: #fee2e2; border: 1px solid #ef4444; }
        .legend-dot.W { background: #ffedd5; border: 1px solid #f97316; }
        .legend-dot.A { background: #fef9c3; border: 1px solid #eab308; }
        .legend-dot.N { background: #f8fafc; border: 1px solid #e2e8f0; }
        .matrix-scroll { overflow-x: auto; }
        .matrix-table { width: 100%; border-collapse: collapse; text-align: left; }
        .matrix-table th { padding: 12px 20px; font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; background: #f8fafc; }
        .matrix-table td { padding: 12px 20px; border-bottom: 1px solid #f1f5f9; }
        .row-discrepancy { background: #fffbf0; }
        .term-cell { min-width: 220px; }
        .pt-name { font-weight: 700; color: #334155; font-size: 0.85rem; }
        .soc-name { font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-top: 2px; }
        .status-cell { text-align: center; width: 80px; }
        .status-badge { display: inline-block; width: 24px; height: 24px; line-height: 24px; border-radius: 4px; font-size: 0.75rem; font-weight: 800; border: 1px solid; }
        .coverage-text { font-size: 0.6rem; color: #94a3b8; font-weight: 800; margin-top: 4px; }
        .peer-strip-cell { padding: 12px !important; }
        .peer-strip { display: flex; gap: 4px; flex-wrap: wrap; }
        .peer-dot { width: 8px; height: 16px; border-radius: 2px; border: 1px solid; }
        .memo-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); z-index: 5000; display: flex; alignItems: center; justifyContent: center; padding: 20px; }
        .memo-modal { background: white; width: 100%; maxWidth: 600px; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
        .modal-header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; alignItems: center; }
        .memo-modal textarea { width: 100%; height: 300px; padding: 20px; border: none; font-size: 0.85rem; font-family: monospace; line-height: 1.5; outline: none; }
        .modal-footer { padding: 16px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; }
        .btn-primary { padding: 8px 16px; border-radius: 8px; border: none; background: #0f172a; color: white; fontWeight: 700; cursor: pointer; }
        .btn-secondary { padding: 8px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; fontWeight: 700; cursor: pointer; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

    </div>
  );
}
