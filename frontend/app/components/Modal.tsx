'use client';

import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}

export default function Modal({ isOpen, onClose, title, children, compact = false }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{ zIndex: 2000 }} // Keep z-index here to ensure it's on top
    >
      <div 
        className="modal-content animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
        style={compact ? { maxWidth: '500px' } : {}}
      >
        <div className="modal-header" style={compact ? { padding: '1rem 1.25rem', borderBottom: 'none' } : {}}>
          <h3 style={{ 
            margin: 0, 
            fontSize: compact ? '1.1rem' : '1.25rem', 
            fontWeight: compact ? 600 : 800, 
            color: '#0f172a',
            letterSpacing: '-0.025em'
          }}>{title}</h3>
          <button 
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: compact ? '28px' : '32px',
              height: compact ? '28px' : '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              transition: 'all 0.2s'
            }}
          >
            <svg width={compact ? "16" : "20"} height={compact ? "16" : "20"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="modal-body" style={compact ? { padding: '0 1.25rem 1.25rem 1.25rem' } : {}}>
          {children}
        </div>
      </div>
    </div>
  );
}
