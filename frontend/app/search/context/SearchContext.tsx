import React, { createContext, useContext, useState } from 'react';
import { Filters, ResultItem } from '../types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Optional debug payloads for better Reasoning UI.
 * These are safe to keep as loose objects because backend shapes may evolve.
 */
export type DebugObject = Record<string, any> | null;

interface SearchContextProps {
  // Core query controls
  searchTerm: string;
  setSearchTerm: (val: string) => void;

  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  applyFilters: () => void;

  // Summary / answer
  summary: string;
  setSummary: React.Dispatch<React.SetStateAction<string>>;

  inputType: string;
  setInputType: (inputType: string) => void;

  medAnswer: string;
  setMedAnswer: React.Dispatch<React.SetStateAction<string>>;

  directAnswer: string;
  setDirectAnswer: React.Dispatch<React.SetStateAction<string>>;

  // Results
  results: ResultItem[];
  setResults: React.Dispatch<React.SetStateAction<ResultItem[]>>;

  allResults: ResultItem[];
  setAllResults: React.Dispatch<React.SetStateAction<ResultItem[]>>;

  setIds: string[];
  setSetIds: React.Dispatch<React.SetStateAction<string[]>>;

  totalResults: number;
  setTotalResults: React.Dispatch<React.SetStateAction<number>>;

  // Pagination
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  resultsPerPage: number;

  // Chat + prompt
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;

  clarificationMessage: string;
  setClarificationMessage: React.Dispatch<React.SetStateAction<string>>;

  AI_ref: string;
  setAI_ref: React.Dispatch<React.SetStateAction<string>>;

  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  // SQL debugging / manual execution
  generatedSql: string;
  setGeneratedSql: React.Dispatch<React.SetStateAction<string>>;

  // UI helpers
  highlightedSetId: string | null;
  setHighlightedSetId: React.Dispatch<React.SetStateAction<string | null>>;

  loadingStatus: string;
  setLoadingStatus: React.Dispatch<React.SetStateAction<string>>;

  // Search Mode: 'semantic' (standard) or 'study' (counts/aggregation)
  searchMode: 'semantic' | 'study';
  setSearchMode: (mode: 'semantic' | 'study') => void;

  // Agent debug panels
  agentFlow: string[];
  setAgentFlow: React.Dispatch<React.SetStateAction<string[]>>;

  reasoning: string;
  setReasoning: React.Dispatch<React.SetStateAction<string>>;

  debugIntent: DebugObject;
  setDebugIntent: React.Dispatch<React.SetStateAction<DebugObject>>;

  debugPlan: DebugObject;
  setDebugPlan: React.Dispatch<React.SetStateAction<DebugObject>>;

  debugStats: DebugObject;
  setDebugStats: React.Dispatch<React.SetStateAction<DebugObject>>;

  traceLog: string[];
  setTraceLog: React.Dispatch<React.SetStateAction<string[]>>;
}

const SearchContext = createContext<SearchContextProps | undefined>(undefined);

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const [filters, setFilters] = useState<Filters>({
    labelingType: [],
    applicationType: [],
    labelingSection: [],
  });

  const [searchMode, setSearchMode] = useState<'semantic' | 'study'>('semantic');

  const [agentFlow, setAgentFlow] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState('');

  const [summary, setSummary] = useState('');
  const [medAnswer, setMedAnswer] = useState('');
  const [directAnswer, setDirectAnswer] = useState('');

  const [highlightedSetId, setHighlightedSetId] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [inputType, setInputType] = useState('');

  const [results, setResults] = useState<ResultItem[]>([]);
  const [allResults, setAllResults] = useState<ResultItem[]>([]);

  const [clarificationMessage, setClarificationMessage] = useState('');

  const [setIds, setSetIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [AI_ref, setAI_ref] = useState('');

  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [generatedSql, setGeneratedSql] = useState('');

  // NEW: debug payloads for reasoning panel
  const [debugIntent, setDebugIntent] = useState<DebugObject>(null);
  const [debugPlan, setDebugPlan] = useState<DebugObject>(null);
  const [debugStats, setDebugStats] = useState<DebugObject>(null);
  const [traceLog, setTraceLog] = useState<string[]>([]);

  const resultsPerPage = 5;

  const applyFilters = () => {
    // Logic for applying filters
  };

  return (
    <SearchContext.Provider
      value={{
        searchTerm,
        setSearchTerm,

        filters,
        setFilters,
        applyFilters,

        summary,
        setSummary,

        inputType,
        setInputType,

        medAnswer,
        setMedAnswer,

        directAnswer,
        setDirectAnswer,

        results,
        setResults,

        allResults,
        setAllResults,

        setIds,
        setSetIds,

        prompt,
        setPrompt,

        clarificationMessage,
        setClarificationMessage,

        AI_ref,
        setAI_ref,

        totalResults,
        setTotalResults,

        currentPage,
        setCurrentPage,

        resultsPerPage,

        chatHistory,
        setChatHistory,

        generatedSql,
        setGeneratedSql,

        highlightedSetId,
        setHighlightedSetId,

        loadingStatus,
        setLoadingStatus,

        searchMode,
        setSearchMode,

        agentFlow,
        setAgentFlow,

        reasoning,
        setReasoning,

        // NEW debug fields
        debugIntent,
        setDebugIntent,

        debugPlan,
        setDebugPlan,

        debugStats,
        setDebugStats,

        traceLog,
        setTraceLog,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearchContext = () => {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearchContext must be used within a SearchProvider");
  return context;
};
