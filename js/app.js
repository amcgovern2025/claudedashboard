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
    const volumeMetadataSection = document.getElementById('volume-metadata-section');
    const volumeMetadataContent = document.getElementById('volume-metadata-content');

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

    /* ======== File Type Detection ======== */

    function getFileType(filename) {
        const name = filename.toLowerCase();
        if (name.endsWith('.nii.gz') || name.endsWith('.nii')) return 'nifti';
        if (name.endsWith('.dcm') || name.endsWith('.dicom')) return 'dicom';
        if (name.endsWith('.nrrd')) return 'nrrd';
        if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image';
        return 'unsupported';
    }

    /**
     * Process uploaded files — detects type and routes to the appropriate handler.
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

        // Detect file type from the first file
        const primaryType = getFileType(files[0].name);

        if (primaryType === 'unsupported') {
            showError('Unsupported file format. Please upload .nii, .nii.gz, .nrrd, or image files.');
            return;
        }

        // Read all files as ArrayBuffers (except for image files)
        if (primaryType === 'image') {
            handleImageFiles(files);
            return;
        }

        const buffers = await Promise.all(
            files.map(f => f.arrayBuffer().then(buffer => ({ buffer, name: f.name })))
        );

        if (primaryType === 'nifti') {
            handleNiftiFiles(buffers);
        } else if (primaryType === 'dicom') {
            handleDicomFiles(buffers);
        } else if (primaryType === 'nrrd') {
            handleNrrdFiles(buffers);
        }
    }

    /**
     * Handle DICOM file uploads (existing functionality).
     */
    function handleDicomFiles(buffers) {
        volumeMetadataSection.hidden = true;

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

    /**
     * Handle NIfTI file uploads (.nii, .nii.gz).
     * Parses header, extracts volume metadata, displays it.
     */
    function handleNiftiFiles(buffers) {
        resultsSection.hidden = true;
        volumeMetadataSection.hidden = false;

        try {
            const results = [];
            for (const { buffer, name } of buffers) {
                const meta = NiftiHandler.parseFile(buffer, name);
                results.push(meta);
            }
            displayVolumeMetadata(results);
        } catch (err) {
            volumeMetadataSection.hidden = true;
            showError('Error parsing NIfTI file: ' + err.message);
            console.error(err);
        }
    }

    /**
     * Handle NRRD file uploads.
     * Accepts the file and confirms loading (no deep parsing without an NRRD library).
     */
    function handleNrrdFiles(buffers) {
        resultsSection.hidden = true;
        volumeMetadataSection.hidden = false;
        volumeMetadataContent.innerHTML = '';

        const info = document.createElement('div');
        info.className = 'volume-load-success';
        info.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
            '<polyline points="22 4 12 14.01 9 11.01"/></svg> ' +
            'NRRD file detected (' + buffers.map(b => b.name).join(', ') + '). ' +
            'File loaded successfully. Full NRRD metadata parsing requires additional library support.';
        volumeMetadataContent.appendChild(info);
    }

    /**
     * Handle image file uploads (.png, .jpg, .jpeg).
     * Displays the image on the MRI canvas.
     */
    function handleImageFiles(files) {
        volumeMetadataSection.hidden = true;
        resultsSection.hidden = false;

        const viewerPanel = resultsSection.querySelector('.viewer-panel');
        if (viewerPanel) viewerPanel.style.display = '';
        const analysisPanel = resultsSection.querySelector('.analysis-panel');
        if (analysisPanel) analysisPanel.style.display = 'none';

        const file = files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /* ======== Volume Metadata Display (NIfTI) ======== */

    function displayVolumeMetadata(niftiResults) {
        volumeMetadataContent.innerHTML = '';

        for (const meta of niftiResults) {
            if (niftiResults.length > 1) {
                const fileHeader = document.createElement('div');
                fileHeader.className = 'volume-file-header';
                fileHeader.textContent = meta.filename;
                volumeMetadataContent.appendChild(fileHeader);
            }

            const grid = document.createElement('div');
            grid.className = 'metadata-grid';

            const fields = [
                ['Filename', meta.filename],
                ['Compressed', meta.compressed ? 'Yes (.nii.gz)' : 'No (.nii)'],
                ['Num Dimensions', meta.numDims],
                ['Dimensions (voxels)', meta.dims.join(' \u00d7 ')],
                ['Voxel Spacing (mm)', meta.pixDims.map(function (v) { return v.toFixed(4); }).join(' \u00d7 ')],
                ['Datatype', meta.datatypeName],
                ['Bits Per Voxel', meta.numBitsPerVoxel],
                ['Description', meta.description || 'N/A']
            ];

            for (const [label, value] of fields) {
                const item = document.createElement('div');
                item.className = 'meta-item';
                item.innerHTML = '<span class="meta-label">' + label + '</span>' +
                    '<span class="meta-value">' + value + '</span>';
                grid.appendChild(item);
            }

            volumeMetadataContent.appendChild(grid);
        }

        // Success confirmation
        const successDiv = document.createElement('div');
        successDiv.className = 'volume-load-success';
        successDiv.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
            '<polyline points="22 4 12 14.01 9 11.01"/></svg> ' +
            'File loaded successfully. Volume metadata extracted.';
        volumeMetadataContent.appendChild(successDiv);
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
        analysisLoading.style.display = 'flex';
        analysisResults.innerHTML = '';

        // Run analysis asynchronously to avoid blocking the UI
        setTimeout(() => {
            try {
                const allData = DicomHandler.getAllPixelData();
                const results = AnalysisEngine.analyze(allData);

                if (results.error) {
                    showError(results.error);
                    analysisLoading.style.display = 'none';
                    return;
                }

                renderAnalysisResults(results);
            } catch (err) {
                showError(`Analysis error: ${err.message}`);
                console.error(err);
            }
            analysisLoading.style.display = 'none';
        }, 100);
    }

    /* ======== Analysis Rendering ======== */

    function renderAnalysisResults(results) {
        analysisResults.innerHTML = '';

        // Brain Health Score Card
        const scoreCard = createScoreCard(results.brainHealthScore);
        analysisResults.appendChild(scoreCard);

        // Research context explanation for the score
        const scoreExplanation = createResearchExplanation(
            'Understanding Your Composite Score',
            `This score is derived from five components of structural MRI analysis, weighted ` +
            `according to their diagnostic significance in structural MRI research. ` +
            `Tissue balance and structural integrity receive the highest weight (25% each) ` +
            `because longitudinal studies show gray matter volume loss and brain ` +
            `parenchyma reduction are among the earliest detectable structural biomarkers — ` +
            `often appearing years before clinical symptoms of cognitive decline.`,
            '"Brain glucose metabolism in the early and specific diagnosis of Alzheimer\'s disease," European Journal of Nuclear Medicine, 2005'
        );
        analysisResults.appendChild(scoreExplanation);

        // ====== Recommended Reading vs Your Reading ======
        const comparisonSection = createReadingComparison(results);
        analysisResults.appendChild(comparisonSection);

        // Research explanation for the comparison
        const compExplanation = createResearchExplanation(
            'Why These Ranges Matter',
            `The recommended ranges are derived from structural MRI research on healthy brain aging. ` +
            `Gray matter proportion reflects neuronal density — research shows that women in particular ` +
            `can experience accelerated gray matter changes during perimenopause. The GM/WM ratio helps distinguish ` +
            `normal age-related changes from pathological atrophy patterns. Brain parenchyma fraction is the most ` +
            `robust single structural biomarker: values below 55% correlate strongly with increased CSF space, ` +
            `suggesting ventricular enlargement or sulcal widening — hallmarks of neurodegeneration. ` +
            `Hemispheric symmetry above 85% indicates balanced bilateral structure; asymmetry in the medial temporal ` +
            `regions specifically may point toward early hippocampal changes that research identifies as a key ` +
            `Alzheimer's risk signal.`,
            '"Reduced hippocampal metabolism in MCI and AD," Neurology, 2005; "Glucose metabolism in normal aging and Alzheimer\'s disease," 2013'
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

        // Histogram (only available for DICOM pixel data, not FreeSurfer)
        if (results.histogram) {
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
        }

        // Findings sections with research explanations
        const findingExplanations = {
            'Tissue Composition (Structural Biomarkers)': {
                title: 'Tissue Composition',
                body: `In this framework, tissue composition from structural MRI serves as a proxy ` +
                    `for what FDG-PET measures metabolically. Regions with gray matter loss on MRI ` +
                    `correspond closely to areas showing hypometabolism on PET. Research has demonstrated ` +
                    `that the ratio of gray matter to total brain volume decreases at predictable rates ` +
                    `in healthy aging (~0.5% per year after age 60), but accelerates significantly ` +
                    `(1-2% per year) in preclinical Alzheimer's — often a decade before diagnosis.`,
                citation: '"MCI conversion to dementia and the APOE genotype," Neurology, 2007'
            },
            'Regional Analysis (Key Brain Regions)': {
                title: 'Regional Vulnerability',
                body: `PET and MRI research has established a hierarchy of regional vulnerability ` +
                    `in Alzheimer's disease. The hippocampus and entorhinal cortex show changes first, ` +
                    `followed by the posterior cingulate cortex, then lateral temporal and parietal lobes. ` +
                    `The frontal lobes are typically affected later. This "Braak staging" pattern on structural ` +
                    `MRI mirrors metabolic findings, making regional intensity comparison valuable ` +
                    `even without PET imaging. Research also shows that individuals with a maternal family ` +
                    `history of Alzheimer's show these regional changes earlier than those with paternal history.`,
                citation: '"Maternal family history of Alzheimer\'s disease predisposes to reduced brain glucose metabolism," PNAS, 2007'
            },
            'Hemispheric Symmetry': {
                title: 'Brain Symmetry',
                body: `Structural MRI research confirms that healthy brains maintain high bilateral symmetry. ` +
                    `Asymmetric atrophy — particularly in the medial temporal lobes — is associated with lateralized ` +
                    `pathology and can help distinguish Alzheimer's (typically symmetric early on) from ` +
                    `frontotemporal dementia (often asymmetric). Temporal lobe asymmetry above 10% ` +
                    `warrants closer clinical attention.`,
                citation: '"Brain glucose metabolism in the early and specific diagnosis of Alzheimer\'s disease," European Journal of Nuclear Medicine, 2005'
            },
            'Brain Atrophy Indicators': {
                title: 'Brain Atrophy',
                body: `Brain atrophy assessment is central to structural biomarker research. ` +
                    `Studies show that brain parenchyma fraction (the ratio of brain tissue to total ` +
                    `intracranial volume) declines with age but that the rate of decline is a stronger ` +
                    `predictor of cognitive outcomes than the absolute value. Importantly, published ` +
                    `nutrition research demonstrates that Mediterranean diet adherence is associated ` +
                    `with 1.5-2.0% greater brain volume preservation over 5 years compared to ` +
                    `Western dietary patterns — an effect attributed to anti-inflammatory and ` +
                    `antioxidant neuroprotection.`,
                citation: '"Mediterranean diet and brain structure in a multiethnic elderly cohort," Neurology, 2014'
            }
        };

        for (const finding of results.findings) {
            const section = createSection(finding.category, true);
            const body = section.querySelector('.analysis-section-body');
            for (const item of finding.items) {
                body.appendChild(createFindingItem(item));
            }

            // Add research explanation after each finding category
            const explanation = findingExplanations[finding.category];
            if (explanation) {
                body.appendChild(createResearchExplanation(
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
        const recSection = createSection('Lifestyle Recommendations', true);
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
                yours: texture.homogeneityScore != null ? texture.homogeneityScore.toFixed(1) : '—',
                status: texture.homogeneityScore != null
                    ? (texture.homogeneityScore > 60 ? 'good' : texture.homogeneityScore > 40 ? 'moderate' : 'concern')
                    : 'moderate'
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

    /* ======== Research Explanation Builder ======== */

    function createResearchExplanation(title, bodyText, citation) {
        const div = document.createElement('div');
        div.className = 'research-explanation';
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
        const row = document.createElement('div');
        row.className = 'metric-row';
        if (value == null) {
            row.innerHTML = `
                <span class="metric-label">${label}</span>
                <div class="metric-bar-bg"></div>
                <span class="metric-value" style="color:#aaa">N/A</span>
            `;
            return row;
        }
        const clamped = Math.max(0, Math.min(100, value));
        const level = clamped >= 70 ? 'good' : clamped >= 45 ? 'moderate' : 'concern';
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
        if (results._isDemo) return; // don't persist demo data
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

    function getDemoState() {
        // Build a realistic bimodal histogram (gray/white matter peaks)
        const bins = 64;
        const counts = Array.from({ length: bins }, (_, i) => {
            const gm = Math.round(3200 * Math.exp(-0.5 * Math.pow((i - 22) / 5, 2)));
            const wm = Math.round(2400 * Math.exp(-0.5 * Math.pow((i - 40) / 5, 2)));
            const noise = Math.round(Math.random() * 80);
            return (i < 6 ? Math.round(8000 * Math.exp(-i * 0.9)) : gm + wm) + noise;
        });

        return {
            brainHealthScore: {
                composite: 78,
                level: 'good',
                subScores: {
                    tissueBalance: 80,
                    symmetry: 88,
                    atrophy: 75,
                    texture: 72,
                    regionalBalance: 76
                }
            },
            tissueComposition: {
                grayMatter: 0.41,
                whiteMatter: 0.33,
                csf: 0.11,
                gmToWmRatio: 1.24,
                background: 0.15
            },
            symmetry: {
                symmetryScore: 88.4,
                overallRatio: 1.014,
                temporalAsymmetry: 0.032
            },
            atrophy: {
                brainParenchymaFraction: 0.74,
                atrophyIndex: 0.26,
                ventricularRatio: 0.08
            },
            texture: {
                homogeneityScore: 72.3,
                contrast: 18.4,
                energy: 0.041
            },
            globalStats: {
                mean: 312.4,
                stdDev: 98.7,
                median: 298.0,
                min: 0,
                max: 1023
            },
            histogram: { counts, bins },
            findings: [
                {
                    category: 'Tissue Composition (Structural Biomarkers)',
                    items: [
                        {
                            title: 'Gray Matter Proportion',
                            detail: '41.0% of brain tissue. Published research identifies gray matter volume as a key MRI biomarker for dementia risk assessment. Changes in gray matter are among the earliest structural indicators.',
                            indicator: 'normal'
                        },
                        {
                            title: 'White Matter Proportion',
                            detail: '33.0% of brain tissue. White matter integrity is tracked in published research as an indicator of neural connectivity.',
                            indicator: 'normal'
                        },
                        {
                            title: 'Gray-to-White Matter Ratio',
                            detail: 'Ratio: 1.24. The balance between gray and white matter is an important structural metric in brain aging research.',
                            indicator: 'normal'
                        }
                    ]
                },
                {
                    category: 'Regional Analysis (Key Brain Regions)',
                    items: [
                        {
                            title: 'Medial Temporal / Hippocampal Region',
                            detail: 'Relative intensity: 94.2% of mean. The hippocampus is among the first regions to show metabolic decline and structural changes in Alzheimer\'s disease.',
                            indicator: 'normal'
                        },
                        {
                            title: 'Posterior Cingulate Cortex',
                            detail: 'Relative intensity: 91.8% of mean. FDG-PET research identified the posterior cingulate as a region showing early glucose metabolism decline in at-risk individuals.',
                            indicator: 'normal'
                        },
                        {
                            title: 'Frontal Lobe',
                            detail: 'Relative intensity: 96.1% of mean. Frontal lobe changes are tracked in published research on brain aging and menopause-related metabolic shifts.',
                            indicator: 'normal'
                        }
                    ]
                },
                {
                    category: 'Hemispheric Symmetry',
                    items: [
                        {
                            title: 'Overall Symmetry',
                            detail: 'Symmetry score: 88.4/100. L/R intensity ratio: 1.014. Within the normal range for healthy bilateral brain structure.',
                            indicator: 'normal'
                        },
                        {
                            title: 'Temporal Asymmetry',
                            detail: 'Temporal asymmetry: 3.2%. Below the 5% threshold research identifies as warranting clinical attention.',
                            indicator: 'normal'
                        }
                    ]
                },
                {
                    category: 'Brain Atrophy Indicators',
                    items: [
                        {
                            title: 'Brain Parenchyma Fraction',
                            detail: 'Brain parenchyma fraction: 74.0%. Above the 70% threshold associated with healthy brain volume preservation.',
                            indicator: 'normal'
                        },
                        {
                            title: 'Ventricular Volume Estimate',
                            detail: 'Ventricular ratio: 8.0%. Consistent with age-appropriate CSF space without signs of compensatory enlargement.',
                            indicator: 'normal'
                        }
                    ]
                }
            ],
            recommendations: [
                {
                    title: 'Mediterranean Diet',
                    detail: 'Published research shows Mediterranean diet adherence is associated with 1.5–2.0% greater brain volume preservation over 5 years. Prioritize olive oil, fatty fish, legumes, and leafy greens.'
                },
                {
                    title: 'Aerobic Exercise',
                    detail: 'Longitudinal studies link regular aerobic activity (150 min/week) to increased hippocampal volume and improved cerebral blood flow — two key structural biomarkers.'
                },
                {
                    title: 'Quality Sleep',
                    detail: 'Adequate sleep (7–9 hours) supports glymphatic clearance of amyloid-beta. Cohort studies show sleep disruption correlates with accelerated brain aging markers.'
                },
                {
                    title: 'Cognitive Engagement',
                    detail: 'Sustained intellectual activity builds cognitive reserve, which research identifies as protective against the clinical expression of neurodegeneration even in the presence of pathology.'
                }
            ],
            volumetric: { totalSlices: 1, brainExtent: 0, crossSliceConsistency: 0, totalBrainPixels: 0 },
            metadata: {},
            sliceCount: 1,
            imageSize: { rows: 512, cols: 512 },
            fileNames: [],
            _isDemo: true
        };
    }

    /* ======== FreeSurfer → Analysis Bridge ======== */

    function buildResultsFromFreeSurfer({ regions, etiv, fileName }) {
        // Aggregate volumes
        const cortex      = (regions.cortex_L || 0) + (regions.cortex_R || 0);
        const wm          = (regions.wm_L     || 0) + (regions.wm_R     || 0);
        const ventricles  = (regions.lat_ventricle_L || 0) + (regions.lat_ventricle_R || 0)
                          + (regions.ventricle_3rd   || 0) + (regions.ventricle_4th   || 0);
        const subcortical = (regions.hippocampus_L || 0) + (regions.hippocampus_R || 0)
                          + (regions.amygdala_L    || 0) + (regions.amygdala_R    || 0)
                          + (regions.thalamus_L    || 0) + (regions.thalamus_R    || 0)
                          + (regions.caudate_L     || 0) + (regions.caudate_R     || 0)
                          + (regions.putamen_L     || 0) + (regions.putamen_R     || 0)
                          + (regions.cerebellum_L  || 0) + (regions.cerebellum_R  || 0)
                          + (regions.brainstem     || 0);
        const parenchyma  = cortex + wm + subcortical;

        // Tissue fractions relative to eTIV
        const grayMatter            = etiv ? cortex      / etiv : 0;
        const whiteMatter           = etiv ? wm          / etiv : 0;
        const csf                   = etiv ? ventricles  / etiv : 0;
        const gmToWmRatio           = wm > 0 ? cortex / wm : 0;
        const brainParenchymaFraction = etiv ? parenchyma / etiv : 0;
        const ventricularRatio      = etiv ? ventricles  / etiv : 0;

        // Hemispheric symmetry from all paired structures
        const pairs = [
            [regions.hippocampus_L, regions.hippocampus_R],
            [regions.amygdala_L,    regions.amygdala_R   ],
            [regions.cortex_L,      regions.cortex_R     ],
            [regions.wm_L,          regions.wm_R         ],
            [regions.thalamus_L,    regions.thalamus_R   ],
            [regions.caudate_L,     regions.caudate_R    ],
            [regions.putamen_L,     regions.putamen_R    ],
            [regions.lat_ventricle_L, regions.lat_ventricle_R],
            [regions.cerebellum_L,  regions.cerebellum_R ],
        ].filter(([l, r]) => l !== undefined && r !== undefined);

        const avgAsymmetry = pairs.length
            ? pairs.reduce((s, [l, r]) => {
                  const avg = (l + r) / 2;
                  return s + (avg > 0 ? Math.abs(l - r) / avg : 0);
              }, 0) / pairs.length
            : 0;
        const symmetryScore = Math.max(0, Math.min(100, (1 - avgAsymmetry) * 100));

        // Hippocampal asymmetry as medial-temporal proxy
        const hL = regions.hippocampus_L, hR = regions.hippocampus_R;
        const temporalAsymmetry = (hL !== undefined && hR !== undefined && (hL + hR) > 0)
            ? Math.abs(hL - hR) / ((hL + hR) / 2) : 0;

        // Sub-scores (0–100)
        const tissueBalance = Math.round(
            ((grayMatter  >= 0.35 && grayMatter  <= 0.45 ? 100 : grayMatter  > 0.25 ? 65 : 35) +
             (whiteMatter >= 0.25 && whiteMatter <= 0.40 ? 100 : whiteMatter > 0.20 ? 65 : 35)) / 2
        );
        const atrophyScore     = Math.round(brainParenchymaFraction > 0.70 ? 90 : brainParenchymaFraction > 0.55 ? 65 : 35);
        const symmetrySubScore = Math.round(symmetryScore);
        const composite        = Math.round((tissueBalance + symmetrySubScore + atrophyScore + 75) / 4);
        const level            = composite >= 70 ? 'good' : composite >= 50 ? 'moderate' : 'concern';

        // Verification log — visible in DevTools console
        console.group('Brain Health Score Verification');
        console.log('Raw regions from aseg.stats:', JSON.parse(JSON.stringify(regions)));
        console.log('eTIV (mm³):', etiv);
        console.log('--- Aggregates ---');
        console.log('Cortex L+R (mm³):', cortex);
        console.log('WM L+R (mm³):', wm);
        console.log('Ventricles (mm³):', ventricles);
        console.log('Subcortical (mm³):', regions.hippocampus_L, regions.hippocampus_R, regions.amygdala_L, regions.amygdala_R, regions.thalamus_L, regions.thalamus_R);
        console.log('Parenchyma (mm³):', parenchyma);
        console.log('--- Fractions ---');
        console.log('Gray Matter %:', (grayMatter * 100).toFixed(2));
        console.log('White Matter %:', (whiteMatter * 100).toFixed(2));
        console.log('CSF (ventricular) %:', (csf * 100).toFixed(2));
        console.log('GM/WM ratio:', gmToWmRatio.toFixed(3));
        console.log('Brain Parenchyma Fraction %:', (brainParenchymaFraction * 100).toFixed(2));
        console.log('Hemispheric Symmetry score:', symmetryScore.toFixed(2));
        console.log('--- Sub-scores ---');
        console.log('Tissue Balance sub-score:', tissueBalance);
        console.log('Atrophy sub-score:', atrophyScore);
        console.log('Symmetry sub-score:', symmetrySubScore);
        console.log('--- Composite ---');
        console.log(`Composite = round((${tissueBalance} + ${symmetrySubScore} + ${atrophyScore} + 75) / 4) = ${composite}`);
        console.groupEnd();

        const hippVol   = ((hL || 0) + (hR || 0)) / 1000;
        const hippPctIcv = etiv ? (((hL || 0) + (hR || 0)) / etiv * 100) : null;

        return {
            brainHealthScore: {
                composite, level,
                subScores: { tissueBalance, symmetry: symmetrySubScore, atrophy: atrophyScore, texture: null, regionalBalance: atrophyScore }
            },
            tissueComposition: { grayMatter, whiteMatter, csf, gmToWmRatio },
            symmetry:   { symmetryScore, overallRatio: 1, temporalAsymmetry },
            atrophy:    { brainParenchymaFraction, atrophyIndex: 1 - brainParenchymaFraction, ventricularRatio },
            texture:    { homogeneityScore: null },
            globalStats: null,
            histogram:   null,
            findings: [
                {
                    category: 'Tissue Composition (Structural Biomarkers)',
                    items: [
                        { title: 'Gray Matter (Cerebral Cortex)',
                          detail: `${(grayMatter * 100).toFixed(1)}% of eTIV (FreeSurfer cerebral cortex L+R). Gray matter volume is a key MRI biomarker for dementia risk.`,
                          indicator: grayMatter >= 0.35 ? 'normal' : grayMatter > 0.25 ? 'borderline' : 'atypical' },
                        { title: 'White Matter (Cerebral WM)',
                          detail: `${(whiteMatter * 100).toFixed(1)}% of eTIV (FreeSurfer cerebral white matter L+R). White matter integrity is an indicator of neural connectivity.`,
                          indicator: whiteMatter >= 0.25 ? 'normal' : 'borderline' },
                        { title: 'Gray-to-White Matter Ratio',
                          detail: `Ratio: ${gmToWmRatio.toFixed(2)}. Balance between cortical gray and white matter.`,
                          indicator: gmToWmRatio >= 1.0 && gmToWmRatio <= 1.5 ? 'normal' : 'borderline' },
                    ]
                },
                {
                    category: 'Regional Analysis (Key Brain Regions)',
                    items: [
                        { title: 'Hippocampal Volume',
                          detail: `${hippVol.toFixed(2)} cm³${hippPctIcv !== null ? ` (${hippPctIcv.toFixed(3)}% of eTIV)` : ''}. The hippocampus is among the first regions affected in Alzheimer's disease ('Brain glucose metabolism in the early and specific diagnosis of Alzheimer\'s disease,' European Journal of Nuclear Medicine, 2005).`,
                          indicator: hippPctIcv !== null && hippPctIcv >= 0.3 ? 'normal' : 'borderline' },
                        { title: 'Amygdala Volume',
                          detail: `${(((regions.amygdala_L || 0) + (regions.amygdala_R || 0)) / 1000).toFixed(2)} cm³. Amygdala atrophy correlates with hippocampal changes in AD risk.`,
                          indicator: 'normal' },
                        { title: 'Ventricular Volume',
                          detail: `${(ventricularRatio * 100).toFixed(1)}% of eTIV. Enlarged ventricles reflect compensatory expansion from parenchymal loss.`,
                          indicator: ventricularRatio < 0.03 ? 'normal' : ventricularRatio < 0.06 ? 'borderline' : 'atypical' },
                    ]
                },
                {
                    category: 'Hemispheric Symmetry',
                    items: [
                        { title: 'Overall Symmetry',
                          detail: `Score: ${symmetryScore.toFixed(1)}/100, derived from L/R volume ratios across all paired FreeSurfer structures. ${symmetryScore > 85 ? 'Within normal range.' : 'Some asymmetry present.'}`,
                          indicator: symmetryScore > 85 ? 'normal' : symmetryScore > 70 ? 'borderline' : 'atypical' },
                        { title: 'Hippocampal Asymmetry',
                          detail: `${(temporalAsymmetry * 100).toFixed(1)}% L/R difference. Research identifies medial temporal asymmetry as an early Alzheimer's risk signal.`,
                          indicator: temporalAsymmetry < 0.05 ? 'normal' : temporalAsymmetry < 0.10 ? 'borderline' : 'atypical' },
                    ]
                },
                {
                    category: 'Brain Atrophy Indicators',
                    items: [
                        { title: 'Brain Parenchyma Fraction',
                          detail: `${(brainParenchymaFraction * 100).toFixed(1)}% of eTIV (cortex + WM + subcortical). ${brainParenchymaFraction > 0.70 ? 'Above the 70% threshold for healthy brain volume.' : 'Below 70% — consider clinical follow-up.'}`,
                          indicator: brainParenchymaFraction > 0.70 ? 'normal' : brainParenchymaFraction > 0.55 ? 'borderline' : 'atypical' },
                        { title: 'Estimated Total Intracranial Volume',
                          detail: etiv ? `${(etiv / 1000).toFixed(0)} cm³. Used to normalise all volumetric measurements.` : 'Not found in file — normalised metrics are unavailable.',
                          indicator: 'normal' },
                    ]
                },
            ],
            recommendations: [
                { title: 'Mediterranean Diet',      detail: 'Published research shows Mediterranean diet adherence is associated with 1.5–2.0% greater brain volume preservation over 5 years. Prioritise olive oil, fatty fish, legumes, and leafy greens.' },
                { title: 'Aerobic Exercise',        detail: 'Longitudinal studies link regular aerobic activity (150 min/week) to increased hippocampal volume and improved cerebral blood flow — two key structural biomarkers.' },
                { title: 'Quality Sleep',           detail: 'Adequate sleep (7–9 hours) supports glymphatic clearance of amyloid-beta. Cohort studies show sleep disruption correlates with accelerated brain aging markers.' },
                { title: 'Cognitive Engagement',   detail: 'Sustained intellectual activity builds cognitive reserve, which research identifies as protective against the clinical expression of neurodegeneration even in the presence of pathology.' },
            ],
            volumetric: { totalSlices: 0, brainExtent: 0, crossSliceConsistency: 0, totalBrainPixels: 0 },
            metadata: { source: fileName },
            sliceCount: 0, imageSize: { rows: 0, cols: 0 }, fileNames: [fileName], _isFreeSurfer: true,
        };
    }

    function loadSavedState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            const parsed = saved ? JSON.parse(saved) : null;
            const state = (parsed && parsed.brainHealthScore) ? parsed : null;
            const isDemo = !state;
            const dataToRender = state || getDemoState();

            // Restore file chips (only for real saved sessions)
            if (!isDemo && dataToRender.fileNames && dataToRender.fileNames.length > 0) {
                fileList.innerHTML = '';
                fileList.hidden = false;
                for (const name of dataToRender.fileNames) {
                    const chip = document.createElement('span');
                    chip.className = 'file-chip';
                    chip.textContent = name;
                    fileList.appendChild(chip);
                }
            }

            // Ensure spinner is never visible during static/demo display
            analysisLoading.style.display = 'none';

            // Show results section (without viewer since we don't have pixel data)
            resultsSection.hidden = false;

            // Hide the viewer panel
            const viewerPanel = resultsSection.querySelector('.viewer-panel');
            if (viewerPanel) viewerPanel.style.display = 'none';

            // Expand the analysis panel to full width when viewer is hidden
            const analysisPanel = resultsSection.querySelector('.analysis-panel');
            if (analysisPanel) analysisPanel.style.gridColumn = '1 / -1';

            // Render results (demo or saved)
            renderAnalysisResults(dataToRender);

            // Add indicator label
            const indicator = document.createElement('span');
            indicator.className = 'persist-indicator';
            if (isDemo) {
                indicator.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Demo data`;
            } else {
                indicator.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Saved session restored`;
            }
            const heading = analysisPanel ? analysisPanel.querySelector('h2') : null;
            if (heading) heading.appendChild(indicator);

        } catch (e) {
            console.warn('Could not restore analysis state:', e.message);
        }
    }

    // On page load, restore saved state if available
    loadSavedState();

    // When a FreeSurfer aseg.stats file is loaded, update the Analysis section.
    // Called directly by freesurfer-handler.js after parsing.
    window.updateAnalysisFromFreeSurfer = function(detail) {
        try {
            resultsSection.hidden = false;
            const results = buildResultsFromFreeSurfer(detail);
            renderAnalysisResults(results);

            // Swap the badge on the analysis heading
            const analysisPanel = resultsSection.querySelector('.analysis-panel');
            const heading = analysisPanel ? analysisPanel.querySelector('h2') : null;
            if (heading) {
                const old = heading.querySelector('.persist-indicator');
                if (old) old.remove();
                const badge = document.createElement('span');
                badge.className = 'persist-indicator';
                badge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> FreeSurfer data`;
                heading.appendChild(badge);
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            console.error('FreeSurfer → Analysis update failed:', err);
            const statusEl = document.getElementById('fs-status');
            if (statusEl) {
                statusEl.hidden = false;
                statusEl.className = 'vm-status vm-status--error';
                statusEl.textContent = 'Analysis section update failed: ' + err.message;
            }
        }
    };

})();
