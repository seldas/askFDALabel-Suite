(function() {
    if (window.DRUG_SNIPPET_LOADED) return;
    window.DRUG_SNIPPET_LOADED = true;

    console.log("Drug Snippet: Initializing...");

    const SNIPPET_ORIGIN = window.ASKFDALABEL_ORIGIN || 'https://ncshpcgpu01';
    const SNIPPET_APP_BASE = window.ASKFDALABEL_APP_BASE || '/askfdalabel';
    const SNIPPET_API_BASE = window.ASKFDALABEL_API_BASE || '/askfdalabel_api';

    const normalizedAppBase =
        SNIPPET_APP_BASE === '/' ? '' : SNIPPET_APP_BASE.replace(/\/$/, '');
    const normalizedApiBase = SNIPPET_API_BASE.replace(/\/$/, '');

    const withAppBase = (path = '') => {
        const normalizedPath = path
            ? path.startsWith('/') ? path : `/${path}`
            : '';
        return `${SNIPPET_ORIGIN}${normalizedAppBase}${normalizedPath}`;
    };

    const withApiBase = (path) => {
        const normalizedPath = path
            ? path.startsWith('/') ? path : `/${path}`
            : '';
        return `${SNIPPET_ORIGIN}${normalizedApiBase}${normalizedPath}`;
    };

    const snippetPreviewUrl = (text) =>
        withApiBase(`/api/dashboard/snippet-preview?drug_name=${encodeURIComponent(text)}`);
    const snippetDashboardLabel = (setId) =>
        withAppBase(`/dashboard/label/${encodeURIComponent(setId)}`);
    const snippetDashboardResults = (query) =>
        withAppBase(`/dashboard/results?drug_name=${encodeURIComponent(query)}`);

    let isEnabled = true;
    let currentOption = 3;

    // Configuration for different platforms
    const ADAPTERS = {
        elsa: '.markdown-content[data-markdown-content="true"]',
        openai: '.prose',
        claude: '.font-claude-message',
        askfdalabel: '.chat-message-content', 
        generic_content: 'article, main, .content'
    };

    function findMatches(text, data) {
        if (!isEnabled || !data) return [];
        const matches = [];
        const lowerText = text.toLowerCase();
        
        function scanTrie(trie, type) {
            if (!trie) return;
            for (let i = 0; i < text.length; i++) {
                let node = trie;
                let j = i;
                let lastMatchEnd = -1;

                while (j < text.length && node[lowerText[j]]) {
                    node = node[lowerText[j]];
                    j++;
                    if (node['#']) {
                        lastMatchEnd = j;
                    }
                }

                if (lastMatchEnd !== -1) {
                    const before = i === 0 ? ' ' : text[i - 1];
                    const after = lastMatchEnd === text.length ? ' ' : text[lastMatchEnd];
                    
                    if (!/[a-zA-Z0-9]/.test(before) && !/[a-zA-Z0-9]/.test(after)) {
                        const matchText = text.substring(i, lastMatchEnd);
                        matches.push({
                            start: i,
                            end: lastMatchEnd,
                            text: matchText,
                            original: matchText,
                            type: type
                        });
                        i = lastMatchEnd - 1; 
                    }
                }
            }
        }

        // Scan both tries
        if (data.rld) scanTrie(data.rld, 'rld');
        if (data.brand) scanTrie(data.brand, 'brand');

        // Sort by start position, then by length (descending)
        matches.sort((a, b) => a.start - b.start || (b.end - a.end));
        
        const filteredMatches = [];
        let lastEnd = -1;
        for (const m of matches) {
            if (m.start >= lastEnd) {
                const sameMatches = matches.filter(x => x.start === m.start && x.end === m.end);
                const priorityMatch = sameMatches.find(x => x.type === 'rld') || m;
                
                // Check if we have cached set_id for this match
                if (typeof DRUG_SNIPPET_DATA !== 'undefined' && DRUG_SNIPPET_DATA.set_ids) {
                    const setId = DRUG_SNIPPET_DATA.set_ids[m.original];
                    if (setId) {
                        priorityMatch.setId = setId;
                    }
                }

                filteredMatches.push(priorityMatch);
                lastEnd = priorityMatch.end;
            }
        }
        return filteredMatches;
    }

    // Tooltip UI
    const tooltip = document.createElement('div');
    tooltip.id = 'drug-snippet-tooltip';
    Object.assign(tooltip.style, {
        position: 'fixed',
        display: 'none',
        zIndex: '3000',
        background: 'white',
        color: '#333',
        padding: '10px',
        borderRadius: '6px',
        fontSize: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        border: '1px solid #ccc',
        maxWidth: '300px',
        pointerEvents: 'none',
        lineHeight: '1.4'
    });
    document.body.appendChild(tooltip);

    function showTooltip(e, text, linkElement) {
        const rect = linkElement.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
        tooltip.style.display = 'block';
        
        // Basic loading state
        tooltip.innerHTML = `<strong>${text}</strong><br/><span style="color:#666">Loading info...</span>`;

        // Check if we already have data cached on the element
        if (linkElement.dataset.dsInfo) {
            renderTooltip(JSON.parse(linkElement.dataset.dsInfo));
            return;
        }

        // Fetch info
        fetch(snippetPreviewUrl(text))
            .then(res => res.json())
            .then(data => {
                if (data.found) {
                    linkElement.dataset.dsInfo = JSON.stringify(data);
                    linkElement.dataset.setId = data.set_id;
                    renderTooltip(data);
                    let baseUrl = '';
                    if (currentOption === 1 ) {
                        baseUrl = snippetDashboardLabel(data.set_id);
                    } else if (currentOption === 2 ) {
                        baseUrl = `https://fdalabel.fda.gov:8443/fdalabel/services/spl/set-ids/${data.set_id}/spl-doc`;
                    } else {
                        baseUrl = snippetDashboardResults(text);
                    }
                    linkElement.href = baseUrl;
                } else {
                    tooltip.innerHTML = `<strong>${text}</strong><br/><span style="color:#999">No specific label found.</span>`;
                }
            })
            .catch(err => {
                tooltip.innerHTML = `<strong>${text}</strong><br/><span style="color:red">Error loading info.</span>`;
                console.error(err);
            });
    }

    function renderTooltip(data) {
        tooltip.innerHTML = `
            <div style="font-weight:bold; margin-bottom:4px; border-bottom:1px solid #eee; padding-bottom:4px;">
                ${data.product_name || 'Unknown Product'}
            </div>
            <div style="display:grid; grid-template-columns: auto 1fr; gap: 4px;">
                <span style="color:#666;">NDA:</span> <span>${data.appr_num || 'N/A'}</span>
                <span style="color:#666;">Generic:</span> <span>${data.generic_name || 'N/A'}</span>
                <span style="color:#666;">RLD :</span> <span>${data.is_RLD || 'No'}</span>
                <span style="color:#666;">Date:</span> <span>${data.effective_date || 'N/A'}</span>
            </div>
            <div style="margin-top:4px; font-size:11px; color:#888;">
                Click to view specific label (Set ID: ${data.set_id})
            </div>
        `;
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }

    function highlightText(node) {
        if (!isEnabled) return;
        if (node.nodeType !== Node.TEXT_NODE) return;
        if (!node.parentElement) return;
        
        // Skip if already processed or inside a link
        if (node.parentElement.closest('[data-ds-done], a, script, style, textarea, input')) return;

        const text = node.textContent;
        const matches = findMatches(text, typeof DRUG_SNIPPET_DATA !== 'undefined' ? DRUG_SNIPPET_DATA : null);
        if (matches.length === 0) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        matches.forEach(match => {
            // Text before match
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.start)));

            // Highlighted link
            const link = document.createElement('a');
            let baseUrl = '';
            if (currentOption === 1 && link.dataset.setId) {
                baseUrl = snippetDashboardLabel(link.dataset.setId);
            } else if (currentOption === 2 && link.dataset.setId) {
                baseUrl = `https://fdalabel.fda.gov:8443/fdalabel/services/spl/set-ids/${link.dataset.setId}/spl-doc`;
            } else {
                baseUrl = snippetDashboardResults(match.original);
            }
            link.href = baseUrl;
            link.target = '_blank';
            link.className = `drug-snippet-link ds-type-${match.type}`;
            
            // Apply styles based on type
            if (match.type === 'rld') {
                link.style.backgroundColor = 'rgba(144, 238, 144, 0.4)'; // Light Green
                link.style.borderBottom = '1px dashed #28a745'; // Green border
            } else {
                link.style.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // Yellow
                link.style.borderBottom = '1px dashed orange';
            }
            
            link.style.color = 'inherit';
            link.style.textDecoration = 'none';
            link.style.padding = '0 2px';
            link.style.borderRadius = '2px';
            link.style.cursor = 'help';
            link.title = ""; // Remove native tooltip
            // link.title = `${match.type.toUpperCase()}: askFDALabel for ${match.original}`;
            link.textContent = match.text;
            link.setAttribute('data-ds-done', 'true');

            // Check if we have cached set_id for this match
            if (match.setId) {
                link.dataset.setId = match.setId;
            }

            // Add hover events
            link.addEventListener('mouseenter', (e) => showTooltip(e, match.original, link));
            link.addEventListener('mouseleave', hideTooltip);
            
            fragment.appendChild(link);
            lastIndex = match.end;
        });

        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        
        // Only replace if we have matches
        if (fragment.childNodes.length > 0) {
            node.parentElement.replaceChild(fragment, node);
        }
    }

    function removeHighlights() {
        const highlights = document.querySelectorAll('.drug-snippet-link');
        highlights.forEach(link => {
            const parent = link.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(link.textContent), link);
                parent.normalize(); // Merge adjacent text nodes
            }
        });
    }

    function scanElement(el) {
        if (!isEnabled) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        textNodes.forEach(highlightText);
    }

    const observer = new MutationObserver((mutations) => {
        if (!isEnabled) return;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        let matched = false;
                        Object.values(ADAPTERS).forEach(selector => {
                            if (node.matches(selector)) {
                                scanElement(node);
                                matched = true;
                            }
                        });
                        if (!matched) {
                            Object.values(ADAPTERS).forEach(selector => {
                                node.querySelectorAll(selector).forEach(scanElement);
                            });
                        }
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        highlightText(node);
                    }
                });
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    function performInitialScan() {
        Object.values(ADAPTERS).forEach(selector => {
            document.querySelectorAll(selector).forEach(scanElement);
        });
    }

    setTimeout(performInitialScan, 1000);

    // Toggle UI
    const toggleContainer = document.createElement('div');
    toggleContainer.id = 'ds-toggle-container';
    Object.assign(toggleContainer.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '2000',
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '8px 12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'sans-serif',
        fontSize: '12px',
        userSelect: 'none',
        cursor: 'move'
    });

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Drug-Snippet';
    toggleLabel.style.fontWeight = 'bold';
    toggleLabel.style.color = '#333';

    const configContainer = document.createElement('div');
    configContainer.style.display = 'flex';
    configContainer.style.flexDirection = 'column';
    configContainer.style.alignItems = 'center';

    const optionsContainer = document.createElement('div');
    optionsContainer.style.display = 'flex';
    optionsContainer.style.gap = '8px';
    optionsContainer.style.marginBottom = '8px';

    const optionA = document.createElement('button');
    optionA.textContent = 'A';
    optionA.style.padding = '4px 8px';
    optionA.style.borderRadius = '4px';
    optionA.style.border = 'none';
    optionA.style.cursor = 'pointer';
    optionA.style.backgroundColor = currentOption === 1 ? '#ee3225' : '#ccc';
    optionA.style.color = 'white';
    optionA.onclick = () => updateOption(1);

    const optionF = document.createElement('button');
    optionF.textContent = 'F';
    optionF.style.padding = '4px 8px';
    optionF.style.borderRadius = '4px';
    optionF.style.border = 'none';
    optionF.style.cursor = 'pointer';
    optionF.style.backgroundColor = currentOption === 2 ? '#007bff' : '#ccc';
    optionF.style.color = 'white';
    optionF.onclick = () => updateOption(2);

    const optionS = document.createElement('button');
    optionS.textContent = 'S';
    optionS.style.padding = '4px 8px';
    optionS.style.borderRadius = '4px';
    optionS.style.border = 'none';
    optionS.style.cursor = 'pointer';
    optionS.style.backgroundColor = currentOption === 3 ? '#007bff' : '#ccc';
    optionS.style.color = 'white';
    optionS.onclick = () => updateOption(3);

    optionsContainer.appendChild(optionA);
    optionsContainer.appendChild(optionF);
    optionsContainer.appendChild(optionS);

    configContainer.appendChild(optionsContainer);

    // Call createCustomTooltip after appending to DOM
    createCustomTooltip(optionA, 'Show in askFDALabel');
    createCustomTooltip(optionF, 'Show in FDALabel');
    createCustomTooltip(optionS, 'Search term');

    const toggleSwitchContainer = document.createElement('div');
    Object.assign(toggleSwitchContainer.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    });

    const toggleSwitch = document.createElement('div');
    Object.assign(toggleSwitch.style, {
      width: '34px',
      height: '20px',
      background: '#28a745',
      borderRadius: '10px',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 0.2s'
    });

    const toggleKnob = document.createElement('div');
    Object.assign(toggleKnob.style, {
      width: '16px',
      height: '16px',
      background: 'white',
      borderRadius: '50%',
      position: 'absolute',
      top: '2px',
      left: '16px',
      transition: 'left 0.2s'
    });

    toggleSwitch.appendChild(toggleKnob);
    toggleSwitchContainer.appendChild(toggleLabel);
    toggleSwitchContainer.appendChild(toggleSwitch);
    configContainer.appendChild(toggleSwitchContainer);

    toggleContainer.appendChild(configContainer);
    document.body.appendChild(toggleContainer);

    function createCustomTooltip(element, text) {
        const tooltip = document.createElement('div');
        tooltip.style.position = 'fixed';
        tooltip.style.background = 'black';
        tooltip.style.color = 'white';
        tooltip.style.padding = '3px 6px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '8px';
        tooltip.style.zIndex = '3000';
        tooltip.style.display = 'none';
        tooltip.textContent = text;
        tooltip.style.pointerEvents = 'none'; 
        document.body.appendChild(tooltip);

        element.addEventListener('mouseenter', (e) => {
            const rect = e.target.getBoundingClientRect();
            tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
            tooltip.style.left = `${rect.left + (e.target.offsetWidth / 2) - (tooltip.offsetWidth / 2)}px`;
            tooltip.style.display = 'block';
        });

        element.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    }

    function updateOption(newOption) {
        currentOption = newOption;
        optionA.style.backgroundColor = currentOption === 1 ? '#ee3225' : '#ccc';
        optionF.style.backgroundColor = currentOption === 2 ? '#25be20d2' : '#ccc';
        optionS.style.backgroundColor = currentOption === 3 ? '#007bff' : '#ccc';
        removeHighlights();
        performInitialScan();
    }

    toggleSwitch.onclick = () => {
        isEnabled = !isEnabled;
        if (isEnabled) {
            toggleSwitch.style.background = '#28a745';
            toggleKnob.style.left = '16px';
            performInitialScan();
        } else {
            toggleSwitch.style.background = '#ccc';
            toggleKnob.style.left = '2px';
            removeHighlights();
        }
    };

    // Simple drag logic
    let isDragging = false;
    let offsetX, offsetY;
    toggleContainer.onmousedown = (e) => {
        if (e.target === toggleSwitch || e.target === toggleKnob) return;
        isDragging = true;
        offsetX = e.clientX - toggleContainer.offsetLeft;
        offsetY = e.clientY - toggleContainer.offsetTop;
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        toggleContainer.style.left = (e.clientX - offsetX) + 'px';
        toggleContainer.style.top = (e.clientY - offsetY) + 'px';
        toggleContainer.style.bottom = 'auto';
        toggleContainer.style.right = 'auto';
    };
    document.onmouseup = () => isDragging = false;

    // Selection Pop-up (remains mostly same, but check isEnabled)
    const popup = document.createElement('div');
    popup.id = 'drug-snippet-popup';
    Object.assign(popup.style, {
        position: 'fixed',
        display: 'none',
        zIndex: '2147483647',
        background: '#007bff',
        color: 'white',
        padding: '5px 12px',
        borderRadius: '20px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'transform 0.1s ease',
        userSelect: 'none'
    });
    popup.innerHTML = '🔍 Search Label';
    document.body.appendChild(popup);

    document.addEventListener('mouseup', (e) => {
        if (!isEnabled) return;
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText.length > 1 && selectedText.length < 50) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            popup.style.left = `${rect.left + (rect.width / 2) - 50}px`;
            popup.style.top = `${rect.top - 40}px`;
            popup.style.display = 'block';
            popup.onmousedown = (pe) => {
                pe.preventDefault(); pe.stopPropagation();
                const baseUrl = snippetDashboardResults(selectedText);
                if (currentOption === 1 || currentOption === 2) {
                    // We don't have set_id here, so we can't append it
                    // For now, we'll open the base URL
                } else if (currentOption === 3) {
                    // For option 3, we can keep the base URL as is
                }
                window.open(baseUrl, '_blank');
                popup.style.display = 'none';
                selection.removeAllRanges();
            };
        } else if (e.target !== popup) {
            popup.style.display = 'none';
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (e.target !== popup) popup.style.display = 'none';
    });

    console.log("Drug Snippet: Monitoring active...");
})();
