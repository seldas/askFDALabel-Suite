document.addEventListener('DOMContentLoaded', function () {
    // Chatbox Functionality
    const chatBubble = document.getElementById('chat-bubble');
    const chatbox = document.getElementById('chatbox');
    const closeChat = document.getElementById('close-chat');
    const chatSend = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const xmlContentDiv = document.getElementById('xml-content');
    const fontIncrease = document.getElementById('font-increase');
    const fontDecrease = document.getElementById('font-decrease');
    const chatReset = document.getElementById('chat-reset');

    // New Controls
    const toggleHistoryBtn = document.getElementById('toggle-history-btn');
    const resetChatBtn = document.getElementById('reset-current-chat-btn');
    const historyStatusText = document.getElementById('history-status-text');

    // State
    window.globalHistoryEnabled = true;
    window.globalHistory = [];        // Messages from other sessions
    window.currentSessionHistory = []; // Messages from THIS session (restored or new)

    // Helper to safely parse markdown
    const parseMarkdown = (text) => {
        if (typeof marked !== 'undefined' && marked.parse) {
            return marked.parse(text);
        }
        // Fallback if marked is missing
        console.warn('Marked library not found. Falling back to plain text.');
        return text.replace(/\n/g, '<br>');
    };

    // Helper to update status text
    const updateHistoryStatus = () => {
        if (window.globalHistoryEnabled) {
            if (historyStatusText) {
                historyStatusText.textContent = "Global history included in context.";
                historyStatusText.style.color = "#28a745";
            }
            if (toggleHistoryBtn) toggleHistoryBtn.classList.add('active');
        } else {
            if (historyStatusText) {
                historyStatusText.textContent = "Global history hidden and IGNORED.";
                historyStatusText.style.color = "#dc3545";
            }
            if (toggleHistoryBtn) toggleHistoryBtn.classList.remove('active');
        }
    };

    if (chatBubble && chatbox && closeChat && chatSend && chatInput && chatMessages && xmlContentDiv) {
        const xmlContent = xmlContentDiv.textContent;
        let currentFontSize = 14;

        const setFontSize = (size) => {
            if (size >= 8 && size <= 20) {
                currentFontSize = size;
                chatMessages.style.fontSize = `${currentFontSize}px`;
            }
        };

        chatBubble.addEventListener('click', () => {
            chatbox.style.display = 'flex';
            chatBubble.style.display = 'none';
        });

        closeChat.addEventListener('click', () => {
            chatbox.style.display = 'none';
            chatBubble.style.display = 'flex';
        });

        if (fontIncrease) fontIncrease.addEventListener('click', () => setFontSize(currentFontSize + 1));
        if (fontDecrease) fontDecrease.addEventListener('click', () => setFontSize(currentFontSize - 1));

        // Initial load of saved annotations
        if (typeof savedAnnotations !== 'undefined' && savedAnnotations.length > 0) {
            savedAnnotations.forEach(ann => {
                createAnnotationBadge(ann.question, ann.answer, ann.section_number, ann.keywords, ann.id, true);
            });
        }

        // Top header reset (Legacy - mapped to new reset logic for consistency)
        if (chatReset) {
            chatReset.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset the current chat?')) {
                    performReset();
                }
            });
        }

        // --- SESSION MANAGER INTEGRATION ---
        if (window.SessionManager && typeof currentSetId !== 'undefined') {
            // 1. Render History from other sessions (Home, other drugs)
            const allHistory = SessionManager.getHistory(currentSetId);

            // Filter: Only show 'home' and the MOST RECENT other session to avoid repetition
            const homeSession = allHistory.find(s => s.id === 'home');
            const otherSessions = allHistory.filter(s => s.id !== 'home');
            const lastSession = otherSessions.length > 0 ? otherSessions[otherSessions.length - 1] : null;

            const historicalSessions = [];
            if (homeSession) historicalSessions.push(homeSession);
            if (lastSession) historicalSessions.push(lastSession);

            let historyContainer = null;

            if (historicalSessions.length > 0) {
                historyContainer = document.createElement('div');
                historyContainer.className = 'history-container';
                historyContainer.id = 'global-history-container';

                historicalSessions.forEach(session => {
                    const sessionHeader = document.createElement('div');
                    sessionHeader.style.fontSize = '0.8em';
                    sessionHeader.style.color = '#6c757d';
                    sessionHeader.style.textAlign = 'center';
                    sessionHeader.style.margin = '10px 0 5px';
                    sessionHeader.style.fontWeight = '700';
                    sessionHeader.style.textTransform = 'uppercase';
                    sessionHeader.innerText = `History: ${session.title || 'Previous Session'}`;
                    historyContainer.appendChild(sessionHeader);

                    session.messages.forEach(msg => {
                        const div = document.createElement('div');
                        let cssClass = (msg.role === 'assistant' || msg.role === 'ai') ? 'message-ai' : 'message-user';

                        div.className = `message ${cssClass} history-message`;
                        div.innerHTML = `<div class="message-content" style="font-size: 0.95em;">${parseMarkdown(msg.content)}</div>`;
                        historyContainer.appendChild(div);

                        // Add to GLOBAL history context
                        const role = (msg.role === 'assistant' || msg.role === 'ai') ? 'model' : 'user';
                        window.globalHistory.push({ role: role, content: msg.content });
                    });
                });

                const greeting = chatMessages.querySelector('.message-greeting');
                if (greeting) {
                    greeting.insertAdjacentElement('afterend', historyContainer);
                } else {
                    chatMessages.prepend(historyContainer);
                }
            } else {
                // No global history found
                if (toggleHistoryBtn) {
                    toggleHistoryBtn.style.display = 'none'; // Hide toggle if empty
                    if (historyStatusText) historyStatusText.textContent = "No global history available.";
                }
            }

            // 2. Restore CURRENT session if exists
            const mySession = SessionManager.getSession(currentSetId);
            if (mySession && mySession.messages && mySession.messages.length > 0) {
                mySession.messages.forEach(msg => {
                    const div = document.createElement('div');
                    let cssClass = (msg.role === 'assistant' || msg.role === 'ai') ? 'message-ai' : 'message-user';

                    div.className = `message ${cssClass}`;
                    div.innerHTML = `<div class="message-content">${parseMarkdown(msg.content)}</div>`;
                    chatMessages.appendChild(div);

                    // Add to CURRENT session context
                    const role = (msg.role === 'assistant' || msg.role === 'ai') ? 'model' : 'user';
                    window.currentSessionHistory.push({ role: role, content: msg.content });
                });
                setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 100);
            }
        }

        // --- NEW CONTROLS LOGIC ---
        if (toggleHistoryBtn) {
            toggleHistoryBtn.addEventListener('click', () => {
                const container = document.getElementById('global-history-container');
                window.globalHistoryEnabled = !window.globalHistoryEnabled;
                if (container) {
                    container.style.display = window.globalHistoryEnabled ? 'block' : 'none';
                }
                updateHistoryStatus();
            });
            updateHistoryStatus(); // Init
        }

        if (resetChatBtn) {
            resetChatBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear this conversation? Global history will be preserved.')) {
                    performReset();
                }
            });
        }

        function performReset() {
            // Clear DOM except greeting and history container
            const toRemove = [];
            // Select all messages that are NOT greeting AND NOT history messages/containers
            for (let child of chatMessages.children) {
                if (child.classList.contains('message-greeting')) continue;
                if (child.classList.contains('history-container')) continue;
                if (child.id === 'global-history-container') continue;
                toRemove.push(child);
            }
            toRemove.forEach(el => el.remove());

            // Reset State
            window.currentSessionHistory = [];

            // Clear storage
            if (window.SessionManager && typeof currentSetId !== 'undefined') {
                SessionManager.updateSession(currentSetId, (typeof currentDrugName !== 'undefined' ? currentDrugName : 'Drug Label'), []);
            }
        }

        const sendMessage = async () => {
            const userInput = chatInput.value;
            if (userInput.trim() === '') return;

            const userMessage = document.createElement('div');
            userMessage.classList.add('message', 'message-user');
            userMessage.innerHTML = `<div class="message-content"><p>${userInput}</p></div>`;
            chatMessages.appendChild(userMessage);
            chatInput.value = '';
            chatMessages.scrollTop = chatMessages.scrollHeight;

            const typingIndicator = document.createElement('div');
            typingIndicator.classList.add('message', 'message-ai');
            typingIndicator.innerHTML = `<div class="message-content"><p class="typing-indicator"><span>.</span><span>.</span><span>.</span></p></div>`;
            chatMessages.appendChild(typingIndicator);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                // Combine History based on Toggle
                let payloadHistory = [];
                if (window.globalHistoryEnabled) {
                    payloadHistory = [...window.globalHistory, ...window.currentSessionHistory];
                } else {
                    payloadHistory = [...window.currentSessionHistory];
                }

                const response = await fetch('/ai_chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: userInput,
                        history: payloadHistory,
                        xml_content: xmlContent,
                        chat_type: 'general'
                    }),
                });

                if (chatMessages.contains(typingIndicator)) chatMessages.removeChild(typingIndicator);

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    const errorMsg = data.error || 'Network response was not ok.';
                    const errorMessage = document.createElement('div');
                    errorMessage.classList.add('message', 'message-ai');
                    errorMessage.innerHTML = `<div class="message-content"><p>Error: ${errorMsg}</p></div>`;
                    chatMessages.appendChild(errorMessage);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    return;
                }

                const aiResponseText = data.response || 'Sorry, I encountered an error.';

                const keywordRegex = /\[KEYWORDS: (.*?)\]/; 
                const keywordMatch = aiResponseText.match(keywordRegex);
                let keywords = [];
                if (keywordMatch) {
                    try {
                        keywords = JSON.parse(`[${keywordMatch[1]}]`);
                    } catch (e) {
                        console.error("Failed to parse keywords", e);
                    }
                }

                let displayAnswer = aiResponseText.replace(keywordRegex, '').trim();

                const aiMessage = document.createElement('div');
                aiMessage.classList.add('message', 'message-ai');
                aiMessage.innerHTML = `<div class="message-content">${parseMarkdown(displayAnswer)}</div>`;
                chatMessages.appendChild(aiMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                // Update CURRENT session history
                window.currentSessionHistory.push({ role: 'user', content: userInput });
                window.currentSessionHistory.push({ role: 'model', content: aiResponseText });

                // Save to SessionManager
                if (window.SessionManager && typeof currentSetId !== 'undefined') {
                    SessionManager.updateSession(currentSetId, (typeof currentDrugName !== 'undefined' ? currentDrugName : 'Drug Label'), window.currentSessionHistory);
                }

                annotateDocument(userInput, aiResponseText, keywords);

            } catch (error) {
                console.error('Error during fetch:', error);
                if (chatMessages.contains(typingIndicator)) chatMessages.removeChild(typingIndicator);
                const errorMessage = document.createElement('div');
                errorMessage.classList.add('message', 'message-ai');
                errorMessage.innerHTML = `<div class="message-content"><p>Error: Could not connect to the AI assistant.</p></div>`;
                chatMessages.appendChild(errorMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        };

        function annotateDocument(question, rawAnswer, keywords) {
            const cleanAnswer = rawAnswer.replace(/\[KEYWORDS: .*?\]/g, '').trim();
            // Robust regex to capture (5.1), ( 5.1 ), (Section 5.1), etc.
            const citationRegex = /\((?:Section\s+)?\s*(\d+(?:\.\d+)*)\s*\)/gi;
            const matches = [...cleanAnswer.matchAll(citationRegex)];
            const uniqueSections = [...new Set(matches.map(m => m[1]))];

            console.log('Annotating sections:', uniqueSections);

            if (uniqueSections.length === 0) {
                createAnnotationBadge(question, cleanAnswer, 'TOP', keywords);
            } else {
                uniqueSections.forEach(sectionNum => {
                    createAnnotationBadge(question, cleanAnswer, sectionNum, keywords);
                });
            }
        }

        window.createAnnotationBadge = createAnnotationBadge;

        function createAnnotationBadge(question, answer, sectionNum, keywords, id = null, isSaved = false) {
            let sectionEl = document.querySelector(`.Section[data-section-number="${sectionNum}"]`);
            let header = sectionEl ? sectionEl.querySelector('h2') : null;

            // Fallback to top of document if section not found or explicitly requested as TOP
            if (!header || sectionNum === 'TOP') {
                header = document.getElementById('top-annotations-container');
                // Use label-view as the highlighting container if we're at the top
                sectionEl = document.getElementById('label-view') || document.querySelector('.container');
                sectionNum = 'TOP';
            }

            if (!header) {
                console.warn(`createAnnotationBadge: Could not find target element for section "${sectionNum}"`);
                return;
            }

            // Simple deduplication check: if badge exists with same Q, don't add
            const existingBadges = header.querySelectorAll('.chat-annotation-badge');
            for (let b of existingBadges) {
                const popoverQ = b.querySelector('.popover-q');
                if (popoverQ && popoverQ.textContent === `Q: ${question}`) return;
            }

            // --- Match Type Detection ---
            let matchType = null;
            if (keywords && Array.isArray(keywords)) {
                if (keywords.includes('match:yes')) matchType = 'yes';
                else if (keywords.includes('match:probable')) matchType = 'probable';
            }

            const badge = document.createElement('span');
            badge.className = 'chat-annotation-badge' + (isSaved ? ' saved' : '');

            // Custom Styling based on Match Type
            let iconSymbol = '&#128172;'; // Default Speech Bubble
            let headerTitle = '<span>&#10024;</span> AI INSIGHT';

            if (matchType === 'yes') {
                badge.classList.add('match-yes');
                iconSymbol = '&#10003;'; // Checkmark
                headerTitle = '<span>&#9989;</span> AI CONFIRMED';
            } else if (matchType === 'probable') {
                badge.classList.add('match-probable');
                iconSymbol = '?';
                headerTitle = '<span>&#9888;</span> AI PROBABLE';
            }

            badge.innerHTML = iconSymbol;
            badge.title = 'Click to toggle sticky note & highlights';
            if (id) badge.setAttribute('data-id', id);

            const popover = document.createElement('div');
            popover.className = 'annotation-popover';
            if (matchType) popover.classList.add(`match-${matchType}`);

            popover.innerHTML = `
                <div class="annotation-popover-header">
                    <div class="popover-header-title">${headerTitle}</div>
                    <div class="popover-actions">
                        ${!isSaved ? `<button class="save-note-btn" title="Save permanently">&#128190;</button>` : ''}
                        <button class="delete-note-btn" title="Delete note">&#128465;</button>
                        <button class="close-note-btn" title="Close note">&times;</button>
                    </div>
                </div>
                <div class="popover-content-wrapper">
                    <span class="popover-q">Q: ${question}</span>
                    <div class="popover-a">${parseMarkdown(answer)}</div>
                </div>
            `;

            badge.appendChild(popover);
            header.appendChild(badge);

            // --- Drag Functionality for Popover ---
            const popoverHeader = popover.querySelector('.annotation-popover-header');
            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            const dragStart = (e) => {
                if (e.target.closest('.popover-actions')) return; // Don't drag if clicking buttons

                // Get current transform values if they exist
                const style = window.getComputedStyle(popover);
                const matrix = new WebKitCSSMatrix(style.transform);
                xOffset = matrix.m41;
                yOffset = matrix.m42;

                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (badge.classList.contains('sticky')) {
                    isDragging = true;
                    popover.classList.add('is-dragging');
                }
            };

            const drag = (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    popover.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
                }
            };

            const dragEnd = () => {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
                popover.classList.remove('is-dragging');
            };

            popoverHeader.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            badge.addEventListener('click', (e) => {
                // If the click is inside the popover, don't toggle the sticky state
                if (e.target.closest('.annotation-popover')) {
                    e.stopPropagation();
                    return;
                }

                e.stopPropagation();
                const isSticky = badge.classList.toggle('sticky');

                // Keep popover on screen
                if (isSticky) {
                    const rect = popover.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        popover.style.left = 'auto';
                        popover.style.right = '0';
                        popover.style.transform = 'none';
                    }
                    if (rect.left < 0) {
                        popover.style.left = '0';
                        popover.style.transform = 'none';
                    }
                }

                // Clean ALL highlight types
                sectionEl.querySelectorAll('.ai-highlight, .ai-highlight-yes, .ai-highlight-probable').forEach(hl => {
                    const text = hl.textContent;
                    hl.parentNode.replaceChild(document.createTextNode(text), hl);
                });
                sectionEl.normalize();

                if (isSticky) {
                    // 1. Highlight Quote (Citation)
                    // Extract text inside > "..." OR just > ...
                    const quoteMatch = answer.match(/>\s*"?([^"\n]+)"?/);
                    if (quoteMatch && quoteMatch[1]) {
                        const quoteText = quoteMatch[1].trim();
                        // Sanity check length to avoid highlighting single characters
                        if (quoteText.length > 5) {
                            let highlightClass = 'ai-highlight';
                            if (matchType === 'yes') highlightClass = 'ai-highlight-yes';
                            else if (matchType === 'probable') highlightClass = 'ai-highlight-probable';

                            highlightText(sectionEl, quoteText, highlightClass);
                        }
                    }

                    // 2. Highlight Keywords (legacy/fallback)
                    if (keywords && keywords.length > 0) {
                        keywords.forEach(phrase => {
                            if (phrase.length < 3) return;
                            if (phrase.startsWith('match:')) return;
                            // Use default highlight for keywords
                            highlightText(sectionEl, phrase, 'ai-highlight');
                        });
                    }
                }
            });

            popover.querySelector('.close-note-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                badge.classList.remove('sticky');
                // Clean highlights if it was sticky
                sectionEl.querySelectorAll('.ai-highlight, .ai-highlight-yes, .ai-highlight-probable').forEach(hl => {
                    const text = hl.textContent;
                    hl.parentNode.replaceChild(document.createTextNode(text), hl);
                });
                sectionEl.normalize();
            });

            const saveBtn = popover.querySelector('.save-note-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const res = await fetch('/save_annotation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                set_id: currentSetId,
                                section_number: sectionNum,
                                question: question,
                                answer: answer,
                                keywords: keywords
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            badge.classList.add('saved');
                            badge.setAttribute('data-id', data.id);
                            saveBtn.remove();
                        }
                    } catch (err) {
                        console.error("Save failed", err);
                    }
                });
            }

            popover.querySelector('.delete-note-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const annotationId = badge.getAttribute('data-id');
                if (annotationId) {
                    if (!confirm('Are you sure you want to delete this saved note?')) return;
                    try {
                        await fetch('/delete_annotation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ set_id: currentSetId, id: annotationId })
                        });
                    } catch (err) {
                        console.error("Delete failed", err);
                    }
                }
                badge.remove();

                // Clean highlights if sticky
                if (badge.classList.contains('sticky')) {
                    sectionEl.querySelectorAll('.ai-highlight, .ai-highlight-yes, .ai-highlight-probable').forEach(hl => {
                        const text = hl.textContent;
                        hl.parentNode.replaceChild(document.createTextNode(text), hl);
                    });
                    sectionEl.normalize();
                }
            });
        }

        function highlightText(element, phrase, className = 'ai-highlight') {
            if (element.nodeType === 3) {
                const text = element.nodeValue;
                const lowerText = text.toLowerCase();
                const lowerPhrase = phrase.toLowerCase();
                const index = lowerText.indexOf(lowerPhrase);

                if (index >= 0) {
                    const span = document.createElement('span');
                    span.className = className;
                    span.textContent = text.substr(index, phrase.length);
                    const afterNode = document.createTextNode(text.substr(index + phrase.length));
                    const parent = element.parentNode;
                    parent.insertBefore(document.createTextNode(text.substr(0, index)), element);
                    parent.insertBefore(span, element);
                    parent.insertBefore(afterNode, element);
                    parent.removeChild(element);
                }
            } else if (element.nodeType === 1 &&
                !element.classList.contains('ai-highlight') &&
                !element.classList.contains('ai-highlight-yes') &&
                !element.classList.contains('ai-highlight-probable') &&
                !['SCRIPT', 'STYLE'].includes(element.tagName)) {
                Array.from(element.childNodes).forEach(child => highlightText(child, phrase, className));
            }
        }

        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                eventpreventDefault();
                sendMessage();
            }
        });

        const resizeHandles = document.querySelectorAll('.resize-handle');
        const chatHeader = document.getElementById('chat-header');
        let initialX_move, initialY_move, initialWidth, initialHeight, initialLeft, initialTop;
        let currentHandle;
        let isMoving = false;

        // --- Resize Logic (4 Corners) ---
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                currentHandle = e.target;
                const rect = chatbox.getBoundingClientRect();
                initialX_move = e.clientX;
                initialY_move = e.clientY;
                initialWidth = rect.width;
                initialHeight = rect.height;
                initialLeft = rect.left;
                initialTop = rect.top;

                const handleResize = (e) => {
                    const dx = e.clientX - initialX_move;
                    const dy = e.clientY - initialY_move;

                    if (currentHandle.classList.contains('resize-handle-se')) {
                        chatbox.style.width = (initialWidth + dx) + 'px';
                        chatbox.style.height = (initialHeight + dy) + 'px';
                    } else if (currentHandle.classList.contains('resize-handle-sw')) {
                        chatbox.style.width = (initialWidth - dx) + 'px';
                        chatbox.style.height = (initialHeight + dy) + 'px';
                        chatbox.style.left = (initialLeft + dx) + 'px';
                    } else if (currentHandle.classList.contains('resize-handle-nw')) {
                        chatbox.style.width = (initialWidth - dx) + 'px';
                        chatbox.style.height = (initialHeight - dy) + 'px';
                        chatbox.style.left = (initialLeft + dx) + 'px';
                        chatbox.style.top = (initialTop + dy) + 'px';
                    } else if (currentHandle.classList.contains('resize-handle-ne')) {
                        chatbox.style.width = (initialWidth + dx) + 'px';
                        chatbox.style.height = (initialHeight - dy) + 'px';
                        chatbox.style.top = (initialTop + dy) + 'px';
                    }
                };

                const stopResize = () => {
                    document.removeEventListener('mousemove', handleResize);
                    document.removeEventListener('mouseup', stopResize);
                };

                document.addEventListener('mousemove', handleResize);
                document.addEventListener('mouseup', stopResize);
            });
        });

        // --- Move Logic (Header Drag) ---
        if (chatHeader) {
            chatHeader.addEventListener('mousedown', function (e) {
                if (e.target.closest('.chat-header-buttons')) return; // Don't drag if clicking buttons

                e.preventDefault();
                isMoving = true;
                initialX_move = e.clientX;
                initialY_move = e.clientY;
                const rect = chatbox.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                const handleMove = (e) => {
                    if (!isMoving) return;
                    const dx = e.clientX - initialX_move;
                    const dy = e.clientY - initialY_move;

                    chatbox.style.left = (initialLeft + dx) + 'px';
                    chatbox.style.top = (initialTop + dy) + 'px';
                    chatbox.style.bottom = 'auto'; // Disable bottom/right positioning once moved
                    chatbox.style.right = 'auto';
                };

                const stopMove = () => {
                    isMoving = false;
                    document.removeEventListener('mousemove', handleMove);
                    document.removeEventListener('mouseup', stopMove);
                };

                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', stopMove);
            });
        }
    }
});
