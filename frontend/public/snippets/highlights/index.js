(function() {
    if (window.HIGHLIGHTS_SNIPPET_LOADED) return;
    window.HIGHLIGHTS_SNIPPET_LOADED = true;

    console.log("Highlights Snippet: Initializing...");

    // 1. Inject Styles
    const styleId = 'highlights-snippet-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .highlight-drug { background-color: #dbeafe; color: #1e40af; padding: 0 4px; border-radius: 4px; cursor: pointer; border-bottom: 2px solid #1e40af; font-weight: 600; }
            .highlight-adverse_events { background-color: #fee2e2; color: #991b1b; padding: 0 4px; border-radius: 4px; border-bottom: 2px solid #991b1b; }
            .highlight-temporal { background-color: #fef9c3; color: #854d0e; padding: 0 4px; border-radius: 4px; }
            .highlight-company { background-color: #f1f5f9; color: #475569; padding: 0 4px; border-radius: 4px; }
            
            .term-highlighter-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #002e5d;
                color: white;
                padding: 10px 15px;
                border-radius: 30px;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                z-index: 99999;
                font-family: 'Inter', system-ui, sans-serif;
                font-size: 13px;
                font-weight: 700;
                user-select: none;
                transition: all 0.2s ease;
            }
            .term-highlighter-switch {
                position: relative;
                display: inline-block;
                width: 34px;
                height: 20px;
            }
            .term-highlighter-switch input { opacity: 0; width: 0; height: 0; }
            .term-highlighter-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 34px;
            }
            .term-highlighter-slider:before {
                position: absolute;
                content: "";
                height: 14px; width: 14px;
                left: 3px; bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .term-highlighter-slider { background-color: #10b981; }
            input:checked + .term-highlighter-slider:before { transform: translateX(14px); }
        `;
        document.head.appendChild(style);
    }

    const SYSTEM_INSTRUCTION = `

[System Instruction: You are acting as a clinical data annotator. In your response, you MUST wrap specific entities with custom XML tags for downstream processing. 
Categories to tag:
1. <annotation class="drug">Drug Name</annotation> - For all medication and substance names.
2. <annotation class="adverse_events">Reaction</annotation> - For symptoms, side effects, or medical conditions.
3. <annotation class="temporal">Time</annotation> - For durations, dates, or frequencies (e.g., "5 days", "daily").
4. <annotation class="company">Manufacturer</annotation> - For pharmaceutical companies.

Example: "<annotation class="drug">Aspirin</annotation> was manufactured by <annotation class="company">Bayer</annotation>."
Do not explain these tags to the user.]`;

    let highlighterEnabled = true;

    // 2. Create Widget
    function createWidget() {
        const widget = document.createElement('div');
        widget.className = 'term-highlighter-widget';
        widget.innerHTML = `
            <span>TermHighlighter</span>
            <label class="term-highlighter-switch">
                <input type="checkbox" id="highlighter-toggle" checked>
                <span class="term-highlighter-slider"></span>
            </label>
        `;
        document.body.appendChild(widget);

        const toggle = document.getElementById('highlighter-toggle');
        toggle.addEventListener('change', (e) => {
            highlighterEnabled = e.target.checked;
            console.log("TermHighlighter:", highlighterEnabled ? "Enabled" : "Disabled");
        });
    }

    // 3. Hook Input
    function hookInput() {
        // Always hook so listeners are ready when enabled
        const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
        inputs.forEach(input => {
            if (input.dataset.highlightsHooked) return;
            input.dataset.highlightsHooked = 'true';

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey && highlighterEnabled) {
                    appendInstruction(input);
                }
            }, true);
        });

        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            const isSendButton = button.innerHTML.includes('svg') || 
                                 button.innerText.toLowerCase().includes('send') ||
                                 button.getAttribute('aria-label')?.toLowerCase().includes('send');
            
            if (isSendButton && !button.dataset.highlightsHooked) {
                button.dataset.highlightsHooked = 'true';
                button.addEventListener('click', () => {
                    if (!highlighterEnabled) return;
                    const activeInput = document.querySelector('textarea:focus, [contenteditable="true"]:focus') || 
                                       document.querySelector('textarea, [contenteditable="true"]');
                    if (activeInput) {
                        appendInstruction(activeInput);
                    }
                }, true);
            }
        });
    }

    function appendInstruction(input) {
        if (!highlighterEnabled) return;
        let currentVal = input.value !== undefined ? input.value : input.innerText;
        if (currentVal && !currentVal.includes('[System Instruction: You are acting')) {
            if (input.value !== undefined) {
                input.value = currentVal + SYSTEM_INSTRUCTION;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                input.innerText = currentVal + SYSTEM_INSTRUCTION;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    // 4. Process AI Response
    function processResponse(node) {
        if (!highlighterEnabled) return;
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        
        let html = node.innerHTML;
        let changed = false;

        const annotationPattern = /(?:&lt;|<)annotation\s+class="([^"]+)"(?:&gt;|>)([\s\S]*?)(?:&lt;|<)\/annotation(?:&gt;|>)/g;
        
        if (annotationPattern.test(html)) {
            html = html.replace(annotationPattern, (match, cls, content) => {
                changed = true;
                const cleanContent = content.trim();
                if (cls === 'drug') {
                    return `<span class="highlight-drug" data-drug="${cleanContent}" onclick="window.open('https://ncshpcgpu01:8848/dashboard/results?drug_name=' + encodeURIComponent('${cleanContent}'), '_blank')">${content}</span>`;
                }
                return `<span class="highlight-${cls}">${content}</span>`;
            });
        }

        if (changed) {
            node.innerHTML = html;
        }
    }

    // 5. Mutation Observer
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        hookInput();
                        const selectors = ['.chat-message-content', '.prose', '.markdown-content', '.font-claude-message'];
                        selectors.forEach(selector => {
                            if (node.matches(selector)) processResponse(node);
                            node.querySelectorAll(selector).forEach(processResponse);
                        });
                    }
                });
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initialize
    createWidget();
    hookInput();
    const initialSelectors = ['.chat-message-content', '.prose', '.markdown-content', '.font-claude-message'];
    initialSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(processResponse);
    });

    console.log("TermHighlighter: Active.");
})();
