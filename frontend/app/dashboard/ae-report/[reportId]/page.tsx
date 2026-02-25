'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import { useUser } from '../../../context/UserContext';

interface ReportDetail {
  report: {
    id: number;
    target_pt: string;
    project_title: string;
    created_at: string;
    status: string;
  };
  frequent_contexts: Array<{
    snippet: string;
    count: number;
    set_ids: string[];
  }>;
  results: Array<{
    set_id: string;
    brand_name: string;
    generic_name: string;
    is_labeled: boolean;
    found_sections: Array<{ section: string; snippet: string }>;
    faers_count: number;
    faers_serious_count: number;
  }>;
}

export default function AEReportPage() {
  const { reportId } = useParams();
  const router = useRouter();
  const { session, loading: sessionLoading } = useUser();
  const [data, setData] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedContexts, setExpandedContexts] = useState<Record<number, boolean>>({});

  // Sorting
  const [sortField, setSortField] = useState<'brand_name' | 'faers_count' | 'faers_serious_count' | 'is_labeled'>('faers_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/dashboard/ae_report/detail/${reportId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          setError('Failed to load report details.');
        }
      } catch (err) {
        setError('Network error occurred.');
      } finally {
        setLoading(false);
      }
    }
    if (reportId) fetchDetail();
  }, [reportId]);

  const sortedResults = useMemo(() => {
    if (!data) return [];
    return [...data.results].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      
      if (typeof valA === 'boolean') {
        valA = valA ? 1 : 0;
        valB = valB ? 1 : 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortOrder]);

  const stats = useMemo(() => {
    if (!data) return null;
    const total = data.results.length;
    const labeled = data.results.filter(r => r.is_labeled).length;
    const totalFaers = data.results.reduce((sum, r) => sum + r.faers_count, 0);
    const totalSerious = data.results.reduce((sum, r) => sum + r.faers_serious_count, 0);
    return { total, labeled, totalFaers, totalSerious, percentLabeled: ((labeled / total) * 100).toFixed(1) };
  }, [data]);

  if (loading) return <div style={{ padding: '100px', textAlign: 'center' }}><div className="loader" style={{ margin: '0 auto' }} /></div>;
  if (error || !data) return <div style={{ padding: '100px', textAlign: 'center', color: '#ef4444' }}>{error || 'Report not found.'}</div>;

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header activeApp="dashboard" />
      
      <div className="hp-container" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header Section */}
        <div style={{ 
          background: 'white', 
          borderRadius: '24px', 
          padding: '2rem', 
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          marginBottom: '2rem',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AE Profile Report</span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>{new Date(data.report.created_at).toLocaleDateString()}</span>
              </div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>{data.report.target_pt}</h1>
              <p style={{ fontSize: '1.1rem', color: '#64748b', marginTop: '0.5rem' }}>Project: <strong>{data.report.project_title}</strong></p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={async () => {
                  const res = await fetch(`/api/dashboard/ae_report/export/${reportId}`);
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `AE_Report_${data.report.target_pt.replace(/ /g, '_')}.xlsx`;
                    a.click();
                  } else {
                    alert('Failed to export report.');
                  }
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: '#ecfeff',
                  color: '#0891b2',
                  border: '1px solid #cffafe',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>📊</span> Download Excel
              </button>

              <button 
                onClick={async () => {
                  const res = await fetch(`/api/dashboard/ae_report/export_json/${reportId}`);
                  if (res.ok) {
                    const json = await res.json();
                    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `AE_AI_Data_${data.report.target_pt.replace(/ /g, '_')}.json`;
                    a.click();
                  } else {
                    alert('Failed to export JSON.');
                  }
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: '#f5f3ff',
                  color: '#5b21b6',
                  border: '1px solid #ddd6fe',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>🤖</span> JSON for AI
              </button>

              <button 
                onClick={() => window.print()}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>🖨️</span> Print Report
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginTop: '2rem' }}>
            <StatCard label="Total Labels" value={stats?.total || 0} icon="📄" color="#6366f1" />
            <StatCard label="Labeled Presence" value={`${stats?.labeled} (${stats?.percentLabeled}%)`} icon="✅" color="#10b981" />
            <StatCard label="Total FAERS Reports" value={stats?.totalFaers.toLocaleString() || 0} icon="📊" color="#f59e0b" />
            <StatCard label="Serious Events" value={stats?.totalSerious.toLocaleString() || 0} icon="⚠️" color="#ef4444" />
          </div>
        </div>

        {/* Context Ranking Table */}
        {data.frequent_contexts && data.frequent_contexts.length > 0 && (
          <div style={{ 
            background: 'white', 
            borderRadius: '24px', 
            padding: '2rem', 
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            marginBottom: '2rem',
            border: '1px solid #e2e8f0'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>📈</span> Most Frequent Labeling Contexts
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.frequent_contexts.map((ctx, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  gap: '20px', 
                  padding: '1.25rem', 
                  background: '#f8fafc', 
                  borderRadius: '16px',
                  border: '1px solid #f1f5f9',
                  alignItems: 'center'
                }}>
                  <div style={{ 
                    minWidth: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    background: '#6366f1', 
                    color: 'white', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '0.9rem'
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: '0.9rem', color: '#334155', lineHeight: '1.5', fontStyle: 'italic' }}>
                    "...<HighlightedText text={ctx.snippet} highlight={data.report.target_pt} />..."
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '120px' }}>
                    <div 
                      onClick={() => {
                        if (ctx.count < 5) {
                          setExpandedContexts(prev => ({ ...prev, [idx]: !prev[idx] }));
                        }
                      }}
                      style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 900, 
                        color: '#6366f1',
                        cursor: ctx.count < 5 ? 'pointer' : 'default',
                        textDecoration: ctx.count < 5 ? 'underline' : 'none',
                        textDecorationStyle: 'dotted'
                      }}
                      title={ctx.count < 5 ? "Click to see documents" : ""}
                    >
                      {ctx.count}
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Documents</div>
                    
                    {expandedContexts[idx] && ctx.set_ids && (
                      <div style={{ 
                        marginTop: '8px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        fontSize: '0.7rem',
                        textAlign: 'left',
                        maxHeight: '100px',
                        overflowY: 'auto',
                        padding: '4px',
                        background: 'white',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0'
                      }}>
                        {ctx.set_ids.map(sid => (
                          <a 
                            key={sid} 
                            href={`/dashboard/label/${sid}`} 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ color: '#6366f1', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {sid.slice(0, 8)}...
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results Table */}
        <div style={{ 
          background: 'white', 
          borderRadius: '24px', 
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Labeling & FAERS Analysis</h2>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Showing {data.results.length} labeling documents</div>
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  <Th label="Drug Product" field="brand_name" current={sortField} order={sortOrder} onClick={setSortField} setOrder={setSortOrder} />
                  <Th label="Labeled?" field="is_labeled" current={sortField} order={sortOrder} onClick={setSortField} setOrder={setSortOrder} />
                  <Th label="Sections Mentioned" field={null} />
                  <Th label="FAERS Count" field="faers_count" current={sortField} order={sortOrder} onClick={setSortField} setOrder={setSortOrder} />
                  <Th label="Serious Events" field="faers_serious_count" current={sortField} order={sortOrder} onClick={setSortField} setOrder={setSortOrder} />
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((res, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }} className="table-row">
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{res.brand_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{res.set_id}</div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      {res.is_labeled ? (
                        <span style={{ padding: '4px 10px', background: '#dcfce7', color: '#166534', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800 }}>LABELED</span>
                      ) : (
                        <span style={{ padding: '4px 10px', background: '#f1f5f9', color: '#64748b', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800 }}>NOT MENTIONED</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      {res.found_sections.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {res.found_sections.map((s, i) => (
                              <span key={i} title={s.snippet} style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 600, border: '1px solid #fde68a' }}>{s.section}</span>
                            ))}
                          </div>
                          {res.found_sections[0] && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              "<HighlightedText text={res.found_sections[0].snippet} highlight={data.report.target_pt} />"
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 700, color: '#1e293b' }}>{res.faers_count.toLocaleString()}</td>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 700, color: '#ef4444' }}>{res.faers_serious_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        .table-row:hover {
          background-color: #f1f5f9;
        }
        .loader {
          border: 4px solid #f3f3f3;
          border-radius: 50%;
          border-top: 4px solid #6366f1;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

function StatCard({ label, value, icon, color }: { label: string, value: string | number, icon: string, color: string }) {
  return (
    <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function Th({ label, field, current, order, onClick, setOrder }: any) {
  const isCurrent = field === current;
  return (
    <th 
      onClick={() => {
        if (!field) return;
        if (isCurrent) {
          setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
          onClick(field);
          setOrder('desc');
        }
      }}
      style={{ 
        padding: '12px 1.5rem', 
        fontSize: '0.75rem', 
        fontWeight: 800, 
        color: '#475569', 
        textTransform: 'uppercase', 
        cursor: field ? 'pointer' : 'default',
        userSelect: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {label}
        {field && (
          <span style={{ color: isCurrent ? '#6366f1' : '#cbd5e1' }}>
            {isCurrent ? (order === 'asc' ? '↑' : '↓') : '⇅'}
          </span>
        )}
      </div>
    </th>
  );
}

function HighlightedText({ text, highlight }: { text: string, highlight: string }) {
  if (!highlight.trim()) return <span>{text}</span>;
  
  const regex = new RegExp(`(${highlight})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <span key={i} style={{ backgroundColor: '#bfdbfe', color: '#1e3a8a', padding: '0 2px', borderRadius: '2px', fontWeight: 700 }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
}
