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

    updateToxBadges();

    function activateAgent(agentName) {
        [btnAgentDili, btnAgentDict, btnAgentDiri, btnAgentPgx].forEach(btn => {
            if (btn) btn.classList.remove('active-agent');
        });
        
        [diliModule, dictModule, diriModule, pgxModule].forEach(mod => {
            if (mod) mod.style.display = 'none';
        });

        const btnMap = { 'dili': btnAgentDili, 'dict': btnAgentDict, 'diri': btnAgentDiri, 'pgx': btnAgentPgx };
        const modMap = { 'dili': diliModule, 'dict': dictModule, 'diri': diriModule, 'pgx': pgxModule };

        if (btnMap[agentName]) btnMap[agentName].classList.add('active-agent');
        if (modMap[agentName]) modMap[agentName].style.display = 'block';
        if (toxIndex) toxIndex.style.display = 'block';
    }

    if (btnAgentDili) btnAgentDili.addEventListener('click', () => { activateAgent('dili'); if (!diliDataLoaded) loadDiliData(); });
    if (btnAgentDict) btnAgentDict.addEventListener('click', () => { activateAgent('dict'); if (!dictDataLoaded) loadDictData(); });
    if (btnAgentDiri) btnAgentDiri.addEventListener('click', () => { activateAgent('diri'); if (!diriDataLoaded) loadDiriData(); });
    if (btnAgentPgx) btnAgentPgx.addEventListener('click', () => { activateAgent('pgx'); if (!pgxDataLoaded) loadPgxData(); });

    backBtns.forEach(btn => { btn.style.display = 'none'; });

    // --- CORE WORD CLOUD RENDERER ---
    function renderWordCloud(containerId, faersData, faersError, baseColor, emptyMsg) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (faersError) {
            container.innerHTML = `
            <div style="padding: 20px; text-align: center; width: 100%;">
               <p style="color:#c2410c; padding: 15px; background:#fff7ed; border-radius:8px; border:1px solid #fdba74; font-size: 0.9rem; margin: 0;">
                   <strong>FAERS Data Unavailable:</strong> ${faersError}<br>
                   <small style="opacity:0.7">This is a connectivity issue, not a "no results" state.</small>
               </p>
            </div>`;
            return;
        }

        if (!faersData || faersData.length === 0) {
            container.innerHTML = `<p style="text-align:center; padding: 50px; color: #64748b; font-style: italic; width: 100%;">${emptyMsg}</p>`;
            return;
        }

        // Calculate scales
        const counts = faersData.map(d => d.count);
        const maxCount = Math.max(...counts);
        const minCount = Math.min(...counts);
        
        container.innerHTML = '';
        
        // Sort data randomly for cloud effect
        const shuffled = [...faersData].sort(() => Math.random() - 0.5);

        shuffled.forEach(item => {
            const span = document.createElement('span');
            span.innerText = item.term;
            
            // Font size scaling: 0.85rem to 2.5rem
            let size = 0.85;
            if (maxCount > minCount) {
                size = 0.85 + ((item.count - minCount) / (maxCount - minCount)) * 1.65;
            } else if (maxCount > 0) {
                size = 1.5;
            }
            
            // Opacity scaling
            const opacity = 0.4 + ((item.count / maxCount) * 0.6);
            
            span.style.fontSize = `${size}rem`;
            span.style.fontWeight = item.count > (maxCount * 0.5) ? '800' : '500';
            span.style.color = baseColor;
            span.style.opacity = opacity.toString();
            span.style.cursor = 'default';
            span.style.transition = 'all 0.2s';
            span.style.padding = '2px 5px';
            span.title = `${item.count} reports`;
            
            span.onmouseenter = () => {
                span.style.opacity = '1';
                span.style.transform = 'scale(1.1)';
                span.style.textShadow = `0 0 10px ${baseColor}44`;
            };
            span.onmouseleave = () => {
                span.style.opacity = opacity.toString();
                span.style.transform = 'scale(1)';
                span.style.textShadow = 'none';
            };
            
            container.appendChild(span);
        });
    }

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
            const response = await fetch(`/api/dashboard/dili/faers/${currentSetId}`);
            const data = await response.json();
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'grid';
            
            currentDiliFaersCount = (data.faers_data || []).reduce((sum, item) => sum + (item.count || 0), 0);
            
            renderWordCloud('diliFaersCloud', data.faers_data, data.faers_error, '#0891b2', 'No liver-related adverse events found in the top reports.');
            
            if (signalsContainer) {
                if (data.existing_assessment) {
                    renderDiliSignals(data.existing_assessment);
                    const controlsDiv = document.createElement('div');
                    controlsDiv.style.cssText = 'margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 10px;';
                    let timeDisplay = data.assessment_timestamp ? `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${new Date(data.assessment_timestamp).toLocaleString()}</span>` : '';
                    controlsDiv.innerHTML = `${timeDisplay}<button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button>`;
                    signalsContainer.appendChild(controlsDiv);
                    document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);
                } else {
                    signalsContainer.innerHTML = `<div style="text-align: center; padding: 20px;"><p style="color: #666; margin-bottom: 15px;">Click below to analyze the official label for DILI-related safety signals using state-of-the-art AI.</p><button id="btn-run-dili-assessment" class="button" style="background-color: #17a2b8; color: white;">Run Assessment</button></div>`;
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
        updateDiliRiskPanel(null);
        signalsContainer.innerHTML = `<div style="text-align: center; padding: 30px;"><div class="loader" style="margin: 0 auto 15px auto;"></div><p>Consulting AI Agent to analyze label sections...</p></div>`;
        try {
            const response = await fetch(`/api/dashboard/dili/assess/${currentSetId}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            renderDiliSignals(data.assessment_report);
            const controlsDiv = document.createElement('div');
            controlsDiv.style.cssText = 'margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 10px;';
            controlsDiv.innerHTML = `<span style="color: #888; font-size: 0.85em; margin-right: 15px;">Last updated: ${new Date().toLocaleString()}</span><button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button>`;
            signalsContainer.appendChild(controlsDiv);
            document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);
        } catch (error) {
            console.error('Error running DILI assessment', error);
            signalsContainer.innerHTML = `<div style="padding: 15px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">Failed to complete the assessment.</div><div style="text-align: center; margin-top: 15px;"><button id="btn-run-dili-assessment" class="button" style="background-color: #6c757d; color: white;">Try Again</button></div>`;
            document.getElementById('btn-run-dili-assessment').addEventListener('click', runDiliAssessment);
        }
    }

    function updateDiliRiskPanel(reportMarkdown) {
        const panel = document.getElementById('dili-risk-panel');
        if (!panel) return;
        panel.style.display = 'block';
        panel.className = '';
        if (!reportMarkdown) {
            panel.classList.add('dili-risk-pending');
            panel.innerHTML = `<h4>Under Assessment</h4><p>No DILI assessment has been generated yet.</p>`;
            return;
        }
        const lowerReport = reportMarkdown.toLowerCase();
        let riskLevel = 'No DILI Concern', riskClass = 'dili-risk-no', riskDesc = 'No significant liver toxicity signals identified.';
        if (lowerReport.includes('most dili concern')) { riskLevel = 'Most DILI Concern'; riskClass = 'dili-risk-most'; riskDesc = 'Significant evidence found in label.'; }
        else if (lowerReport.includes('less dili concern')) { riskLevel = 'Less DILI Concern'; riskClass = 'dili-risk-less'; riskDesc = 'Some evidence found in label.'; }
        if (currentDiliFaersCount > 100) riskLevel += ' ++'; else if (currentDiliFaersCount > 0) riskLevel += ' +';
        panel.classList.add(riskClass);
        panel.innerHTML = `<h4>${riskLevel}</h4><p>${riskDesc}</p>`;
    }

    function renderDiliSignals(reportMarkdown) {
        const container = document.getElementById('dili-label-signals');
        if (!container) return;
        updateDiliRiskPanel(reportMarkdown);
        if (!reportMarkdown) { container.innerHTML = ''; return; }
        let processedMarkdown = reportMarkdown.replace(/\[([^\]]+)\](?!\s*\()/g, '<span class="dili-evidence">$1</span>');
        processedMarkdown = processedMarkdown.replace(/\(\[Score:\s*(\d+)\]\s*([^\)]+)\)/g, '<span class="badge-score badge-score-$1">Score $1: $2</span>');
        let htmlContent = (typeof marked !== 'undefined') ? marked.parse(processedMarkdown) : processedMarkdown.replace(/\n/g, '<br>');
        container.innerHTML = `<div class="dili-results markdown-body" style="padding: 10px; background: #fff; border-radius: 8px;">${htmlContent}</div>`;
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
            currentDictFaersCount = (data.faers_data || []).reduce((sum, item) => sum + (item.count || 0), 0);
            
            renderWordCloud('dictFaersCloud', data.faers_data, data.faers_error, '#e11d48', 'No cardiac-related adverse events found in the top reports.');
            
            if (signalsContainer) {
                if (data.existing_assessment) {
                    renderDictSignals(data.existing_assessment);
                    const controlsDiv = document.createElement('div');
                    controlsDiv.style.cssText = 'margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 10px;';
                    controlsDiv.innerHTML = `<button id="btn-run-dict-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button>`;
                    signalsContainer.appendChild(controlsDiv);
                    document.getElementById('btn-run-dict-assessment').addEventListener('click', runDictAssessment);
                } else {
                    signalsContainer.innerHTML = `<div style="text-align: center; padding: 20px;"><p style="color: #666; margin-bottom: 15px;">Click below to analyze the official label for cardiotoxicity signals using state-of-the-art AI.</p><button id="btn-run-dict-assessment" class="button" style="background-color: #dc3545; color: white;">Run Assessment</button></div>`;
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
        updateDictRiskPanel(null);
        signalsContainer.innerHTML = `<div style="text-align: center; padding: 30px;"><div class="loader" style="margin: 0 auto 15px auto; border-top-color: #dc3545;"></div><p>Consulting AI Agent...</p></div>`;
        try {
            const response = await fetch(`/api/dashboard/dict/assess/${currentSetId}`);
            const data = await response.json();
            renderDictSignals(data.assessment_report);
            const controlsDiv = document.createElement('div');
            controlsDiv.style.cssText = 'margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 10px;';
            controlsDiv.innerHTML = `<button id="btn-run-dict-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button>`;
            signalsContainer.appendChild(controlsDiv);
            document.getElementById('btn-run-dict-assessment').addEventListener('click', runDictAssessment);
        } catch (error) {
            console.error('Error running DICT assessment', error);
        }
    }

    function updateDictRiskPanel(reportMarkdown) {
        const panel = document.getElementById('dict-risk-panel');
        if (!panel) return;
        panel.style.display = 'block';
        panel.className = '';
        if (!reportMarkdown) {
            panel.classList.add('dict-risk-pending');
            panel.innerHTML = `<h4>Under Assessment</h4><p>No DICT assessment yet.</p>`;
            return;
        }
        const lowerReport = reportMarkdown.toLowerCase();
        let riskLevel = 'No Cardiotoxicity Concern', riskClass = 'dict-risk-no', riskDesc = 'No significant cardiac signals identified.';
        if (lowerReport.includes('most dict concern')) { riskLevel = 'Most DICT Concern'; riskClass = 'dict-risk-most'; riskDesc = 'Significant evidence found in label.'; }
        else if (lowerReport.includes('less dict concern')) { riskLevel = 'Less DICT Concern'; riskClass = 'dict-risk-less'; riskDesc = 'Some evidence found in label.'; }
        if (currentDictFaersCount > 100) riskLevel += ' ++'; else if (currentDictFaersCount > 0) riskLevel += ' +';
        panel.classList.add(riskClass);
        panel.innerHTML = `<h4>${riskLevel}</h4><p>${riskDesc}</p>`;
    }

    function renderDictSignals(reportMarkdown) {
        const container = document.getElementById('dict-label-signals');
        if (!container) return;
        updateDictRiskPanel(reportMarkdown);
        if (!reportMarkdown) { container.innerHTML = ''; return; }
        let processedMarkdown = reportMarkdown.replace(/\[([^\]]+)\](?!\s*\()/g, '<span class="dict-evidence">$1</span>');
        let htmlContent = (typeof marked !== 'undefined') ? marked.parse(processedMarkdown) : processedMarkdown.replace(/\n/g, '<br>');
        container.innerHTML = `<div class="dict-results markdown-body" style="padding: 10px; background: #fff; border-radius: 8px;">${htmlContent}</div>`;
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
            currentDiriFaersCount = (data.faers_data || []).reduce((sum, item) => sum + (item.count || 0), 0);
            
            renderWordCloud('diriFaersCloud', data.faers_data, data.faers_error, '#d97706', 'No renal-related adverse events found in the top reports.');
            
            if (signalsContainer) {
                if (data.existing_assessment) {
                    renderDiriSignals(data.existing_assessment);
                    const controlsDiv = document.createElement('div');
                    controlsDiv.style.cssText = 'margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 10px;';
                    controlsDiv.innerHTML = `<button id="btn-run-diri-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button>`;
                    signalsContainer.appendChild(controlsDiv);
                    document.getElementById('btn-run-diri-assessment').addEventListener('click', runDiriAssessment);
                } else {
                    signalsContainer.innerHTML = `<div style="text-align: center; padding: 20px;"><p style="color: #666; margin-bottom: 15px;">Click below to analyze the official label for renal injury signals using state-of-the-art AI.</p><button id="btn-run-diri-assessment" class="button" style="background-color: #ffc107; color: black;">Run Assessment</button></div>`;
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
        updateDiriRiskPanel(null);
        signalsContainer.innerHTML = `<div style="text-align: center; padding: 30px;"><div class="loader" style="margin: 0 auto 15px auto; border-top-color: #ffc107;"></div><p>Consulting AI Agent...</p></div>`;
        try {
            const response = await fetch(`/api/dashboard/diri/assess/${currentSetId}`);
            const data = await response.json();
            renderDiriSignals(data.assessment_report);
            const controlsDiv = document.createElement('div');
            controlsDiv.style.cssText = 'margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 10px;';
            controlsDiv.innerHTML = `<button id="btn-run-diri-assessment" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button>`;
            signalsContainer.appendChild(controlsDiv);
            document.getElementById('btn-run-diri-assessment').addEventListener('click', runDiriAssessment);
        } catch (error) {
            console.error('Error running DIRI assessment', error);
        }
    }

    function updateDiriRiskPanel(reportMarkdown) {
        const panel = document.getElementById('diri-risk-panel');
        if (!panel) return;
        panel.style.display = 'block';
        panel.className = ''; 
        if (!reportMarkdown) {
            panel.classList.add('diri-risk-pending');
            panel.innerHTML = `<h4>Under Assessment</h4><p>No DIRI assessment yet.</p>`;
            return;
        }
        const lowerReport = reportMarkdown.toLowerCase();
        let riskLevel = 'No Renal Injury Concern', riskClass = 'diri-risk-no', riskDesc = 'No significant renal signals identified.';
        if (lowerReport.includes('most diri concern')) { riskLevel = 'Most DIRI Concern'; riskClass = 'diri-risk-most'; riskDesc = 'Significant evidence found in label.'; }
        else if (lowerReport.includes('less diri concern')) { riskLevel = 'Less DIRI Concern'; riskClass = 'diri-risk-less'; riskDesc = 'Some evidence found in label.'; }
        if (currentDiriFaersCount > 100) riskLevel += ' ++'; else if (currentDiriFaersCount > 0) riskLevel += ' +';
        panel.classList.add(riskClass);
        panel.innerHTML = `<h4>${riskLevel}</h4><p>${riskDesc}</p>`;
    }

    function renderDiriSignals(reportMarkdown) {
        const container = document.getElementById('diri-label-signals');
        if (!container) return;
        updateDiriRiskPanel(reportMarkdown);
        if (!reportMarkdown) { container.innerHTML = ''; return; }
        let processedMarkdown = reportMarkdown.replace(/\[([^\]]+)\](?!\s*\()/g, '<span class="diri-evidence">$1</span>');
        let htmlContent = (typeof marked !== 'undefined') ? marked.parse(processedMarkdown) : processedMarkdown.replace(/\n/g, '<br>');
        container.innerHTML = `<div class="diri-results markdown-body" style="padding: 10px; background: #fff; border-radius: 8px;">${htmlContent}</div>`;
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
            const data = await response.json();
            if (loadingEl) loadingEl.style.display = 'none';
            if (data.error) {
                if (errorEl) { errorEl.style.display = 'block'; errorEl.querySelector('p').textContent = data.error; }
                return;
            }
            if (contentEl) contentEl.style.display = 'grid';
            renderPgxResults(data.report);
            pgxDataLoaded = true;
        } catch (error) {
            console.error('Error fetching PGx data', error);
        }
    }

    function renderPgxResults(reportJson) {
        const container = document.getElementById('pgx-results-container');
        if (!container) return;
        let data;
        try { data = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson; } catch (e) { container.innerHTML = `<p>Error parsing PGx report.</p>`; return; }
        if (!data.biomarkers || data.biomarkers.length === 0) {
            container.innerHTML = `<p>${data.message || 'No pharmacogenomic biomarkers found.'}</p><div style="margin-top: 20px; text-align: right; padding-top: 10px; border-top: 1px solid #eee;"><button id="btn-refresh-pgx" class="button" style="background-color: #6c757d; color: white; font-size: 0.9em; padding: 5px 15px;">&#x21bb; Re-assess</button></div>`;
            document.getElementById('btn-refresh-pgx').addEventListener('click', () => loadPgxData(true));
            return;
        }
        let html = '<div style="display: grid; gap: 20px;">';
        data.biomarkers.forEach(bio => {
            const isValid = bio.is_valid !== false;
            let cardColor = isValid ? '#e2e6ea' : '#fff3cd';
            html += `<div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; background-color: ${cardColor};"><h4 style="margin: 0; color: #6610f2;">${bio.name}</h4><p>${bio.evidence || ''}</p></div>`;
        });
        html += '</div><div style="margin-top: 20px; text-align: right;"><button id="btn-refresh-pgx" class="button" style="background-color: #6c757d; color: white;">&#x21bb; Re-assess</button></div>';
        container.innerHTML = html;
        document.getElementById('btn-refresh-pgx').addEventListener('click', () => loadPgxData(true));
    }
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => window.initToxAgents()); } else { window.initToxAgents(); }
