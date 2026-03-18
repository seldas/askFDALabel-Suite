import React, { useState, useRef, useEffect } from 'react';
import { useSearchContext } from '../context/SearchContext';
import { useUser } from '../../context/UserContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ChatPanelProps {
  onSearch: () => void;
}

const semanticSuggestions = [
  { title: "Safety Comparison", query: "Compare the renal safety profile of Ozempic vs Mounjaro." },
  { title: "Dosing Strategy", query: "What is the recommended titration schedule for a patient with renal impairment?" },
  { title: "Clinical Evidence", query: "What were the primary endpoints in the clinical studies for Keytruda?" },
  { title: "Mechanism of Action", query: "How do SGLT2 inhibitors help in managing heart failure?" }
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

const SimpleProgress = ({ status }: { status: string }) => {
  return (
    <div className="afd-progress afd-progress--simple">
      <div className="afd-progress__card">
        <div className="afd-progress__header">
          <Spinner />
          <div className="afd-progress__headText">
            <div className="afd-progress__title">{status || "AI is thinking..."}</div>
          </div>
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
    setAgentFlow,
    setReasoning,
    setDebugIntent,
    setDebugPlan,
    setDebugStats,
    setTraceLog,
    toggleFilterTerm,
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
    setLoadingStatus("Thinking...");

    const payload = {
      query: queryText,
      chat_history: updatedHistory,
      ai_provider: session?.ai_provider,
    };

    onSearch();

    try {
      const endpoint = "/api/search/chat";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      const answerText = result.response_text;

      setChatHistory(prev => [...prev, { role: "assistant" as const, content: answerText }]);
      setIsLoading(false);
      setLoadingStatus("");
    } catch (error) {
      console.error("Chat error:", error);
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
            <h1 className="hero-title-animated" style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1rem' }}>
              Ask Elsa
            </h1>
            
            <form onSubmit={handleSearch} className="centered-search-form">
                <div className="centered-input-wrapper">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about clinical data, safety, or dosing..."
                        disabled={isLoading}
                        autoFocus
                    />
                    <button type="submit" disabled={isLoading || !searchTerm.trim()} className="send-btn-centered">
                        ➤
                    </button>
                </div>
            </form>

            <div className="suggestions-grid">
                {semanticSuggestions.map((suggestion, index) => (
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
                            rehypePlugins={[rehypeRaw]}
                            components={{
                                // @ts-ignore - custom tag
                                annotation: ({node, className, children}) => {
                                    const cls = className || "";
                                    const content = children?.toString() || "";
                                    const baseUrl = window.location.origin;

                                    let onClick = undefined;
                                    if (cls === 'drug') {
                                        onClick = () => toggleFilterTerm('drugNames', content);
                                    } else if (cls === 'ndc') {
                                        onClick = () => toggleFilterTerm('ndcs', content);
                                    } else if (cls === 'adverse_events') {
                                        onClick = () => toggleFilterTerm('adverseEvents', content);
                                    }

                                    return (
                                        <span 
                                            className={`highlight-${cls}`} 
                                            onClick={onClick}
                                            style={onClick ? { cursor: 'pointer' } : {}}
                                        >
                                          {children}
                                        </span>
                                    );
                                },
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
                    <SimpleProgress status={loadingStatus} />
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
