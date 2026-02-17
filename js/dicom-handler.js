/**
 * DICOM Handler Module
 * Parses DICOM files, extracts metadata and pixel data,
 * and renders brain MRI slices to canvas.
 */
const DicomHandler = (() => {
    'use strict';

    /** Parsed DICOM datasets keyed by filename */
    const datasets = new Map();

    /** Sorted filenames for slice navigation */
    let sortedFiles = [];

    /** Current rendering state */
    const state = {
        currentSlice: 0,
        windowCenter: 40,
        windowWidth: 400,
        inverted: false,
        rows: 0,
        cols: 0
    };

    /**
     * Parse a single DICOM file from an ArrayBuffer.
     * Returns an object with metadata and pixel data.
     */
    function parseFile(arrayBuffer, filename) {
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const rows = dataSet.uint16('x00280010') || 0;
        const cols = dataSet.uint16('x00280011') || 0;
        const bitsAllocated = dataSet.uint16('x00280100') || 16;
        const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
        const pixelRepresentation = dataSet.uint16('x00280103') || 0;
        const samplesPerPixel = dataSet.uint16('x00280002') || 1;
        const photometric = dataSet.string('x00280004') || 'MONOCHROME2';
        const rescaleSlope = parseFloat(dataSet.string('x00281053')) || 1;
        const rescaleIntercept = parseFloat(dataSet.string('x00281052')) || 0;
        const wc = parseFloat(dataSet.string('x00281050')) || 40;
        const ww = parseFloat(dataSet.string('x00281051')) || 400;

        // Extract pixel data
        const pixelDataElement = dataSet.elements.x7fe00010;
        let pixelData = null;
        let minVal = Infinity;
        let maxVal = -Infinity;

        if (pixelDataElement) {
            const pixelDataOffset = pixelDataElement.dataOffset;
            const pixelDataLength = pixelDataElement.length;

            if (bitsAllocated === 16) {
                if (pixelRepresentation === 1) {
                    pixelData = new Int16Array(
                        arrayBuffer, pixelDataOffset, pixelDataLength / 2
                    );
                } else {
                    pixelData = new Uint16Array(
                        arrayBuffer, pixelDataOffset, pixelDataLength / 2
                    );
                }
            } else if (bitsAllocated === 8) {
                pixelData = new Uint8Array(
                    arrayBuffer, pixelDataOffset, pixelDataLength
                );
            }

            // Apply rescale and find min/max
            if (pixelData) {
                for (let i = 0; i < pixelData.length; i++) {
                    const val = pixelData[i] * rescaleSlope + rescaleIntercept;
                    if (val < minVal) minVal = val;
                    if (val > maxVal) maxVal = val;
                }
            }
        }

        // Extract metadata
        const metadata = {
            patientName: cleanString(dataSet.string('x00100010')),
            patientId: cleanString(dataSet.string('x00100020')),
            patientBirthDate: formatDate(dataSet.string('x00100030')),
            patientSex: cleanString(dataSet.string('x00100040')),
            patientAge: cleanString(dataSet.string('x00101010')),
            studyDate: formatDate(dataSet.string('x00080020')),
            studyDescription: cleanString(dataSet.string('x00081030')),
            seriesDescription: cleanString(dataSet.string('x0008103e')),
            modality: cleanString(dataSet.string('x00080060')),
            manufacturer: cleanString(dataSet.string('x00080070')),
            institutionName: cleanString(dataSet.string('x00080080')),
            sliceThickness: cleanString(dataSet.string('x00180050')),
            spacingBetweenSlices: cleanString(dataSet.string('x00180088')),
            pixelSpacing: cleanString(dataSet.string('x00280030')),
            imagePosition: cleanString(dataSet.string('x00200032')),
            sliceLocation: parseFloat(dataSet.string('x00201041')) || 0,
            instanceNumber: dataSet.intString('x00200013') || 0,
            rows,
            cols,
            bitsAllocated,
            bitsStored,
            pixelRepresentation,
            samplesPerPixel,
            photometricInterpretation: photometric,
            rescaleSlope,
            rescaleIntercept,
            windowCenter: wc,
            windowWidth: ww
        };

        const entry = {
            dataSet,
            metadata,
            pixelData,
            rows,
            cols,
            minVal,
            maxVal,
            rescaleSlope,
            rescaleIntercept,
            bitsAllocated,
            photometric
        };

        datasets.set(filename, entry);
        return entry;
    }

    /**
     * Parse multiple DICOM files and sort them by slice location.
     */
    function parseFiles(fileArrayBuffers) {
        datasets.clear();
        const results = [];

        for (const { buffer, name } of fileArrayBuffers) {
            try {
                const entry = parseFile(buffer, name);
                results.push({ name, entry });
            } catch (err) {
                console.warn(`Failed to parse ${name}:`, err.message);
            }
        }

        // Sort by slice location or instance number
        sortedFiles = results
            .sort((a, b) => {
                const locA = a.entry.metadata.sliceLocation || a.entry.metadata.instanceNumber;
                const locB = b.entry.metadata.sliceLocation || b.entry.metadata.instanceNumber;
                return locA - locB;
            })
            .map(r => r.name);

        if (sortedFiles.length > 0) {
            const first = datasets.get(sortedFiles[0]);
            state.windowCenter = first.metadata.windowCenter;
            state.windowWidth = first.metadata.windowWidth;
            state.rows = first.rows;
            state.cols = first.cols;
            state.currentSlice = Math.floor(sortedFiles.length / 2);
        }

        return {
            fileCount: sortedFiles.length,
            sortedFiles,
            state: { ...state }
        };
    }

    /**
     * Render a slice to the given canvas.
     */
    function renderSlice(canvas, sliceIndex) {
        if (sliceIndex === undefined) sliceIndex = state.currentSlice;
        if (sliceIndex < 0 || sliceIndex >= sortedFiles.length) return;

        state.currentSlice = sliceIndex;
        const filename = sortedFiles[sliceIndex];
        const entry = datasets.get(filename);
        if (!entry || !entry.pixelData) return;

        const { pixelData, rows, cols, rescaleSlope, rescaleIntercept, photometric } = entry;

        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(cols, rows);
        const data = imageData.data;

        const wc = state.windowCenter;
        const ww = state.windowWidth;
        const lower = wc - ww / 2;
        const upper = wc + ww / 2;
        const invert = state.inverted;
        const isMono1 = photometric === 'MONOCHROME1';

        for (let i = 0; i < rows * cols; i++) {
            let raw = pixelData[i] * rescaleSlope + rescaleIntercept;

            // Apply windowing
            let mapped;
            if (raw <= lower) {
                mapped = 0;
            } else if (raw >= upper) {
                mapped = 255;
            } else {
                mapped = Math.round(((raw - lower) / ww) * 255);
            }

            // Handle MONOCHROME1 (inverted by default) and user inversion
            if (isMono1 !== invert) {
                mapped = 255 - mapped;
            }

            const idx = i * 4;
            data[idx] = mapped;
            data[idx + 1] = mapped;
            data[idx + 2] = mapped;
            data[idx + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Get all pixel data for the current dataset (all slices).
     * Returns an array of Float32Arrays with rescaled values.
     */
    function getAllPixelData() {
        const allData = [];
        for (const filename of sortedFiles) {
            const entry = datasets.get(filename);
            if (!entry || !entry.pixelData) continue;

            const { pixelData, rescaleSlope, rescaleIntercept, rows, cols } = entry;
            const rescaled = new Float32Array(rows * cols);
            for (let i = 0; i < pixelData.length; i++) {
                rescaled[i] = pixelData[i] * rescaleSlope + rescaleIntercept;
            }
            allData.push({
                data: rescaled,
                rows,
                cols,
                metadata: entry.metadata
            });
        }
        return allData;
    }

    /**
     * Get metadata for a specific slice.
     */
    function getMetadata(sliceIndex) {
        if (sliceIndex === undefined) sliceIndex = state.currentSlice;
        const filename = sortedFiles[sliceIndex];
        if (!filename) return null;
        return datasets.get(filename)?.metadata || null;
    }

    /**
     * Get pixel data for a single slice (rescaled).
     */
    function getSlicePixelData(sliceIndex) {
        if (sliceIndex === undefined) sliceIndex = state.currentSlice;
        const filename = sortedFiles[sliceIndex];
        if (!filename) return null;
        const entry = datasets.get(filename);
        if (!entry || !entry.pixelData) return null;

        const { pixelData, rescaleSlope, rescaleIntercept, rows, cols } = entry;
        const rescaled = new Float32Array(rows * cols);
        for (let i = 0; i < pixelData.length; i++) {
            rescaled[i] = pixelData[i] * rescaleSlope + rescaleIntercept;
        }
        return { data: rescaled, rows, cols };
    }

    /** Update windowing state */
    function setWindow(wc, ww) {
        state.windowCenter = wc;
        state.windowWidth = ww;
    }

    function setInverted(inverted) {
        state.inverted = inverted;
    }

    function getState() {
        return { ...state, totalSlices: sortedFiles.length };
    }

    function getDatasetCount() {
        return sortedFiles.length;
    }

    /* Helpers */
    function cleanString(str) {
        if (!str) return '';
        return str.replace(/\0/g, '').trim();
    }

    function formatDate(str) {
        if (!str || str.length < 8) return str || '';
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    }

    return {
        parseFiles,
        renderSlice,
        getAllPixelData,
        getSlicePixelData,
        getMetadata,
        setWindow,
        setInverted,
        getState,
        getDatasetCount
    };
})();
