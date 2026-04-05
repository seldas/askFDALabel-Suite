'use client';

import { useState, useEffect, useMemo } from 'react';

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
  dist: { [key: string]: number };
  peers: ('B' | 'W' | 'A' | 'N')[];
  peer_ids?: string[];
  is_discrepancy: boolean;
  originals: string[];
}

interface Anomaly {
  term: string;
  soc: string;
  target_code: string;
  consensus_code: string;
  peer_coverage: number;
  peer_max_level: number;
  distribution: { [key: string]: number };
  note?: string;
  weight: number;
  originals: string[];
}

interface PeerMeta {
  brand: string;
  manufacturer: string;
}

interface TieredResults {
  matrix: MatrixRow[];
  tiers: {
    critical: Anomaly[];
    moderate: Anomaly[];
    minor: Anomaly[];
  };
  peer_count: number;
  peers_metadata: { [setId: string]: PeerMeta };
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
  const [collapsedSocs, setCollapsedSocs] = useState<Set<string>>(new Set());
  
  // Memo State
  const [selectedSignals, setSelectedSignals] = useState<Set<string>>(new Set());
  const [showMemo, setShowMemo] = useState(false);
  const [memoText, setMemoText] = useState('');

  const toggleSoc = (soc: string) => {
    const next = new Set(collapsedSocs);
    if (next.has(soc)) next.delete(soc);
    else next.add(soc);
    setCollapsedSocs(next);
  };

  const toggleSignal = (term: string) => {
    const next = new Set(selectedSignals);
    if (next.has(term)) next.delete(term);
    else next.add(term);
    setSelectedSignals(next);
  };

  const generateMemo = () => {
    if (!results || selectedSignals.size === 0) return;
    let draft = `LABEL REVIEW MEMO\nDate: ${new Date().toLocaleDateString()}\nBaseline: ${selectedBaseline?.term} (${results.peer_count} peers)\n\nOBSERVATIONS ON REGULATORY DISCREPANCIES:\n\n`;
    const allAnomalies = [...results.tiers.critical, ...results.tiers.moderate, ...results.tiers.minor];
    allAnomalies.filter(s => selectedSignals.has(s.term)).forEach(s => {
      const distStr = `B:${s.distribution.B}%, W:${s.distribution.W}%, A:${s.distribution.A}%, N:${s.distribution.N}%`;
      draft += `[${s.term}]\n`;
      if (s.originals && s.originals.length > 0) draft += `- Matched in Target XML as: "${s.originals.join(', ')}"\n`;
      draft += `- Status: Target lists as "${getLevelLabel(s.target_code)}", while Peer Consensus is "${getLevelLabel(s.consensus_code)}".\n`;
      draft += `- Evidence: Peer Class Distribution is [ ${distStr} ].\n`;
      if (s.note) draft += `- Risk Context: ${s.note}\n`;
      draft += `\n`;
    });
    draft += `REFERENCES (Peer Labels Analyzed):\n`;
    Object.entries(results.peers_metadata).forEach(([pid, meta]) => {
      draft += `- ${meta.brand} (${meta.manufacturer}): /dashboard/label/${pid}\n`;
    });
    setMemoText(draft);
    setShowMemo(true);
  };

