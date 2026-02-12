document.addEventListener('DOMContentLoaded', function () {
    // --- FAERS Dashboard Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const faersLimitSelect = document.getElementById('faers-limit-select');
    let faersDataLoaded = false;
    let chartInstances = {}; // Track chart instances to destroy them on update
    let currentFaersData = null; // Store fetched reactions for pagination
    let currentCoveragePage = 1;
    const itemsPerPage = 10;
    
    // Global state for trend comparison
    window.selectedTerms = new Set();
    window.trendCache = {}; // Cache for fetched time-series data: { "Term": [{time:..., count:...}] }
    const MAX_SELECTED_TERMS = 10;

    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Toggle Buttons
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Toggle Content
                const targetId = btn.getAttribute('data-target');
                tabContents.forEach(content => {
                    content.style.display = (content.id === targetId) ? 'block' : 'none';
                    if (content.id === targetId) content.classList.add('active');
                    else content.classList.remove('active');
                });

                // Sidebar Logic (Auto-hide on non-label views)
                const tocPanel = document.getElementById('toc-panel');
                const mainContent = document.getElementById('main-content');
                const showTocBtn = document.getElementById('show-toc-btn');
                const tocToggle = document.getElementById('toc-toggle');

                if (targetId === 'label-view') {
                    // Force show sidebar
                    if (tocPanel) tocPanel.classList.remove('hidden');
                    if (mainContent) mainContent.classList.remove('expanded');
                    if (showTocBtn) showTocBtn.style.display = 'none';
                    
                    // Sync toggle icon
                    if (tocToggle) tocToggle.innerHTML = '&laquo;'; 
                } else {
                    // Force hide sidebar and button
                    if (tocPanel) tocPanel.classList.add('hidden');
                    if (mainContent) mainContent.classList.add('expanded');
                    if (showTocBtn) showTocBtn.style.display = 'none';
                    
                    // Sync toggle icon
                    if (tocToggle) tocToggle.innerHTML = '&raquo;'; 
                }

                // Load Data if FAERS tab is selected
                if (targetId === 'faers-view' && !faersDataLoaded) {
                    loadFaersData();
                }
            });
        });

        // Add listener for limit change (Now client-side only)
        if (faersLimitSelect) {
            faersLimitSelect.addEventListener('change', () => {
                const limit = parseInt(faersLimitSelect.value, 10);
                filterAndRenderCharts(limit);
            });
        }

        // Handle Hash-based Tab Switching on Load
        if (window.location.hash) {
            const hash = window.location.hash.substring(1); // remove #
            const targetBtn = document.querySelector(`.tab-btn[data-target="${hash}"]`);
            if (targetBtn) {
                // Small delay to ensure everything is ready
                setTimeout(() => targetBtn.click(), 100);
            }
        }
    }

    // Pagination Event Listeners
    const firstBtn = document.getElementById('firstPage');
    const lastBtn = document.getElementById('lastPage');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInput = document.getElementById('pageInput');

    function goToPage(page) {
        // Validation happens in renderCoverageTable, but we can set state here
        currentCoveragePage = parseInt(page, 10);
        renderCoverageTable();
    }

    if (firstBtn) firstBtn.addEventListener('click', () => goToPage(1));
    if (prevBtn) prevBtn.addEventListener('click', () => goToPage(currentCoveragePage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToPage(currentCoveragePage + 1));
    
    if (lastBtn) {
        lastBtn.addEventListener('click', () => {
            const totalEl = document.getElementById('totalPages');
            if (totalEl) {
                goToPage(parseInt(totalEl.textContent, 10));
            }
        });
    }

    if (pageInput) {
        pageInput.addEventListener('change', () => {
            let val = parseInt(pageInput.value, 10);
            if (isNaN(val)) val = 1;
            goToPage(val);
        });
        pageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                let val = parseInt(pageInput.value, 10);
                if (isNaN(val)) val = 1;
                goToPage(val);
            }
        });
    }

    async function loadFaersData() {
        if (typeof currentDrugName === 'undefined') return;

        // Fetch a large dataset initially (1000 items) 
        const fetchLimit = 1000; 
        const encodedName = encodeURIComponent(currentDrugName);
        
        // Show loading, hide content
        const loadingEl = document.getElementById('faers-loading');
        const contentEl = document.getElementById('dashboard-content');
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';

        try {
            const response = await fetch(`/api/dashboard/faers/${encodedName}?limit=${fetchLimit}`);
            const data = await response.json();
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'grid';
            
            currentFaersData = data;
            faersDataLoaded = true;
            
            filterAndRenderCharts();
            
            // Tag signals based on the full dataset (1000 items) as requested
            tagSafetySignals(data); 

        } catch (error) {
            console.error('Error fetching FAERS data:', error);
            const loadingEl = document.getElementById('faers-loading');
            if (loadingEl) loadingEl.innerHTML = '<p style="color:red">Failed to load safety data.</p>';
        }
    }

    function filterAndRenderCharts() {
        if (!currentFaersData) return;

        currentCoveragePage = 1; // Reset pagination
        renderCoverageTable();
        updateTrendComparisonChart(); // Initialize chart
    }

    // Filter Event Listener
    const aeFilterInput = document.getElementById('ae-table-filter');
    if (aeFilterInput) {
        aeFilterInput.addEventListener('input', () => {
            currentCoveragePage = 1; // Reset to first page on filter
            renderCoverageTable();
        });
    }

    function renderCoverageTable() {
        if (!currentFaersData || !currentFaersData.reactions) return;

        const filterText = aeFilterInput ? aeFilterInput.value.toLowerCase().trim() : '';
        const labelText = getCleanLabelText();
        
        // 1. Filter Data
        const filteredReactions = currentFaersData.reactions.filter(item => {
            if (!filterText) return true;
            
            const term = item.term.toLowerCase();
            const soc = (item.soc || '').toLowerCase();
            const hlt = (item.hlt || '').toLowerCase();
            
            // Check if filterText is present in term, soc, or hlt
            const matchesFilter = term.includes(filterText) ||
                                  soc.includes(filterText) ||
                                  hlt.includes(filterText);
            
            // Basic Status (for display, not filtering the table itself)
            // This part is retained for the coverage logic within renderCoverageTable
            const isFound = labelText.includes(term); 
            let statusText = isFound ? "found" : "not in label";
            
            // Check cache for AI augmented status
            if (!isFound) {
                const cacheKey = `ai_coverage_${currentSetId}_${term}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const aiData = JSON.parse(cached);
                        const match = (aiData.match || "").toLowerCase();
                        if (match === 'yes' || match === 'probably') {
                            statusText += " ai identified";
                        }
                    } catch(e) {}
                }
            }
            
            return matchesFilter; // Only filter based on term, soc, hlt
        });

        // Update Count Display
        const countDisplay = document.getElementById('ae-filter-count');
        if (countDisplay) {
            countDisplay.textContent = `(${filteredReactions.length} items)`;
        }

        // 2. Pagination
        const totalItems = filteredReactions.length;
        const maxPage = Math.ceil(totalItems / itemsPerPage);
        
        // Adjust current page if out of bounds
        if (currentCoveragePage > maxPage && maxPage > 0) currentCoveragePage = maxPage;
        if (currentCoveragePage < 1) currentCoveragePage = 1;

        const startIndex = (currentCoveragePage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const pageData = filteredReactions.slice(startIndex, endIndex);

        const coverageBody = document.querySelector('#coverageTable tbody');

        if (!coverageBody) return;

        coverageBody.innerHTML = '';

        if (filteredReactions.length === 0) {
            coverageBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No matching reactions found.</td></tr>';
        }

        pageData.forEach(item => {
            const term = item.term.toLowerCase();
            const isFound = labelText.includes(term);
            
            const row = document.createElement('tr');
            let statusHtml = `
                <span class="status-badge ${isFound ? 'found' : 'not-found'}">
                    ${isFound ? '✓ Found' : '✗ Not in Label'}
                </span>
            `;

            let actionHtml = '';
            if (!isFound) {
                // Check Cache for AI result
                const cacheKey = `ai_coverage_${currentSetId}_${term}`;
                const cachedResult = localStorage.getItem(cacheKey);
                
                if (cachedResult) {
                    try {
                        const aiData = JSON.parse(cachedResult);
                        const matchStatus = (aiData.match || "").toLowerCase();
                        
                        // Construct tooltip data
                        const tooltipData = encodeURIComponent(JSON.stringify(aiData));
                        
                        let iconSymbol = '✓';
                        let iconClass = 'ai-answer-icon';
                        
                        if (matchStatus === 'yes' || matchStatus === 'probably') {
                            iconClass += ' match';
                        } else {
                            iconClass += ' no-match';
                            iconSymbol = '✕';
                        }
                        
                        actionHtml = `<span class="${iconClass}" data-ai-content="${tooltipData}" style="cursor: pointer;">${iconSymbol}</span>`;

                        // Update status badge if positive match
                        if (matchStatus === 'yes') {
                            statusHtml = `
                                <span class="status-badge ai-found-yes">
                                    &#10024; Yes (AI)
                                </span>
                            `;
                        } else if (matchStatus === 'probably') {
                            statusHtml = `
                                <span class="status-badge ai-found-probable">
                                    &#10024; Probable (AI)
                                </span>
                            `;
                        }
                    } catch (e) {
                        console.error("Error reading cache for render", e);
                        // Fallback to ? if corrupt
                        actionHtml = `<span class="ask-ai-btn" title="Ask AI if this is mentioned in the labeling" onclick="window.askAiAboutReaction('${item.term.replace(/'/g, "\'")}', this)">?</span>`;
                    }
                } else {
                    // No cache, show "?" Ask AI button
                    actionHtml = `<span class="ask-ai-btn" title="Ask AI if this is mentioned in the labeling" onclick="window.askAiAboutReaction('${item.term.replace(/'/g, "\'")}', this)">?</span>`;
                }
            }

            const isChecked = window.selectedTerms.has(item.term);
            const isDisabled = !isChecked && window.selectedTerms.size >= MAX_SELECTED_TERMS;

            row.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="ae-checkbox" 
                           value="${item.term}" 
                           ${isChecked ? 'checked' : ''} 
                           ${isDisabled ? 'disabled' : ''}
                           onchange="window.toggleTermSelection('${item.term.replace(/'/g, "\'")}', this)">
                </td>
                <td>${item.term} ${actionHtml}</td>
                <td>${item.count.toLocaleString()}</td>
                <td>${item.soc || 'N/A'}${item.soc_abbrev ? ' (' + item.soc_abbrev + ')' : ''}</td>
                <td>${item.hlt || 'N/A'}</td>
                <td class="status-cell">${statusHtml}</td>
            `;
            coverageBody.appendChild(row);
        });

        // Bind custom tooltips (defined in results logic, check ui.js or similar? No, tooltips were in script.js)
        // Note: bindAiTooltips needs to be available. We will implement it here or in a shared module.
        // It was in script.js, let's include it here.
        bindAiTooltips();

        // Update pagination UI
        const totalPagesEl = document.getElementById('totalPages');
        const pageInputEl = document.getElementById('pageInput');
        
        if (totalPagesEl) totalPagesEl.textContent = maxPage || 1;
        if (pageInputEl) {
            pageInputEl.value = currentCoveragePage;
            pageInputEl.max = maxPage || 1;
        }

        if (firstBtn) firstBtn.disabled = currentCoveragePage <= 1;
        if (prevBtn) prevBtn.disabled = currentCoveragePage <= 1;
        if (nextBtn) nextBtn.disabled = currentCoveragePage >= maxPage;
        if (lastBtn) lastBtn.disabled = currentCoveragePage >= maxPage;
    }

    // Expose to global scope for onclick attributes
    window.askAiAboutReaction = async function(term, iconEl) {
        if (iconEl.classList.contains('loading')) return;

        // Check Local Storage Cache first
        const cacheKey = `ai_coverage_${currentSetId}_${term.toLowerCase()}`;
        const cachedResult = localStorage.getItem(cacheKey);

        if (cachedResult) {
            try {
                const aiData = JSON.parse(cachedResult);
                updateUiWithAiResult(aiData, iconEl, term);
                return; // Skip API call
            } catch (e) {
                console.error("Cache parse error", e);
                localStorage.removeItem(cacheKey);
            }
        }

        // Visual loading state
        const originalContent = iconEl.innerHTML;
        iconEl.innerHTML = '<i class="fa fa-spinner fa-spin" style="font-size: 10px;"></i>';
        iconEl.classList.add('loading');
        iconEl.style.cursor = 'wait';

        const question = `Analyze the labeling for the adverse event "${term}".
                          Criteria: > Include semantic matches and medical synonyms. Categorize as "Yes" (direct match), "Probably" (semantic/indirect match), or "No" (absent).
                          Your response MUST be ONLY a single, raw JSON object and nothing else. Do not include explanations, apologies, or any conversational text before or after the JSON object. 
                          Output strictly in this JSON format: { "match": "Yes | Probably | No", "citation": "Section name with numbers, if applicable, or null", "quote": "Exact quote, or null" }
                          Constraint: If match is "No", citation and quote must be null.`;
        
        // Add to chat history visually (optional, but good for context)
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const userMessage = document.createElement('div');
            userMessage.classList.add('message', 'message-user');
            userMessage.innerHTML = `<div class="message-content"><p>Checking labeling for coverage of: <strong>${term}</strong></p></div>`;
            chatMessages.appendChild(userMessage);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        try {
            const xmlContentDiv = document.getElementById('xml-content');
            const xmlContent = xmlContentDiv ? xmlContentDiv.textContent : '';

            // Access chatHistory if global
            const historyToSend = [];

            const response = await fetch('/api/dashboard/ai_chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: question,
                    history: historyToSend, 
                    xml_content: xmlContent,
                    chat_type: 'TERM_VERIFY'
                }),
            });

            const data = await response.json();
            let answerText = data.response || "{}";
            
            // Clean markdown code blocks if present
            answerText = answerText.replace(/```json\n?|```/g, '').trim();
            // console.log(answerText);
            let aiData = {};
            try {
                aiData = JSON.parse(answerText);
                // Cache the successful result
                if (aiData.match) {
                    localStorage.setItem(cacheKey, JSON.stringify(aiData));
                }
            } catch (e) {
                console.error("Failed to parse AI JSON", e);
                aiData = { match: "Error", quote: "Could not parse response." };
            }

            // --- Auto-Save "Yes" Matches as Notes ---
            if ((aiData.match === "Yes" || aiData.match === "Probably") && aiData.citation) {
                const sectionNum = findSectionFromCitation(aiData.citation);
                
                // Only save if user is logged in and section found
                if (sectionNum && typeof currentUserId !== 'undefined' && currentUserId) {
                    const noteQuestion = `Is "${term}" mentioned in the label?`;
                    const noteAnswer = `> "${aiData.quote}"`;
                    const matchTag = aiData.match === 'Yes' ? 'match:yes' : 'match:probable';
                    
                    // Auto-save to DB
                    fetch('/api/dashboard/save_annotation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            set_id: currentSetId,
                            section_number: sectionNum,
                            question: noteQuestion,
                            answer: noteAnswer,
                            keywords: [term, matchTag],
                            is_public: true 
                        })
                    })
                    .then(r => {
                        if (!r.ok) throw new Error("Network response was not ok");
                        return r.json();
                    })
                    .then(saveData => {
                        if (saveData.success && window.createAnnotationBadge) {
                            window.createAnnotationBadge(
                                noteQuestion, 
                                noteAnswer, 
                                sectionNum, 
                                [term, matchTag], 
                                saveData.id, 
                                true // isSaved
                            );
                        }
                    })
                    .catch(err => console.error("Auto-save failed (likely auth or network)", err));
                }
            }

            // Construct readable output for chat
            let readableOutput = "";
            if (aiData.match === "Yes" || aiData.match === "Probably") {
                readableOutput = `**AI Found Match:** ${aiData.match}\n\n> "${aiData.quote}"\n\n*Section: ${aiData.citation}*`;
            } else {
                readableOutput = `**AI Analysis:** Not found in labeling.`;
            }

            // Add AI response to chat window
            if (chatMessages) {
                const aiMessage = document.createElement('div');
                aiMessage.classList.add('message', 'message-ai');
                
                let contentHtml = readableOutput;
                if (typeof marked !== 'undefined' && marked.parse) {
                    contentHtml = marked.parse(readableOutput);
                } else {
                    // Fallback: simple newline to break replacement
                    contentHtml = readableOutput.replace(/\n/g, '<br>');
                }

                aiMessage.innerHTML = `<div class="message-content">${contentHtml}</div>`;
                chatMessages.appendChild(aiMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Update history
                if (window.chatHistory) {
                    window.chatHistory.push({ role: 'user', content: question });
                    window.chatHistory.push({ role: 'model', content: answerText });
                }
            }

            updateUiWithAiResult(aiData, iconEl, term);

        } catch (err) {
            console.error(err);
            iconEl.innerHTML = originalContent; // Revert on error
            iconEl.classList.remove('loading');
            alert("Failed to ask AI.");
        }
    };

    function updateUiWithAiResult(aiData, iconEl, term) {
        // Determine Symbol and Style based on result
        const matchStatus = (aiData.match || "").toLowerCase();
        const isMatch = matchStatus === 'yes' || matchStatus === 'probably';
        
        // Update the Icon
        iconEl.className = 'ai-answer-icon' + (isMatch ? ' match' : ' no-match');
        iconEl.innerHTML = isMatch ? '✓' : '✕';
        iconEl.style.cursor = 'pointer';
        iconEl.classList.remove('loading'); 
        
        // Remove any manual inline overrides from previous versions
        iconEl.style.backgroundColor = '';
        iconEl.style.borderColor = '';
        
        // Store Data
        iconEl.setAttribute('data-ai-content', encodeURIComponent(JSON.stringify(aiData)));
        iconEl.removeAttribute('title'); // Remove native tooltip
        
        iconEl.onclick = null; // Remove click handler
        
        // Bind Custom Tooltip Events
        bindAiTooltipEvents(iconEl);

        // Check if Positive for Status Badge
        if (isMatch) {
            // Find the status badge in this row
            const row = iconEl.closest('tr');
            if (row) {
                const badge = row.querySelector('.status-badge');
                if (badge) {
                    if (matchStatus === 'yes') {
                        badge.className = 'status-badge ai-found-yes';
                        badge.innerHTML = `&#10024; Yes (AI)`;
                    } else {
                        badge.className = 'status-badge ai-found-probable';
                        badge.innerHTML = `&#10024; Probable (AI)`;
                    }
                }
            }
        }
    }

    function tagSafetySignals(data) {
        if (!data.reactions || data.reactions.length === 0) return;

        // Build a map of term -> details object
        const termsMap = {};
        data.reactions.forEach(r => {
            if (r.term && r.term.length > 2) {
                termsMap[r.term.toLowerCase()] = {
                    count: r.count,
                    term: r.term,
                    soc: r.soc || 'N/A',
                    soc_abbrev: r.soc_abbrev || '',
                    hlt: r.hlt || 'N/A'
                };
            }
        });

        const labelContainer = document.getElementById('label-view');
        if (!labelContainer) return;

        highlightSafetyTerms(labelContainer, termsMap);
    }

    function highlightSafetyTerms(root, termsMap) {
        // ... (sorting logic)
        const terms = Object.keys(termsMap).sort((a, b) => b.length - a.length);
        if (terms.length === 0) return;

        // 1. Upgrade existing highlights
        const existingHighlights = root.querySelectorAll('.meddra-term-base, .faers-signal');
        existingHighlights.forEach(span => {
            const termText = (span.getAttribute('data-term') || span.textContent).toLowerCase();
            if (termsMap[termText]) {
                const details = termsMap[termText];
                
                // Always update data attributes
                span.setAttribute('data-soc', details.soc_abbrev || details.soc || 'Unknown');
                span.setAttribute('data-term', details.term);

                if (details.count > 0) {
                    upgradeSpanToSignal(span, details);
                }
            }
        });

        // 2. Scan for new highlights
        const pattern = new RegExp(`\\b(${terms.map(window.escapeRegExp).join('|')})\\b`, 'gi');
        
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        while(walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            if (['SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON'].includes(node.parentNode.tagName)) return;
            if (node.parentNode.classList.contains('faers-signal') || 
                node.parentNode.classList.contains('meddra-term-base')) return;

            const text = node.nodeValue;
            if (!pattern.test(text)) return;

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            pattern.lastIndex = 0;
            
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const matchedText = match[0];
                const lowerTerm = matchedText.toLowerCase();
                const details = termsMap[lowerTerm];
                
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                }

                const span = document.createElement('span');
                span.textContent = matchedText;
                
                if (details) {
                    // Store Metadata
                    span.setAttribute('data-term', details.term);
                    span.setAttribute('data-soc', details.soc_abbrev || details.soc || 'Unknown');

                    if (details.count === 0) {
                        span.className = 'meddra-term-base';
                        span.title = `MedDRA Term: ${details.term} (${details.soc_abbrev || details.soc})`; 
                    } else {
                        upgradeSpanToSignal(span, details);
                    }
                }
                
                fragment.appendChild(span);
                lastIndex = pattern.lastIndex;
            }

            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }

            node.parentNode.replaceChild(fragment, node);
        });
    }

    function upgradeSpanToSignal(span, details) {
        span.classList.remove('meddra-term-base');
        span.classList.add('faers-signal');
        span.removeAttribute('title');

        span.classList.remove('intensity-high', 'intensity-med', 'intensity-low');
        if (details.count > 100) span.classList.add('intensity-high');
        else if (details.count >= 10) span.classList.add('intensity-med');
        else span.classList.add('intensity-low');

        span.setAttribute('data-faers-content', encodeURIComponent(JSON.stringify(details)));
        
        if (!span._eventsBound) {
            span.addEventListener('mouseenter', () => FaersTooltipManager.show(span));
            span.addEventListener('mouseleave', () => FaersTooltipManager.hide(span));
            span._eventsBound = true;
        }
    }

    // Custom Tooltip Manager for in-text FAERS signals
    const FaersTooltipManager = {
        create: function(element) {
            if (element._faersTooltipEl) return element._faersTooltipEl;

            const dataStr = element.getAttribute('data-faers-content');
            if (!dataStr) return null;

            let details;
            try {
                details = JSON.parse(decodeURIComponent(dataStr));
            } catch(e) { console.error("FAERS Tooltip parse error", e); return null; }

            const tooltip = document.createElement('div');
            tooltip.className = 'faers-signal-tooltip';
            
            // Determine intensity class for the badge
            let intensityClass = 'intensity-low';
            if (details.count > 100) intensityClass = 'intensity-high';
            else if (details.count >= 10) intensityClass = 'intensity-med';

            tooltip.innerHTML = `
                <div class="faers-tooltip-header">
                    <span class="faers-tooltip-term">${details.term}</span>
                    <span class="faers-tooltip-count ${intensityClass}">${details.count.toLocaleString()} reports</span>
                </div>
                <div class="faers-tooltip-body">
                    <div class="faers-tooltip-row">
                        <span class="faers-tooltip-label">SOC:</span>
                        <span class="faers-tooltip-value">${details.soc}${details.soc_abbrev ? ' (' + details.soc_abbrev + ')' : ''}</span>
                    </div>
                    <div class="faers-tooltip-row">
                        <span class="faers-tooltip-label">HLT:</span>
                        <span class="faers-tooltip-value">${details.hlt}</span>
                    </div>
                </div>
                <div class="faers-tooltip-footer">
                    Post-marketing safety signal (FAERS)
                </div>
            `;
            document.body.appendChild(tooltip);
            
            element._faersTooltipEl = tooltip;
            return tooltip;
        },

        show: function(element) {
            let tooltip = element._faersTooltipEl;
            if (!tooltip) {
                tooltip = this.create(element);
                if (!tooltip) return;
            }

            this.position(element, tooltip);
            
            // Activate
            void tooltip.offsetWidth; // Force reflow
            tooltip.classList.add('show');
        },

        hide: function(element) {
            if (element._faersTooltipEl) {
                const el = element._faersTooltipEl;
                el.classList.remove('show');
                // Remove from DOM after transition
                setTimeout(() => {
                    if (el.parentNode && !el.classList.contains('show')) {
                        el.parentNode.removeChild(el);
                        element._faersTooltipEl = null;
                    }
                }, 200);
            }
        },

        position: function(element, tooltip) {
            const rect = element.getBoundingClientRect();
            
            tooltip.style.display = 'block';
            const tWidth = tooltip.offsetWidth || 280;
            const tHeight = tooltip.offsetHeight || 120;
            const gap = 10; 

            let top = rect.top - tHeight - gap; 
            let left = rect.left + (rect.width / 2) - (tWidth / 2);

            // Bounds checking
            if (left < 10) left = 10;
            if (left + tWidth > window.innerWidth - 10) {
                left = window.innerWidth - tWidth - 10;
            }
            if (top < 10) {
                top = rect.bottom + gap;
            }

            tooltip.style.top = `${top + window.scrollY}px`;
            tooltip.style.left = `${left + window.scrollX}px`;
        }
    };

    // Global Tooltip Manager for FAERS (AI Evidence)
    const TooltipManager = {
        create: function(icon) {
            if (icon._tooltipEl) return icon._tooltipEl;

            const dataStr = icon.getAttribute('data-ai-content');
            if (!dataStr) return null;

            let aiData;
            try {
                aiData = JSON.parse(decodeURIComponent(dataStr));
            } catch(e) { console.error("Tooltip parse error", e); return null; }

            const tooltip = document.createElement('div');
            tooltip.className = 'ai-evidence-tooltip';
            
            let content = `<strong>Match: ${aiData.match}</strong>`;
            if (aiData.quote) content += `<div>"${aiData.quote}"</div>`;
            if (aiData.citation) content += `<div class="citation">Source: ${aiData.citation}</div>`;
            
            tooltip.innerHTML = content;
            document.body.appendChild(tooltip);
            
            icon._tooltipEl = tooltip;
            return tooltip;
        },

        show: function(icon, isSticky = false) {
            let tooltip = icon._tooltipEl;
            if (!tooltip) {
                tooltip = this.create(icon);
                if (!tooltip) return;
            }

            if (isSticky) {
                tooltip.classList.add('sticky');
                icon.classList.add('sticky');
            }

            this.position(icon, tooltip);
            
            // Activate
            void tooltip.offsetWidth; // Force reflow
            tooltip.classList.add('show');
        },

        hide: function(icon) {
            if (icon._tooltipEl) {
                const el = icon._tooltipEl;
                el.classList.remove('show');
                el.classList.remove('sticky');
                icon.classList.remove('sticky');
                // Remove from DOM after transition
                setTimeout(() => {
                    if (el.parentNode && !el.classList.contains('show')) {
                        el.parentNode.removeChild(el);
                        icon._tooltipEl = null;
                    }
                }, 200);
            }
        },

        position: function(icon, tooltip) {
            const rect = icon.getBoundingClientRect();
            
            // Ensure tooltip is visible for measurement
            tooltip.style.display = 'block';
            const tWidth = tooltip.offsetWidth || 320;
            const tHeight = tooltip.offsetHeight || 100;
            const gap = 15; 

            // Default: Top-Right relative to icon
            let top = rect.top - tHeight - gap; 
            let left = rect.right + 5;

            if (left + tWidth > window.innerWidth - 10) {
                left = rect.left - tWidth - 5;
            }

            if (top < 10) {
                top = rect.bottom + gap;
            }

            if (left < 10) left = 10; 

            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
        },

        toggleSticky: function(icon) {
            if (icon.classList.contains('sticky')) {
                // Close
                this.hide(icon);
            } else {
                // Open as sticky
                this.show(icon, true);
            }
        }
    };

    function bindAiTooltips() {
        const icons = document.querySelectorAll('.ai-answer-icon');
        icons.forEach(bindAiTooltipEvents);
    }

    function bindAiTooltipEvents(icon) {
        if (icon._bound) return;
        icon._bound = true;

        icon.addEventListener('mouseenter', () => {
            if (!icon.classList.contains('sticky')) {
                TooltipManager.show(icon, false);
            }
        });

        icon.addEventListener('mouseleave', () => {
            if (!icon.classList.contains('sticky')) {
                TooltipManager.hide(icon);
            }
        });

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            TooltipManager.toggleSticky(icon);
        });
    }

    // --- Trend Comparison Logic ---
    window.toggleTermSelection = function(term, checkbox) {
        if (checkbox.checked) {
            if (window.selectedTerms.size >= MAX_SELECTED_TERMS) {
                checkbox.checked = false;
                alert(`You can only compare up to ${MAX_SELECTED_TERMS} adverse events at a time.`);
                return;
            }
            window.selectedTerms.add(term);
        } else {
            window.selectedTerms.delete(term);
        }
        
        updateCheckboxStates();
        updateTrendComparisonChart();
    };

    function updateCheckboxStates() {
        const checkboxes = document.querySelectorAll('.ae-checkbox');
        const isMaxReached = window.selectedTerms.size >= MAX_SELECTED_TERMS;
        
        checkboxes.forEach(cb => {
            if (!cb.checked) {
                cb.disabled = isMaxReached;
                cb.parentElement.classList.toggle('disabled', isMaxReached);
            } else {
                cb.disabled = false;
                cb.parentElement.classList.remove('disabled');
            }
        });
    }

    async function updateTrendComparisonChart() {
        const termsToDisplay = Array.from(window.selectedTerms);
        const canvas = document.getElementById('trendComparisonChart');
        if (!canvas) return;

        if (typeof Chart === 'undefined') {
            console.error("Chart.js is not loaded.");
            const container = canvas.parentElement;
            if (container) {
                container.innerHTML = '<p style="color: #721c24; background: #f8d7da; padding: 10px; border-radius: 4px;">Error: Chart library could not be loaded. Please check your internet connection.</p>';
            }
            return;
        }

        // 1. Identify terms we need to fetch
        const missingTerms = termsToDisplay.filter(t => !window.trendCache[t]);
        
        if (missingTerms.length > 0) {
            try {
                const response = await fetch('/api/dashboard/faers/trends', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        drug_name: currentDrugName,
                        terms: missingTerms
                    })
                });
                const data = await response.json();
                if (data.trends) {
                    // Merge into cache
                    Object.assign(window.trendCache, data.trends);
                }
            } catch (e) {
                console.error("Error fetching trends", e);
            }
        }

        // 2. Prepare Datasets for Chart.js
        const datasets = [];
        const allDates = new Set();
        
        const colors = [
            '#007bff', '#6610f2', '#6f42c1', '#e83e8c', '#dc3545',
            '#fd7e14', '#ffc107', '#28a745', '#20c997', '#17a2b8'
        ];

        termsToDisplay.forEach((term, index) => {
            const dataPoints = window.trendCache[term] || [];
            
            // Aggregate by YYYY-MM
            const monthlyCounts = {};
            dataPoints.forEach(pt => {
                const monthKey = pt.time.substring(0, 6); // YYYYMM
                monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + pt.count;
            });
            
            Object.keys(monthlyCounts).forEach(d => allDates.add(d));
            
            datasets.push({
                label: term,
                dataRaw: monthlyCounts, 
                borderColor: colors[index % colors.length],
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3
            });
        });

        // 3. Sort Dates and Align Data
        const sortedDates = Array.from(allDates).sort();
        
        datasets.forEach(ds => {
            let cumulativeSum = 0;
            ds.data = sortedDates.map(date => {
                const count = ds.dataRaw[date] || 0;
                cumulativeSum += count;
                return cumulativeSum;
            });
            delete ds.dataRaw; 
        });

        // 4. Render Chart
        if (chartInstances['trendComparison']) {
            chartInstances['trendComparison'].destroy();
        }

        // If no terms selected, show artistic placeholder
        if (termsToDisplay.length === 0) {
            const ctx = canvas.getContext('2d');
            
            const ghostPoints = 50;
            const ghostLabels = Array.from({length: ghostPoints}, (_, i) => i);
            
            const createWave = (phase, amplitude, frequency, color) => {
                return {
                    label: 'Placeholder',
                    data: ghostLabels.map(x => Math.sin(x * frequency + phase) * amplitude + 50),
                    borderColor: color,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.5,
                    pointRadius: 0,
                    fill: false
                };
            };

            const artisticDatasets = [
                createWave(0, 30, 0.1, 'rgba(200, 200, 200, 0.2)'),
                createWave(2, 25, 0.15, 'rgba(180, 180, 180, 0.15)'),
                createWave(4, 35, 0.08, 'rgba(220, 220, 220, 0.1)')
            ];

            chartInstances['trendComparison'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ghostLabels.map(() => ''), 
                    datasets: artisticDatasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false },
                        title: {
                            display: true,
                            text: 'Select reactions above to visualize trends',
                            color: '#999',
                            font: { size: 16, style: 'italic', weight: 'normal' },
                            padding: 20
                        }
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false, min: 0, max: 100 }
                    },
                    animation: {
                        duration: 3000,
                        easing: 'easeInOutQuart'
                    }
                }
            });
            return; 
        }

        const ctx = canvas.getContext('2d');
        chartInstances['trendComparison'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(d => `${d.substring(0,4)}-${d.substring(4,6)}`),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, usePointStyle: true }
                    },
                    title: {
                        display: true,
                        text: 'Cumulative Reports (Last 5 Years)'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Date (Year-Month)' }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Cumulative Reports' }
                    }
                }
            }
        });
    }

    function findSectionFromCitation(citation) {
        if (!citation) return null;
        const normCitation = citation.toLowerCase().replace(/section\s*/, '').trim();
        
        // 1. Try to extract specific number (e.g. "6.1")
        const numberMatch = normCitation.match(/^(\d+(\.\d+)*)/);
        const searchNumber = numberMatch ? numberMatch[0] : null;

        const sections = document.querySelectorAll('.Section');
        for (let sec of sections) {
            const h2 = sec.querySelector('h2');
            if (!h2) continue;
            const title = h2.textContent.toLowerCase();
            
            // Check Number Match
            if (searchNumber && title.includes(searchNumber)) {
                return sec.getAttribute('data-section-number');
            }
            
            // Check Text Match
            if (title.includes(normCitation)) {
                return sec.getAttribute('data-section-number');
            }
        }
        
        return null; 
    }

    function getCleanLabelText() {
        const root = document.getElementById('label-view');
        if (!root) return '';
        
        let text = '';
        
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.nodeValue;
                return;
            }
            
            if (node.nodeType === Node.ELEMENT_NODE) {
                // Skip annotation badges and other UI overlays
                if (node.classList.contains('chat-annotation-badge') || 
                    node.classList.contains('selection-toolbar') ||
                    node.classList.contains('annotation-popover')) {
                    return;
                }
                
                for (let child of node.childNodes) {
                    walk(child);
                }
            }
        }
        
        walk(root);
        return text.toLowerCase();
    }

    function syncCachedAiResultsToDb() {
        if (typeof currentUserId === 'undefined' || !currentUserId) return;
        if (typeof currentSetId === 'undefined' || !currentSetId) return;

        // 1. Build set of existing normalized questions to avoid duplicates
        const existingQuestions = new Set();
        if (typeof savedAnnotations !== 'undefined' && Array.isArray(savedAnnotations)) {
            savedAnnotations.forEach(ann => {
                if (ann.question) existingQuestions.add(ann.question.toLowerCase());
            });
        }

        const prefix = `ai_coverage_${currentSetId}_`;
        
        // 2. Iterate LocalStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(prefix)) {
                // Extract term from key (it was lowercased when saved)
                const term = key.substring(prefix.length); 
                
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    
                    // 3. Check criteria: Match Yes, Has Citation, Not already saved
                    if ((data.match === 'Yes' || data.match === 'Probably') && data.citation) {
                        const question = `Is "${term}" mentioned in the label?`;
                        
                        if (!existingQuestions.has(question.toLowerCase())) {
                            const sectionNum = findSectionFromCitation(data.citation);
                            
                            if (sectionNum) {
                                const answer = `> "${data.quote}"`;
                                const matchTag = data.match === 'Yes' ? 'match:yes' : 'match:probable';
                                
                                // Prevent duplicate attempts in this session
                                existingQuestions.add(question.toLowerCase());
                                
                                // 4. Save to DB
                                fetch('/api/dashboard/save_annotation', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        set_id: currentSetId,
                                        section_number: sectionNum,
                                        question: question,
                                        answer: answer,
                                        keywords: [term, matchTag],
                                        is_public: true
                                    })
                                })
                                .then(r => {
                                    if (!r.ok) throw new Error("Sync failed");
                                    return r.json();
                                })
                                .then(res => {
                                    if (res.success && window.createAnnotationBadge) {
                                        console.log(`Synced annotation for ${term}`);
                                        window.createAnnotationBadge(
                                            question, 
                                            answer, 
                                            sectionNum, 
                                            [term, matchTag], 
                                            res.id, 
                                            true
                                        );
                                    }
                                })
                                .catch(e => console.error(`Failed to sync ${term}`, e));
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error parsing cache for sync", e);
                }
            }
        }
    }

    // Run sync on load
    setTimeout(syncCachedAiResultsToDb, 1000); 

    // --- Load All MedDRA Terms (Initial Scan) ---
    if (typeof currentSetId !== 'undefined') {
        loadMeddraScan(currentSetId);
    }

    async function loadMeddraScan(setId) {
        try {
            const response = await fetch(`/api/dashboard/meddra/scan_label/${setId}`);
            if (!response.ok) return;
            const data = await response.json();
            
            if (data.found_terms && data.found_terms.length > 0) {
                // Create a map where count is null/0 to indicate base highlighting
                const termsMap = {};
                data.found_terms.forEach(item => {
                    // Item is now {term: "...", soc: "...", soc_abbrev: "...", ...}
                    const term = item.term;
                    if (term && term.length > 2) {
                        termsMap[term.toLowerCase()] = {
                            count: 0, // 0 indicates "base MedDRA term"
                            term: term,
                            soc: item.soc || 'Unknown',
                            soc_abbrev: item.soc_abbrev || ''
                        };
                    }
                });
                
                const labelContainer = document.getElementById('label-view');
                if (labelContainer) {
                    highlightSafetyTerms(labelContainer, termsMap);
                }
            }
        } catch (e) {
            console.error("Error scanning MedDRA terms:", e);
        }
    }

    // --- Statistics Logic ---
    window.loadMeddraStatistics = function() {
        const modalBody = document.getElementById('meddra-stats-body');
        const exportBtn = document.getElementById('export-meddra-json');
        
        if (exportBtn) {
            // Remove old listener to avoid duplicates
            const newBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newBtn, exportBtn);
            newBtn.addEventListener('click', exportMeddraStats);
        }

        if (!modalBody) return;

        // 1. Gather Data
        const signals = document.querySelectorAll('.meddra-term-base, .faers-signal');
        const socCounts = {};
        const uniqueTerms = new Set();
        const socTermsMap = {}; // Map SOC -> Map Term -> Set of Sections

        signals.forEach(el => {
            const term = (el.getAttribute('data-term') || el.textContent).toLowerCase();
            const soc = el.getAttribute('data-soc') || 'Unknown';
            
            // Find Section
            let sectionName = null;
            const sectionDiv = el.closest('.Section');
            if (sectionDiv) {
                // Try to find numeric ID first
                const numericId = sectionDiv.getAttribute('data-section-number');
                if (numericId) {
                    sectionName = numericId;
                } else {
                    // Use header title
                    const header = sectionDiv.querySelector('h1, h2, h3, h4');
                    if (header) sectionName = header.textContent.trim();
                }
            }

            if (!uniqueTerms.has(term)) {
                uniqueTerms.add(term);
                socCounts[soc] = (socCounts[soc] || 0) + 1;
            }
            
            if (!socTermsMap[soc]) socTermsMap[soc] = {};
            if (!socTermsMap[soc][term]) socTermsMap[soc][term] = new Set();
            
            if (sectionName) {
                socTermsMap[soc][term].add(sectionName);
            }
        });

        // 2. Prepare Chart Data
        const labels = Object.keys(socCounts).sort((a, b) => socCounts[b] - socCounts[a]); // Sort desc
        const data = labels.map(l => socCounts[l]);

        // Generate Colors
        const colors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 60%)`);
        const borderColors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 40%)`);

        // 3. Render
        modalBody.innerHTML = `
            <div style="height: 300px; width: 100%;">
                <canvas id="meddraStatsChart"></canvas>
            </div>
            <div id="meddra-drilldown-container" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; display: none;">
                <h4 id="drilldown-title" style="margin-top: 0; color: #6f42c1;"></h4>
                <div id="meddra-drilldown-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </div>
        `;
        
        if (typeof Chart === 'undefined') {
            modalBody.innerHTML = '<p style="color: red; padding: 20px;">Error: Chart.js library not loaded.</p>';
            return;
        }

        const ctx = document.getElementById('meddraStatsChart').getContext('2d');

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Count',
                    data: data,
                    backgroundColor: colors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'x', 
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `Total Unique Terms: ${uniqueTerms.size}`
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return context[0].label; // Show SOC name in tooltip
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true },
                    x: { 
                        display: true, // Show the axis
                        ticks: {
                            maxRotation: 90,
                            minRotation: 90,
                            autoSkip: false,
                            font: {
                                size: 10
                            }
                        }
                    }
                },
                onClick: (e) => {
                    const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                    if (points.length) {
                        const index = points[0].index;
                        const socName = labels[index];
                        showDrillDown(socName, socTermsMap[socName]);
                    }
                }
            }
        });
    };

    function showDrillDown(socName, termsObj) {
        const container = document.getElementById('meddra-drilldown-container');
        const title = document.getElementById('drilldown-title');
        const list = document.getElementById('meddra-drilldown-list');
        
        container.style.display = 'block';
        const sortedTerms = Object.keys(termsObj).sort();
        const termCount = sortedTerms.length;
        
        title.textContent = `${socName} (${termCount} terms)`;
        title.style.fontFamily = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        title.style.fontSize = '1.2em';
        title.style.borderBottom = '2px solid #6f42c1';
        title.style.paddingBottom = '8px';
        title.style.marginBottom = '15px';

        list.innerHTML = '';
        
        // Conditional Layout Threshold lowered to 5
        const isDense = termCount > 5;
        
        if (isDense) {
            list.style.flexDirection = 'row';
            list.style.flexWrap = 'wrap';
            list.style.gap = '10px';
        } else {
            list.style.flexDirection = 'column';
            list.style.flexWrap = 'nowrap';
            list.style.gap = '0';
        }
        
        sortedTerms.forEach(term => {
            const sections = Array.from(termsObj[term]).sort();
            const sectionText = sections.length > 0 ? ` (Sect ${sections.join(', ')})` : '';
            
            // Capitalize
            const displayTerm = term.charAt(0).toUpperCase() + term.slice(1);
            
            const itemDiv = document.createElement('div');
            // Modern, clean font stack
            itemDiv.style.fontFamily = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
            
            if (isDense) {
                // Badge Style
                itemDiv.style.background = '#ffffff';
                itemDiv.style.border = '1px solid #e0e6ed';
                itemDiv.style.borderRadius = '20px';
                itemDiv.style.padding = '6px 14px';
                itemDiv.style.fontSize = '1em'; // Larger base font
                itemDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)';
                itemDiv.style.width = 'auto';
                itemDiv.innerHTML = `<strong style="color: #2c3e50;">${displayTerm}</strong><span style="color: #94a3b8; font-size: 0.8em; margin-left: 5px;">${sectionText}</span>`;
            } else {
                // List Style
                itemDiv.style.fontSize = '1.1em'; // Larger base font
                itemDiv.style.padding = '10px 0';
                itemDiv.style.borderBottom = '1px solid #f1f3f5';
                itemDiv.innerHTML = `<strong style="color: #2c3e50;">${displayTerm}</strong><span style="color: #94a3b8; font-size: 0.85em; margin-left: 8px;">${sectionText}</span>`;
            }
            
            // Add interactivity
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.transition = 'all 0.2s';
            
            itemDiv.onmouseover = () => { itemDiv.style.borderColor = '#6f42c1'; itemDiv.style.backgroundColor = '#f3f0ff'; };
            itemDiv.onmouseout = () => { 
                itemDiv.style.borderColor = isDense ? '#e0e6ed' : 'transparent'; 
                itemDiv.style.borderBottom = isDense ? '1px solid #e0e6ed' : '1px solid #f1f3f5'; 
                itemDiv.style.backgroundColor = isDense ? '#ffffff' : 'transparent'; 
            };
            
            itemDiv.onclick = () => focusMeddraTerm(term);
            
            list.appendChild(itemDiv);
        });
        
        // Scroll to drilldown
        container.scrollIntoView({ behavior: 'smooth' });
    }

    // Global state for focused terms
    window.focusedMeddraTerms = new Set();

    function focusMeddraTerm(term) {
        const lowerTerm = term.toLowerCase();
        
        // Toggle selection (or just add, user said "added to a variable")
        // Let's clear others for single-select focus, or toggle for multi?
        // "Highlights this term" implies single focus usually, but "variable of array" suggests potential for multiple.
        // Let's do single focus for clarity, as requested "highlights THIS term".
        
        window.focusedMeddraTerms.clear();
        window.focusedMeddraTerms.add(lowerTerm);

        // Update DOM
        const allSignals = document.querySelectorAll('.meddra-term-base, .faers-signal');
        let found = false;
        let firstMatch = null;

        allSignals.forEach(el => {
            const elTerm = (el.getAttribute('data-term') || el.textContent).trim().toLowerCase();
            
            if (window.focusedMeddraTerms.has(elTerm)) {
                el.classList.add('meddra-focus-highlight');
                found = true;
                if (!firstMatch) firstMatch = el;
            } else {
                el.classList.remove('meddra-focus-highlight');
            }
        });
        
        if (found && firstMatch) {
            // 3. Scroll to first match
            firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const modal = document.getElementById('meddra-stats-modal');
            if (modal) modal.style.display = 'none';
        } else {
            console.warn(`Term "${term}" not found in DOM with data-term matching "${lowerTerm}"`);
            // Fallback: try content match
             allSignals.forEach(el => {
                if (el.textContent.toLowerCase() === lowerTerm) {
                    el.classList.add('meddra-focus-highlight');
                    if (!firstMatch) firstMatch = el;
                }
            });
            if (firstMatch) {
                 firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 const modal = document.getElementById('meddra-stats-modal');
                 if (modal) modal.style.display = 'none';
            } else {
                alert(`Could not find "${term}" in the visible text.`);
            }
        }
    }

    function exportMeddraStats() {
        const signals = document.querySelectorAll('.meddra-term-base, .faers-signal');
        const termsList = [];
        
        signals.forEach(el => {
            // Find Section
            let sectionName = "Unknown Section";
            const sectionDiv = el.closest('.Section');
            if (sectionDiv) {
                // Try to find header
                const header = sectionDiv.querySelector('h1, h2, h3, h4');
                if (header) sectionName = header.textContent.trim();
                else sectionName = sectionDiv.getAttribute('data-section-number') || "Unknown Section";
            }

            const term = el.getAttribute('data-term') || el.textContent;
            const soc = el.getAttribute('data-soc') || 'Unknown';
            
            // Check for duplicates in list? Or keep all occurrences?
            // "organized by section title" implies list of occurrences
            termsList.push({
                term: term,
                soc: soc,
                section: sectionName
            });
        });

        const exportData = {
            metadata: {
                brand_name: typeof currentDrugName !== 'undefined' ? currentDrugName : 'Unknown',
                set_id: typeof currentSetId !== 'undefined' ? currentSetId : 'Unknown',
                export_date: new Date().toISOString()
            },
            meddra_terms: termsList
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MedDRA_Stats_${exportData.metadata.brand_name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

});

