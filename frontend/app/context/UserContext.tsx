'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

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

export interface ActiveTask {
  id: number;
  project_id: number;
  project_title: string;
  target_pt: string;
  progress: number;
  status: string;
}

interface UserContextType {
  session: UserSession | null;
  loading: boolean;
  activeTasks: ActiveTask[];
  updateAiProvider: (provider: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  authModal: 'login' | 'register' | 'change_password' | null;
  openAuthModal: (type: 'login' | 'register' | 'change_password' | null) => void;
  refreshTasks: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [authModal, setAuthModal] = useState<'login' | 'register' | 'change_password' | null>(null);
  const pathname = usePathname();

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

  const refreshTasks = useCallback(async () => {
    if (!session?.is_authenticated) return;
    try {
      const res = await fetch('/api/dashboard/ae_report/active_tasks');
      if (res.ok) {
        const data = await res.json();
        setActiveTasks(data);
      }
    } catch (e) {
      console.error("Failed to fetch active tasks", e);
    }
  }, [session?.is_authenticated]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Task polling effect
  useEffect(() => {
    if (session?.is_authenticated && pathname === '/dashboard') {
      refreshTasks();
      const interval = setInterval(refreshTasks, 60000); // Poll every 60 seconds
      return () => clearInterval(interval);
    } else {
      setActiveTasks([]);
    }
  }, [session?.is_authenticated, refreshTasks, pathname]);

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
    <UserContext.Provider value={{ session, loading, activeTasks, updateAiProvider, refreshSession: fetchSession, authModal, openAuthModal, refreshTasks }}>
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
