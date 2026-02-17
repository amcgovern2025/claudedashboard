/**
 * Main Application Controller
 * Handles UI interactions, file uploads, and coordinates
 * between the DICOM handler and analysis engine.
 */
(() => {
    'use strict';

    /* ======== DOM References ======== */
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const resultsSection = document.getElementById('results-section');
    const canvas = document.getElementById('mri-canvas');
    const wcSlider = document.getElementById('wc-slider');
    const wwSlider = document.getElementById('ww-slider');
    const sliceSlider = document.getElementById('slice-slider');
    const wcValue = document.getElementById('wc-value');
    const wwValue = document.getElementById('ww-value');
    const sliceValue = document.getElementById('slice-value');
    const invertBtn = document.getElementById('invert-btn');
    const resetBtn = document.getElementById('reset-btn');
    const metadataGrid = document.getElementById('dicom-metadata');
    const analysisLoading = document.getElementById('analysis-loading');
    const analysisResults = document.getElementById('analysis-results');

    /* ======== File Upload Handling ======== */

    // Drag & drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // Click to browse
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFiles(fileInput.files);
        }
    });

    /**
     * Process uploaded files.
     */
    async function handleFiles(fileHandles) {
        const files = Array.from(fileHandles);
        if (files.length === 0) return;

        // Show file chips
        fileList.innerHTML = '';
        fileList.hidden = false;
        for (const f of files) {
            const chip = document.createElement('span');
            chip.className = 'file-chip';
            chip.innerHTML = `${f.name} <span class="size">(${formatFileSize(f.size)})</span>`;
            fileList.appendChild(chip);
        }

        // Read all files
        const buffers = await Promise.all(
            files.map(f => f.arrayBuffer().then(buffer => ({ buffer, name: f.name })))
        );

        // Parse DICOM files
        try {
            const result = DicomHandler.parseFiles(buffers);

            if (result.fileCount === 0) {
                showError('No valid DICOM files found. Please upload .dcm files from your radiology department.');
                return;
            }

            // Show results section and restore viewer if previously hidden
            resultsSection.hidden = false;
            const viewerPanel = resultsSection.querySelector('.viewer-panel');
            if (viewerPanel) viewerPanel.style.display = '';
            const analysisPanel = resultsSection.querySelector('.analysis-panel');
            if (analysisPanel) analysisPanel.style.gridColumn = '';

            // Setup viewer controls
            setupViewerControls(result);

            // Render middle slice
            DicomHandler.renderSlice(canvas);

            // Show metadata
            displayMetadata();

            // Run analysis
            runAnalysis();

        } catch (err) {
            showError(`Error parsing DICOM files: ${err.message}. Ensure these are valid DICOM files (.dcm format).`);
            console.error(err);
        }
    }

    /* ======== Viewer Controls ======== */

    function setupViewerControls(parseResult) {
        const state = parseResult.state;

        // Window Center
        wcSlider.value = state.windowCenter;
        wcValue.textContent = Math.round(state.windowCenter);

        // Window Width
        wwSlider.value = state.windowWidth;
        wwValue.textContent = Math.round(state.windowWidth);

        // Slice slider
        const total = parseResult.fileCount;
        sliceSlider.min = 0;
        sliceSlider.max = Math.max(0, total - 1);
        sliceSlider.value = state.currentSlice;
        sliceValue.textContent = `${state.currentSlice + 1} / ${total}`;

        // Event listeners
        wcSlider.oninput = () => {
            const wc = parseInt(wcSlider.value);
            wcValue.textContent = wc;
            DicomHandler.setWindow(wc, parseInt(wwSlider.value));
            DicomHandler.renderSlice(canvas);
        };

        wwSlider.oninput = () => {
            const ww = parseInt(wwSlider.value);
            wwValue.textContent = ww;
            DicomHandler.setWindow(parseInt(wcSlider.value), ww);
            DicomHandler.renderSlice(canvas);
        };

        sliceSlider.oninput = () => {
            const idx = parseInt(sliceSlider.value);
            sliceValue.textContent = `${idx + 1} / ${total}`;
            DicomHandler.renderSlice(canvas, idx);
            displayMetadata(idx);
        };

        invertBtn.onclick = () => {
            const state = DicomHandler.getState();
            DicomHandler.setInverted(!state.inverted);
            DicomHandler.renderSlice(canvas);
        };

        resetBtn.onclick = () => {
            const meta = DicomHandler.getMetadata();
            if (meta) {
                wcSlider.value = meta.windowCenter;
                wwSlider.value = meta.windowWidth;
                wcValue.textContent = Math.round(meta.windowCenter);
                wwValue.textContent = Math.round(meta.windowWidth);
                DicomHandler.setWindow(meta.windowCenter, meta.windowWidth);
                DicomHandler.setInverted(false);
                DicomHandler.renderSlice(canvas);
            }
        };

        // Scroll wheel on canvas changes slice
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const currentSlice = parseInt(sliceSlider.value);
            const newSlice = Math.max(0, Math.min(total - 1,
                currentSlice + (e.deltaY > 0 ? 1 : -1)));
            sliceSlider.value = newSlice;
            sliceValue.textContent = `${newSlice + 1} / ${total}`;
            DicomHandler.renderSlice(canvas, newSlice);
            displayMetadata(newSlice);
        });
    }

    /* ======== Metadata Display ======== */

    function displayMetadata(sliceIndex) {
        const meta = DicomHandler.getMetadata(sliceIndex);
        if (!meta) return;

        metadataGrid.hidden = false;
        metadataGrid.innerHTML = '';

        const fields = [
            ['Patient', meta.patientName || 'N/A'],
            ['Patient ID', meta.patientId || 'N/A'],
            ['Birth Date', meta.patientBirthDate || 'N/A'],
            ['Sex', meta.patientSex || 'N/A'],
            ['Age', meta.patientAge || 'N/A'],
            ['Study Date', meta.studyDate || 'N/A'],
            ['Modality', meta.modality || 'N/A'],
            ['Study', meta.studyDescription || 'N/A'],
            ['Series', meta.seriesDescription || 'N/A'],
            ['Manufacturer', meta.manufacturer || 'N/A'],
            ['Institution', meta.institutionName || 'N/A'],
            ['Image Size', `${meta.rows} x ${meta.cols}`],
            ['Bits', `${meta.bitsStored} stored / ${meta.bitsAllocated} allocated`],
            ['Pixel Spacing', meta.pixelSpacing || 'N/A'],
            ['Slice Thickness', meta.sliceThickness ? `${meta.sliceThickness} mm` : 'N/A'],
            ['Window C/W', `${meta.windowCenter} / ${meta.windowWidth}`]
        ];

        for (const [label, value] of fields) {
            const item = document.createElement('div');
            item.className = 'meta-item';
            item.innerHTML = `<span class="meta-label">${label}</span><span class="meta-value">${value}</span>`;
            metadataGrid.appendChild(item);
        }
    }

    /* ======== Analysis ======== */

    function runAnalysis() {
        analysisLoading.hidden = false;
        analysisResults.innerHTML = '';

        // Run analysis asynchronously to avoid blocking the UI
        setTimeout(() => {
            try {
                const allData = DicomHandler.getAllPixelData();
                const results = AnalysisEngine.analyze(allData);

                if (results.error) {
                    showError(results.error);
                    analysisLoading.hidden = true;
                    return;
                }

                renderAnalysisResults(results);
            } catch (err) {
                showError(`Analysis error: ${err.message}`);
                console.error(err);
            }
            analysisLoading.hidden = true;
        }, 100);
    }

    /* ======== Analysis Rendering ======== */

    function renderAnalysisResults(results) {
        analysisResults.innerHTML = '';

        // Brain Health Score Card
        const scoreCard = createScoreCard(results.brainHealthScore);
        analysisResults.appendChild(scoreCard);

        // Mosconi context explanation for the score
        const scoreExplanation = createMosconiExplanation(
            'Understanding Your Composite Score',
            `This score is derived from five components of structural MRI analysis, weighted ` +
            `according to their diagnostic significance in Mosconi's research framework. ` +
            `Tissue balance and structural integrity receive the highest weight (25% each) ` +
            `because Mosconi's longitudinal studies show gray matter volume loss and brain ` +
            `parenchyma reduction are among the earliest detectable structural biomarkers — ` +
            `often appearing years before clinical symptoms of cognitive decline.`,
            'Mosconi et al., "Brain glucose metabolism in the early and specific diagnosis of Alzheimer\'s disease," European Journal of Nuclear Medicine, 2005'
        );
        analysisResults.appendChild(scoreExplanation);

        // ====== Recommended Reading vs Your Reading ======
        const comparisonSection = createReadingComparison(results);
        analysisResults.appendChild(comparisonSection);

        // Mosconi explanation for the comparison
        const compExplanation = createMosconiExplanation(
            'Why These Ranges Matter',
            `The recommended ranges are derived from Mosconi's structural MRI research on healthy brain aging. ` +
            `Gray matter proportion reflects neuronal density — Mosconi's work shows that women in particular ` +
            `can experience accelerated gray matter changes during perimenopause. The GM/WM ratio helps distinguish ` +
            `normal age-related changes from pathological atrophy patterns. Brain parenchyma fraction is the most ` +
            `robust single structural biomarker: values below 55% correlate strongly with increased CSF space, ` +
            `suggesting ventricular enlargement or sulcal widening — hallmarks of neurodegeneration. ` +
            `Hemispheric symmetry above 85% indicates balanced bilateral structure; asymmetry in the medial temporal ` +
            `regions specifically may point toward early hippocampal changes that Mosconi identifies as a key ` +
            `Alzheimer's risk signal.`,
            'Mosconi et al., "Reduced hippocampal metabolism in MCI and AD," Neurology, 2005; Mosconi, "Glucose metabolism in normal aging and Alzheimer\'s disease," 2013'
        );
        analysisResults.appendChild(compExplanation);

        // Sub-scores
        const subScoresSection = createSection('Component Scores', true);
        const subBody = subScoresSection.querySelector('.analysis-section-body');
        const subScores = results.brainHealthScore.subScores;
        const subLabels = {
            tissueBalance: 'Tissue Balance',
            symmetry: 'Hemispheric Symmetry',
            atrophy: 'Structural Integrity',
            texture: 'Tissue Homogeneity',
            regionalBalance: 'Regional Balance'
        };
        for (const [key, label] of Object.entries(subLabels)) {
            subBody.appendChild(createMetricBar(label, subScores[key]));
        }
        analysisResults.appendChild(subScoresSection);

        // Histogram
        const histSection = createSection('Intensity Histogram', false);
        const histBody = histSection.querySelector('.analysis-section-body');
        const histWrapper = document.createElement('div');
        histWrapper.className = 'histogram-wrapper';
        const histCanvas = document.createElement('canvas');
        histCanvas.width = 512;
        histCanvas.height = 120;
        histWrapper.appendChild(histCanvas);
        histBody.appendChild(histWrapper);
        drawHistogram(histCanvas, results.histogram);

        const statsP = document.createElement('p');
        statsP.style.cssText = 'font-size:0.8rem;color:#7f8c8d;margin-top:0.5rem;';
        statsP.textContent = `Mean: ${results.globalStats.mean.toFixed(1)} | ` +
            `Std Dev: ${results.globalStats.stdDev.toFixed(1)} | ` +
            `Median: ${results.globalStats.median.toFixed(1)} | ` +
            `Range: ${results.globalStats.min.toFixed(0)}–${results.globalStats.max.toFixed(0)}`;
        histBody.appendChild(statsP);
        analysisResults.appendChild(histSection);

        // Findings sections with Mosconi explanations
        const findingExplanations = {
            'Tissue Composition (Mosconi Structural Biomarkers)': {
                title: 'Mosconi on Tissue Composition',
                body: `In Mosconi's framework, tissue composition from structural MRI serves as a proxy ` +
                    `for what FDG-PET measures metabolically. Regions with gray matter loss on MRI ` +
                    `correspond closely to areas showing hypometabolism on PET. Her research demonstrated ` +
                    `that the ratio of gray matter to total brain volume decreases at predictable rates ` +
                    `in healthy aging (~0.5% per year after age 60), but accelerates significantly ` +
                    `(1-2% per year) in preclinical Alzheimer's — often a decade before diagnosis.`,
                citation: 'Mosconi et al., "MCI conversion to dementia and the APOE genotype," Neurology, 2007'
            },
            'Regional Analysis (Mosconi Key Brain Regions)': {
                title: 'Mosconi on Regional Vulnerability',
                body: `Mosconi's PET and MRI research established a hierarchy of regional vulnerability ` +
                    `in Alzheimer's disease. The hippocampus and entorhinal cortex show changes first, ` +
                    `followed by the posterior cingulate cortex, then lateral temporal and parietal lobes. ` +
                    `The frontal lobes are typically affected later. This "Braak staging" pattern on structural ` +
                    `MRI mirrors Mosconi's metabolic findings, making regional intensity comparison valuable ` +
                    `even without PET imaging. Her work also shows that individuals with a maternal family ` +
                    `history of Alzheimer's show these regional changes earlier than those with paternal history.`,
                citation: 'Mosconi et al., "Maternal family history of Alzheimer\'s disease predisposes to reduced brain glucose metabolism," PNAS, 2007'
            },
            'Hemispheric Symmetry': {
                title: 'Mosconi on Brain Symmetry',
                body: `While Mosconi's primary focus is metabolic imaging, her structural MRI work ` +
                    `confirms that healthy brains maintain high bilateral symmetry. Asymmetric atrophy ` +
                    `— particularly in the medial temporal lobes — is associated with lateralized ` +
                    `pathology and can help distinguish Alzheimer's (typically symmetric early on) from ` +
                    `frontotemporal dementia (often asymmetric). Temporal lobe asymmetry above 10% ` +
                    `warrants closer clinical attention in her framework.`,
                citation: 'Mosconi, "Brain glucose metabolism in the early and specific diagnosis of Alzheimer\'s disease," European Journal of Nuclear Medicine, 2005'
            },
            'Brain Atrophy Indicators': {
                title: 'Mosconi on Brain Atrophy',
                body: `Brain atrophy assessment is central to Mosconi's structural biomarker research. ` +
                    `Her studies show that brain parenchyma fraction (the ratio of brain tissue to total ` +
                    `intracranial volume) declines with age but that the rate of decline is a stronger ` +
                    `predictor of cognitive outcomes than the absolute value. Importantly, Mosconi's ` +
                    `nutrition research demonstrates that Mediterranean diet adherence is associated ` +
                    `with 1.5-2.0% greater brain volume preservation over 5 years compared to ` +
                    `Western dietary patterns — an effect she attributes to anti-inflammatory and ` +
                    `antioxidant neuroprotection.`,
                citation: 'Mosconi et al., "Mediterranean diet and brain structure in a multiethnic elderly cohort," Neurology, 2014'
            }
        };

        for (const finding of results.findings) {
            const section = createSection(finding.category, true);
            const body = section.querySelector('.analysis-section-body');
            for (const item of finding.items) {
                body.appendChild(createFindingItem(item));
            }

            // Add Mosconi explanation after each finding category
            const explanation = findingExplanations[finding.category];
            if (explanation) {
                body.appendChild(createMosconiExplanation(
                    explanation.title, explanation.body, explanation.citation
                ));
            }

            analysisResults.appendChild(section);
        }

        // Volumetric info (if multi-slice)
        if (results.volumetric.totalSlices > 1) {
            const volSection = createSection('Volumetric Analysis', true);
            const volBody = volSection.querySelector('.analysis-section-body');
            volBody.appendChild(createMetricBar('Brain Extent',
                results.volumetric.brainExtent * 100));
            volBody.appendChild(createMetricBar('Cross-Slice Consistency',
                results.volumetric.crossSliceConsistency));

            const volP = document.createElement('p');
            volP.className = 'finding-detail';
            volP.style.marginTop = '0.5rem';
            volP.textContent = `Analysis covers ${results.volumetric.totalSlices} slices ` +
                `with ${results.volumetric.totalBrainPixels.toLocaleString()} total brain tissue pixels.`;
            volBody.appendChild(volP);
            analysisResults.appendChild(volSection);
        }

        // Recommendations
        const recSection = createSection('Recommendations (Mosconi Research-Based)', true);
        const recBody = recSection.querySelector('.analysis-section-body');
        const recList = document.createElement('ul');
        recList.className = 'recommendation-list';
        for (const rec of results.recommendations) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${rec.title}</strong><br>${rec.detail}`;
            recList.appendChild(li);
        }
        recBody.appendChild(recList);
        analysisResults.appendChild(recSection);

        // Save analysis to localStorage for persistence
        saveAnalysisState(results);

        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ======== Recommended Reading Comparison ======== */

    function createReadingComparison(results) {
        const container = document.createElement('div');
        container.className = 'reading-comparison';

        const header = document.createElement('div');
        header.className = 'reading-comparison-header';
        header.textContent = 'Recommended Reading vs. Your Reading';
        container.appendChild(header);

        const body = document.createElement('div');
        body.className = 'reading-comparison-body';

        // Header row
        const headerRow = document.createElement('div');
        headerRow.className = 'reading-row header-row';
        headerRow.innerHTML = `
            <span>Metric</span>
            <span style="text-align:center">Recommended</span>
            <span style="text-align:center">Your Reading</span>
            <span style="text-align:center">Status</span>
        `;
        body.appendChild(headerRow);

        const tissue = results.tissueComposition;
        const symmetry = results.symmetry;
        const atrophy = results.atrophy;
        const texture = results.texture;

        // Define comparison rows
        const comparisons = [
            {
                metric: 'Gray Matter',
                recommended: '35–45%',
                yours: `${(tissue.grayMatter * 100).toFixed(1)}%`,
                status: tissue.grayMatter > 0.35 ? 'good' :
                    tissue.grayMatter > 0.25 ? 'moderate' : 'concern'
            },
            {
                metric: 'White Matter',
                recommended: '25–40%',
                yours: `${(tissue.whiteMatter * 100).toFixed(1)}%`,
                status: tissue.whiteMatter > 0.25 ? 'good' :
                    tissue.whiteMatter > 0.15 ? 'moderate' : 'concern'
            },
            {
                metric: 'GM/WM Ratio',
                recommended: '1.0–1.5',
                yours: tissue.gmToWmRatio.toFixed(2),
                status: (tissue.gmToWmRatio > 0.8 && tissue.gmToWmRatio < 2.0) ? 'good' :
                    (tissue.gmToWmRatio > 0.5 && tissue.gmToWmRatio < 2.5) ? 'moderate' : 'concern'
            },
            {
                metric: 'CSF Proportion',
                recommended: '< 15%',
                yours: `${(tissue.csf * 100).toFixed(1)}%`,
                status: tissue.csf < 0.15 ? 'good' :
                    tissue.csf < 0.25 ? 'moderate' : 'concern'
            },
            {
                metric: 'Brain Parenchyma',
                recommended: '> 70%',
                yours: `${(atrophy.brainParenchymaFraction * 100).toFixed(1)}%`,
                status: atrophy.brainParenchymaFraction > 0.7 ? 'good' :
                    atrophy.brainParenchymaFraction > 0.55 ? 'moderate' : 'concern'
            },
            {
                metric: 'Hemispheric Symmetry',
                recommended: '> 85',
                yours: symmetry.symmetryScore.toFixed(1),
                status: symmetry.symmetryScore > 85 ? 'good' :
                    symmetry.symmetryScore > 70 ? 'moderate' : 'concern'
            },
            {
                metric: 'Temporal Asymmetry',
                recommended: '< 5%',
                yours: `${(symmetry.temporalAsymmetry * 100).toFixed(1)}%`,
                status: symmetry.temporalAsymmetry < 0.05 ? 'good' :
                    symmetry.temporalAsymmetry < 0.10 ? 'moderate' : 'concern'
            },
            {
                metric: 'Tissue Homogeneity',
                recommended: '> 60',
                yours: texture.homogeneityScore.toFixed(1),
                status: texture.homogeneityScore > 60 ? 'good' :
                    texture.homogeneityScore > 40 ? 'moderate' : 'concern'
            }
        ];

        for (const row of comparisons) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'reading-row';
            rowDiv.innerHTML = `
                <span class="reading-metric">${row.metric}</span>
                <span class="reading-recommended">${row.recommended}</span>
                <span class="reading-yours" style="color: var(--color-${row.status === 'good' ? 'accent' : row.status === 'moderate' ? 'warning' : 'danger'})">${row.yours}</span>
                <span class="reading-status"><span class="status-dot ${row.status}" title="${row.status}"></span></span>
            `;
            body.appendChild(rowDiv);
        }

        container.appendChild(body);
        return container;
    }

    /* ======== Mosconi Explanation Builder ======== */

    function createMosconiExplanation(title, bodyText, citation) {
        const div = document.createElement('div');
        div.className = 'mosconi-explanation';
        div.innerHTML = `
            <div class="explanation-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                ${title}
            </div>
            <div class="explanation-body">${bodyText}</div>
            ${citation ? `<span class="explanation-citation">${citation}</span>` : ''}
        `;
        return div;
    }

    /* ======== UI Component Builders ======== */

    function createScoreCard(score) {
        const card = document.createElement('div');
        card.className = `score-card ${score.level}`;
        card.innerHTML = `
            <div class="score-number">${score.composite}</div>
            <div class="score-label">Brain Health Composite Score</div>
            <div class="score-description">
                ${score.level === 'good'
                    ? 'Image analysis indicators are within typical ranges.'
                    : score.level === 'moderate'
                    ? 'Some indicators show variability. Consider clinical consultation.'
                    : 'Several indicators warrant professional neurological evaluation.'}
            </div>
        `;
        return card;
    }

    function createSection(title, expanded) {
        const section = document.createElement('div');
        section.className = 'analysis-section';

        const header = document.createElement('div');
        header.className = 'analysis-section-header';
        header.innerHTML = `${title}<span class="toggle">${expanded ? 'collapse' : 'expand'}</span>`;

        const body = document.createElement('div');
        body.className = 'analysis-section-body' + (expanded ? '' : ' collapsed');

        header.addEventListener('click', () => {
            body.classList.toggle('collapsed');
            header.querySelector('.toggle').textContent =
                body.classList.contains('collapsed') ? 'expand' : 'collapse';
        });

        section.appendChild(header);
        section.appendChild(body);
        return section;
    }

    function createMetricBar(label, value) {
        const clamped = Math.max(0, Math.min(100, value));
        const level = clamped >= 70 ? 'good' : clamped >= 45 ? 'moderate' : 'concern';

        const row = document.createElement('div');
        row.className = 'metric-row';
        row.innerHTML = `
            <span class="metric-label">${label}</span>
            <div class="metric-bar-bg">
                <div class="metric-bar ${level}" style="width: ${clamped}%"></div>
            </div>
            <span class="metric-value">${clamped.toFixed(0)}%</span>
        `;
        return row;
    }

    function createFindingItem(item) {
        const div = document.createElement('div');
        div.className = 'finding-item';
        div.innerHTML = `
            <div class="finding-title">
                ${item.title}
                <span class="indicator ${item.indicator}">${item.indicator}</span>
            </div>
            <div class="finding-detail">${item.detail}</div>
        `;
        return div;
    }

    function drawHistogram(histCanvas, histogram) {
        const ctx = histCanvas.getContext('2d');
        const { counts, bins } = histogram;
        const w = histCanvas.width;
        const h = histCanvas.height;

        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, w, h);

        // Skip first few bins (background) for better visualization
        const startBin = 5;
        const maxCount = Math.max(...counts.slice(startBin));
        const barWidth = w / (bins - startBin);

        for (let i = startBin; i < bins; i++) {
            const barHeight = maxCount > 0 ? (counts[i] / maxCount) * (h - 10) : 0;
            const x = (i - startBin) * barWidth;

            // Color gradient from blue (low) to white (high)
            const t = (i - startBin) / (bins - startBin);
            const r = Math.round(26 + t * 200);
            const g = Math.round(82 + t * 150);
            const b = Math.round(118 + t * 100);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, h - barHeight, barWidth + 0.5, barHeight);
        }
    }

    /* ======== Utilities ======== */

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function showError(message) {
        const errDiv = document.createElement('div');
        errDiv.className = 'disclaimer-banner';
        errDiv.style.borderLeftColor = '#c0392b';
        errDiv.style.background = '#fdedec';
        errDiv.style.color = '#922b21';
        errDiv.innerHTML = `<strong>Error:</strong> ${message}`;
        document.querySelector('main').insertBefore(errDiv, resultsSection);
        setTimeout(() => errDiv.remove(), 10000);
    }

    /* ======== LocalStorage Persistence ======== */

    const STORAGE_KEY = 'mri_analysis_state';

    function saveAnalysisState(results) {
        try {
            const stateToSave = {
                timestamp: Date.now(),
                brainHealthScore: results.brainHealthScore,
                tissueComposition: results.tissueComposition,
                symmetry: results.symmetry,
                atrophy: results.atrophy,
                texture: results.texture,
                globalStats: results.globalStats,
                histogram: results.histogram,
                findings: results.findings,
                recommendations: results.recommendations,
                volumetric: results.volumetric,
                metadata: results.metadata,
                sliceCount: results.sliceCount,
                imageSize: results.imageSize,
                fileNames: getSavedFileNames()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Could not save analysis state:', e.message);
        }
    }

    function getSavedFileNames() {
        const chips = fileList.querySelectorAll('.file-chip');
        return Array.from(chips).map(chip => chip.textContent.trim());
    }

    function loadSavedState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return;

            const state = JSON.parse(saved);
            if (!state || !state.brainHealthScore) return;

            // Restore file chips
            if (state.fileNames && state.fileNames.length > 0) {
                fileList.innerHTML = '';
                fileList.hidden = false;
                for (const name of state.fileNames) {
                    const chip = document.createElement('span');
                    chip.className = 'file-chip';
                    chip.textContent = name;
                    fileList.appendChild(chip);
                }
            }

            // Show results section (without viewer since we don't have pixel data)
            resultsSection.hidden = false;

            // Hide the viewer panel since we can't restore raw pixel data
            const viewerPanel = resultsSection.querySelector('.viewer-panel');
            if (viewerPanel) viewerPanel.style.display = 'none';

            // Expand the analysis panel to full width when viewer is hidden
            const analysisPanel = resultsSection.querySelector('.analysis-panel');
            if (analysisPanel) analysisPanel.style.gridColumn = '1 / -1';

            // Render the saved analysis results
            renderAnalysisResults(state);

            // Add a restored indicator
            const indicator = document.createElement('span');
            indicator.className = 'persist-indicator';
            indicator.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Saved session restored`;
            const heading = analysisPanel.querySelector('h2');
            if (heading) heading.appendChild(indicator);

        } catch (e) {
            console.warn('Could not restore analysis state:', e.message);
        }
    }

    // On page load, restore saved state if available
    loadSavedState();

})();
