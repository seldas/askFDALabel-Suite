'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f8fafc',
      padding: '20px'
    }}>
      <h1 style={{ color: '#1e293b', fontSize: '3rem', marginBottom: '1rem' }}>askFDALabel Suite</h1>
      <p style={{ color: '#64748b', fontSize: '1.25rem', marginBottom: '3rem', textAlign: 'center', maxWidth: '600px' }}>
        A unified platform for drug label analysis, safety screening, and agentic search.
      </p>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: '2rem',
        width: '100%',
        maxWidth: '1000px'
      }}>
        <AppCard 
          title="Agentic Search" 
          description="Semantically search across FDA drug labels with AI-powered reasoning."
          href="/search"
          icon="🔍"
          color="#3b82f6"
        />
        <AppCard 
          title="Drug Analyzer" 
          description="Deep analysis of drug labels, comparison, and FAERS safety trends."
          href="/dashboard"
          icon="📊"
          color="#8b5cf6"
        />
        <AppCard 
          title="DrugTox" 
          description="Advanced pharmacology intelligence for liver, heart, and kidney toxicity."
          href="/drugtox"
          icon="🧪"
          color="#10b981"
        />
      </div>
      
      <footer style={{ marginTop: '5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
        &copy; 2026 askFDALabel Project
      </footer>
    </div>
  );
}

function AppCard({ title, description, href, icon, color }: { title: string, description: string, href: string, icon: string, color: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '16px', 
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderTop: `6px solid ${color}`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
      }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>{icon}</div>
        <h2 style={{ color: '#1e293b', marginBottom: '0.75rem', fontSize: '1.5rem' }}>{title}</h2>
        <p style={{ color: '#64748b', lineHeight: '1.5' }}>{description}</p>
      </div>
    </Link>
  );
}
