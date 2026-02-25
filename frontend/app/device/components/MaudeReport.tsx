import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell
} from 'recharts';

interface MaudeReportProps {
  productCode: string;
  kNumber?: string;
  onClose: () => void;
}

export default function MaudeReport({ productCode, kNumber, onClose }: MaudeReportProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSafetyData() {
      setLoading(true);
      try {
        const url = `/api/device/safety/${productCode}${kNumber ? `?id=${kNumber}` : ''}`;
        const resp = await fetch(url);
        const result = await resp.json();
        setData(result);
      } catch (err) {
        console.error("Failed to fetch safety data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSafetyData();
  }, [productCode, kNumber]);

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6366f1'];

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '20px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    padding: '1.5rem',
    width: '100%',
    maxWidth: '900px',
    border: '1px solid #e2e8f0',
    position: 'relative' as const,
    animation: 'slideUp 0.3s ease-out',
    maxHeight: '90vh',
    overflowY: 'auto' as const
  };

  const sectionStyle = {
    backgroundColor: '#f8fafc',
    padding: '1rem',
    borderRadius: '16px',
    border: '1px solid #f1f5f9',
  };

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'white', borderRadius: '20px', fontWeight: 800, color: '#6366f1', fontSize: '0.9rem' }}>
      Synchronizing MAUDE Intelligence...
    </div>
  );

  if (!data) return (
    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#fef2f2', borderRadius: '20px', fontWeight: 800, color: '#ef4444', fontSize: '0.9rem' }}>
      Failed to synchronize safety data.
    </div>
  );

  return (
    <div style={cardStyle} className="custom-scrollbar">
      {/* Close Button */}
      <button 
        onClick={onClose} 
        style={{ 
          position: 'absolute', 
          top: '16px', 
          right: '16px', 
          background: '#f1f5f9', 
          border: 'none', 
          width: '32px', 
          height: '32px', 
          borderRadius: '50%', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          transition: 'all 0.2s',
          zIndex: 10
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ padding: '3px 8px', backgroundColor: '#eef2ff', color: '#6366f1', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 900 }}>CODE: {productCode}</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
              Analyzed Company: {data.target_manufacturer || 'N/A'}
            </h2>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, margin: 0 }}>
          MAUDE Adverse Event Intelligence Profile for {kNumber} (Last 3 Years)
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Event Type Breakdown */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '0.6rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Event Distribution</h3>
          <div style={{ height: '180px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.event_types} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="term" type="category" width={80} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px', fontSize: '0.7rem' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.event_types?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Manufacturers */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '0.6rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Key Manufacturers</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.manufacturers?.slice(0, 4).map((m: any, idx: number) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '8px 12px', 
                backgroundColor: 'white', 
                borderRadius: '10px', 
                border: '1px solid #f1f5f9'
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.term}</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '5px' }}>{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#fffbeb', borderRadius: '10px', color: '#92400e', fontSize: '0.65rem', fontWeight: 700, border: '1px solid #fef3c7' }}>
        NOTICE: MAUDE data represents clinical report counts and does not establish a definitive causal relationship.
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
