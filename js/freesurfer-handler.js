/**
 * FreeSurfer aseg.stats → Volumetrics Dashboard
 * -----------------------------------------------
 * Parses a FreeSurfer aseg.stats file entirely in the browser and feeds the
 * resulting rows directly into VolumetricsDashboard.ingestRows().
 *
 * Mirrors the logic in convert_freesurfer.py (STRUCT_MAP) and
 * brain_metrics/regions.py (ROI_DEFINITIONS + composites).
 *
 * Accepted file: the aseg.stats produced by FreeSurfer recon-all, typically
 * found at  <subject>/stats/aseg.stats  inside a brainlife.io download.
 */
const FreeSurferHandler = (() => {
    'use strict';

    // ── FreeSurfer StructName → internal ROI key ──────────────────────────
    // Must align with the bilateral keys in ROI_DEFINITIONS below.
    const STRUCT_MAP = {
        'Left-Hippocampus':           'hippocampus_L',
        'Right-Hippocampus':          'hippocampus_R',
        'Left-Amygdala':              'amygdala_L',
        'Right-Amygdala':             'amygdala_R',
        'Left-Cerebral-Cortex':       'cortex_L',
        'Right-Cerebral-Cortex':      'cortex_R',
        'Left-Cerebral-White-Matter': 'wm_L',
        'Right-Cerebral-White-Matter':'wm_R',
        'Left-Thalamus':              'thalamus_L',
        'Right-Thalamus':             'thalamus_R',
        'Left-Thalamus-Proper':       'thalamus_L',   // older FreeSurfer
        'Right-Thalamus-Proper':      'thalamus_R',
        'Left-Caudate':               'caudate_L',
        'Right-Caudate':              'caudate_R',
        'Left-Putamen':               'putamen_L',
        'Right-Putamen':              'putamen_R',
        'Left-Lateral-Ventricle':     'lat_ventricle_L',
        'Right-Lateral-Ventricle':    'lat_ventricle_R',
        '3rd-Ventricle':              'ventricle_3rd',
        '4th-Ventricle':              'ventricle_4th',
        'Left-Cerebellum-Cortex':     'cerebellum_L',
        'Right-Cerebellum-Cortex':    'cerebellum_R',
        'Brain-Stem':                 'brainstem',
    };

    // ── ROI definitions (mirrors brain_metrics/regions.py) ────────────────
    // sumOf entries are computed after bilateral values are collected.
    const ROI_DEFINITIONS = {
        hippocampus_L:      { system: 'limbic',      label: 'Hippocampus (L)' },
        hippocampus_R:      { system: 'limbic',      label: 'Hippocampus (R)' },
        hippocampus:        { sumOf: ['hippocampus_L', 'hippocampus_R'],
                              system: 'limbic',      label: 'Hippocampus (L+R)' },

        amygdala_L:         { system: 'limbic',      label: 'Amygdala (L)' },
        amygdala_R:         { system: 'limbic',      label: 'Amygdala (R)' },
        amygdala:           { sumOf: ['amygdala_L', 'amygdala_R'],
                              system: 'limbic',      label: 'Amygdala (L+R)' },

        cortex_L:           { system: 'cortical',    label: 'Cerebral Cortex (L)' },
        cortex_R:           { system: 'cortical',    label: 'Cerebral Cortex (R)' },
        cortex:             { sumOf: ['cortex_L', 'cortex_R'],
                              system: 'cortical',    label: 'Cerebral Cortex (L+R)' },

        wm_L:               { system: 'cortical',    label: 'Cerebral WM (L)' },
        wm_R:               { system: 'cortical',    label: 'Cerebral WM (R)' },
        white_matter:       { sumOf: ['wm_L', 'wm_R'],
                              system: 'cortical',    label: 'Cerebral WM (L+R)' },

        thalamus_L:         { system: 'subcortical', label: 'Thalamus (L)' },
        thalamus_R:         { system: 'subcortical', label: 'Thalamus (R)' },
        thalamus:           { sumOf: ['thalamus_L', 'thalamus_R'],
                              system: 'subcortical', label: 'Thalamus (L+R)' },

        caudate_L:          { system: 'subcortical', label: 'Caudate (L)' },
        caudate_R:          { system: 'subcortical', label: 'Caudate (R)' },
        caudate:            { sumOf: ['caudate_L', 'caudate_R'],
                              system: 'subcortical', label: 'Caudate (L+R)' },

        putamen_L:          { system: 'subcortical', label: 'Putamen (L)' },
        putamen_R:          { system: 'subcortical', label: 'Putamen (R)' },
        putamen:            { sumOf: ['putamen_L', 'putamen_R'],
                              system: 'subcortical', label: 'Putamen (L+R)' },

        lat_ventricle_L:    { system: 'ventricular', label: 'Lateral Ventricle (L)' },
        lat_ventricle_R:    { system: 'ventricular', label: 'Lateral Ventricle (R)' },
        lateral_ventricles: { sumOf: ['lat_ventricle_L', 'lat_ventricle_R'],
                              system: 'ventricular', label: 'Lateral Ventricles (L+R)' },

        ventricle_3rd:      { system: 'ventricular', label: '3rd Ventricle' },
        ventricle_4th:      { system: 'ventricular', label: '4th Ventricle' },

        cerebellum_L:       { system: 'cerebellar',  label: 'Cerebellar Cortex (L)' },
        cerebellum_R:       { system: 'cerebellar',  label: 'Cerebellar Cortex (R)' },
        cerebellum:         { sumOf: ['cerebellum_L', 'cerebellum_R'],
                              system: 'cerebellar',  label: 'Cerebellar Cortex (L+R)' },

        brainstem:          { system: 'brainstem',   label: 'Brainstem' },
    };

    // ── aseg.stats parser ─────────────────────────────────────────────────
    /**
     * Parse raw text of an aseg.stats file.
     * Returns { regions: {roiKey: volumeMm3}, etiv: number|null }.
     */
    function parseAsegStats(text) {
        const regions = {};
        let etiv = null;

        for (const rawLine of text.split('\n')) {
            const line = rawLine.trimEnd();

            if (line.startsWith('#')) {
                // e.g. # Measure EstimatedTotalIntraCranialVol, eTIV, ..., 1456789.0, mm^3
                const m = line.match(
                    /Measure\s+EstimatedTotalIntraCranialVol[^,]*,[^,]*,\s*[^,]*,\s*([\d.]+)\s*,\s*mm/i
                );
                if (m) etiv = parseFloat(m[1]);
                continue;
            }

            // Data rows: Index SegId NVoxels Volume_mm3 StructName ...
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;

            const volumeMm3 = parseFloat(parts[3]);
            if (isNaN(volumeMm3)) continue;

            const structName = parts[4];
            const roiKey = STRUCT_MAP[structName];
            if (roiKey) regions[roiKey] = volumeMm3;
        }

        return { regions, etiv };
    }

    // ── Metrics computation ───────────────────────────────────────────────
    /**
     * Resolve composite (sumOf) ROIs then build dashboard rows.
     * Row format matches brain_metrics_summary.csv:
     *   subject, roi, label, system, volume_mm3, volume_cm3, volume_pct_icv, icv_mm3
     */
    function computeRows(regions, etiv, subject) {
        // Resolve composites
        const vols = { ...regions };
        for (const [roiKey, defn] of Object.entries(ROI_DEFINITIONS)) {
            if (!defn.sumOf) continue;
            const total = defn.sumOf.reduce((acc, k) => acc + (vols[k] || 0), 0);
            if (defn.sumOf.some(k => vols[k] !== undefined)) {
                vols[roiKey] = total;
            }
        }

        const rows = [];
        for (const [roiKey, defn] of Object.entries(ROI_DEFINITIONS)) {
            const vol = vols[roiKey];
            if (vol === undefined) continue;

            rows.push({
                subject,
                roi:            roiKey,
                label:          defn.label,
                system:         defn.system,
                volume_mm3:     vol,
                volume_cm3:     vol / 1000,
                volume_pct_icv: etiv ? (vol / etiv) * 100 : '',
                icv_mm3:        etiv || '',
            });
        }

        return rows;
    }

    // ── File handler ──────────────────────────────────────────────────────
    function handleFile(file) {
        const statusEl = document.getElementById('fs-status');

        function showStatus(msg, isError) {
            if (!statusEl) return;
            statusEl.hidden  = false;
            statusEl.textContent = msg;
            statusEl.className = isError ? 'vm-status vm-status--error' : 'vm-status vm-status--loading';
        }

        showStatus('Parsing ' + file.name + ' …', false);

        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result;
            const { regions, etiv } = parseAsegStats(text);

            if (!Object.keys(regions).length) {
                showStatus(
                    'No recognized regions found. Make sure you are uploading a FreeSurfer aseg.stats file.',
                    true
                );
                return;
            }

            if (!etiv) {
                console.warn('FreeSurferHandler: eTIV not found — ICV-normalised metrics unavailable.');
            }

            // Subject label = parent folder name or filename without extension
            const subject = file.name.replace(/\.stats$/i, '') || 'subject';
            const rows    = computeRows(regions, etiv, subject);

            const regionCount = Object.keys(regions).length;
            const etivNote = etiv ? `, eTIV ${(etiv / 1000).toFixed(0)} cm³` : '';
            showStatus(`✓ Loaded ${file.name} — ${regionCount} regions parsed${etivNote}. Dashboard updated.`, false);
            if (statusEl) statusEl.className = 'vm-status vm-status--success';

            if (typeof VolumetricsDashboard !== 'undefined' && VolumetricsDashboard.ingestRows) {
                VolumetricsDashboard.ingestRows(rows, file.name);
            } else {
                console.error('FreeSurferHandler: VolumetricsDashboard.ingestRows not available.');
            }

            document.dispatchEvent(new CustomEvent('freesurfer-data', {
                detail: { regions, etiv, fileName: file.name }
            }));
        };

        reader.onerror = () => showStatus('Failed to read file.', true);
        reader.readAsText(file);
    }

    // ── Init ──────────────────────────────────────────────────────────────
    function init() {
        const input = document.getElementById('fs-stats-input');
        if (!input) return;
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (file) handleFile(file);
            // Reset so the same file can be re-uploaded if needed
            input.value = '';
        });
    }

    return { init };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', FreeSurferHandler.init);
} else {
    FreeSurferHandler.init();
}
