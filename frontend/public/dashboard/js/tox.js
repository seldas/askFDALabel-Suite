window.initToxAgents = function() {
    // --- Tox Agents Navigation ---
    const toxIndex = document.getElementById('tox-index');
    const diliModule = document.getElementById('dili-module');
    const dictModule = document.getElementById('dict-module');
    const diriModule = document.getElementById('diri-module');
    const pgxModule = document.getElementById('pgx-module');

    const btnAgentDili = document.getElementById('btn-agent-dili');
    const btnAgentDict = document.getElementById('btn-agent-dict');
    const btnAgentDiri = document.getElementById('btn-agent-diri');
    const btnAgentPgx = document.getElementById('btn-agent-pgx');
    
    const backBtns = document.querySelectorAll('.btn-back-to-tox');

    // Data Load Status
    let diliDataLoaded = false;
    let dictDataLoaded = false;
    let diriDataLoaded = false;
    let pgxDataLoaded = false;
    
    // Global Counters (for risk panel calculation logic)
    let currentDiliFaersCount = 0;
    let currentDictFaersCount = 0;
    let currentDiriFaersCount = 0;

    window.activateAgent = activateAgent;
    window.loadPgxData = loadPgxData;

    // --- Add badges to buttons if pre-computed data exists ---
    function updateToxBadges() {
        if (typeof toxSummary === 'undefined') return;
        
        const summaryMap = {
            'dili': { btn: btnAgentDili, exists: toxSummary.dili },
            'dict': { btn: btnAgentDict, exists: toxSummary.dict },
            'diri': { btn: btnAgentDiri, exists: toxSummary.diri }
        };

        Object.keys(summaryMap).forEach(key => {
            const { btn, exists } = summaryMap[key];
            if (btn && exists) {
                // Check if badge already exists
                if (!btn.querySelector('.tox-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'tox-badge';
                    badge.innerHTML = '&#x2713;'; // Checkmark
                    badge.style.cssText = 'position: absolute; top: 5px; right: 5px; background: #28a745; color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; display: flex; align-items: center; justify-content: center;';
                    btn.style.position = 'relative';
                    btn.appendChild(badge);
                }
            }
        });
    }

    // Call updateBadges
    updateToxBadges();

    // --- Helper to switch active agent ---
    function activateAgent(agentName) {
        // Reset all buttons
        [btnAgentDili, btnAgentDict, btnAgentDiri, btnAgentPgx].forEach(btn => {
            if (btn) btn.classList.remove('active-agent');
        });
        
        // Hide all modules
        [diliModule, dictModule, diriModule, pgxModule].forEach(mod => {
            if (mod) mod.style.display = 'none';
        });

        // Activate selected
        const btnMap = {
            'dili': btnAgentDili,
            'dict': btnAgentDict,
            'diri': btnAgentDiri,
            'pgx': btnAgentPgx
        };
        
        const modMap = {
            'dili': diliModule,
            'dict': dictModule,
            'diri': diriModule,
            'pgx': pgxModule
        };

        if (btnMap[agentName]) btnMap[agentName].classList.add('active-agent');
        if (modMap[agentName]) modMap[agentName].style.display = 'block';
        
        // Keep index visible (flow over)
        if (toxIndex) toxIndex.style.display = 'block';
    }

    if (btnAgentDili) {
        btnAgentDili.addEventListener('click', () => {
            activateAgent('dili');
            if (!diliDataLoaded) loadDiliData();
        });
    }

    if (btnAgentDict) {
        btnAgentDict.addEventListener('click', () => {
            activateAgent('dict');
            if (!dictDataLoaded) loadDictData();
        });
    }

    if (btnAgentDiri) {
        btnAgentDiri.addEventListener('click', () => {
            activateAgent('diri');
            if (!diriDataLoaded) loadDiriData();
        });
    }

    if (btnAgentPgx) {
        btnAgentPgx.addEventListener('click', () => {
            activateAgent('pgx');
            if (!pgxDataLoaded) loadPgxData();
        });
    }

    // Hide Back Buttons (Redundant now that nav is persistent)
    backBtns.forEach(btn => {
        btn.style.display = 'none'; 
    });

    // --- DILI Agent Logic ---
    async function loadDiliData() {
        if (typeof currentSetId === 'undefined') return;

        const loadingEl = document.getElementById('dili-loading');
        const contentEl = document.getElementById('dili-content');
        const errorEl = document.getElementById('dili-error');
        const signalsContainer = document.getElementById('dili-label-signals');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        try {
            // Fetch FAERS Data ONLY
            const response = await fetch(`/api/dashboard/dili/faers/${currentSetId}`);
            const data = await response.json();
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'grid';
            
            // Show Risk Panel
            const riskPanel = document.getElementById('dili-risk-panel');
            if (riskPanel) riskPanel.style.display = 'block';
            
            // Calculate Total FAERS DILI Reports
            currentDiliFaersCount = 0;
            if (data.faers_data && Array.isArray(data.faers_data)) {
                currentDiliFaersCount = data.faers_data.reduce((sum, item) => sum + (item.count || 0), 0);
            }
            
            renderDiliChart(data.faers_data);
            
            // Handle Existing Assessment or Setup Run Button
            if (signalsContainer) {
                if (data.existing_assessment) {
                    // Render existing report
                    renderDiliSignals(data.existing_assessment);
                    
                    // Add Re-assess Button and Timestamp
                    const controlsDiv = document.createElement('div');
                    controlsDiv.style.marginTop = '20px';
                    controlsDiv.style.textAlign = 'right';
                    controlsDiv.style.borderTop = '1px solid #eee';
                    controlsDiv.style.paddingTop = '10px';
                    
                    let timeDisplay = '';
                    if (data.assessment_timestamp) {
                        const date = new Date(data.assessment_timestamp);
                        timeDisplay = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>`;
                    }

                    controlsDiv.innerHTML = `
                        ${timeDisplay}
                        <button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                            &#x21bb; Re-assess
                        </button>
                    `;
                    signalsContainer.appendChild(controlsDiv);
                    
                    document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);
                } else {
                    // No assessment yet, show big run button
                    signalsContainer.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <p style="color: #666; margin-bottom: 15px;">
                                Click below to analyze the official label for DILI-related safety signals using state-of-the-art AI.
                            </p>
                            <button id="btn-run-dili-assessment" class="button" style="background-color: #17a2b8; color: white;">
                                Run Assessment
                            </button>
                        </div>
                    `;
                    document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);
                }
            }
            
            diliDataLoaded = true;
        } catch (error) {
            console.error('Error fetching DILI data:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'block';
        }
    }

    async function runDiliAssessment() {
        const signalsContainer = document.getElementById('dili-label-signals');
        if (!signalsContainer) return;

        // Reset Risk Panel to Under Assessment
        if (typeof updateDiliRiskPanel === 'function') {
            updateDiliRiskPanel(null);
        }

        // Show Loading State
        signalsContainer.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div class="loader" style="margin: 0 auto 15px auto;"></div>
                <p>Consulting AI Agent to analyze label sections...</p>
            </div>
        `;

        try {
            const response = await fetch(`/api/dashboard/dili/assess/${currentSetId}`);
            
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Oops, we haven't got JSON!");
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            renderDiliSignals(data.assessment_report);

            // Restore Re-assess Button
            const controlsDiv = document.createElement('div');
            controlsDiv.style.marginTop = '20px';
            controlsDiv.style.textAlign = 'right';
            controlsDiv.style.borderTop = '1px solid #eee';
            controlsDiv.style.paddingTop = '10px';
            
            const now = new Date();
            const timeDisplay = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</span>`;

            controlsDiv.innerHTML = `
                ${timeDisplay}
                <button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                    &#x21bb; Re-assess
                </button>
            `;
            signalsContainer.appendChild(controlsDiv);
            document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);

        } catch (error) {
            console.error('Error running DILI assessment, attempting lazy recovery...', error);
            
            // Wait 3 seconds and check if it actually finished in the background
            setTimeout(async () => {
                try {
                    const checkResp = await fetch(`/api/dashboard/dili/faers/${currentSetId}`);
                    const checkData = await checkResp.json();
                    if (checkData.existing_assessment) {
                        renderDiliSignals(checkData.existing_assessment);
                        
                        const controlsDiv = document.createElement('div');
                        controlsDiv.style.marginTop = '20px';
                        controlsDiv.style.textAlign = 'right';
                        controlsDiv.style.borderTop = '1px solid #eee';
                        controlsDiv.style.paddingTop = '10px';
                        controlsDiv.innerHTML = `
                            <span style="color: #28a745; font-size: 0.85em; margin-right: 15px;">✓ Recovered from background</span>
                            <button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                                &#x21bb; Re-assess
                            </button>
                        `;
                        signalsContainer.appendChild(controlsDiv);
                        document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);
                        return;
                    }
                } catch (e) { console.error("Recovery check failed", e); }

                // If still no assessment, show error UI
                signalsContainer.innerHTML = `
                    <div style="padding: 15px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                        Failed to complete the assessment. Please try again.
                    </div>
                    <div style="text-align: center; margin-top: 15px;">
                         <button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white;">Try Again</button>
                    </div>
                `;
                const retryBtn = document.getElementById('btn-run-dili-assessment');
                if(retryBtn) retryBtn.addEventListener('click', runDiliAssessment);
            }, 3000);
        }
    }

    function updateDiliRiskPanel(reportMarkdown) {
        const panel = document.getElementById('dili-risk-panel');
        if (!panel) return;

        panel.style.display = 'block';
        panel.className = ''; // Reset classes

        if (!reportMarkdown) {
            panel.classList.add('dili-risk-pending');
            panel.innerHTML = `<h4>Under Assessment</h4><p>No DILI assessment has been generated yet.</p>`;
            return;
        }

        // Helper to extract max score from a text block
        const getMaxScore = (text) => {
            const matches = text.match(/badge-score-(\d+)|Score:\s*(\d+)|\[Score:\s*(\d+)\]/g);
            if (!matches) return 0;
            let max = 0;
            matches.forEach(m => {
                const digits = m.match(/\d+/);
                if (digits) {
                    const s = parseInt(digits[0], 10);
                    if (s > max) max = s;
                }
            });
            return max;
        };

        // Split by sections (looking for <h3> headers)
        const sections = reportMarkdown.split(/<h3>/i);
        
        let boxedScore = 0;
        let warningsScore = 0;
        let otherScore = 0;
        
        sections.forEach(sec => {
            if (!sec.includes('</h3>')) return; 
            
            const titlePart = sec.split('</h3>')[0].toLowerCase();
            const contentPart = sec.split('</h3>')[1] || '';
            const score = getMaxScore(contentPart);
            
            if (titlePart.includes('boxed warning')) {
                boxedScore = Math.max(boxedScore, score);
            } else if (titlePart.includes('warnings') && titlePart.includes('precautions')) {
                warningsScore = Math.max(warningsScore, score);
            } else {
                otherScore = Math.max(otherScore, score);
            }
        });

        let riskLevel = 'No DILI Concern';
        let riskClass = 'dili-risk-no';
        let riskDesc = 'No significant liver toxicity signals identified.';

        if (boxedScore > 0) {
            riskLevel = 'Most DILI Concern';
            riskClass = 'dili-risk-most';
            riskDesc = 'Evidence found in Boxed Warning.';
        } else if (warningsScore >= 3) {
            riskLevel = 'Most DILI Concern';
            riskClass = 'dili-risk-most';
            riskDesc = 'Significant evidence found in Warnings and Precautions.';
        } else if (warningsScore > 0 || otherScore > 0) {
            riskLevel = 'Less DILI Concern';
            riskClass = 'dili-risk-less';
            riskDesc = 'Evidence found in related sections.';
        }
        
        if (reportMarkdown.includes("(No Section)")) {
             riskLevel = 'No DILI Concern';
             riskClass = 'dili-risk-no';
             riskDesc = 'No relevant sections found in label.';
        }

        // Append FAERS Suffix
        if (typeof currentDiliFaersCount !== 'undefined') {
            if (currentDiliFaersCount > 100) {
                riskLevel += ' ++';
            } else if (currentDiliFaersCount > 0) {
                riskLevel += ' +';
            }
        }

        panel.classList.add(riskClass);
        panel.innerHTML = `<h4>${riskLevel}</h4><p>${riskDesc}</p>`;
    }

    function renderDiliSignals(reportMarkdown) {
        const container = document.getElementById('dili-label-signals');
        if (!container) return;
        
        updateDiliRiskPanel(reportMarkdown);

        if (!reportMarkdown) {
            container.innerHTML = ''; 
            return;
        }

        if (reportMarkdown.includes("(No Section)")) {
            container.innerHTML = `<p>${reportMarkdown || 'No specific liver toxicity signals found in the analyzed sections.'}</p>`;
            return;
        }

        // Post-process the markdown string to apply special DILI styles
        let processedMarkdown = reportMarkdown;

        // 1. Wrap evidence sentences: [Sentence] -> <span class="dili-evidence">Sentence</span>
        processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\](?!\s*\()/g, '<span class="dili-evidence">$1</span>');

        // 2. Wrap scores and keywords: ([Score: X] keyword) -> <span class="badge-score badge-score-X">Score X: keyword</span>
        processedMarkdown = processedMarkdown.replace(/\(\[Score:\s*(\d+)\]\s*([^\)]+)\)/g, (match, score, keyword) => {
            return `<span class="badge-score badge-score-${score}">Score ${score}: ${keyword}</span>`;
        });
        
        // 3. Handle cases where evidence is right before the score: [Sentence] ([Score: X] keyword)
        processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\]\s*<span class="badge-score/g, '<span class="dili-evidence">"$1"</span><span class="badge-score');
        
        // 4. Fallback for keywords that might be formatted slightly differently by the model
        processedMarkdown = processedMarkdown.replace(/\[Score:\s*(\d+)\]/g, (match, score) => {
             return `<span class="badge-score badge-score-${score}">Score ${score}</span>`;
        });
        
        // 5. Ensure any remaining [Evidence] is wrapped correctly as a citation with quotes
        processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\]/g, '<span class="dili-evidence">"$1"</span>');

        // Use 'marked' library to parse Markdown
        let htmlContent = processedMarkdown;
        if (typeof marked !== 'undefined' && marked.parse) {
            htmlContent = marked.parse(processedMarkdown);
        } else {
            htmlContent = processedMarkdown.replace(/\n/g, '<br>');
        }

        container.innerHTML = `
            <div class="dili-results markdown-body" style="padding: 10px; background: #fff; border-radius: 8px;">
                ${htmlContent}
            </div>
        `;
    }

    function renderDiliChart(faersData) {
        const canvas = document.getElementById('diliFaersChart');
        if (!canvas) return;
        
        if (typeof Chart === 'undefined') {
            const container = canvas.parentElement;
            if(container) container.innerHTML = '<p style="color: red; padding: 20px;">Chart.js library not loaded.</p>';
            return;
        }
        
        if (!faersData || faersData.length === 0) {
             const container = canvas.parentElement;
             if(container) container.innerHTML = '<p style="text-align:center; padding-top: 50px;">No liver-related adverse events found in the top reports.</p>';
             return;
        }

        const ctx = canvas.getContext('2d');
        const terms = faersData.map(d => d.term);
        const counts = faersData.map(d => d.count);

        if (typeof Chart !== 'undefined') {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: terms,
                datasets: [{
                    label: 'Liver-Related Reports (FAERS)',
                    data: counts,
                    backgroundColor: 'rgba(23, 162, 184, 0.6)',
                    borderColor: 'rgba(23, 162, 184, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Top Reported Liver Events'
                    }
                }
            }
        });
    }

    // --- DICT Agent Logic ---
    async function loadDictData() {
        if (typeof currentSetId === 'undefined') return;

        const loadingEl = document.getElementById('dict-loading');
        const contentEl = document.getElementById('dict-content');
        const errorEl = document.getElementById('dict-error');
        const signalsContainer = document.getElementById('dict-label-signals');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        try {
            const response = await fetch(`/api/dashboard/dict/faers/${currentSetId}`);
            const data = await response.json();
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'grid';
            
            const riskPanel = document.getElementById('dict-risk-panel');
            if (riskPanel) riskPanel.style.display = 'block';
            
            currentDictFaersCount = 0;
            if (data.faers_data && Array.isArray(data.faers_data)) {
                currentDictFaersCount = data.faers_data.reduce((sum, item) => sum + (item.count || 0), 0);
            }
            
            renderDictChart(data.faers_data);
            
            if (signalsContainer) {
                if (data.existing_assessment) {
                    renderDictSignals(data.existing_assessment);
                    
                    const controlsDiv = document.createElement('div');
                    controlsDiv.style.marginTop = '20px';
                    controlsDiv.style.textAlign = 'right';
                    controlsDiv.style.borderTop = '1px solid #eee';
                    controlsDiv.style.paddingTop = '10px';
                    
                    let timeDisplay = '';
                    if (data.assessment_timestamp) {
                        const date = new Date(data.assessment_timestamp);
                        timeDisplay = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>`;
                    }

                    controlsDiv.innerHTML = `
                        ${timeDisplay}
                        <button id="btn-run-dict-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                            &#x21bb; Re-assess
                        </button>
                    `;
                    signalsContainer.appendChild(controlsDiv);
                    
                    document.getElementById('btn-run-dict-assessment').addEventListener('click', runDictAssessment);
                } else {
                    signalsContainer.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <p style="color: #666; margin-bottom: 15px;">
                                Click below to analyze the official label for cardiotoxicity signals using state-of-the-art AI.
                            </p>
                            <button id="btn-run-dict-assessment" class="button" style="background-color: #dc3545; color: white;">
                                Run Assessment
                            </button>
                        </div>
                    `;
                    document.getElementById('btn-run-dict-assessment').addEventListener('click', runDictAssessment);
                }
            }
            
            dictDataLoaded = true;
        } catch (error) {
            console.error('Error fetching DICT data:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'block';
        }
    }

    async function runDictAssessment() {
        const signalsContainer = document.getElementById('dict-label-signals');
        if (!signalsContainer) return;

        if (typeof updateDictRiskPanel === 'function') {
            updateDictRiskPanel(null);
        }

        signalsContainer.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div class="loader" style="margin: 0 auto 15px auto; border-top-color: #dc3545;"></div>
                <p>Consulting state-of-the-art AI to analyze label sections...</p>
            </div>
        `;

        try {
            const response = await fetch(`/api/dashboard/dict/assess/${currentSetId}`);
            
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Oops, we haven't got JSON!");
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            renderDictSignals(data.assessment_report);

            const controlsDiv = document.createElement('div');
            controlsDiv.style.marginTop = '20px';
            controlsDiv.style.textAlign = 'right';
            controlsDiv.style.borderTop = '1px solid #eee';
            controlsDiv.style.paddingTop = '10px';
            
            const now = new Date();
            const timeDisplay = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</span>`;

            controlsDiv.innerHTML = `
                ${timeDisplay}
                <button id="btn-run-dict-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                    &#x21bb; Re-assess
                </button>
            `;
            signalsContainer.appendChild(controlsDiv);
            document.getElementById('btn-run-dict-assessment').addEventListener('click', runDictAssessment);

        } catch (error) {
            console.error('Error running DICT assessment, attempting lazy recovery...', error);
            
            setTimeout(async () => {
                try {
                    const checkResp = await fetch(`/api/dashboard/dict/faers/${currentSetId}`);
                    const checkData = await checkResp.json();
                    if (checkData.existing_assessment) {
                        renderDictSignals(checkData.existing_assessment);
                        
                        const controlsDiv = document.createElement('div');
                        controlsDiv.style.marginTop = '20px';
                        controlsDiv.style.textAlign = 'right';
                        controlsDiv.style.borderTop = '1px solid #eee';
                        controlsDiv.style.paddingTop = '10px';
                        controlsDiv.innerHTML = `
                            <span style="color: #28a745; font-size: 0.85em; margin-right: 15px;">✓ Recovered from background</span>
                            <button id="btn-run-dict-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                                &#x21bb; Re-assess
                            </button>
                        `;
                        signalsContainer.appendChild(controlsDiv);
                        document.getElementById('btn-run-dict-assessment').addEventListener('click', runDictAssessment);
                        return;
                    }
                } catch (e) { console.error("Recovery check failed", e); }

                signalsContainer.innerHTML = `
                    <div style="padding: 15px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                        Failed to complete the assessment. Please try again.
                    </div>
                    <div style="text-align: center; margin-top: 15px;">
                         <button id="btn-run-dict-assessment" class="button" style="background-color: #6c757d; color: white;">Try Again</button>
                    </div>
                `;
                const retryBtn = document.getElementById('btn-run-dict-assessment');
                if(retryBtn) retryBtn.addEventListener('click', runDictAssessment);
            }, 3000);
        }
    }

    function updateDictRiskPanel(reportMarkdown) {
        const panel = document.getElementById('dict-risk-panel');
        if (!panel) return;

        panel.style.display = 'block';
        panel.className = ''; 

        if (!reportMarkdown) {
            panel.classList.add('dict-risk-pending');
            panel.innerHTML = `<h4>Under Assessment</h4><p>No DICT assessment has been generated yet.</p>`;
            return;
        }

        // DICT Logic: Severe, Moderate, Mild
        const lowerReport = reportMarkdown.toLowerCase();
        
        let riskLevel = 'No Cardiotoxicity Concern';
        let riskClass = 'dict-risk-no';
        let riskDesc = 'No significant cardiac signals identified.';

        if (lowerReport.includes('level: severe') || lowerReport.includes('badge-score-severe')) {
            riskLevel = 'High Concern (Severe)';
            riskClass = 'dict-risk-most';
            riskDesc = 'Severe cardiac events or failure risks identified.';
        } else if (lowerReport.includes('level: moderate') || lowerReport.includes('badge-score-moderate')) {
            riskLevel = 'Moderate Concern';
            riskClass = 'dict-risk-less';
            riskDesc = 'Moderate cardiac risks (e.g. arrhythmias, structural changes) identified.';
        } else if (lowerReport.includes('level: mild') || lowerReport.includes('badge-score-mild')) {
            riskLevel = 'Low Concern (Mild)';
            riskClass = 'dict-risk-less'; // Reusing "less" style
            riskDesc = 'Mild cardiac symptoms or marker changes identified.';
        }
        
        if (reportMarkdown.includes("(No Section)")) {
             riskLevel = 'No Cardiotoxicity Concern';
             riskClass = 'dict-risk-no';
             riskDesc = 'No relevant sections found in label.';
        }

        if (typeof currentDictFaersCount !== 'undefined') {
            if (currentDictFaersCount > 100) {
                riskLevel += ' ++';
            } else if (currentDictFaersCount > 0) {
                riskLevel += ' +';
            }
        }

        panel.classList.add(riskClass);
        panel.innerHTML = `<h4>${riskLevel}</h4><p>${riskDesc}</p>`;
    }

    function renderDictSignals(reportMarkdown) {
        const container = document.getElementById('dict-label-signals');
        if (!container) return;
        
        updateDictRiskPanel(reportMarkdown);

        if (!reportMarkdown) {
            container.innerHTML = ''; 
            return;
        }

        if (reportMarkdown.includes("(No Section)")) {
            container.innerHTML = `<p>${reportMarkdown || 'No specific cardiac signals found in the analyzed sections.'}</p>`;
            return;
        }

        let processedMarkdown = reportMarkdown;
        // Fallback formatting if model returns text [Score] style
        processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\](?!\s*\()/g, '<span class="dict-evidence">$1</span>');
        
        // Use 'marked' library to parse Markdown
        let htmlContent = processedMarkdown;
        if (typeof marked !== 'undefined' && marked.parse) {
            htmlContent = marked.parse(processedMarkdown);
        } else {
            htmlContent = processedMarkdown.replace(/\n/g, '<br>');
        }

        container.innerHTML = `
            <div class="dict-results markdown-body" style="padding: 10px; background: #fff; border-radius: 8px;">
                ${htmlContent}
            </div>
        `;
    }

    function renderDictChart(faersData) {
        const canvas = document.getElementById('dictFaersChart');
        if (!canvas) return;
        
        if (typeof Chart === 'undefined') {
            const container = canvas.parentElement;
            if(container) container.innerHTML = '<p style="color: red; padding: 20px;">Chart.js library not loaded.</p>';
            return;
        }
        
        if (!faersData || faersData.length === 0) {
             const container = canvas.parentElement;
             if(container) container.innerHTML = '<p style="text-align:center; padding-top: 50px;">No cardiac-related adverse events found in the top reports.</p>';
             return;
        }

        const ctx = canvas.getContext('2d');
        const terms = faersData.map(d => d.term);
        const counts = faersData.map(d => d.count);

        if (typeof Chart !== 'undefined') {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: terms,
                datasets: [{
                    label: 'Cardiac-Related Reports (FAERS)',
                    data: counts,
                    backgroundColor: 'rgba(220, 53, 69, 0.6)', // Red for Heart
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Top Reported Cardiac Events'
                    }
                }
            }
        });
    }

    // --- DIRI Agent Logic ---
    async function loadDiriData() {
        if (typeof currentSetId === 'undefined') return;

        const loadingEl = document.getElementById('diri-loading');
        const contentEl = document.getElementById('diri-content');
        const errorEl = document.getElementById('diri-error');
        const signalsContainer = document.getElementById('diri-label-signals');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        try {
            const response = await fetch(`/api/dashboard/diri/faers/${currentSetId}`);
            const data = await response.json();
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'grid';
            
            const riskPanel = document.getElementById('diri-risk-panel');
            if (riskPanel) riskPanel.style.display = 'block';
            
            currentDiriFaersCount = 0;
            if (data.faers_data && Array.isArray(data.faers_data)) {
                currentDiriFaersCount = data.faers_data.reduce((sum, item) => sum + (item.count || 0), 0);
            }
            
            renderDiriChart(data.faers_data);
            
            if (signalsContainer) {
                if (data.existing_assessment) {
                    renderDiriSignals(data.existing_assessment);
                    
                    const controlsDiv = document.createElement('div');
                    controlsDiv.style.marginTop = '20px';
                    controlsDiv.style.textAlign = 'right';
                    controlsDiv.style.borderTop = '1px solid #eee';
                    controlsDiv.style.paddingTop = '10px';
                    
                    let timeDisplay = '';
                    if (data.assessment_timestamp) {
                        const date = new Date(data.assessment_timestamp);
                        timeDisplay = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>`;
                    }

                    controlsDiv.innerHTML = `
                        ${timeDisplay}
                        <button id="btn-run-diri-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                            &#x21bb; Re-assess
                        </button>
                    `;
                    signalsContainer.appendChild(controlsDiv);
                    
                    document.getElementById('btn-run-diri-assessment').addEventListener('click', runDiriAssessment);
                } else {
                    signalsContainer.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <p style="color: #666; margin-bottom: 15px;">
                                Click below to analyze the official label for renal injury signals using state-of-the-art AI.
                            </p>
                            <button id="btn-run-diri-assessment" class="button" style="background-color: #ffc107; color: black;">
                                Run Assessment
                            </button>
                        </div>
                    `;
                    document.getElementById('btn-run-diri-assessment').addEventListener('click', runDiriAssessment);
                }
            }
            
            diriDataLoaded = true;
        } catch (error) {
            console.error('Error fetching DIRI data:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'block';
        }
    }

    async function runDiriAssessment() {
        const signalsContainer = document.getElementById('diri-label-signals');
        if (!signalsContainer) return;

        if (typeof updateDiriRiskPanel === 'function') {
            updateDiriRiskPanel(null);
        }

        signalsContainer.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div class="loader" style="margin: 0 auto 15px auto; border-top-color: #ffc107;"></div>
                <p>Consulting state-of-the-art AI to analyze label sections...</p>
            </div>
        `;

        try {
            const response = await fetch(`/api/dashboard/diri/assess/${currentSetId}`);
            
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Oops, we haven't got JSON!");
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            renderDiriSignals(data.assessment_report);

            const controlsDiv = document.createElement('div');
            controlsDiv.style.marginTop = '20px';
            controlsDiv.style.textAlign = 'right';
            controlsDiv.style.borderTop = '1px solid #eee';
            controlsDiv.style.paddingTop = '10px';
            
            const now = new Date();
            const timeDisplay = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</span>`;

            controlsDiv.innerHTML = `
                ${timeDisplay}
                <button id="btn-run-diri-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                    &#x21bb; Re-assess
                </button>
            `;
            signalsContainer.appendChild(controlsDiv);
            document.getElementById('btn-run-diri-assessment').addEventListener('click', runDiriAssessment);

        } catch (error) {
            console.error('Error running DIRI assessment, attempting lazy recovery...', error);
            
            setTimeout(async () => {
                try {
                    const checkResp = await fetch(`/api/dashboard/diri/faers/${currentSetId}`);
                    const checkData = await checkResp.json();
                    if (checkData.existing_assessment) {
                        renderDiriSignals(checkData.existing_assessment);
                        
                        const controlsDiv = document.createElement('div');
                        controlsDiv.style.marginTop = '20px';
                        controlsDiv.style.textAlign = 'right';
                        controlsDiv.style.borderTop = '1px solid #eee';
                        controlsDiv.style.paddingTop = '10px';
                        controlsDiv.innerHTML = `
                            <span style="color: #28a745; font-size: 0.85em; margin-right: 15px;">✓ Recovered from background</span>
                            <button id="btn-run-diri-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                                &#x21bb; Re-assess
                            </button>
                        `;
                        signalsContainer.appendChild(controlsDiv);
                        document.getElementById('btn-run-diri-assessment').addEventListener('click', runDiriAssessment);
                        return;
                    }
                } catch (e) { console.error("Recovery check failed", e); }

                signalsContainer.innerHTML = `
                    <div style="padding: 15px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                        Failed to complete the assessment. Please try again.
                    </div>
                    <div style="text-align: center; margin-top: 15px;">
                         <button id="btn-run-diri-assessment" class="button" style="background-color: #6c757d; color: white;">Try Again</button>
                    </div>
                `;
                const retryBtn = document.getElementById('btn-run-diri-assessment');
                if(retryBtn) retryBtn.addEventListener('click', runDiriAssessment);
            }, 3000);
        }
    }

    function updateDiriRiskPanel(reportMarkdown) {
        const panel = document.getElementById('diri-risk-panel');
        if (!panel) return;

        panel.style.display = 'block';
        panel.className = ''; 

        if (!reportMarkdown) {
            panel.classList.add('diri-risk-pending');
            panel.innerHTML = `<h4>Under Assessment</h4><p>No DIRI assessment has been generated yet.</p>`;
            return;
        }

        // DIRI Logic: Certain, Possible
        const lowerReport = reportMarkdown.toLowerCase();
        
        let riskLevel = 'No Renal Injury Concern';
        let riskClass = 'diri-risk-no';
        let riskDesc = 'No significant renal signals identified.';

        if (lowerReport.includes('level: certain') || lowerReport.includes('badge-score-certain')) {
            riskLevel = 'High Concern (Certain)';
            riskClass = 'diri-risk-most';
            riskDesc = 'Certain evidence of renal injury or failure risks.';
        } else if (lowerReport.includes('level: possible') || lowerReport.includes('badge-score-possible')) {
            riskLevel = 'Possible Concern';
            riskClass = 'diri-risk-less';
            riskDesc = 'Possible risks or marker changes identified.';
        } 
        
        if (reportMarkdown.includes("(No Section)")) {
             riskLevel = 'No Renal Injury Concern';
             riskClass = 'diri-risk-no';
             riskDesc = 'No relevant sections found in label.';
        }

        if (typeof currentDiriFaersCount !== 'undefined') {
            if (currentDiriFaersCount > 100) {
                riskLevel += ' ++';
            } else if (currentDiriFaersCount > 0) {
                riskLevel += ' +';
            }
        }

        panel.classList.add(riskClass);
        panel.innerHTML = `<h4>${riskLevel}</h4><p>${riskDesc}</p>`;
    }

    function renderDiriSignals(reportMarkdown) {
        const container = document.getElementById('diri-label-signals');
        if (!container) return;
        
        updateDiriRiskPanel(reportMarkdown);

        if (!reportMarkdown) {
            container.innerHTML = ''; 
            return;
        }

        if (reportMarkdown.includes("(No Section)")) {
            container.innerHTML = `<p>${reportMarkdown || 'No specific renal signals found in the analyzed sections.'}</p>`;
            return;
        }

        let processedMarkdown = reportMarkdown;
        // Fallback formatting if model returns text [Score] style
        processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\](?!\s*\()/g, '<span class="diri-evidence">$1</span>');
        
        let htmlContent = processedMarkdown;
        if (typeof marked !== 'undefined' && marked.parse) {
            htmlContent = marked.parse(processedMarkdown);
        } else {
            htmlContent = processedMarkdown.replace(/\n/g, '<br>');
        }

        container.innerHTML = `
            <div class="diri-results markdown-body" style="padding: 10px; background: #fff; border-radius: 8px;">
                ${htmlContent}
            </div>
        `;
    }

    function renderDiriChart(faersData) {
        const canvas = document.getElementById('diriFaersChart');
        if (!canvas) return;
        
        if (typeof Chart === 'undefined') {
            const container = canvas.parentElement;
            if(container) container.innerHTML = '<p style="color: red; padding: 20px;">Chart.js library not loaded.</p>';
            return;
        }
        
        if (!faersData || faersData.length === 0) {
             const container = canvas.parentElement;
             if(container) container.innerHTML = '<p style="text-align:center; padding-top: 50px;">No renal-related adverse events found in the top reports.</p>';
             return;
        }

        const ctx = canvas.getContext('2d');
        const terms = faersData.map(d => d.term);
        const counts = faersData.map(d => d.count);

        if (typeof Chart !== 'undefined') {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: terms,
                datasets: [{
                    label: 'Renal-Related Reports (FAERS)',
                    data: counts,
                    backgroundColor: 'rgba(255, 193, 7, 0.6)', // Yellow for Kidney
                    borderColor: 'rgba(255, 193, 7, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Top Reported Renal Events'
                    }
                }
            }
        });
    }

    // --- PGx Agent Logic ---
    async function loadPgxData(forceRefresh = false) {
        if (typeof currentSetId === 'undefined') return;

        const loadingEl = document.getElementById('pgx-loading');
        const contentEl = document.getElementById('pgx-content');
        const errorEl = document.getElementById('pgx-error');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        try {
            const response = await fetch(`/api/dashboard/pgx/assess/${currentSetId}?refresh=${forceRefresh}`);
            
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Oops, we haven't got JSON!");
            }

            const data = await response.json();
            
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (data.error) {
                console.error('PGx Error:', data.error);
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.querySelector('p').textContent = data.error;
                }
                return;
            }

            if (contentEl) contentEl.style.display = 'grid';
            
            renderPgxResults(data.report);
            
            pgxDataLoaded = true;
        } catch (error) {
            console.error('Error fetching PGx data, attempting lazy recovery...', error);
            
            setTimeout(async () => {
                try {
                    const checkResp = await fetch(`/api/dashboard/pgx/assess/${currentSetId}?refresh=false`);
                    const checkData = await checkResp.json();
                    if (checkData.report && !checkData.error) {
                        if (loadingEl) loadingEl.style.display = 'none';
                        if (contentEl) contentEl.style.display = 'grid';
                        renderPgxResults(checkData.report);
                        pgxDataLoaded = true;
                        
                        const container = document.getElementById('pgx-results-container');
                        if (container) {
                            const recoveryMsg = document.createElement('div');
                            recoveryMsg.style.cssText = "color: #28a745; font-size: 0.85em; text-align: right; margin-bottom: 10px;";
                            recoveryMsg.innerHTML = "✓ Recovered from background";
                            container.prepend(recoveryMsg);
                        }
                        return;
                    }
                } catch (e) { console.error("PGx recovery check failed", e); }

                if (loadingEl) loadingEl.style.display = 'none';
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.querySelector('p').textContent = "Failed to complete the assessment. Please try again.";
                }
            }, 3000);
        }
    }

    function renderPgxResults(reportJson) {
        const container = document.getElementById('pgx-results-container');
        if (!container) return;
        
        let data;
        try {
            data = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
        } catch (e) {
            console.error("Failed to parse PGx JSON", e);
            container.innerHTML = `<p>Error parsing PGx report.</p>`;
            return;
        }

        if (!data.biomarkers || data.biomarkers.length === 0) {
            container.innerHTML = `<p>${data.message || 'No verified pharmacogenomic biomarkers found in the label.'}</p>`;
            // Add Refresh Button even if empty
            container.innerHTML += `
                <div style="margin-top: 20px; text-align: right; padding-top: 10px; border-top: 1px solid #eee;">
                    <button id="btn-refresh-pgx" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                        &#x21bb; Re-assess
                    </button>
                </div>`;
            const refreshBtn = document.getElementById('btn-refresh-pgx');
            if (refreshBtn) refreshBtn.addEventListener('click', () => loadPgxData(true));
            return;
        }

        let html = '<div style="display: grid; gap: 20px;">';
        
        data.biomarkers.forEach(bio => {
            const isValid = bio.is_valid !== false; // Default true if missing, or explicit check
            const foundTerm = bio.found_term || bio.name;
            const inTable = bio.in_fda_table;
            const isMissing = !isValid && inTable && !bio.found_term;

            let cardColor;
            let badgesHtml = '';

            if (isValid) {
                cardColor = '#e2e6ea';
                badgesHtml += `<span style="font-size: 0.85em; background: #28a745; color: white; padding: 2px 8px; border-radius: 10px;">Verified</span>`;
                if (inTable) {
                    badgesHtml += ` <span style="font-size: 0.85em; background: #17a2b8; color: white; padding: 2px 8px; border-radius: 10px; margin-left: 5px;">FDA Listed</span>`;
                } else {
                    badgesHtml += ` <span style="font-size: 0.85em; background: #ffc107; color: black; padding: 2px 8px; border-radius: 10px; margin-left: 5px;">Potential New</span>`;
                }
            } else if (isMissing) {
                cardColor = '#fff5f5'; // Light red
                badgesHtml += `<span style="font-size: 0.85em; background: #dc3545; color: white; padding: 2px 8px; border-radius: 10px;">Missing</span>`;
                badgesHtml += ` <span style="font-size: 0.85em; background: #17a2b8; color: white; padding: 2px 8px; border-radius: 10px; margin-left: 5px;">FDA Listed</span>`;
            } else {
                cardColor = '#fff3cd'; // Light yellow
                badgesHtml += `<span style="font-size: 0.85em; background: #6c757d; color: white; padding: 2px 8px; border-radius: 10px;">False Positive</span>`;
            }
            
            html += `
                <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; background-color: ${cardColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="display:flex; align-items: baseline; gap: 10px;">
                            <h4 style="margin: 0; color: #6610f2; font-size: 1.2em;">${bio.name}</h4>
                            ${foundTerm && foundTerm.toLowerCase() !== bio.name.toLowerCase() && !isMissing ? `<small style="color: #666;">(Found: ${foundTerm})</small>` : ''}
                        </div>
                        <div>${badgesHtml}</div>
                    </div>
            `;
            
            if (isValid) {
                html += `
                    <div style="margin-bottom: 10px;">
                        <strong style="color: #495057;">Section:</strong> <span style="color: #6c757d;">${bio.section || 'N/A'}</span>
                    </div>
                    <div style="margin-bottom: 10px; background: white; padding: 10px; border-left: 3px solid #6610f2; font-style: italic;">
                        "${bio.evidence}"
                    </div>
                    ${bio.reason ? `<div><strong style="color: #495057;">Analysis:</strong> ${bio.reason}</div>` : ''}
                `;
            } else if (isMissing) {
                html += `<p style="color: #721c24; font-style: italic;">${bio.reason || 'Listed in FDA Table but not found in this label version.'}</p>`;
            } else {
                html += `<p style="color: #856404; font-style: italic;">Excluded by Agent: ${bio.reason || 'Not relevant.'}</p>`;
            }
            
            html += `</div>`;
        });
        
        html += '</div>';

        // Add Re-assess Button
        html += `
            <div style="margin-top: 20px; text-align: right; padding-top: 10px; border-top: 1px solid #eee;">
                <button id="btn-refresh-pgx" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">
                    &#x21bb; Re-assess
                </button>
            </div>
        `;

        container.innerHTML = html;

        // Attach listener
        const refreshBtn = document.getElementById('btn-refresh-pgx');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadPgxData(true));
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initToxAgents());
} else {
    window.initToxAgents();
}

