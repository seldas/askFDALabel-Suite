(function() {
    if (window.HIGHLIGHTS_SNIPPET_LOADED) return;
    window.HIGHLIGHTS_SNIPPET_LOADED = true;

    console.log("Highlights Snippet: Initializing...");

    // 1. Inject Styles
    const styleId = 'highlights-snippet-styles';
    if (!document.getElementById(styleId)) {
        const styleLink = document.createElement('link');
        styleLink.id = styleId;
        styleLink.rel = 'stylesheet';
        styleLink.href = 'https://ncshpcgpu01:8848/snippets/highlights/style.css';
        document.head.appendChild(styleLink);
    }

    const SYSTEM_INSTRUCTION = `

[Instruction: In your response, wrap specific entities with <annotation class="CATEGORY">text</annotation> tags. Categories: drug, adverse_events, temporal, company]`;

    // 2. Hook Input
    // This function tries to find the chat input and hook into its submission
    function hookInput() {
        // Common selectors for chat inputs
        const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
        inputs.forEach(input => {
            if (input.dataset.highlightsHooked) return;
            input.dataset.highlightsHooked = 'true';

            input.addEventListener('keydown', (e) => {
                // Check if Enter is pressed (but not Shift+Enter)
                if (e.key === 'Enter' && !e.shiftKey) {
                    appendInstruction(input);
                }
            }, true); // Use capture to run before the site's own listeners
        });

        // Also hook into buttons that look like "Send" buttons
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            // Check if it's likely a send button (has icon, or specific text)
            const isSendButton = button.innerHTML.includes('svg') || 
                                 button.innerText.toLowerCase().includes('send') ||
                                 button.getAttribute('aria-label')?.toLowerCase().includes('send');
            
            if (isSendButton && !button.dataset.highlightsHooked) {
                button.dataset.highlightsHooked = 'true';
                button.addEventListener('click', () => {
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
        let currentVal = input.value !== undefined ? input.value : input.innerText;
        if (currentVal && !currentVal.includes('[Instruction: In your response')) {
            if (input.value !== undefined) {
                input.value = currentVal + SYSTEM_INSTRUCTION;
                // Trigger input event for frameworks like React
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                input.innerText = currentVal + SYSTEM_INSTRUCTION;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    // 3. Process AI Response
    // Converts <annotation class="...">...</annotation> into styled <span>
    function processResponse(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        
        let html = node.innerHTML;
        let changed = false;

        // Pattern 1: Escaped tags (often happens when AI returns markdown)
        // &lt;annotation class="drug"&gt;Aspirin&lt;/annotation&gt;
        const escapedPattern = /&lt;annotation\s+class="([^"]+)"&gt;([\s\S]*?)&lt;\/annotation&gt;/g;
        if (escapedPattern.test(html)) {
            html = html.replace(escapedPattern, (match, cls, content) => {
                changed = true;
                return `<span class="highlight-${cls}">${content}</span>`;
            });
        }

        // Pattern 2: Literal tags
        // <annotation class="drug">Aspirin</annotation>
        const literalPattern = /<annotation\s+class="([^"]+)">([\s\S]*?)<\/annotation>/g;
        if (literalPattern.test(html)) {
            html = html.replace(literalPattern, (match, cls, content) => {
                changed = true;
                return `<span class="highlight-${cls}">${content}</span>`;
            });
        }

        if (changed) {
            node.innerHTML = html;
        }
    }

    // 4. Mutation Observer
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Re-hook inputs in case they were re-rendered
                        hookInput();
                        
                        // Check for new AI responses
                        const selectors = [
                            '.markdown-content[data-markdown-content="true"]',
                            '.chat-message-content',
                            '.prose',
                            '.font-claude-message'
                        ];
                        
                        selectors.forEach(selector => {
                            if (node.matches(selector)) {
                                processResponse(node);
                            }
                            node.querySelectorAll(selector).forEach(processResponse);
                        });
                    }
                });
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial scan
    hookInput();
    const initialSelectors = [
        '.markdown-content[data-markdown-content="true"]',
        '.chat-message-content',
        '.prose',
        '.font-claude-message'
    ];
    initialSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(processResponse);
    });

    console.log("Highlights Snippet: Active.");
})();
