/**
 * MRI Analysis Engine
 * Performs image-based brain analysis informed by published neuroscience research.
 *
 * Analysis areas:
 *   1. Tissue composition (gray matter, white matter, CSF)
 *   2. Regional intensity analysis (mapped to key brain regions)
 *   3. Hemispheric symmetry
 *   4. Brain parenchyma fraction (atrophy indicator)
 *   5. Intensity histogram characterization
 *   6. Texture / homogeneity metrics
 *   7. Composite brain health score
 *   8. Lifestyle recommendations from published nutrition research
 */
const AnalysisEngine = (() => {
    'use strict';

    /**
     * Run full analysis on all loaded slices.
     * @param {Array} allSliceData - Array of {data: Float32Array, rows, cols, metadata}
     * @returns {Object} Complete analysis results
     */
    function analyze(allSliceData) {
        if (!allSliceData || allSliceData.length === 0) {
            return { error: 'No image data available for analysis.' };
        }

        // Use the middle slice for primary 2D analysis
        const midIdx = Math.floor(allSliceData.length / 2);
        const primarySlice = allSliceData[midIdx];
        const metadata = primarySlice.metadata || {};

        // Collect all pixel values across slices for volumetric stats
        const allPixels = collectAllPixels(allSliceData);

        // Run analysis components
        const histogram = computeHistogram(allPixels);
        const globalStats = computeGlobalStats(allPixels);
        const tissueComposition = analyzeTissueComposition(allPixels, globalStats);
        const regionalAnalysis = analyzeRegions(primarySlice);
        const symmetry = analyzeSymmetry(primarySlice);
        const atrophy = analyzeAtrophyIndicators(allPixels, globalStats, tissueComposition);
        const texture = analyzeTexture(primarySlice);
        const volumetric = analyzeVolumetric(allSliceData, globalStats);

        // Composite score
        const brainHealthScore = computeBrainHealthScore(
            tissueComposition, symmetry, atrophy, texture, regionalAnalysis
        );

        // Generate brain health findings
        const findings = generateFindings(
            tissueComposition, regionalAnalysis, symmetry,
            atrophy, texture, brainHealthScore, metadata
        );

        // Lifestyle recommendations based on published research
        const recommendations = generateRecommendations(brainHealthScore, metadata);

        return {
            metadata,
            sliceCount: allSliceData.length,
            imageSize: { rows: primarySlice.rows, cols: primarySlice.cols },
            histogram,
            globalStats,
            tissueComposition,
            regionalAnalysis,
            symmetry,
            atrophy,
            texture,
            volumetric,
            brainHealthScore,
            findings,
            recommendations
        };
    }

    /* ======== Core Analysis Functions ======== */

    function collectAllPixels(sliceDataArray) {
        const arrays = sliceDataArray.map(s => s.data);
        const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            combined.set(arr, offset);
            offset += arr.length;
        }
        return combined;
    }

    function computeHistogram(pixels) {
        const bins = 256;
        const counts = new Uint32Array(bins);

        let min = Infinity, max = -Infinity;
        for (let i = 0; i < pixels.length; i++) {
            if (pixels[i] < min) min = pixels[i];
            if (pixels[i] > max) max = pixels[i];
        }

        const range = max - min || 1;
        for (let i = 0; i < pixels.length; i++) {
            const bin = Math.min(bins - 1, Math.floor(((pixels[i] - min) / range) * (bins - 1)));
            counts[bin]++;
        }

        return { counts: Array.from(counts), min, max, bins };
    }

    function computeGlobalStats(pixels) {
        let sum = 0, count = 0, min = Infinity, max = -Infinity;
        for (let i = 0; i < pixels.length; i++) {
            const v = pixels[i];
            sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
            count++;
        }
        const mean = sum / count;

        let varianceSum = 0;
        for (let i = 0; i < pixels.length; i++) {
            varianceSum += (pixels[i] - mean) ** 2;
        }
        const stdDev = Math.sqrt(varianceSum / count);

        // Percentiles
        const sorted = Float32Array.from(pixels).sort();
        const p5 = sorted[Math.floor(count * 0.05)];
        const p25 = sorted[Math.floor(count * 0.25)];
        const median = sorted[Math.floor(count * 0.5)];
        const p75 = sorted[Math.floor(count * 0.75)];
        const p95 = sorted[Math.floor(count * 0.95)];

        return { mean, stdDev, min, max, median, p5, p25, p75, p95, count };
    }

    /**
     * Tissue composition analysis.
     * Uses intensity-based thresholding informed by typical MRI tissue contrasts:
     *   - CSF: lowest intensities
     *   - Gray matter: mid-range intensities
     *   - White matter: higher intensities (in T1-weighted)
     *
     * Brain health research tracks gray matter volume and white matter integrity
     * as key dementia risk biomarkers.
     */
    function analyzeTissueComposition(pixels, stats) {
        // Adaptive thresholds based on histogram
        const csfThreshold = stats.p25;
        const gmLower = stats.p25;
        const gmUpper = stats.median + (stats.p75 - stats.median) * 0.3;
        const wmLower = gmUpper;
        // Anything above background but below CSF threshold is background

        let background = 0, csf = 0, grayMatter = 0, whiteMatter = 0;
        const bgThreshold = stats.p5 + (stats.p25 - stats.p5) * 0.2;

        for (let i = 0; i < pixels.length; i++) {
            const v = pixels[i];
            if (v <= bgThreshold) {
                background++;
            } else if (v <= csfThreshold) {
                csf++;
            } else if (v <= gmUpper) {
                grayMatter++;
            } else {
                whiteMatter++;
            }
        }

        const brain = csf + grayMatter + whiteMatter;
        const total = pixels.length;

        return {
            background: background / total,
            csf: brain > 0 ? csf / brain : 0,
            grayMatter: brain > 0 ? grayMatter / brain : 0,
            whiteMatter: brain > 0 ? whiteMatter / brain : 0,
            brainFraction: brain / total,
            gmToWmRatio: whiteMatter > 0 ? grayMatter / whiteMatter : 0,
            counts: { background, csf, grayMatter, whiteMatter, brain, total }
        };
    }

    /**
     * Regional intensity analysis.
     * Divides the image into regions mapped to key brain areas:
     *   - Frontal (top center)
     *   - Temporal left/right (mid sides)
     *   - Parietal (top sides)
     *   - Occipital (bottom center)
     *   - Central / deep structures (center — includes hippocampal region)
     */
    function analyzeRegions(slice) {
        const { data, rows, cols } = slice;

        // Define approximate regions on an axial slice
        const regions = {
            frontal: { label: 'Frontal Lobe', startRow: 0.05, endRow: 0.35, startCol: 0.25, endCol: 0.75 },
            parietalLeft: { label: 'Left Parietal', startRow: 0.1, endRow: 0.45, startCol: 0.05, endCol: 0.3 },
            parietalRight: { label: 'Right Parietal', startRow: 0.1, endRow: 0.45, startCol: 0.7, endCol: 0.95 },
            temporalLeft: { label: 'Left Temporal', startRow: 0.4, endRow: 0.7, startCol: 0.05, endCol: 0.25 },
            temporalRight: { label: 'Right Temporal', startRow: 0.4, endRow: 0.7, startCol: 0.75, endCol: 0.95 },
            occipital: { label: 'Occipital Lobe', startRow: 0.7, endRow: 0.95, startCol: 0.25, endCol: 0.75 },
            centralDeep: { label: 'Central / Deep Structures', startRow: 0.35, endRow: 0.65, startCol: 0.3, endCol: 0.7 },
            hippocampalArea: { label: 'Medial Temporal (Hippocampal Region)', startRow: 0.5, endRow: 0.7, startCol: 0.3, endCol: 0.7 },
            posteriorCingulate: { label: 'Posterior Cingulate Region', startRow: 0.55, endRow: 0.75, startCol: 0.4, endCol: 0.6 }
        };

        const results = {};
        for (const [key, region] of Object.entries(regions)) {
            const stats = computeRegionStats(data, rows, cols, region);
            results[key] = { ...region, ...stats };
        }

        // Compute relative intensity comparison
        const allMeans = Object.values(results).map(r => r.mean);
        const globalMean = allMeans.reduce((a, b) => a + b, 0) / allMeans.length;

        for (const key of Object.keys(results)) {
            results[key].relativeIntensity = results[key].mean / globalMean;
        }

        return results;
    }

    function computeRegionStats(data, rows, cols, region) {
        const r0 = Math.floor(region.startRow * rows);
        const r1 = Math.floor(region.endRow * rows);
        const c0 = Math.floor(region.startCol * cols);
        const c1 = Math.floor(region.endCol * cols);

        let sum = 0, count = 0, min = Infinity, max = -Infinity;
        const values = [];

        for (let r = r0; r < r1; r++) {
            for (let c = c0; c < c1; c++) {
                const v = data[r * cols + c];
                sum += v;
                if (v < min) min = v;
                if (v > max) max = v;
                values.push(v);
                count++;
            }
        }

        const mean = count > 0 ? sum / count : 0;
        let variance = 0;
        for (const v of values) {
            variance += (v - mean) ** 2;
        }
        const stdDev = count > 0 ? Math.sqrt(variance / count) : 0;
        const cv = mean > 0 ? stdDev / mean : 0; // coefficient of variation

        return { mean, stdDev, min, max, cv, pixelCount: count };
    }

    /**
     * Hemispheric symmetry analysis.
     * Published research examines bilateral brain changes.
     * Asymmetry can indicate lateralized pathology.
     */
    function analyzeSymmetry(slice) {
        const { data, rows, cols } = slice;
        const halfCol = Math.floor(cols / 2);

        let leftSum = 0, rightSum = 0, leftCount = 0, rightCount = 0;
        let diffSum = 0, diffCount = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < halfCol; c++) {
                const leftVal = data[r * cols + c];
                const rightVal = data[r * cols + (cols - 1 - c)];
                leftSum += leftVal;
                rightSum += rightVal;
                leftCount++;
                rightCount++;

                const maxPair = Math.max(Math.abs(leftVal), Math.abs(rightVal));
                if (maxPair > 0) {
                    diffSum += Math.abs(leftVal - rightVal) / maxPair;
                    diffCount++;
                }
            }
        }

        const leftMean = leftSum / leftCount;
        const rightMean = rightSum / rightCount;
        const asymmetryIndex = diffCount > 0 ? diffSum / diffCount : 0;
        const overallRatio = rightMean > 0 ? leftMean / rightMean : 1;

        // Regional symmetry (temporal lobes — key for hippocampal research)
        const temporalLeft = computeRegionStats(data, rows, cols,
            { startRow: 0.4, endRow: 0.7, startCol: 0.05, endCol: 0.3 });
        const temporalRight = computeRegionStats(data, rows, cols,
            { startRow: 0.4, endRow: 0.7, startCol: 0.7, endCol: 0.95 });
        const temporalAsymmetry = temporalRight.mean > 0
            ? Math.abs(temporalLeft.mean - temporalRight.mean) / temporalRight.mean
            : 0;

        return {
            leftMean,
            rightMean,
            asymmetryIndex,
            overallRatio,
            temporalAsymmetry,
            symmetryScore: Math.max(0, 1 - asymmetryIndex) * 100
        };
    }

    /**
     * Brain atrophy indicators.
     * Brain parenchyma fraction is a key measure in structural MRI research.
     * Lower BPF suggests greater atrophy, associated with cognitive decline risk.
     */
    function analyzeAtrophyIndicators(pixels, stats, tissue) {
        const brainParenchymaFraction = tissue.brainFraction;
        const gmWmRatio = tissue.gmToWmRatio;

        // Sulcal widening estimate: ratio of low-intensity (CSF) pixels in brain region
        const csfFraction = tissue.csf;

        // Ventricular enlargement proxy: large connected low-intensity central regions
        // We approximate this from CSF fraction
        const ventricularIndex = csfFraction;

        // Classification
        let atrophyLevel;
        if (brainParenchymaFraction > 0.7) atrophyLevel = 'minimal';
        else if (brainParenchymaFraction > 0.55) atrophyLevel = 'mild';
        else if (brainParenchymaFraction > 0.4) atrophyLevel = 'moderate';
        else atrophyLevel = 'notable';

        return {
            brainParenchymaFraction,
            gmWmRatio,
            csfFraction,
            ventricularIndex,
            atrophyLevel,
            atrophyScore: Math.min(100, brainParenchymaFraction * 120)
        };
    }

    /**
     * Texture analysis — local homogeneity and entropy.
     * Abnormal textures can indicate microstructural changes
     * in white matter (relevant to published white matter research).
     */
    function analyzeTexture(slice) {
        const { data, rows, cols } = slice;
        const blockSize = 8;
        const localVariances = [];
        let entropySum = 0;
        let blockCount = 0;

        for (let r = 0; r < rows - blockSize; r += blockSize) {
            for (let c = 0; c < cols - blockSize; c += blockSize) {
                let sum = 0, count = 0;
                for (let dr = 0; dr < blockSize; dr++) {
                    for (let dc = 0; dc < blockSize; dc++) {
                        sum += data[(r + dr) * cols + (c + dc)];
                        count++;
                    }
                }
                const mean = sum / count;

                let variance = 0;
                for (let dr = 0; dr < blockSize; dr++) {
                    for (let dc = 0; dc < blockSize; dc++) {
                        variance += (data[(r + dr) * cols + (c + dc)] - mean) ** 2;
                    }
                }
                variance /= count;

                if (mean > 0) {
                    localVariances.push(variance);
                    blockCount++;
                }
            }
        }

        // Compute entropy from histogram
        const hist = new Uint32Array(256);
        let total = 0, hMin = Infinity, hMax = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (data[i] < hMin) hMin = data[i];
            if (data[i] > hMax) hMax = data[i];
        }
        const range = hMax - hMin || 1;
        for (let i = 0; i < data.length; i++) {
            const bin = Math.min(255, Math.floor(((data[i] - hMin) / range) * 255));
            hist[bin]++;
            total++;
        }

        let entropy = 0;
        for (let i = 0; i < 256; i++) {
            if (hist[i] > 0) {
                const p = hist[i] / total;
                entropy -= p * Math.log2(p);
            }
        }

        const avgVariance = localVariances.length > 0
            ? localVariances.reduce((a, b) => a + b, 0) / localVariances.length
            : 0;

        // Variance of local variances — indicates heterogeneity
        let varOfVar = 0;
        for (const lv of localVariances) {
            varOfVar += (lv - avgVariance) ** 2;
        }
        varOfVar = localVariances.length > 0 ? Math.sqrt(varOfVar / localVariances.length) : 0;

        // Homogeneity score (higher = more homogeneous = typically healthier white matter)
        const maxEntropy = Math.log2(256); // ~8
        const homogeneityScore = Math.max(0, Math.min(100, (1 - entropy / maxEntropy) * 100));

        return {
            entropy,
            avgLocalVariance: avgVariance,
            varianceOfVariance: varOfVar,
            homogeneityScore,
            blockCount
        };
    }

    /**
     * Volumetric analysis across all slices.
     */
    function analyzeVolumetric(allSliceData, globalStats) {
        const sliceStats = allSliceData.map((slice, idx) => {
            let sum = 0, count = 0;
            const bgThreshold = globalStats.p5 + (globalStats.p25 - globalStats.p5) * 0.2;

            for (let i = 0; i < slice.data.length; i++) {
                if (slice.data[i] > bgThreshold) {
                    sum += slice.data[i];
                    count++;
                }
            }
            return {
                sliceIndex: idx,
                brainPixels: count,
                meanIntensity: count > 0 ? sum / count : 0,
                totalPixels: slice.data.length
            };
        });

        const totalBrainPixels = sliceStats.reduce((s, ss) => s + ss.brainPixels, 0);
        const maxBrainPixels = Math.max(...sliceStats.map(s => s.brainPixels));

        // Brain extent: fraction of slices with significant brain tissue
        const significantSlices = sliceStats.filter(s => s.brainPixels > maxBrainPixels * 0.2).length;
        const brainExtent = significantSlices / sliceStats.length;

        // Intensity consistency across slices
        const means = sliceStats.filter(s => s.brainPixels > 100).map(s => s.meanIntensity);
        const meanOfMeans = means.reduce((a, b) => a + b, 0) / means.length;
        let crossSliceVariance = 0;
        for (const m of means) {
            crossSliceVariance += (m - meanOfMeans) ** 2;
        }
        crossSliceVariance = Math.sqrt(crossSliceVariance / means.length);
        const crossSliceConsistency = meanOfMeans > 0
            ? Math.max(0, 100 - (crossSliceVariance / meanOfMeans) * 100)
            : 0;

        return {
            totalSlices: allSliceData.length,
            totalBrainPixels,
            brainExtent,
            crossSliceConsistency,
            sliceStats
        };
    }

    /* ======== Composite Score ======== */

    function computeBrainHealthScore(tissue, symmetry, atrophy, texture, regions) {
        // Weighted composite of normalized sub-scores
        const scores = {
            tissueBalance: normalizeTissueScore(tissue),
            symmetry: symmetry.symmetryScore,
            atrophy: atrophy.atrophyScore,
            texture: texture.homogeneityScore,
            regionalBalance: normalizeRegionalScore(regions)
        };

        const weights = {
            tissueBalance: 0.25,
            symmetry: 0.20,
            atrophy: 0.25,
            texture: 0.15,
            regionalBalance: 0.15
        };

        let composite = 0;
        for (const key of Object.keys(scores)) {
            composite += scores[key] * weights[key];
        }

        let level;
        if (composite >= 75) level = 'good';
        else if (composite >= 50) level = 'moderate';
        else level = 'concern';

        return {
            composite: Math.round(composite),
            level,
            subScores: scores,
            weights
        };
    }

    function normalizeTissueScore(tissue) {
        // Healthy GM/WM ratio is roughly 1.2-1.5 in adults
        const idealGmWm = 1.3;
        const gmWmDiff = Math.abs(tissue.gmToWmRatio - idealGmWm);
        const gmWmScore = Math.max(0, 100 - gmWmDiff * 50);

        // CSF fraction should be moderate (~10-15% of brain)
        const idealCsf = 0.12;
        const csfDiff = Math.abs(tissue.csf - idealCsf);
        const csfScore = Math.max(0, 100 - csfDiff * 300);

        return (gmWmScore * 0.6 + csfScore * 0.4);
    }

    function normalizeRegionalScore(regions) {
        // All regions should have similar relative intensity (close to 1.0)
        const relativeIntensities = Object.values(regions).map(r => r.relativeIntensity);
        let deviationSum = 0;
        for (const ri of relativeIntensities) {
            deviationSum += Math.abs(ri - 1.0);
        }
        const avgDeviation = deviationSum / relativeIntensities.length;
        return Math.max(0, 100 - avgDeviation * 200);
    }

    /* ======== Findings & Recommendations ======== */

    function generateFindings(tissue, regions, symmetry, atrophy, texture, score, metadata) {
        const findings = [];

        // Tissue composition
        findings.push({
            category: 'Tissue Composition (Structural Biomarkers)',
            items: [
                {
                    title: 'Gray Matter Proportion',
                    detail: `${(tissue.grayMatter * 100).toFixed(1)}% of brain tissue. ` +
                        `Published research identifies gray matter volume as a key MRI biomarker ` +
                        `for dementia risk assessment. Changes in gray matter are among the ` +
                        `earliest structural indicators.`,
                    indicator: tissue.grayMatter > 0.35 ? 'normal' :
                        tissue.grayMatter > 0.25 ? 'borderline' : 'atypical'
                },
                {
                    title: 'White Matter Proportion',
                    detail: `${(tissue.whiteMatter * 100).toFixed(1)}% of brain tissue. ` +
                        `White matter integrity is tracked in published research as an indicator of ` +
                        `neural connectivity. Reduced white matter PiB retention has been observed ` +
                        `in Alzheimer's research.`,
                    indicator: tissue.whiteMatter > 0.25 ? 'normal' :
                        tissue.whiteMatter > 0.15 ? 'borderline' : 'atypical'
                },
                {
                    title: 'Gray-to-White Matter Ratio',
                    detail: `Ratio: ${tissue.gmToWmRatio.toFixed(2)}. ` +
                        `The balance between gray and white matter is an important ` +
                        `structural metric in brain aging research.`,
                    indicator: (tissue.gmToWmRatio > 0.8 && tissue.gmToWmRatio < 2.0) ? 'normal' :
                        (tissue.gmToWmRatio > 0.5 && tissue.gmToWmRatio < 2.5) ? 'borderline' : 'atypical'
                }
            ]
        });

        // Regional analysis — key brain regions
        const hippocampal = regions.hippocampalArea;
        const posteriorCingulate = regions.posteriorCingulate;
        const frontal = regions.frontal;

        findings.push({
            category: 'Regional Analysis (Key Brain Regions)',
            items: [
                {
                    title: 'Medial Temporal / Hippocampal Region',
                    detail: `Relative intensity: ${(hippocampal.relativeIntensity * 100).toFixed(1)}% of mean. ` +
                        `The hippocampus is among the first regions to show metabolic decline and ` +
                        `structural changes in Alzheimer's disease. ` +
                        `Reduced hippocampal metabolism often precedes clinical symptoms.`,
                    indicator: hippocampal.relativeIntensity > 0.9 ? 'normal' :
                        hippocampal.relativeIntensity > 0.8 ? 'borderline' : 'atypical'
                },
                {
                    title: 'Posterior Cingulate Cortex',
                    detail: `Relative intensity: ${(posteriorCingulate.relativeIntensity * 100).toFixed(1)}% of mean. ` +
                        `FDG-PET research identified the posterior cingulate as a region ` +
                        `showing early glucose metabolism decline in at-risk individuals.`,
                    indicator: posteriorCingulate.relativeIntensity > 0.9 ? 'normal' :
                        posteriorCingulate.relativeIntensity > 0.8 ? 'borderline' : 'atypical'
                },
                {
                    title: 'Frontal Lobe',
                    detail: `Relative intensity: ${(frontal.relativeIntensity * 100).toFixed(1)}% of mean. ` +
                        `Frontal lobe changes are tracked in published research on ` +
                        `brain aging and menopause-related metabolic shifts.`,
                    indicator: frontal.relativeIntensity > 0.9 ? 'normal' :
                        frontal.relativeIntensity > 0.8 ? 'borderline' : 'atypical'
                }
            ]
        });

        // Symmetry
        findings.push({
            category: 'Hemispheric Symmetry',
            items: [
                {
                    title: 'Overall Symmetry',
                    detail: `Symmetry score: ${symmetry.symmetryScore.toFixed(1)}/100. ` +
                        `L/R intensity ratio: ${symmetry.overallRatio.toFixed(3)}. ` +
                        `Healthy brains show high bilateral symmetry. Significant asymmetry ` +
                        `may indicate lateralized pathological processes.`,
                    indicator: symmetry.symmetryScore > 85 ? 'normal' :
                        symmetry.symmetryScore > 70 ? 'borderline' : 'atypical'
                },
                {
                    title: 'Temporal Lobe Symmetry',
                    detail: `Asymmetry index: ${(symmetry.temporalAsymmetry * 100).toFixed(1)}%. ` +
                        `Temporal lobe asymmetry is particularly relevant to published research ` +
                        `on medial temporal lobe and entorhinal cortex changes in early AD.`,
                    indicator: symmetry.temporalAsymmetry < 0.05 ? 'normal' :
                        symmetry.temporalAsymmetry < 0.10 ? 'borderline' : 'atypical'
                }
            ]
        });

        // Atrophy
        findings.push({
            category: 'Brain Atrophy Indicators',
            items: [
                {
                    title: 'Brain Parenchyma Fraction',
                    detail: `${(atrophy.brainParenchymaFraction * 100).toFixed(1)}%. ` +
                        `This measures the ratio of brain tissue to total intracranial volume. ` +
                        `Published research links reduced brain parenchyma to increased dementia risk. ` +
                        `Mediterranean diet adherence has been associated with preserved brain volume.`,
                    indicator: atrophy.atrophyLevel === 'minimal' ? 'normal' :
                        atrophy.atrophyLevel === 'mild' ? 'borderline' : 'atypical'
                },
                {
                    title: 'CSF Proportion',
                    detail: `${(atrophy.csfFraction * 100).toFixed(1)}% of brain region. ` +
                        `Increased CSF space can indicate ventricular enlargement or ` +
                        `sulcal widening, both markers of brain atrophy.`,
                    indicator: atrophy.csfFraction < 0.15 ? 'normal' :
                        atrophy.csfFraction < 0.25 ? 'borderline' : 'atypical'
                }
            ]
        });

        // Texture / white matter
        findings.push({
            category: 'White Matter Characterization',
            items: [
                {
                    title: 'Tissue Homogeneity',
                    detail: `Score: ${texture.homogeneityScore.toFixed(1)}/100 (entropy: ${texture.entropy.toFixed(2)} bits). ` +
                        `Higher homogeneity in white matter regions suggests better microstructural ` +
                        `integrity. Published research tracks white matter lesions and their ` +
                        `correlation with cognitive outcomes.`,
                    indicator: texture.homogeneityScore > 60 ? 'normal' :
                        texture.homogeneityScore > 40 ? 'borderline' : 'atypical'
                }
            ]
        });

        // Sex-specific context if available
        if (metadata.patientSex) {
            const sex = metadata.patientSex.toUpperCase();
            if (sex === 'F') {
                findings.push({
                    category: 'Sex-Specific Context (Women\'s Brain Research)',
                    items: [
                        {
                            title: 'Women\'s Brain Health Context',
                            detail: `Research at the Women's Brain Initiative has demonstrated ` +
                                `that the menopause transition is associated with significant changes in ` +
                                `brain structure, connectivity, energy metabolism, and amyloid-β deposition. ` +
                                `These findings suggest the perimenopause-to-menopause transition represents ` +
                                `a critical window for Alzheimer's risk and potential intervention.`,
                            indicator: 'normal'
                        }
                    ]
                });
            }
        }

        return findings;
    }

    function generateRecommendations(score, metadata) {
        // Based on published nutrition and lifestyle research
        const recommendations = [
            {
                title: 'Mediterranean Diet',
                detail: 'Strong associations exist between Mediterranean diet ' +
                    'adherence and reduced brain atrophy, lower amyloid biomarker burden, and preserved ' +
                    'brain glucose metabolism. Key components include vegetables, fruits, legumes, whole grains, ' +
                    'fish, and olive oil.'
            },
            {
                title: 'Antioxidant-Rich Foods',
                detail: 'Research links higher dietary antioxidant intake with lower Alzheimer\'s biomarker ' +
                    'levels. Berries, leafy greens, nuts, and seeds are particularly beneficial.'
            },
            {
                title: 'Physical Activity',
                detail: 'Regular aerobic exercise is associated with preserved brain volume and improved ' +
                    'cerebral blood flow in published brain health research.'
            },
            {
                title: 'Cognitive Engagement',
                detail: 'Continued intellectual stimulation and social engagement are associated with ' +
                    'cognitive reserve, a protective factor identified across multiple dementia prevention studies.'
            },
            {
                title: 'Sleep Quality',
                detail: 'Sleep disturbances are linked to increased amyloid-β accumulation. Prioritizing ' +
                    '7-9 hours of quality sleep supports brain waste clearance mechanisms.'
            }
        ];

        if (score.level === 'concern') {
            recommendations.unshift({
                title: 'Clinical Consultation Recommended',
                detail: 'The analysis indicators suggest patterns that warrant professional neurological ' +
                    'evaluation. Consider discussing these findings with your physician and requesting ' +
                    'a comprehensive neurocognitive assessment.'
            });
        }

        if (metadata.patientSex && metadata.patientSex.toUpperCase() === 'F') {
            recommendations.push({
                title: 'Hormone Health Monitoring',
                detail: 'Published research highlights the importance of monitoring hormonal changes, ' +
                    'particularly during perimenopause. Discuss brain-protective strategies with your ' +
                    'healthcare provider during hormonal transitions.'
            });
        }

        if (metadata.patientAge) {
            const age = parseInt(metadata.patientAge);
            if (age >= 40) {
                recommendations.push({
                    title: 'Baseline Brain Imaging',
                    detail: 'Published research supports establishing baseline brain imaging in midlife. ' +
                        'Serial comparisons over time can detect subtle changes earlier than single-timepoint analysis.'
                });
            }
        }

        return recommendations;
    }

    return { analyze };
})();