  const fetchCounts = async (currentSource: string) => {
    setLoadingCounts(true);
    setCountsError(null);
    try {
      const resp = await fetch(`/api/dashboard/deep_dive/peers_count/${setId}?source=${currentSource}`);
      if (!resp.ok) throw new Error('Failed to fetch peer counts');
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
      const params = new URLSearchParams({ source, [type === 'name' ? 'generic_names' : 'epcs']: term });
      const resp = await fetch(`/api/dashboard/deep_dive/analysis/${setId}?${params.toString()}`);
      if (!resp.ok) throw new Error('Analysis failed');
      const data = await resp.json();
      setResults(data);
      const criticalSet = new Set<string>();
      data.tiers.critical.forEach((s: any) => criticalSet.add(s.term));
      setSelectedSignals(criticalSet);
      setTimeout(() => {
        document.getElementById('analysis-results-anchor')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) { console.error(err); } finally { setAnalyzing(false); }
  };

  useEffect(() => {
    if (activeTab === 'deep-dive-view' && setId) fetchCounts(source);
  }, [activeTab, setId, source]);

  // Group matrix data by SOC
  const groupedMatrix = useMemo(() => {
    if (!results) return {};
    const groups: { [soc: string]: MatrixRow[] } = {};
    results.matrix.forEach(row => {
      if (!groups[row.soc]) groups[row.soc] = [];
      groups[row.soc].push(row);
    });
    return groups;
  }, [results]);

  if (activeTab !== 'deep-dive-view') return null;

  const getLevelStyles = (code: string) => {
    switch (code) {
      case 'B': return { bg: '#fee2e2', text: '#b91c1c', border: '#ef4444', label: 'Boxed', shadow: '0 0 8px rgba(239,68,68,0.2)' };
      case 'W': return { bg: '#ffedd5', text: '#c2410c', border: '#f97316', label: 'Warning', shadow: 'none' };
      case 'A': return { bg: '#fef9c3', text: '#a16207', border: '#eab308', label: 'Adverse', shadow: 'none' };
      default:  return { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0', label: 'None', shadow: 'none' };
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

  return (
    <div id="deep-dive-view" className="tab-content active" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* 1. SELECTION AREA */}
      <div className="selection-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Regulatory Intelligence</h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Select a clinical cohort to perform a comparative gap analysis.</p>
          </div>
          <div className="source-toggle">
            {(['local', 'oracle', 'openfda'] as const).map((s) => (
              <button key={s} onClick={() => setSource(s)} className={`source-btn ${source === s ? 'active' : ''}`}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '32px' }}>
          <div className="cohort-column">
            <div className="cohort-header">Generic Peer Groups</div>
            <div className="cohort-body">
              {loadingCounts ? <div className="loader-box"><div className="loader"></div></div> : countsData?.names.map(item => (
                <div key={item.term} onClick={() => runAnalysis(item.term, 'name')} className={`cohort-card ${selectedBaseline?.term === item.term ? 'active' : ''}`}>
                  <div className="cohort-info">
                    <span className="cohort-icon">💊</span>
                    <span className="cohort-name">{item.term}</span>
                  </div>
                  <span className="cohort-count">{item.count} Peers</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cohort-column">
            <div className="cohort-header">Pharmacologic Class (EPC)</div>
            <div className="cohort-body">
              {loadingCounts ? <div className="loader-box"><div className="loader"></div></div> : countsData?.epcs.map(item => (
                <div key={item.term} onClick={() => runAnalysis(item.term, 'epc')} className={`cohort-card ${selectedBaseline?.term === item.term ? 'active' : ''}`}>
                  <div className="cohort-info">
                    <span className="cohort-icon">🧬</span>
                    <span className="cohort-name">{item.term}</span>
                  </div>
                  <span className="cohort-count">{item.count} Labels</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="analysis-results-anchor"></div>

      {/* 2. ANALYSIS RESULTS AREA */}
      {analyzing && (
        <div className="analysis-loading">
          <div className="loader large"></div>
          <h4>Constructing Intelligence Matrix...</h4>
          <p>Scanning MedDRA hierarchy and calculating regulatory consensus across class peers.</p>
        </div>
      )}

      {results && !analyzing && (
        <div className="animate-fade-in">
          
          {/* TIERED ANOMALIES */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>Signal Anomalies</h2>
                <div className="peer-summary-badge">Analyzed {results.peer_count} Peers</div>
              </div>
              <button onClick={generateMemo} disabled={selectedSignals.size === 0} className="memo-action-btn">
                <span>📝</span> DRAFT REVIEWER MEMO ({selectedSignals.size})
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
              <div className="anomaly-tier critical">
                <div className="tier-label">Critical Gaps</div>
                <div className="tier-content">
                  {results.tiers.critical.length > 0 ? results.tiers.critical.map(s => renderAnomalyCard(s, 'critical', toggleSignal, selectedSignals)) : <div className="empty-state">No critical gaps identified.</div>}
                </div>
              </div>
              <div className="anomaly-tier moderate">
                <div className="tier-label">Regulatory Discrepancies</div>
                <div className="tier-content">
                  {results.tiers.moderate.length > 0 ? results.tiers.moderate.map(s => renderAnomalyCard(s, 'moderate', toggleSignal, selectedSignals)) : <div className="empty-state">No major discrepancies found.</div>}
                </div>
              </div>
            </div>
          </div>

          {/* COMPLIANCE MATRIX REIMAGINED */}
          <div className="matrix-container">
            <div className="matrix-header-main">
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <h4 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem' }}>Clinical Compliance Landscape</h4>
                <div className="matrix-controls">
                  <label className="filter-toggle">
                    <input type="checkbox" checked={showOnlyDiscrepancies} onChange={(e) => setShowOnlyDiscrepancies(e.target.checked)} />
                    <span className="toggle-label">Discrepancies Only</span>
                  </label>
                </div>
              </div>
              <div className="matrix-legend">
                {['B','W','A','N'].map(c => (
                  <div key={c} className="legend-item">
                    <span className={`gem mini ${c}`}></span>
                    <span className="legend-text">{getLevelLabel(c)}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="matrix-body">
              {Object.entries(groupedMatrix).map(([soc, rows]) => {
                const isCollapsed = collapsedSocs.has(soc);
                const filteredRows = rows.filter(r => !showOnlyDiscrepancies || r.is_discrepancy);
                if (filteredRows.length === 0) return null;

                return (
                  <div key={soc} className={`soc-group ${isCollapsed ? 'collapsed' : ''}`}>
                    <div className="soc-header" onClick={() => toggleSoc(soc)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="soc-toggle-icon">{isCollapsed ? '⊕' : '⊖'}</span>
                        <span className="soc-name">{soc}</span>
                        <span className="soc-count">{filteredRows.length} Terms</span>
                      </div>
                      <div className="soc-summary-line"></div>
                    </div>
                    
                    {!isCollapsed && (
                      <div className="soc-content">
                        <table className="modern-matrix-table">
                          <thead>
                            <tr>
                              <th style={{ width: '30%' }}>MedDRA Term (PT)</th>
                              <th style={{ width: '10%', textAlign: 'center' }}>Target</th>
                              <th style={{ width: '10%', textAlign: 'center' }}>Consensus</th>
                              <th style={{ width: '50%' }}>Peer Profile ({results.peer_count} Labels)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRows.map((row, idx) => {
                              const targetStyle = getLevelStyles(row.target);
                              const consensusStyle = getLevelStyles(row.consensus);
                              return (
                                <tr key={idx} className={row.is_discrepancy ? 'is-discrepancy' : ''}>
                                  <td className="term-cell">
                                    <div className="pt-wrap">
                                      <span className="pt-text">{row.term}</span>
                                      {row.originals.length > 0 && (
                                        <span className="original-match-tag" title={`Source text: ${row.originals.join(', ')}`}>
                                          {row.originals[0]}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="status-cell">
                                    <div className={`gem-badge ${row.target}`} style={{ backgroundColor: targetStyle.bg, color: targetStyle.text, borderColor: targetStyle.border, boxShadow: targetStyle.shadow }}>
                                      {row.target}
                                    </div>
                                  </td>
                                  <td className="status-cell">
                                    <div className={`gem-badge ${row.consensus}`} style={{ backgroundColor: consensusStyle.bg, color: consensusStyle.text, borderColor: consensusStyle.border }}>
                                      {row.consensus}
                                    </div>
                                    <div className="consensus-meta">{row.coverage}</div>
                                  </td>
                                  <td className="peer-track-cell">
                                    <div className="peer-track">
                                      {row.peers.map((p, pIdx) => {
                                        const pStyle = getLevelStyles(p);
                                        const peerIds = Object.keys(results.peers_metadata);
                                        const peerId = peerIds[pIdx];
                                        const peerMeta = results.peers_metadata[peerId];
                                        
                                        return (
                                          <div 
                                            key={pIdx} 
                                            className={`peer-gem ${p}`} 
                                            style={{ backgroundColor: pStyle.border, opacity: p === 'N' ? 0.15 : 1 }}
                                            title={peerMeta ? `${peerMeta.brand} (${peerMeta.manufacturer}) - ${getLevelLabel(p)}` : getLevelLabel(p)}
                                            onClick={() => window.open(`/dashboard/label/${peerId}`, '_blank')}
                                          ></div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Memo Modal */}
      {showMemo && (
        <div className="memo-overlay">
          <div className="memo-modal">
            <div className="memo-modal-header">
              <h3>Draft Reviewer Memo</h3>
              <button onClick={() => setShowMemo(false)}>&times;</button>
            </div>
            <textarea value={memoText} onChange={(e) => setMemoText(e.target.value)} spellCheck={false} />
            <div className="memo-modal-footer">
              <button className="btn-cancel" onClick={() => setShowMemo(false)}>Close</button>
              <button className="btn-copy" onClick={() => { navigator.clipboard.writeText(memoText); alert('Copied to clipboard!'); }}>Copy to Clipboard</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .selection-card { background: white; border-radius: 24px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.05); margin-bottom: 32px; }
        .source-toggle { background: #f1f5f9; padding: 6px; border-radius: 14px; display: flex; gap: 4px; }
        .source-btn { padding: 8px 18px; border-radius: 10px; font-size: 0.8rem; font-weight: 800; cursor: pointer; border: none; background: transparent; color: #64748b; text-transform: uppercase; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        .source-btn.active { background: white; color: #0f172a; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        
        .cohort-column { background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; }
        .cohort-header { padding: 16px 24px; background: rgba(255,255,255,0.6); border-bottom: 1px solid #e2e8f0; font-weight: 900; font-size: 0.8rem; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
        .cohort-body { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .cohort-card { display: flex; justify-content: space-between; align-items: center; background: white; padding: 16px 20px; border-radius: 14px; border: 2px solid #f1f5f9; cursor: pointer; transition: all 0.3s ease; }
        .cohort-card:hover { transform: translateY(-3px) scale(1.01); border-color: #3b82f6; box-shadow: 0 12px 24px -8px rgba(59, 130, 246, 0.15); }
        .cohort-card.active { border-color: #3b82f6; background: #eff6ff; }
        .cohort-info { display: flex; alignItems: center; gap: 12px; }
        .cohort-icon { font-size: 1.2rem; }
        .cohort-name { font-weight: 800; color: #1e293b; font-size: 0.95rem; }
        .cohort-count { font-size: 0.75rem; font-weight: 900; background: #eff6ff; color: #1d4ed8; padding: 4px 10px; border-radius: 8px; text-transform: uppercase; }

        .analysis-loading { text-align: center; padding: 80px; background: white; border-radius: 24px; border: 1px solid #e2e8f0; }
        .peer-summary-badge { background: #f1f5f9; color: #475569; padding: 6px 14px; border-radius: 30px; font-size: 0.8rem; font-weight: 800; }
        .memo-action-btn { background: #e11d48; color: white; border: none; padding: 12px 24px; border-radius: 14px; font-weight: 900; font-size: 0.85rem; cursor: pointer; transition: all 0.3s; box-shadow: 0 8px 20px -6px rgba(225,29,72,0.4); }
        .memo-action-btn:hover:not(:disabled) { transform: translateY(-2px); background: #be123c; box-shadow: 0 12px 24px -6px rgba(225,29,72,0.5); }
        .memo-action-btn:disabled { background: #fca5a5; opacity: 0.6; cursor: not-allowed; box-shadow: none; }

        .anomaly-tier { background: white; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
        .tier-label { padding: 14px 24px; font-weight: 900; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; }
        .critical .tier-label { background: #fee2e2; color: #b91c1c; }
        .moderate .tier-label { background: #fffbeb; color: #92400e; }
        .tier-content { padding: 20px; flex: 1; }
        .empty-state { color: #94a3b8; font-style: italic; font-size: 0.9rem; text-align: center; padding: 40px 0; }

        .matrix-container { background: white; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 50px rgba(0,0,0,0.04); }
        .matrix-header-main { padding: 20px 32px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .filter-toggle { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; }
        .toggle-label { font-size: 0.85rem; font-weight: 700; color: #475569; }
        .matrix-legend { display: flex; gap: 20px; }
        .legend-item { display: flex; align-items: center; gap: 8px; }
        .gem { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid; }
        .gem.B { background: #fee2e2; border-color: #ef4444; }
        .gem.W { background: #ffedd5; border-color: #f97316; }
        .gem.A { background: #fef9c3; border-color: #eab308; }
        .gem.N { background: #f8fafc; border-color: #e2e8f0; }
        .legend-text { font-size: 0.75rem; font-weight: 800; color: #64748b; }

        .soc-group { border-bottom: 1px solid #f1f5f9; }
        .soc-header { padding: 16px 32px; background: #ffffff; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; }
        .soc-header:hover { background: #f8fafc; }
        .soc-toggle-icon { font-size: 1.2rem; color: #3b82f6; font-weight: 900; }
        .soc-name { font-weight: 900; color: #0f172a; fontSize: 1rem; letter-spacing: -0.01em; }
        .soc-count { font-size: 0.7rem; font-weight: 800; background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; }
        .soc-summary-line { flex: 1; margin-left: 24px; height: 1px; background: #f1f5f9; }

        .modern-matrix-table { width: 100%; border-collapse: collapse; }
        .modern-matrix-table th { padding: 12px 24px; font-size: 0.7rem; font-weight: 900; color: #94a3b8; text-transform: uppercase; text-align: left; background: #fafbfc; border-bottom: 1px solid #f1f5f9; }
        .modern-matrix-table td { padding: 16px 24px; border-bottom: 1px solid #f8fafc; }
        .is-discrepancy { background: #fffcf0; }
        .pt-wrap { display: flex; flex-direction: column; gap: 6px; }
        .pt-text { font-weight: 800; color: #1e293b; font-size: 0.95rem; }
        .original-match-tag { font-size: 0.7rem; font-weight: 700; color: #3b82f6; background: #eff6ff; padding: 2px 8px; border-radius: 6px; width: fit-content; }
        .gem-badge { width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 8px; font-size: 0.85rem; font-weight: 900; border: 2px solid; margin: 0 auto; }
        .consensus-meta { font-size: 0.65rem; color: #94a3b8; font-weight: 900; margin-top: 6px; text-align: center; }
        .peer-track { display: flex; gap: 6px; flex-wrap: wrap; }
        .peer-gem { width: 10px; height: 20px; border-radius: 3px; }

        .memo-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(8px); z-index: 5000; display: flex; alignItems: center; justifyContent: center; padding: 24px; }
        .memo-modal { background: white; width: 100%; maxWidth: 700px; border-radius: 24px; overflow: hidden; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.3); display: flex; flex-direction: column; }
        .memo-modal-header { padding: 20px 32px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .memo-modal textarea { width: 100%; height: 400px; padding: 32px; border: none; font-size: 0.95rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; line-height: 1.6; outline: none; resize: none; color: #334155; }
        .memo-modal-footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; }
        .btn-copy { background: #0f172a; color: white; padding: 12px 24px; border-radius: 12px; font-weight: 800; border: none; cursor: pointer; transition: all 0.2s; }
        .btn-cancel { background: white; color: #64748b; padding: 12px 24px; border-radius: 12px; font-weight: 800; border: 1px solid #e2e8f0; cursor: pointer; }
        
        .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.23, 1, 0.32, 1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .loader.large { width: 60px; height: 60px; border-width: 8px; margin: 0 auto 24px; }
      `}</style>

    </div>
  );
}

function renderAnomalyCard(s: Anomaly, tier: 'critical' | 'moderate' | 'minor', onToggle: (t:string)=>void, selected: Set<string>) {
  const isSelected = selected.has(s.term);
  const tierColors = {
    critical: { bg: '#fff1f2', border: '#fecaca', text: '#9f1239', accent: '#e11d48' },
    moderate: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', accent: '#f59e0b' },
    minor: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', accent: '#94a3b8' }
  };
  const color = tierColors[tier];
  const distStr = `B:${s.distribution.B}% W:${s.distribution.W}% A:${s.distribution.A}% N:${s.distribution.N}%`;

  return (
    <div key={s.term} onClick={() => onToggle(s.term)} className="anomaly-card" style={{ 
      background: isSelected ? 'white' : color.bg, 
      borderColor: isSelected ? color.accent : color.border,
      borderWidth: '2px', borderStyle: 'solid',
      padding: '16px 20px', borderRadius: '16px', marginBottom: '12px', cursor: 'pointer', transition: 'all 0.2s ease',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <input type="checkbox" checked={isSelected} readOnly style={{ width: '18px', height: '18px', accentColor: color.accent }} />
        <div>
          <div style={{ fontWeight: 900, color: color.text, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>{s.term}</div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, marginTop: '2px' }}>{s.soc}</div>
          <div style={{ fontSize: '0.75rem', color: color.accent, fontWeight: 800, marginTop: '6px', background: 'rgba(255,255,255,0.5)', padding: '2px 8px', borderRadius: '4px', width: 'fit-content' }}>
            {s.note}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900, marginBottom: '4px' }}>Peer Distribution</div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 800, color: '#334155', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>
          {distStr}
        </div>
      </div>
    </div>
  );
}
