window.initUI = function() {
    // --- Back to Top Button ---
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    const scrollContainer = document.querySelector('.main-content') || window; 

    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            if (scrollContainer === window) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // --- TOC Toggle Functionality ---
    const tocToggle = document.getElementById('toc-toggle');
    const tocCloseInternal = document.getElementById('toc-close-internal');
    const showTocBtn = document.getElementById('show-toc-btn');
    const tocPanel = document.getElementById('toc-panel');
    const mainContent = document.getElementById('main-content');

    if (tocPanel && mainContent) {
        const toggleToc = () => {
            const isHidden = tocPanel.classList.toggle('hidden');
            mainContent.classList.toggle('expanded');

            // Update external toggle button text
            if (tocToggle) {
                tocToggle.innerHTML = isHidden ? '&raquo;' : '&laquo;';
            }

            // Update top nav "Show Sidebar" button visibility
            if (showTocBtn) {
                showTocBtn.style.display = isHidden ? 'inline-flex' : 'none';
            }
        };

        if (tocToggle) tocToggle.addEventListener('click', toggleToc);
        if (tocCloseInternal) tocCloseInternal.addEventListener('click', toggleToc);
        if (showTocBtn) showTocBtn.addEventListener('click', toggleToc);
    }

    // --- Table Resizing ---
    function initTableResizing() {
        const tables = document.querySelectorAll('table.diff');
        tables.forEach(table => {
            const cols = table.querySelectorAll('th');
            cols.forEach(col => {
                const resizer = document.createElement('div');
                resizer.classList.add('resizer');
                col.appendChild(resizer);

                let x = 0;
                let w = 0;

                const mouseDownHandler = function (e) {
                    x = e.clientX;
                    const styles = window.getComputedStyle(col);
                    w = parseInt(styles.width, 10);
                    document.addEventListener('mousemove', mouseMoveHandler);
                    document.addEventListener('mouseup', mouseUpHandler);
                    resizer.classList.add('resizing');
                };

                const mouseMoveHandler = function (e) {
                    const dx = e.clientX - x;
                    col.style.width = `${w + dx}px`;
                };

                const mouseUpHandler = function () {
                    document.removeEventListener('mousemove', mouseMoveHandler);
                    document.removeEventListener('mouseup', mouseUpHandler);
                    resizer.classList.remove('resizing');
                };

                resizer.addEventListener('mousedown', mouseDownHandler);
            });
        });
    }
    initTableResizing();

    // --- MedDRA Stats Modal Logic ---
    const statsBtn = document.getElementById('meddra-stats-btn');
    const statsModal = document.getElementById('meddra-stats-modal');
    const closeStatsBtn = document.getElementById('close-meddra-stats');

    if (statsBtn && statsModal) {
        statsBtn.addEventListener('click', () => {
            statsModal.style.display = 'block';
            if (window.loadMeddraStatistics) {
                window.loadMeddraStatistics();
            }
        });

        if (closeStatsBtn) {
            closeStatsBtn.addEventListener('click', () => {
                statsModal.style.display = 'none';
            });
        }
    }

    // --- AI Preferences Modal Logic (In-Chat) ---
    const openAiPrefsBtn = document.getElementById('open-ai-prefs');
    const aiPrefsModal = document.getElementById('ai-prefs-modal');
    const closeAiPrefsBtn = document.getElementById('close-ai-prefs');
    const aiPrefsForm = document.getElementById('ai-prefs-form');

    if (openAiPrefsBtn && aiPrefsModal) {
        openAiPrefsBtn.addEventListener('click', () => {
            aiPrefsModal.style.display = 'block';
        });

        if (closeAiPrefsBtn) {
            closeAiPrefsBtn.addEventListener('click', () => {
                aiPrefsModal.style.display = 'none';
            });
        }

        // Handle provider radio toggle
        const radios = aiPrefsForm.querySelectorAll('input[name="ai_provider"]');
        radios.forEach(r => {
            r.addEventListener('change', () => {
                document.getElementById('modal-gemini-config').style.display = r.value === 'gemini' ? 'block' : 'none';
                document.getElementById('modal-openai-config').style.display = r.value === 'openai' ? 'block' : 'none';
            });
        });

        // AJAX Form Submission
        if (aiPrefsForm) {
            aiPrefsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(aiPrefsForm);
                const payload = {};
                formData.forEach((value, key) => { payload[key] = value; });

                try {
                    const response = await fetch('/api/dashboard/preferences', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        alert('AI Model preferences updated successfully.');
                        aiPrefsModal.style.display = 'none';
                    } else {
                        alert('Failed to update preferences.');
                    }
                } catch (err) {
                    console.error('Error updating AI preferences:', err);
                    alert('An error occurred while saving preferences.');
                }
            });
        }
    }

    // --- Table Extraction Logic ---
    function initTableExtractor() {
        console.log("Initializing Table Extractor...");
        const labelView = document.getElementById('label-view');
        if (!labelView) {
            console.warn("Table Extractor: #label-view not found");
            return;
        }

        const tables = labelView.querySelectorAll('table');
        console.log(`Table Extractor: Found ${tables.length} tables`);
        
        let addedCount = 0;
        tables.forEach((table, index) => {
            // Skip tables already wrapped
            if (table.closest('.table-wrapper')) return;
            
            // Refined check: Only skip tables that are clearly nested inside another DATA table cell
            // We want to allow tables that might be wrapped in layout-only tables or other containers.
            const parentCell = table.parentElement.closest('td, th');
            if (parentCell) {
                // If it's in a cell, check if that parent table is a real data table or just layout
                const parentTable = parentCell.closest('table');
                if (parentTable && parentTable.querySelectorAll('tr').length > 2) {
                    // It's likely nested inside a data table, skip it
                    return;
                }
            }

            try {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);

                const btn = document.createElement('button');
                btn.className = 'btn-extract-table';
                btn.innerHTML = '<span>&#128229;</span> Extract';
                btn.title = 'Open in Excel-style viewer';
                btn.onclick = () => openTableExtractor(table);
                wrapper.appendChild(btn);
                addedCount++;
            } catch (err) {
                console.error("Error wrapping table:", err);
            }
        });
        console.log(`Table Extractor: Added ${addedCount} extract buttons`);
    }
    window.initTableExtractor = initTableExtractor;

    function openTableExtractor(originalTable) {
        const modal = document.getElementById('table-extract-modal');
        const container = document.getElementById('table-extract-container');
        const titleEl = document.getElementById('table-extract-title');
        if (!modal || !container) return;

        let tableTitle = "Table Data";
        let prev = originalTable.previousElementSibling;
        for (let i = 0; i < 3; i++) {
            if (!prev) break;
            if (['H1', 'H2', 'H3', 'H4', 'P'].includes(prev.tagName) && prev.textContent.trim().length > 2) {
                tableTitle = prev.textContent.trim();
                break;
            }
            prev = prev.previousElementSibling;
        }
        if (titleEl) titleEl.textContent = tableTitle;

        const clone = originalTable.cloneNode(true);
        clone.querySelectorAll('.btn-extract-table').forEach(b => b.remove());
        clone.className = 'excel-style-table';
        clone.removeAttribute('style');
        clone.querySelectorAll('*').forEach(el => {
            el.removeAttribute('width');
            el.removeAttribute('height');
        });

        container.innerHTML = '';
        container.appendChild(clone);
        modal.style.display = 'block';
        clone.setAttribute('tabindex', '0');
        clone.focus();
        initCellSelection(clone);
    }

    function initCellSelection(table) {
        let isDragging = false;
        let startCell = null;
        const copySelectionBtn = document.getElementById('copy-selection-btn');

        function getCellCoords(cell) {
            return {
                row: cell.parentElement.rowIndex,
                col: cell.cellIndex
            };
        }

        const getSelectedTSV = () => {
            const selected = table.querySelectorAll('.selected-cell');
            if (selected.length === 0) return null;
            const rows = {};
            selected.forEach(cell => {
                const r = cell.parentElement.rowIndex;
                if (!rows[r]) rows[r] = [];
                let text = cell.innerText.trim();
                if (text.includes('\n') || text.includes('\t') || text.includes('"')) {
                    text = '"' + text.replace(/"/g, '""') + '"';
                }
                rows[r].push(text);
            });
            return Object.keys(rows).sort((a,b) => a-b).map(r => rows[r].join('\t')).join('\n');
        };

        const performCopy = () => {
            const tsv = getSelectedTSV();
            if (tsv) {
                // Try modern clipboard API first
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(tsv).then(() => {
                        showCopySuccess();
                    }).catch((err) => {
                        console.error('Clipboard API failed:', err);
                        fallbackCopyTextToClipboard(tsv);
                    });
                } else {
                    // Use fallback method for non-HTTPS or older browsers
                    fallbackCopyTextToClipboard(tsv);
                }
            }
        };

        const fallbackCopyTextToClipboard = (text) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            // Make it invisible and position off-screen
            textArea.style.position = "fixed";
            textArea.style.top = "-9999px";
            textArea.style.left = "-9999px";
            textArea.style.opacity = "0";
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showCopySuccess();
                } else {
                    console.error('Fallback copy failed');
                    showCopyError();
                }
            } catch (err) {
                console.error('Fallback: Unable to copy', err);
                showCopyError();
            }
            
            document.body.removeChild(textArea);
        };

        const showCopySuccess = () => {
            if (copySelectionBtn) {
                const originalText = '<span>&#128203;</span> Copy Selection';
                copySelectionBtn.innerHTML = '<span>&#9989;</span> Copied!';
                setTimeout(() => { 
                    copySelectionBtn.innerHTML = originalText; 
                }, 2000);
            }
        };

        const showCopyError = () => {
            if (copySelectionBtn) {
                const originalText = '<span>&#128203;</span> Copy Selection';
                copySelectionBtn.innerHTML = '<span>&#10060;</span> Copy Failed';
                copySelectionBtn.style.backgroundColor = '#dc3545';
                setTimeout(() => { 
                    copySelectionBtn.innerHTML = originalText;
                    copySelectionBtn.style.backgroundColor = '';
                }, 2000);
            }
        };

        table.addEventListener('copy', (e) => {
            const tsv = getSelectedTSV();
            if (tsv) {
                e.clipboardData.setData('text/plain', tsv);
                e.preventDefault();
                performCopy(); // Trigger visual feedback
            }
        });

        table.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') performCopy();
        });

        table.addEventListener('mousedown', (e) => {
            const cell = e.target.closest('td, th');
            if (cell) {
                isDragging = true;
                startCell = cell;
                table.querySelectorAll('.selected-cell').forEach(c => c.classList.remove('selected-cell'));
                cell.classList.add('selected-cell');
                if (copySelectionBtn) copySelectionBtn.style.display = 'inline-flex';
                e.preventDefault();
            }
        });

        table.addEventListener('mouseover', (e) => {
            if (isDragging) {
                const cell = e.target.closest('td, th');
                if (cell) {
                    const start = getCellCoords(startCell);
                    const end = getCellCoords(cell);
                    const minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row);
                    const minCol = Math.min(start.col, end.col), maxCol = Math.max(start.col, end.col);
                    table.querySelectorAll('td, th').forEach(c => {
                        const coords = getCellCoords(c);
                        if (coords.row >= minRow && coords.row <= maxRow && coords.col >= minCol && coords.col <= maxCol) c.classList.add('selected-cell');
                        else c.classList.remove('selected-cell');
                    });
                }
            }
        });

        window.addEventListener('mouseup', () => { isDragging = false; });

        if (copySelectionBtn) {
            copySelectionBtn.onclick = performCopy;
        }

        // Global Keydown for Ctrl+C when Modal is open
        const extractModal = document.getElementById('table-extract-modal');
        document.addEventListener('keydown', (e) => {
            if (extractModal && extractModal.style.display === 'block') {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                    const hasSelection = table.querySelector('.selected-cell');
                    if (hasSelection) {
                        e.preventDefault();
                        performCopy();
                    }
                }
            }
        });
    }

    // Modal Close
    const closeExtractBtn = document.getElementById('close-table-extract');
    if (closeExtractBtn) {
        closeExtractBtn.onclick = () => document.getElementById('table-extract-modal').style.display = 'none';
    }

        // --- User Notes Modal Logic ---

        const notesBtn = document.getElementById('user-notes-btn');

        const notesModal = document.getElementById('user-notes-modal');

        const closeNotesBtn = document.getElementById('close-user-notes');

    

        if (notesBtn && notesModal) {

            notesBtn.addEventListener('click', () => {

                notesModal.style.display = 'block';

                loadUserNotesSummary();

            });

    

            if (closeNotesBtn) {

                closeNotesBtn.addEventListener('click', () => {

                    notesModal.style.display = 'none';

                });

            }

        }

    

        function loadUserNotesSummary() {

            const container = document.getElementById('notes-list-container');

            if (!container) return;

    

            container.innerHTML = '';

            const notes = [];

    

            // 1. Gather AI Q&A Notes (from badges)

            const qaBadges = document.querySelectorAll('.chat-annotation-badge');

            qaBadges.forEach(badge => {

                const qEl = badge.querySelector('.popover-q');

                if (qEl) {

                    // Filter out FAERS-related notes (by checking question text or tags if available)

                    const question = qEl.textContent.replace(/^Q:\s*/, '');

                    if (question.toLowerCase().includes('faers') || question.toLowerCase().includes('reports')) return;

    

                                        notes.push({

    

                                            type: 'QA',

    

                                            text: question,

    

                                            element: badge,

    

                                            section: badge.closest('.Section')?.getAttribute('data-section-number') || 'TOP'

    

                                        });

    

                                    }

    

                                });

    

                        

    

                                // 2. Gather Highlights & Comments

    

                                const textAnns = document.querySelectorAll('.text-highlight, .text-comment');

    

                                textAnns.forEach(ann => {

    

                                    const isComment = ann.classList.contains('text-comment');

    

                                    // Basic check to avoid duplicating if we have both highlight and comment on same span

    

                                    // Or just treat them as separate items. Let's use the text content.

    

                                    

    

                                    notes.push({

    

                                        type: isComment ? 'Comment' : 'Highlight',

    

                                        text: ann.textContent.trim(),

    

                                        element: ann,

    

                                        section: ann.closest('.Section')?.getAttribute('data-section-number') || 'Label'

    

                                    });

    

                                });

    

            if (notes.length === 0) {

                container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 20px;">No personal notes or annotations found in this label.</p>';

                return;

            }

    

            // Render List

            notes.forEach(note => {

                const item = document.createElement('div');

                item.className = 'note-summary-item';

                

                const tagClass = note.type === 'QA' ? 'tag-qa' : (note.type === 'Comment' ? 'tag-comment' : 'tag-highlight');

                // Get ID
                const noteId = note.type === 'QA' ? 
                    note.element.getAttribute('data-id') : 
                    note.element.getAttribute('data-ann-id');

                const deleteBtnHtml = noteId ? `<button class="note-delete-btn" title="Delete Note">🗑️</button>` : '';

                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                        <div style="flex:1;">
                            <div class="note-type-tag ${tagClass}">${note.type}</div>
                            <div class="note-summary-text">${note.text.substring(0, 150)}${note.text.length > 150 ? '...' : ''}</div>
                            <div class="note-summary-meta">Location: Section ${note.section}</div>
                        </div>
                        ${deleteBtnHtml}
                    </div>
                `;

    

                // Main Click: Go to note
                item.onclick = (e) => {
                    if (e.target.closest('.note-delete-btn')) return;

                    notesModal.style.display = 'none';

                    note.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // If it's a badge, we can also trigger the click to open it

                    if (note.type === 'QA') {

                        note.element.click();

                    } else {

                        // Flash the element to draw attention

                        const originalBg = note.element.style.backgroundColor;

                        note.element.style.backgroundColor = '#fd7e14';

                        note.element.style.color = 'white';

                        setTimeout(() => { 

                            note.element.style.backgroundColor = originalBg;

                            note.element.style.color = '';

                        }, 1000);

                    }

                };

                // Delete Click
                const delBtn = item.querySelector('.note-delete-btn');
                if (delBtn) {
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (!confirm("Are you sure you want to delete this note?")) return;

                        if (note.type === 'QA') {
                            // Delete QA Note
                            fetch("/api/dashboard/delete_annotation", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ set_id: currentSetId, id: noteId }),
                            })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) {
                                    note.element.remove();
                                    item.remove();
                                    if (container.children.length === 0) {
                                        container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 20px;">No personal notes or annotations found in this label.</p>';
                                    }
                                } else {
                                    alert("Error deleting note.");
                                }
                            });
                        } else {
                            // Delete Highlight/Comment
                            fetch('/api/dashboard/annotations/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: noteId })
                            })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) {
                                    // Unwrap text
                                    const domElement = note.element;
                                    const parent = domElement.parentNode;
                                    while(domElement.firstChild) parent.insertBefore(domElement.firstChild, domElement);
                                    parent.removeChild(domElement);
                                    parent.normalize();
                                    
                                    item.remove();
                                    if (container.children.length === 0) {
                                        container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 20px;">No personal notes or annotations found in this label.</p>';
                                    }
                                } else {
                                    alert("Error deleting annotation.");
                                }
                            });
                        }
                    };
                }

    

                container.appendChild(item);

            });

        }

    

        // Global listener for closing modals on outside click

        window.addEventListener('click', (event) => {

            const statsModal = document.getElementById('meddra-stats-modal');

            const aiModal = document.getElementById('ai-prefs-modal');

            const extractModal = document.getElementById('table-extract-modal');

            const notesModal = document.getElementById('user-notes-modal');

            

            if (event.target === statsModal) statsModal.style.display = 'none';

            if (event.target === aiModal) aiModal.style.display = 'none';

            if (event.target === extractModal) extractModal.style.display = 'none';

            if (event.target === notesModal) notesModal.style.display = 'none';

        });

    setTimeout(initTableExtractor, 500);
    setTimeout(initTableExtractor, 1500);
    setTimeout(initTableExtractor, 3000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initUI());
} else {
    window.initUI();
}
