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

export default function DeepDiveView({ 
  activeTab, 
  setId 
}: { 
  activeTab: string;
  setId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PeerCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'local' | 'oracle' | 'openfda'>('local');

  const fetchCounts = async (currentSource: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/dashboard/deep_dive/peers_count/${setId}?source=${currentSource}`);
      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.error || 'Failed to fetch peer counts');
      }
      const json = await resp.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'deep-dive-view' && setId) {
      fetchCounts(source);
    }
  }, [activeTab, setId, source]);

  if (activeTab !== 'deep-dive-view') return null;

  return (
    <div id="deep-dive-view" className="tab-content active" style={{ padding: '20px' }}>
      <div className="chart-card full-width" style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
        
        {/* Header with Source Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Label Deep Dive</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Detailed peer labeling analysis by Generic Name and EPC</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Data Source:</span>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
              {(['local', 'oracle', 'openfda'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: source === s ? 'white' : 'transparent',
                    color: source === s ? '#0f172a' : '#64748b',
                    boxShadow: source === s ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', color: '#dc2626', marginBottom: '20px', fontSize: '0.9rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Detailed Lists Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px' }}>
          
          {/* Peer Drugs List */}
          <div style={{ background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>💊</span>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peer Generic Names</h4>
            </div>
            <div style={{ padding: '20px' }}>
              {loading ? (
                <div className="loader" style={{ margin: '20px auto' }}></div>
              ) : data?.names && data.names.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.names.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px 16px', borderRadius: '10px', border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{item.term}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>{item.count}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>labels</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontStyle: 'italic' }}>No generic name metadata found</div>
              )}
            </div>
          </div>

          {/* Class Peers List */}
          <div style={{ background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>🧬</span>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class Peers (EPC)</h4>
            </div>
            <div style={{ padding: '20px' }}>
              {loading ? (
                <div className="loader" style={{ margin: '20px auto' }}></div>
              ) : data?.epcs && data.epcs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.epcs.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'white', padding: '16px', borderRadius: '10px', border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', lineHeight: 1.4 }}>{item.term}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', borderTop: '1px solid #f8fafc', paddingTop: '8px' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>{item.count}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>labels in class</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontStyle: 'italic' }}>No EPC metadata found</div>
              )}
            </div>
          </div>

        </div>

        <div style={{ marginTop: '30px', padding: '20px', background: '#fffbeb', borderRadius: '12px', border: '1px solid #fef3c7' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '1.2rem' }}>💡</span>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 800, color: '#92400e' }}>Phase 1 Analysis</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: 1.5 }}>
                Peer counts indicate the size of the comparative corpus available in <strong>{source.toUpperCase()}</strong>. Detailed comparisons (TF-IDF, Excipients) will be performed across these specific groups in Phase 2.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
