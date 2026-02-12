'use client';

import Script from 'next/script';

export default function Page() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AskFDALabel - Drug Label Analyzer</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="stylesheet" href="/dashboard/style.css" />
        <link id="theme-stylesheet" rel="stylesheet" href="/dashboard/themes/modern.css" />
      </head>
      <body className="hp-main-layout">
        <div className="hp-container">
          {/* Navigation and Hero content */}
          <div className="hp-auth-nav">
            {/* Conditional rendering for authenticated users */}
            {true ? (
              <div>
                <div className="hp-ai-switcher">
                  <span style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 600 }}>AI:</span>
                  <select id="quick-ai-switcher">
                    <option value="gemini">Gemini</option>
                    <option value="gemma">Gemma 3 27B</option>
                    <option value="openai">OpenAI</option>
                    <option value="elsa">ELSA</option>
                  </select>
                  <button id="ai-config-btn" title="AI Configuration">&#9881;</button>
                </div>

                <div className="hp-user-badge">
                  <div className="hp-user-avatar">U</div>
                  <span className="hp-welcome-text">Signed in as <strong>User</strong></span>
                </div>

                <div className="hp-theme-container">
                  <button id="theme-toggle-btn" className="hp-nav-btn hp-btn-outline">
                    <span>&#x1F3A8;</span> Theme
                  </button>
                  <div id="theme-dropdown" style={{ display: 'none', position: 'absolute', top: '120%', right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '150px', overflow: 'hidden', zIndex: 100 }}>
                    <div className="theme-option" data-theme="default" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
                      <span>&#x1F4C4;</span> Default
                    </div>
                    <div className="theme-option" data-theme="scientific" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
                      <span>&#x1F52C;</span> Scientific
                    </div>
                    <div className="theme-option" data-theme="modern" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>&#x2728;</span> Modern
                    </div>
                    <div className="theme-option" data-theme="playful" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
                      <span>&#x1F388;</span> Playful
                    </div>
                  </div>
                </div>

                <a href="#" className="hp-nav-btn hp-btn-outline"><span>&#x1F4BC;</span> My Projects</a>
                <a href="#" className="hp-nav-btn hp-btn-outline"><span>&#x21A9;</span> Logout</a>
              </div>
            ) : (
              <div>
                <div className="hp-theme-container">
                  <button id="theme-toggle-btn" className="hp-nav-btn hp-btn-outline">
                    <span>&#x1F3A8;</span> Theme
                  </button>
                  <div id="theme-dropdown" style={{ display: 'none', position: 'absolute', top: '120%', right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '150px', overflow: 'hidden', zIndex: 100 }}>
                    <div className="theme-option" data-theme="modern" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>&#x2728;</span> Modern
                    </div>
                    <div className="theme-option" data-theme="default" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
                      <span>&#x1F4C4;</span> Default
                    </div>
                    <div className="theme-option" data-theme="playful" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
                      <span>&#x1F388;</span> Playful
                    </div>
                    <div className="theme-option" data-theme="scientific" style={{ padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
                      <span>&#x1F52C;</span> Scientific
                    </div>
                  </div>
                </div>

                <a href="#" className="hp-nav-btn hp-btn-outline"><span>&#x1F464;</span> Login</a>
                <a href="#" className="hp-nav-btn hp-btn-outline"><span>&#x2728;</span> Register</a>
              </div>
            )}
            <div className="hp-hero">
              <h1>AskFDALabel</h1>
              <p className="hp-hero-subtitle">The Intelligence Layer for Drug Safety & Analysis</p>
            </div>

            <div className="hp-action-center">
              {/* Excel upload and search form */}
              <div className="hp-import-row">
                <div id="excel-upload-box" className="hp-upload-box">
                  <div className="hp-icon-container">
                    {/* Animated CSS Pill */}
                    <div className="hp-pill-animation">
                      <div className="hp-pill-half hp-pill-indigo"></div>
                      <div className="hp-pill-half hp-pill-sky"></div>
                    </div>
                  </div>
                  <div className="hp-upload-text">Import FDALabel Excel</div>
                  <div className="hp-upload-hint">Drag & drop or click to browse files</div>
                  <input type="file" id="fdalabel-excel-upload" accept=".xlsx" style={{ display: 'none' }} />
                  
                  <span id="excel-file-info" style={{ display: 'none', fontSize: '0.9em', color: '#10b981', fontWeight: 600, marginTop: '15px' }}>
                    <span id="excel-file-name"></span>
                    <a href="#" id="remove-excel-file" style={{ marginLeft: '10px', color: '#94a3b8', fontWeight: 'normal', textDecoration: 'none' }}>&times;</a>
                  </span>
                </div>
              </div>

              <div className="hp-ad-bar">
                <div className="hp-source-header">
                  <img src="/dashboard/logo_FDALabel.jpg" alt="FDALabel Logo" className="hp-source-logo" />
                  <p className="hp-ad-text">&#x1F680; <strong>Transform your workflow.</strong> Get your customized drug list from the <strong>FDALabel website</strong> first.</p>
                </div>
                <div className="hp-import-links">
                  <a href="https://nctr-crs.fda.gov/fdalabel/ui/search" target="_blank">FDALabel Public Version</a>
                  <a href="https://fdalabel.fda.gov/fdalabel/ui/search" target="_blank">FDA Version</a>
                  <a href="https://fdalabel.fda.gov/fdalabel-r/ui/search" target="_blank">CDER-CBER version</a>
                </div>
              </div>

              <div className="hp-secondary-search">
                <span className="hp-search-label">Standard Search</span>
                <form id="search-form" action="/api/dashboard/search" method="get">
                  <div className="hp-search-wrapper">
                    <input type="text" id="drug-name-input" name="drug_name" placeholder="Search by name, Set ID, or NDC..." required />
                    <button type="submit" className="hp-search-btn">Search</button>
                  </div>
                </form>
              </div>
            </div>

            <div className="hp-features">
              <div className="hp-feature-card">
                <span className="hp-feature-icon">&#x1F4AC;</span>
                <h3>Focused Chat</h3>
                <p>Natural language interactions with full document citations.</p>
              </div>
              <div className="hp-feature-card">
                <span className="hp-feature-icon">&#x2696;</span>
                <h3>Label Compare</h3>
                <p>Deep section alignment for PLR and non-PLR formats.</p>
              </div>
              <div className="hp-feature-card">
                <span className="hp-feature-icon">&#x1F4CA;</span>
                <h3>ADE Profiling</h3>
                <p>Visualize FAERS trends and identify real-world safety signals.</p>
              </div>
              <div className="hp-feature-card">
                <span className="hp-feature-icon">&#x1F916;</span>
                <h3>DrugTox Agents</h3>
                <p>Automated toxicity screening using specialized AI domain knowledge.</p>
              </div>
            </div>
          </div>

          {/* Modals and floating elements */}
          {/* AI Search Helper Modal */}
          <div id="ai-search-modal" className="custom-modal">
            <div className="custom-modal-content ai-search-content">
              <div className="custom-modal-header">
                <h3>&#x1F913; AI Search Assistant</h3>
                <span className="close-modal" id="close-ai-search">&times;</span>
              </div>
              <div className="custom-modal-body" id="ai-search-body">
                <div className="ai-search-messages" id="ai-search-messages">
                  <div className="message message-ai">
                    <div className="message-content">
                      Hello! I can help you find the right drug label. Tell me what you're looking for (e.g., "drugs for headache", "white round pill 50mg", or just a name).
                    </div>
                  </div>
                </div>
              </div>
              <div className="ai-search-footer">
                <div style={{ textAlign: 'right', marginBottom: '5px' }}>
                  <button id="reset-home-chat-btn" style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8em', cursor: 'pointer', textDecoration: 'underline' }}>Reset Chat</button>
                </div>
                <div className="ai-input-wrapper">
                  <input type="text" id="ai-search-input" placeholder="Type here..." autoComplete="off" />
                  <button id="ai-search-send">Send</button>
                </div>
              </div>
            </div>
          </div>

          {/* Info Modal */}
          <div id="info-modal" className="custom-modal">
            <div className="custom-modal-content info-modal-content">
              <span className="close-modal" id="close-info-modal" style={{ position: 'absolute', top: '15px', right: '20px', zIndex: 10 }}>&times;</span>
              
              <div className="index-hero-container" style={{ paddingTop: '20px' }}>
                <div className="hero-icon" style={{ fontSize: '3em', marginBottom: '0.2em' }}><span>&#x1F4DC;</span></div>
                <h1 style={{ fontSize: '2em' }}>About AskFDALabel</h1>
                <p className="hero-subtitle">Streamlining Drug Label Analysis for Professionals</p>
              </div>
              
              <div className="info-content" style={{ textAlign: 'left', padding: '0 40px 40px' }}>
                <p style={{ fontSize: '1.1em', color: '#495057', textAlign: 'center', maxWidth: '700px', margin: '0 auto 40px', lineHeight: '1.6' }}>
                  AskFDALabel is an intelligent tool designed to assist healthcare practitioners and safety reviewers in navigating complex regulatory documents. By combining official data with advanced AI, we provide clarity where it matters most.
                </p>

                <div style={{ marginTop: '50px', paddingTop: '20px', borderTop: '1px solid #e0e6ed', textAlign: 'center' }}>
                  <p style={{ color: '#6c757d', fontSize: '0.9em', fontStyle: 'italic' }}>
                    <strong>Open Source:</strong> We believe in transparency for public health. <a href="https://github.com/seldas/LabelAgent-Auto" target="_blank" style={{ color: '#0056b3' }}>View on GitHub</a>
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: '0.8em', marginTop: '10px' }}>
                    Disclaimer: For informational and research purposes only. Not a substitute for professional medical advice.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Configuration Modal */}
          <div id="ai-config-modal" className="custom-modal">
            <div className="custom-modal-content" style={{ maxWidth: '600px' }}>
              <div className="custom-modal-header">
                <h3>AI Configuration</h3>
                <span className="close-modal" id="close-ai-config">&times;</span>
              </div>
              <div className="custom-modal-body">
                <form id="ai-config-form">
                  {/* AI Configuration form content */}
                </form>
              </div>
            </div>
          </div>

          {/* Floating Info Button */}
          <div id="info-btn" className="floating-info-btn" title="About AskFDALabel" style={{ cursor: 'pointer' }}>
            <span>&#x1F4DC;</span>
          </div>

        </div>

        <Script src="/js/session_manager.js" />
        <Script src="/js/ai_search.js" />
      </body>
    </html>
  );
}