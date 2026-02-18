'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface UserSession {
  is_authenticated: boolean;
  username?: string;
  ai_provider?: string;
  custom_gemini_key?: string;
  openai_api_key?: string;
  openai_base_url?: string;
  openai_model_name?: string;
  is_internal?: boolean;
}

interface UserContextType {
  session: UserSession | null;
  loading: boolean;
  updateAiProvider: (provider: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  authModal: 'login' | 'register' | 'change_password' | null;
  openAuthModal: (type: 'login' | 'register' | 'change_password' | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModal, setAuthModal] = useState<'login' | 'register' | 'change_password' | null>(null);

  const openAuthModal = (type: 'login' | 'register' | 'change_password' | null) => {
    setAuthModal(type);
  };

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/auth/session');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setSession(data);
    } catch (e) {
      console.error("Failed to fetch session", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const updateAiProvider = async (provider: string) => {
    try {
      const res = await fetch('/api/dashboard/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'ai_provider': provider })
      });
      const data = await res.json();
      if (data.success) {
        setSession(prev => prev ? { ...prev, ai_provider: provider } : null);
      }
    } catch (e) {
      console.error("Failed to update AI provider", e);
    }
  };

  return (
    <UserContext.Provider value={{ session, loading, updateAiProvider, refreshSession: fetchSession, authModal, openAuthModal }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
