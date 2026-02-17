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

            // Show results section
            resultsSection.hidden = false;

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

        // Findings sections
        for (const finding of results.findings) {
            const section = createSection(finding.category, true);
            const body = section.querySelector('.analysis-section-body');
            for (const item of finding.items) {
                body.appendChild(createFindingItem(item));
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

        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

})();
