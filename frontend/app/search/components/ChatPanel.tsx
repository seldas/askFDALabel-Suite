import React, { useState, useRef, useEffect } from 'react';
import { useSearchContext } from '../context/SearchContext';
import { useUser } from '../../context/UserContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatPanelProps {
  onSearch: () => void;
}

const semanticSuggestions = [
  { title: "Safety Comparison", query: "Compare the renal safety profile of Ozempic vs Mounjaro." },
  { title: "Dosing Strategy", query: "What is the recommended titration schedule for a patient with renal impairment?" },
  { title: "Clinical Evidence", query: "What were the primary endpoints in the clinical studies for Keytruda?" },
  { title: "Mechanism of Action", query: "How do SGLT2 inhibitors help in managing heart failure?" }
];

const studySuggestions = [
  { title: "Study Analysis", query: "Design a study protocol for comparing liver toxicity across all SGLT2 inhibitors." },
  { title: "Population Study", query: "Analyze labeling differences for pediatric populations in recent biologics." },
  { title: "Adverse Event Study", query: "Generate a summary of cardiovascular safety signals across GLP-1 agonists." },
  { title: "Compliance Review", query: "Study the consistency of Black Box warnings for NSAIDs." }
];

const PROGRESS_STEPS = [
  { key: "plan", label: "Planning" },
  { key: "db", label: "Searching labels" },
  { key: "evidence", label: "Fetching evidence" },
  { key: "answer", label: "Writing answer" },
  { key: "finalize", label: "Finalizing" },
];

function inferStage(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("planning")) return 0;
  if (s.includes("searching") || s.includes("database") || s.includes("query")) return 1;
  if (s.includes("fetching") || s.includes("evidence") || s.includes("excerpts")) return 2;
  if (s.includes("writing") || s.includes("generating") || s.includes("answer")) return 3;
  if (s.includes("finalizing") || s.includes("reasoning")) return 4;
  return 0;
}

const Spinner = () => (
  <span className="afd-progress__spinner" aria-hidden />
);

const StepIcon = ({ state }: { state: "todo" | "active" | "done" }) => {
  if (state === "done") return <span className="afd-progress__icon afd-progress__icon--done">✓</span>;
  if (state === "active") return <span className="afd-progress__icon afd-progress__icon--active"><Spinner /></span>;
  return <span className="afd-progress__icon afd-progress__icon--todo" />;
};

