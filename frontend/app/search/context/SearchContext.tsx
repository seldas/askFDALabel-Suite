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
  toggleFilterTerm: (category: keyof Filters, term: string) => void;
  toggleFilterFlag: (flag: 'isRx' | 'isRLD') => void;
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

  resultsLimit: number;
  setResultsLimit: (val: number) => void;
  resultsMessage: string;
  setResultsMessage: (val: string) => void;
  applyDataFilters: () => void;
  
  isRefining: boolean;
  lastRefId: string | null;
  refineResponseWithLabel: (setId: string, productName: string) => Promise<void>;

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

  // Fixed Mode: 'semantic'
  searchMode: string;
  setSearchMode: React.Dispatch<React.SetStateAction<string>>;

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
    drugNames: [],
    adverseEvents: [],
    ndcs: [],
    isRx: false,
    isRLD: false,
  });

  const toggleFilterTerm = (category: keyof Filters, term: string) => {
    setFilters(prev => {
      const current = prev[category];
      if (Array.isArray(current)) {
        if (current.includes(term)) {
          return { ...prev, [category]: current.filter(t => t !== term) };
        } else {
          return { ...prev, [category]: [...current, term] };
        }
      }
      return prev;
    });
  };

  const toggleFilterFlag = (flag: 'isRx' | 'isRLD') => {
    setFilters(prev => ({ ...prev, [flag]: !prev[flag] }));
  };

  const [searchMode, setSearchMode] = useState('semantic');

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
  const [resultsLimit, setResultsLimit] = useState(5000);
  const [resultsMessage, setResultsMessage] = useState('');

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [generatedSql, setGeneratedSql] = useState('');

  // NEW: debug payloads for reasoning panel
  const [debugIntent, setDebugIntent] = useState<DebugObject>(null);
  const [debugPlan, setDebugPlan] = useState<DebugObject>(null);
  const [debugStats, setDebugStats] = useState<DebugObject>(null);
  const [traceLog, setTraceLog] = useState<string[]>([]);

  const [isRefining, setIsRefining] = useState(false);
  const [lastRefId, setLastRefId] = useState<string | null>(null);

  const refineResponseWithLabel = async (setId: string, productName: string) => {
    if (chatHistory.length === 0) return;
    setIsRefining(true);
    setLoadingStatus(`Refining last response with ${productName} labeling...`);
    try {
      const response = await fetch('/api/search/refine_chat', {
        method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                set_id: setId,
                product_name: productName,
                chat_history: chatHistory,
                filters: filters
              }),
            });

      const data = await response.json();

      if (data.error) {
        alert(data.error);
      } else if (data.refined_json) {
        setLastRefId(setId);
        // Update the last message in history
        setChatHistory(prev => {
          const newHistory = [...prev];
          const lastMsg = newHistory[newHistory.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content = data.refined_json.text;
            // Optionally store metadata like related sections if needed for rendering
            (lastMsg as any).relatedSections = data.refined_json['related sections'];
            (lastMsg as any).refLabel = `${productName} [${setId}]`;
            (lastMsg as any).originalContent = data.original_text; // For diffing
          }
          return newHistory;
        });
      }
    } catch (err) {
      console.error("Refinement failed:", err);
    } finally {
      setIsRefining(false);
      setLoadingStatus('');
    }
  };

  const resultsPerPage = 5;

  const applyDataFilters = React.useCallback(async () => {
    try {
      setLoadingStatus('Filtering data...');

const response = await fetch('/api/search/filter_data', {
  method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, limit: resultsLimit }),
      });
      const data = await response.json();
      setResults(data.results || []);
      setTotalResults(data.total_counts || 0);
      setResultsMessage(data.message || '');
      setCurrentPage(1);
    } catch (err) {
      console.error("Failed to filter data:", err);
    } finally {
      setLoadingStatus('');
    }
  }, [filters, resultsLimit]);

  // Real-time update when filters change
  React.useEffect(() => {
    // Only auto-apply if there's at least one filter or we want to show all initially
    applyDataFilters();
  }, [filters, resultsLimit, applyDataFilters]);

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
        toggleFilterTerm,
        toggleFilterFlag,
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

        resultsLimit,
        setResultsLimit,
        resultsMessage,
        setResultsMessage,
        applyDataFilters,

        isRefining,
        lastRefId,
        refineResponseWithLabel,

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
