import React, { useState, useRef, useEffect } from 'react';
import { useSearchContext } from '../context/SearchContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatPanelProps {
  onSearch: () => void;
}

const suggestions = [
  { title: "Indications & Usage", query: "What are the indications for Ozempic?" },
  { title: "Boxed Warnings", query: "Show me the boxed warning for Fentanyl." },
  { title: "Adverse Reactions", query: "List all adverse events for Abacavir." },
  { title: "Drug Interactions", query: "Does Ibuprofen interact with Aspirin?" }
];

const getSnippetCount = (s: any) => {
  const n =
    s?.snippets_returned ??
    s?.snippet_count ??
    s?.evidence_count ??
    s?.snippets ??
    0;
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
};

const getEvidenceLimited = (s: any, resultsLen: number) => {
  // Prefer an explicit backend flag if you add it later:
  if (typeof s?.evidence_limited === 'boolean') return s.evidence_limited;

  // Otherwise infer: if we used snippets but results list is larger than what could be fetched
  // (works if backend returns any of these counts)
  const usedLabels = Number(s?.labels_used ?? s?.labels_considered ?? s?.labels_fetched ?? 0) || 0;
  if (usedLabels > 0 && resultsLen > usedLabels) return true;

  // If you have a “limit hit” flag:
  if (typeof s?.limit_hit === 'boolean') return s.limit_hit;

  return false;
};

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
  if (s.includes("database") || s.includes("db") || s.includes("query")) return 1;
  if (s.includes("evidence") || s.includes("section") || s.includes("label")) return 2;
  if (s.includes("writing answer") || s.includes("composing answer") || s.includes("answer")) return 3;
  if (s.includes("finalizing") || s.includes("reasoning")) return 4;

  // default / early
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
  const {
    searchTerm,
    setSearchTerm,
    setMedAnswer,
    setSummary,
    setInputType,
    results,
    setResults,
    setSetIds,
    setTotalResults,
    setCurrentPage,
    filters,
    setPrompt,
    chatHistory,
    setChatHistory,
    generatedSql,
    setGeneratedSql,
    setFilters,
    setDirectAnswer,
    setHighlightedSetId,
    loadingStatus,
    setLoadingStatus,
    searchMode,
    setAgentFlow,
    setReasoning,
    setDebugIntent,
    setDebugPlan,
    debugStats,
    setDebugStats,
    setTraceLog,
  } = useSearchContext();

  const [isLoading, setIsLoading] = useState(false);
  const [searchCategory, setSearchCategory] = useState("Drugs");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAnsweredQuestionRef = useRef<string>("");

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

    const currentSqlContext = generatedSql;

    const updatedHistory = [...chatHistory, { role: 'user' as const, content: queryText }];
    setChatHistory(updatedHistory);
    setSearchTerm('');
    setIsLoading(true);
    setCurrentPage(1);
    setSummary('');
    setInputType('');
    setGeneratedSql('');
    setDirectAnswer('');
    setAgentFlow([]);
    setReasoning('');
    
    // Set initial loading status based on mode
    setLoadingStatus(searchMode === 'v2' ? "Agent is thinking..." : "Generating SQL...");

    const payload = {
      query: queryText,
      chat_history: updatedHistory,
      current_sql: currentSqlContext,
      category: searchCategory,
      labelingTypes: filters.labelingType,
      applicationTypes: filters.applicationType,
      labelingSections: filters.labelingSection,
    };

    onSearch();

    try {
      if (searchMode === 'v2') {
        // --- V2 Agentic Search Path ---
        const searchResponse = await fetch("/api/search_agentic_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        });

        if (!searchResponse.body) {
        throw new Error("No streaming body returned from /api/search_agentic_stream");
        }

        const reader = searchResponse.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let buffer = "";
        let finalPayload: any = null;
        let answerText = "";
        let hasStreamedAnswer = false;
        let answerMsgIndex = -1;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) continue;
                const evt = JSON.parse(line);
                if (evt.type === "status") {
                    setLoadingStatus(evt.text || "Working…");

                } else if (evt.type === "answer_start") {
                    hasStreamedAnswer = true;
                    // Create a placeholder assistant message we will update as chunks arrive
                    setChatHistory(prev => {
                        answerMsgIndex = prev.length;
                        return [...prev, { role: "assistant" as const, content: "" }];
                    });

                } else if (evt.type === "chunk") {
                    const t = evt.text || "";
                    if (!t) continue;
                    answerText += t;
                    // Update the placeholder message live
                    setChatHistory(prev => {
                        const next = [...prev];
                        const idx = answerMsgIndex >= 0 ? answerMsgIndex : next.length - 1;
                        if (idx >= 0 && next[idx]) {
                        next[idx] = { role: "assistant", content: answerText };
                        }
                        return next;
                    });
                } else if (evt.type === "answer_end") {
                    // optional: do nothing

                } else if (evt.type === "error") {
                    setChatHistory(prev => [...prev, { role: "assistant", content: `Error: ${evt.error}` }]);
                    setIsLoading(false);
                    setLoadingStatus("");
                    return;

                } else if (evt.type === "final") {
                    finalPayload = evt.payload;
                }
            }
        }

        // now handle the final payload exactly like your old v2 code:
        const searchData = finalPayload;

        if (!searchData) {
        setChatHistory(prev => [...prev, { role: "assistant", content: "No response received." }]);
        setResults([]);
        setTotalResults(0);
        setSetIds([]);
        setIsLoading(false);
        setLoadingStatus("");
        return;
        }

        // ✅ debug panels
        setDebugIntent(searchData.debug_intent || null);
        setDebugPlan(searchData.debug_plan || null);
        setDebugStats(searchData.debug_stats || null);
        setTraceLog(searchData.trace_log || []);

        // ✅ results panel
        if (Array.isArray(searchData.results)) {
        setResults(searchData.results);
        setTotalResults(searchData.total_counts ?? searchData.results.length);

        const extractedIds = searchData.results.map((r: any) => r?.SET_ID || r?.set_id || "").filter(Boolean);
        setSetIds(extractedIds);
        } else {
        setResults([]);
        setTotalResults(0);
        setSetIds([]);
        }


        if (!hasStreamedAnswer) {
            // No chunks came through (fallback): show final answer normally
            if (searchData.med_answer) {
                setChatHistory(prev => [...prev, { role: "assistant", content: searchData.med_answer }]);
            } else {
                setChatHistory(prev => [...prev, { role: "assistant", content: "I couldn't generate an answer." }]);
            }
            } else {
            // We already streamed. Optionally ensure final matches last streamed text:
            if (searchData.med_answer && searchData.med_answer.length > answerText.length) {
                setChatHistory(prev => {
                const next = [...prev];
                const idx = answerMsgIndex >= 0 ? answerMsgIndex : next.length - 1;
                if (idx >= 0 && next[idx]) next[idx] = { role: "assistant", content: searchData.med_answer };
                return next;
                });
            }
        }

        if (searchData.agent_flow) setAgentFlow(searchData.agent_flow);
        if (searchData.reasoning) setReasoning(searchData.reasoning);

        setIsLoading(false);
        setLoadingStatus("");


      } else {
          // --- V1 Standard Search Path ---
          const searchResponse = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const searchData = await searchResponse.json();

          if (searchData.error) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${searchData.error}` }]);
            setIsLoading(false);
            setLoadingStatus("");
            return;
          }

          setGeneratedSql(searchData.generated_sql || '');
          setInputType(searchData.input_type || '');
          
          let historyWithMedAnswer = updatedHistory;
          
          if (searchData.generated_sql) {
            // A search was performed
            if (searchData.results) {
                setResults(searchData.results);
                setTotalResults(searchData.total_counts);
                const extractedIds = (searchData.results || []).map((r: any) => r?.SET_ID || r?.set_id || "");
                setSetIds(extractedIds);
                
                // Add explanation to chat
                if (searchData.med_answer) {
                    const assistantMsg = { role: 'assistant' as const, content: searchData.med_answer };
                    setChatHistory(prev => [...prev, assistantMsg]);
                    historyWithMedAnswer = [...updatedHistory, assistantMsg];
                }
                
                // Fetch metadata in background
                fetchMetadata(1, searchData.results);
            }
          } else {
             // No SQL generated - either conversational or irrelevant
             if (searchData.med_answer) {
                 // For conversational responses, we use the med_answer as the response
                 setChatHistory(prev => [...prev, { role: 'assistant' as const, content: searchData.med_answer }]);
                 setIsLoading(false);
                 setLoadingStatus("");
                 return; // Stop here for conversational inputs
             }
             
             // Fallback to general chat if no explanation provided
             await triggerGeneralChat(queryText);
             setIsLoading(false);
             setLoadingStatus("");
             return; 
          }

          // Step 2: Generate Answer (if answerable, results exist, AND it's a new or updated question)
          const isNewQuestion = searchData.refined_question !== lastAnsweredQuestionRef.current;
          
          if (searchData.is_answerable && searchData.results && searchData.results.length > 0 && isNewQuestion) {
              setLoadingStatus("Generating answer...");
              
              const answerPayload = {
                  results: searchData.results,
                  refined_question: searchData.refined_question,
                  chat_history: historyWithMedAnswer
              };

              const answerResponse = await fetch("/api/generate_answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(answerPayload),
              });

              if (!answerResponse.body) return;

              const reader = answerResponse.body.getReader();
              const decoder = new TextDecoder('utf-8');
              let answerText = "";
              
              // Add a placeholder message for the answer
              setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

              while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  
                  const chunk = decoder.decode(value, { stream: true });
                  answerText += chunk;
                  
                  // Update the last message with the streaming answer
                  setChatHistory(prev => {
                      const newHistory = [...prev];
                      newHistory[newHistory.length - 1] = { 
                          role: 'assistant', 
                          content: (searchData.refined_question ? `**Answer to "${searchData.refined_question}":**\n\n` : `**Answer:**\n\n`) + answerText 
                      };
                      return newHistory;
                  });
              }
              
              // Mark as answered to avoid repetitive answering until question updates
              lastAnsweredQuestionRef.current = searchData.refined_question;
          } else if (!isNewQuestion && searchData.is_answerable) {
              // If it's the same question, don't re-answer from scratch, just a brief confirmation
              setChatHistory(prev => [...prev, { role: 'assistant', content: "I've provided the answer above based on the current results. Is there anything specific you'd like me to clarify?" }]);
          }

          setIsLoading(false);
          setLoadingStatus("");
      }

    } catch (error) {
      console.error("Error executing search:", error);
      setSetIds([]);
      setResults([]);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "An unexpected error occurred." }]);
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  const triggerGeneralChat = async (query: string) => {
      setLoadingStatus("Thinking...");
      try {
          // Prepare chat payload for the general chat endpoint
          const formData = new FormData();
          formData.append('chatHistory', JSON.stringify([...chatHistory, { role: 'user', content: query }]));
          formData.append('doc_type', 'none'); 
          
          const response = await fetch("/api/chat", {
              method: "POST",
              body: formData,
          });

          if (!response.body) return;

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let chatText = "";
          
          setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              // The /api/chat endpoint might return JSON chunks like {"summary_chunk": "..."}
              // We need to parse or handle appropriately. 
              // Looking at backend, it yields json.dumps({"summary_chunk": ...})
              
              const lines = chunk.split('\n');
              for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                      const data = JSON.parse(line);
                      if (data.summary_chunk) {
                          chatText += data.summary_chunk;
                          setChatHistory(prev => {
                              const newHistory = [...prev];
                              newHistory[newHistory.length - 1] = { role: 'assistant', content: chatText };
                              return newHistory;
                          });
                      }
                  } catch (e) {
                      // If not JSON, might be raw text (depending on backend implementation)
                      // For now assume the backend yields summary_chunk JSON
                  }
              }
          }
      } catch (err) {
          console.error("General chat error:", err);
      }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchTerm);
  };

  const handleSuggestionClick = (query: string) => {
    executeSearch(query);
  };

  const fetchMetadata = async (page: number, items: any[]) => {
    try {
      const response = await fetch("/api/get_metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_ids: items }),
      });

      const data = await response.json();
      if (data && data.results) {
        setResults(data.results);
        setTotalResults(data.results.length);
        setCurrentPage(1);
      } else {
        setResults([]);
        setTotalResults(0);
      }
    } catch (error) {
      console.error("Error fetching metadata:", error);
      setResults([]);
      setTotalResults(0);
    }
  };

  const handleClear = () => {
      setChatHistory([]);
      setResults([]);
      setSetIds([]);
      setTotalResults(0);
      setCurrentPage(1);
      setSearchTerm('');
      setPrompt('');
      setMedAnswer('');
      setGeneratedSql('');
      setFilters({
        labelingType: [],
        applicationType: [],
        labelingSection: [],
      });
  };

  return (
    <div className="chat-panel">
      {chatHistory.length === 0 ? (
        // Initial View (Centered)
        <div className="initial-view-container">
            <h1 className="initial-view-title">How can I help you with drug labeling today?</h1>
            
            <form onSubmit={handleSearch} className="centered-search-form">
                <div className="centered-input-wrapper">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything about FDA Labels..."
                        disabled={isLoading}
                        autoFocus
                    />
                    <button type="submit" disabled={isLoading || !searchTerm.trim()} className="send-btn-centered">
                        ➤
                    </button>
                </div>
            </form>

            <div className="random-query-container">
                <button 
                    type="button" 
                    className="random-query-btn" 
                    onClick={async () => {
                        try {
                            setIsLoading(true);
                            const res = await fetch('/api/random_query');
                            if (res.ok) {
                                const data = await res.json();
                                setSearchTerm(data.query);
                            } else {
                                setSearchTerm("What are the indications for Ozempic?"); // Fallback
                            }
                            setIsLoading(false);
                        } catch (e) {
                            console.error(e);
                            setIsLoading(false);
                        }
                    }}
                    data-tooltip="Let AI generate a random question for you"
                >
                    Random Query
                </button>
            </div>

            <div className="suggestions-grid">
                {suggestions.map((suggestion, index) => (
                    <div 
                        key={index} 
                        className="suggestion-card" 
                        onClick={() => handleSuggestionClick(suggestion.query)}
                    >
                        <span className="suggestion-heading">{suggestion.title}</span>
                        <span className="suggestion-text">{suggestion.query}</span>
                    </div>
                ))}
            </div>
            
            {/* Hidden file input for consistency */}
            <input
                type="file"
                multiple
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={() => {}} // Placeholder
            />
        </div>
      ) : (
        // Chat View (History + Bottom Input)
        <>
            <div className="chat-history">
                {chatHistory.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.role}`}>
                    <div className="message-content">
                    {msg.role === 'assistant' ? (
                        <>
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                a: ({node, href, children, ...props}) => {
                                    if (href?.startsWith('search:')) {
                                        const query = href.replace('search:', '');
                                        return (
                                            <button 
                                                className="search-link-btn" 
                                                onClick={() => executeSearch(decodeURIComponent(query))}
                                                title={`Search for ${query}`}
                                            >
                                                {children} 🔍
                                            </button>
                                        );
                                    }
                                    if (href?.startsWith('#cite-')) {
                                        const setId = href.replace('#cite-', '');
                                        return (
                                            <button 
                                                className="citation-btn" 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setHighlightedSetId(setId);
                                                }}
                                                title="Highlight this result"
                                                style={{
                                                    color: '#0077cc',
                                                    background: '#e6f7ff',
                                                    border: '1px solid #bae7ff',
                                                    borderRadius: '4px',
                                                    padding: '0 4px',
                                                    fontSize: '0.85em',
                                                    cursor: 'pointer',
                                                    margin: '0 2px'
                                                }}
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

                        {(() => {
                        const isLastMsg = index === chatHistory.length - 1;
                        const snippetCount = getSnippetCount(debugStats);
                        //const evidenceLimited = getEvidenceLimited(debugStats, results?.length || 0);
                        console.log(debugStats);
                        const shouldShow =
                            searchMode === 'v2' &&
                            msg.role === 'assistant' &&
                            isLastMsg &&
                            !isLoading &&
                            snippetCount > 0;

                        if (!shouldShow) return null;

                        return (
                            <div
                            style={{
                                marginTop: 10,
                                padding: '10px 12px',
                                borderRadius: 10,
                                background: '#fff7ed',
                                border: '1px solid #fed7aa',
                                borderLeft: '6px solid #fb923c',
                                color: '#7c2d12',
                                fontSize: 13,
                                lineHeight: 1.5,
                                fontWeight: 650
                            }}
                            >
                            <div style={{ fontWeight: 900, marginBottom: 4 }}>
                                ⚠️ Evidence limitation notice
                            </div>
                            <div>
                                To fit input size constraints, this answer was generated from selected sections in the
                                highest-ranked results, not all matching labels. Additional results may contain relevant details.
                            </div>
                            </div>
                        );
                        })()}
                        </>
                    ) : (
                        msg.content
                    )}
                    </div>
                </div>
                ))}
                {isLoading && (
                <div className="chat-loading-container afd-progressWrap">
                    {/* Big visual progress dock (uses the empty space) */}
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
                <button onClick={handleClear} className="clear-chat-btn" title="Clear Chat">
                    Clear Chat
                </button>
            </div>
        </>
      )}
    </div>
  );
};

export default ChatPanel;