const ProgressDock = ({ status }: { status: string }) => {
  const stage = inferStage(status);
  return (
    <div className="afd-progress">
      <div className="afd-progress__card">
        <div className="afd-progress__header">
          <div className="afd-progress__orb" aria-hidden />
          <div className="afd-progress__headText">
            <div className="afd-progress__title">Working on your question</div>
            <div className="afd-progress__subtitle">{status || "Starting…"}</div>
          </div>
        </div>
        <div className="afd-progress__steps">
          {PROGRESS_STEPS.map((st, idx) => {
            const state: "todo" | "active" | "done" =
              idx < stage ? "done" : idx === stage ? "active" : "todo";
            return (
              <div key={st.key} className={`afd-progress__step afd-progress__step--${state}`}>
                <StepIcon state={state} />
                <div className="afd-progress__label">{st.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ChatPanel: React.FC<ChatPanelProps> = ({ onSearch }) => {
  const { session } = useUser();
  const {
    searchTerm,
    setSearchTerm,
    setResults,
    setSetIds,
    setTotalResults,
    setCurrentPage,
    filters,
    chatHistory,
    setChatHistory,
    setHighlightedSetId,
    loadingStatus,
    setLoadingStatus,
    searchMode,
    setSearchMode,
    setAgentFlow,
    setReasoning,
    setDebugIntent,
    setDebugPlan,
    debugStats,
    setDebugStats,
    setTraceLog,
  } = useSearchContext();

  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (searchTerm.trim()) {
        executeSearch(searchTerm);
      }
    }
  };

  const executeSearch = async (queryText: string) => {
    if (!queryText.trim()) return;

    const updatedHistory = [...chatHistory, { role: 'user' as const, content: queryText }];
    setChatHistory(updatedHistory);
    setSearchTerm('');
    setIsLoading(true);
    setCurrentPage(1);
    setAgentFlow([]);
    setReasoning('');
    setLoadingStatus("Initializing Agent...");

    const payload = {
      query: queryText,
      chat_history: updatedHistory,
      search_mode: searchMode,
      labelingTypes: filters.labelingType,
      applicationTypes: filters.applicationType,
      labelingSections: filters.labelingSection,
      ai_provider: session?.ai_provider,
    };

    onSearch();

    try {
      // All searches now use the agentic stream endpoint
      const endpoint = "/api/search/search_agentic_stream";
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let finalPayload: any = null;
      let answerText = "";
      let answerMsgIndex = -1;

      while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
              if (!line.trim()) continue;
              try {
                  const evt = JSON.parse(line);
                  if (evt.type === "status") {
                      setLoadingStatus(evt.text || "Working…");
                  } else if (evt.type === "answer_start") {
                      setChatHistory(prev => {
                          answerMsgIndex = prev.length;
                          return [...prev, { role: "assistant" as const, content: "" }];
                      });
                  } else if (evt.type === "chunk") {
                      answerText += (evt.text || "");
                      setChatHistory(prev => {
                          const next = [...prev];
                          const idx = answerMsgIndex >= 0 ? answerMsgIndex : next.length - 1;
                          if (idx >= 0 && next[idx]) next[idx] = { role: "assistant", content: answerText };
                          return next;
                      });
                  } else if (evt.type === "error") {
                      setChatHistory(prev => [...prev, { role: "assistant", content: `Error: ${evt.error}` }]);
                      setIsLoading(false);
                      return;
                  } else if (evt.type === "final") {
                      finalPayload = evt.payload;
                  }
              } catch (e) {
                  console.error("Parse error in stream:", e);
              }
          }
      }

      if (finalPayload) {
          setDebugIntent(finalPayload.debug_intent || null);
          setDebugPlan(finalPayload.debug_plan || null);
          setDebugStats(finalPayload.debug_stats || null);
          setTraceLog(finalPayload.trace_log || []);
          
          if (Array.isArray(finalPayload.results)) {
              setResults(finalPayload.results);
              setTotalResults(finalPayload.total_counts ?? finalPayload.results.length);
              const extractedIds = finalPayload.results.map((r: any) => r?.SET_ID || r?.set_id || "").filter(Boolean);
              setSetIds(extractedIds);
          }
          
          if (finalPayload.agent_flow) setAgentFlow(finalPayload.agent_flow);
          if (finalPayload.reasoning) setReasoning(finalPayload.reasoning);
      }

      setIsLoading(false);
      setLoadingStatus("");

    } catch (error) {
      console.error("Search error:", error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "An unexpected error occurred." }]);
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchTerm);
  };

  const handleClear = () => {
      setChatHistory([]);
      setResults([]);
      setSetIds([]);
      setTotalResults(0);
      setCurrentPage(1);
      setSearchTerm('');
  };

  return (
    <div className="chat-panel">
      {chatHistory.length === 0 ? (
        <div className="initial-view-container">
            <div className="search-mode-selector">
              <button
                onClick={() => setSearchMode('semantic')}
                className={`mode-btn ${searchMode === 'semantic' ? 'active' : ''}`}
              >
                Semantic Search
              </button>
              <button
                onClick={() => setSearchMode('study')}
                className={`mode-btn ${searchMode === 'study' ? 'active' : ''}`}
              >
                Study & Counts
              </button>
            </div>

            <h1 className="hero-title-animated" style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1rem' }}>
              {searchMode === 'semantic' ? 'Semantic Search' : 'Aggregation Study'}
            </h1>
            
            <form onSubmit={handleSearch} className="centered-search-form">
                <div className="centered-input-wrapper">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={searchMode === 'semantic' ? "Ask about clinical data, safety, or dosing..." : "Ask for trends, counts, or comparative studies..."}
                        disabled={isLoading}
                        autoFocus
                    />
                    <button type="submit" disabled={isLoading || !searchTerm.trim()} className="send-btn-centered">
                        ➤
                    </button>
                </div>
            </form>

            <div className="suggestions-grid">
                {(searchMode === 'semantic' ? semanticSuggestions : studySuggestions).map((suggestion, index) => (
                    <div 
                        key={index} 
                        className="suggestion-card" 
                        onClick={() => executeSearch(suggestion.query)}
                    >
                        <span className="suggestion-heading">{suggestion.title}</span>
                        <span className="suggestion-text">{suggestion.query}</span>
                    </div>
                ))}
            </div>
        </div>
      ) : (
        <>
            <div className="chat-history">
                {chatHistory.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.role}`}>
                    <div className="message-content">
                    {msg.role === 'assistant' ? (
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                a: ({node, href, children, ...props}) => {
                                    if (href?.startsWith('#cite-')) {
                                        const setId = href.replace('#cite-', '');
                                        return (
                                            <button 
                                                className="citation-btn" 
                                                onClick={() => setHighlightedSetId(setId)}
                                                title="Highlight result"
                                            >
                                                {children}
                                            </button>
                                        );
                                    }
                                    return <a href={href} {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
                                }
                            }}
                        >
                            {msg.content}
                        </ReactMarkdown>
                    ) : (
                        msg.content
                    )}
                    </div>
                </div>
                ))}
                {isLoading && (
                <div className="chat-loading-container afd-progressWrap">
                    <ProgressDock status={loadingStatus} />
                </div>
                )}
                <div ref={chatEndRef} />
            </div>

            <div className="chat-input-area">
                <form onSubmit={handleSearch} className="chat-form">
                    <div className="input-wrapper">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask a follow-up question..."
                            disabled={isLoading}
                        />
                        <button type="submit" disabled={isLoading || !searchTerm.trim()}>
                            ➤
                        </button>
                    </div>
                </form>
                <button onClick={handleClear} className="clear-chat-btn">
                    Clear Chat
                </button>
            </div>
        </>
      )}
    </div>
  );
};

export default ChatPanel;
