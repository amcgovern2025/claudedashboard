/**
 * Volumetrics Dashboard
 * ---------------------
 * Loads brain_metrics_summary.csv produced by the brain_metrics Python module,
 * renders metric cards, a sortable table, and the summary plot PNG.
 *
 * Loading strategy (in order):
 *   1. fetch('brain_metrics_summary.csv') — works automatically on GitHub Pages
 *      when the file is committed to the repo root.
 *   2. If fetch fails (file:// protocol or file not committed yet) →
 *      show demo data with a "DEMO" banner + manual file-upload controls.
 *   3. User can always override by uploading local files via the load controls.
 */
const VolumetricsDashboard = (() => {
    'use strict';

    // ── System colours (must match brain_metrics/regions.py) ─────────────
    const SYSTEM_COLORS = {
        limbic:      '#4C72B0',
        cortical:    '#55A868',
        subcortical: '#C44E52',
        ventricular: '#8172B2',
        cerebellar:  '#CCB974',
        brainstem:   '#64B5CD',
        other:       '#999999',
    };

    // ROI keys shown as highlight cards (bilateral totals, in display order)
    const CARD_ROIS = [
        'hippocampus', 'amygdala', 'thalamus', 'caudate',
        'lateral_ventricles', 'cortex', 'white_matter', 'brainstem',
    ];

    // ── Bundled demo data ─────────────────────────────────────────────────
    // Realistic adult brain volumes. Used when no CSV file is available.
    const DEMO_CSV = [
        'subject,roi,label,system,volume_mm3,volume_cm3,volume_pct_icv,icv_mm3',
        'demo_T1.nii.gz,hippocampus,Hippocampus (L+R),limbic,7534.12,7.5341,0.5120,1471082.33',
        'demo_T1.nii.gz,amygdala,Amygdala (L+R),limbic,3812.44,3.8124,0.2592,1471082.33',
        'demo_T1.nii.gz,thalamus,Thalamus (L+R),subcortical,14233.67,14.2337,0.9675,1471082.33',
        'demo_T1.nii.gz,caudate,Caudate (L+R),subcortical,7018.92,7.0189,0.4771,1471082.33',
        'demo_T1.nii.gz,putamen,Putamen (L+R),subcortical,10447.31,10.4473,0.7102,1471082.33',
        'demo_T1.nii.gz,cortex,Cerebral Cortex (L+R),cortical,449823.45,449.8234,30.5785,1471082.33',
        'demo_T1.nii.gz,white_matter,Cerebral WM (L+R),cortical,448234.11,448.2341,30.4703,1471082.33',
        'demo_T1.nii.gz,lateral_ventricles,Lateral Ventricles (L+R),ventricular,24812.67,24.8127,1.6867,1471082.33',
        'demo_T1.nii.gz,ventricle_3rd,3rd Ventricle,ventricular,1234.56,1.2346,0.0840,1471082.33',
        'demo_T1.nii.gz,ventricle_4th,4th Ventricle,ventricular,1876.43,1.8764,0.1276,1471082.33',
        'demo_T1.nii.gz,cerebellum,Cerebellar Cortex (L+R),cerebellar,119234.78,119.2348,8.1053,1471082.33',
        'demo_T1.nii.gz,brainstem,Brainstem,brainstem,20134.89,20.1349,1.3687,1471082.33',
    ].join('\n');

    // ── State ─────────────────────────────────────────────────────────────
    let allRows       = [];
    let subjects      = [];
    let currentSubject = null;
    let sortState     = { col: null, asc: true };
    let isDemo        = false;

    // ── DOM references (set in init) ──────────────────────────────────────
    let els = {};

    // ── CSV parser ────────────────────────────────────────────────────────
    /**
     * Parse a CSV string into an array of plain objects.
     * Handles quoted fields (RFC 4180 subset). Numbers are coerced to float.
     */
    function parseCSV(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
        if (lines.length < 2) return [];

        const headers = splitCSVLine(lines[0]);

        return lines.slice(1).filter(l => l.trim()).map(line => {
            const vals = splitCSVLine(line);
            const obj  = {};
            headers.forEach((h, i) => {
                const v = vals[i] !== undefined ? vals[i] : '';
                obj[h] = isNaN(v) || v === '' ? v : parseFloat(v);
            });
            return obj;
        });
    }

    function splitCSVLine(line) {
        const fields = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === ',' && !inQ) {
                fields.push(cur.trim()); cur = '';
            } else {
                cur += ch;
            }
        }
        fields.push(cur.trim());
        return fields;
    }

    // ── Fetch helpers ─────────────────────────────────────────────────────
    async function tryFetchText(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            return await r.text();
        } catch { return null; }
    }

    async function tryFetchBlob(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            return URL.createObjectURL(await r.blob());
        } catch { return null; }
    }

    // ── Data loading ──────────────────────────────────────────────────────

    /**
     * Reconstruct a regions map from dashboard rows and fire renderVolumetricAnalysis.
     * Used so that demo data and CSV uploads also show the Mosconi composite analysis.
     * When only bilateral rows are present (e.g. demo CSV), L/R are split 50/50 so
     * asymmetry shows as 0% — the score still reflects GM, WM, BPF, and CSF values.
     */
    function triggerMosconiAnalysis(rows) {
        if (!window.AppController || !window.AppController.renderVolumetricAnalysis) return;

        const byRoi = {};
        let etiv = null;
        for (const r of rows) {
            byRoi[r.roi] = r.volume_mm3;
            if (!etiv && r.icv_mm3) etiv = r.icv_mm3;
        }

        const regions = {};
        // Bilateral pairs: [leftKey, rightKey, bilateralKey]
        const pairs = [
            ['hippocampus_L',   'hippocampus_R',   'hippocampus'],
            ['amygdala_L',      'amygdala_R',      'amygdala'],
            ['cortex_L',        'cortex_R',        'cortex'],
            ['wm_L',            'wm_R',            'white_matter'],
            ['thalamus_L',      'thalamus_R',      'thalamus'],
            ['caudate_L',       'caudate_R',       'caudate'],
            ['putamen_L',       'putamen_R',       'putamen'],
            ['lat_ventricle_L', 'lat_ventricle_R', 'lateral_ventricles'],
            ['cerebellum_L',    'cerebellum_R',    'cerebellum'],
        ];
        for (const [lKey, rKey, bilKey] of pairs) {
            if (byRoi[lKey] !== undefined) regions[lKey] = byRoi[lKey];
            if (byRoi[rKey] !== undefined) regions[rKey] = byRoi[rKey];
            // Fall back to 50/50 bilateral split when individual sides are absent
            if (!regions[lKey] && !regions[rKey] && byRoi[bilKey] !== undefined) {
                regions[lKey] = byRoi[bilKey] / 2;
                regions[rKey] = byRoi[bilKey] / 2;
            }
        }
        if (byRoi.ventricle_3rd !== undefined) regions.ventricle_3rd = byRoi.ventricle_3rd;
        if (byRoi.ventricle_4th !== undefined) regions.ventricle_4th = byRoi.ventricle_4th;
        if (byRoi.brainstem    !== undefined) regions.brainstem      = byRoi.brainstem;

        window.AppController.renderVolumetricAnalysis(regions, etiv, {});
    }

    function ingestCSV(text, sourceLabel) {
        const parsed = parseCSV(text);
        if (!parsed.length) {
            setStatus('error', 'CSV parsed to zero rows — check the file format.');
            return;
        }

        allRows = parsed;
        subjects = [...new Set(parsed.map(r => r.subject))];
        currentSubject = subjects[0];
        isDemo = (sourceLabel === 'demo');

        setStatus(null);
        buildSubjectBar();
        els.demoBanner.hidden = !isDemo;
        els.sourceBadge.textContent = sourceLabel;
        els.sourceBadge.hidden = false;
        els.sourceBadge.className = 'vm-source-badge vm-source-' + (isDemo ? 'demo' : 'live');

        renderDashboard(currentSubject);
        triggerMosconiAnalysis(allRows.filter(r => r.subject === currentSubject));
    }

    function ingestPlot(url) {
        els.plotImg.src    = url;
        els.plotWrapper.hidden = false;
    }

    // ── Rendering ─────────────────────────────────────────────────────────
    function renderDashboard(subject) {
        currentSubject = subject;
        const rows = allRows.filter(r => r.subject === subject);

        renderCards(rows);
        renderTable(rows);

        els.cards.hidden       = false;
        els.tableWrapper.hidden = false;
    }

    function renderCards(rows) {
        const byRoi = Object.fromEntries(rows.map(r => [r.roi, r]));
        els.cards.innerHTML = '';

        // ICV card (special)
        const icvVal = rows.length ? rows[0].icv_mm3 : null;
        if (icvVal) {
            els.cards.appendChild(makeCard({
                systemColor: '#1a5276',
                label: 'Total ICV',
                primaryVal: (icvVal / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 }),
                primaryUnit: 'cm³',
                secondaryLine: 'Intracranial reference volume',
                isICV: true,
            }));
        }

        // ROI cards
        for (const roi of CARD_ROIS) {
            const row = byRoi[roi];
            if (!row) continue;

            els.cards.appendChild(makeCard({
                systemColor: SYSTEM_COLORS[row.system] || SYSTEM_COLORS.other,
                label: row.label,
                primaryVal: typeof row.volume_cm3 === 'number'
                    ? row.volume_cm3.toFixed(2) : '—',
                primaryUnit: 'cm³',
                secondaryLine: typeof row.volume_pct_icv === 'number'
                    ? row.volume_pct_icv.toFixed(3) + ' % ICV' : '',
                pctICV: typeof row.volume_pct_icv === 'number' ? row.volume_pct_icv : null,
            }));
        }
    }

    function makeCard({ systemColor, label, primaryVal, primaryUnit, secondaryLine, isICV, pctICV }) {
        const card = document.createElement('div');
        card.className = 'vm-card' + (isICV ? ' vm-card--icv' : '');

        // Coloured top stripe
        const stripe = document.createElement('div');
        stripe.className = 'vm-card-stripe';
        stripe.style.background = systemColor;
        card.appendChild(stripe);

        const body = document.createElement('div');
        body.className = 'vm-card-body';

        const lbl = document.createElement('div');
        lbl.className = 'vm-card-label';
        lbl.textContent = label;
        body.appendChild(lbl);

        const valRow = document.createElement('div');
        valRow.className = 'vm-card-valrow';

        const val = document.createElement('span');
        val.className = 'vm-card-value';
        val.textContent = primaryVal;
        valRow.appendChild(val);

        const unit = document.createElement('span');
        unit.className = 'vm-card-unit';
        unit.textContent = primaryUnit;
        valRow.appendChild(unit);
        body.appendChild(valRow);

        if (secondaryLine) {
            const sub = document.createElement('div');
            sub.className = 'vm-card-sub';
            sub.textContent = secondaryLine;
            body.appendChild(sub);
        }

        // Mini bar (scaled 0–5 % ICV → 0–100% bar width; capped at 100%)
        if (pctICV !== null && !isICV) {
            const barWrap = document.createElement('div');
            barWrap.className = 'vm-card-bar-bg';
            const bar = document.createElement('div');
            bar.className = 'vm-card-bar';
            bar.style.width = Math.min(100, pctICV * 20) + '%';
            bar.style.background = systemColor;
            barWrap.appendChild(bar);
            body.appendChild(barWrap);
        }

        card.appendChild(body);
        return card;
    }

    // ── Table ─────────────────────────────────────────────────────────────
    function renderTable(rows) {
        const tbody = els.tableBody;
        tbody.innerHTML = '';

        const sorted = sortRows(rows);
        for (const row of sorted) {
            const tr = document.createElement('tr');

            const systemColor = SYSTEM_COLORS[row.system] || SYSTEM_COLORS.other;
            const dot = `<span class="vm-sys-dot" style="background:${systemColor}"></span>`;

            tr.innerHTML = `
                <td>${row.label || '—'}</td>
                <td>${dot}${row.system || '—'}</td>
                <td class="vm-num">${fmt(row.volume_cm3, 3)}</td>
                <td class="vm-num">${fmt(row.volume_mm3, 0)}</td>
                <td class="vm-num">${fmt(row.volume_pct_icv, 4)}</td>
            `;
            tbody.appendChild(tr);
        }
    }

    function fmt(val, decimals) {
        if (val === undefined || val === null || val === '' || isNaN(val)) return '—';
        return Number(val).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }

    function sortRows(rows) {
        if (!sortState.col) return rows;
        return [...rows].sort((a, b) => {
            const av = a[sortState.col], bv = b[sortState.col];
            const numA = parseFloat(av), numB = parseFloat(bv);
            let cmp;
            if (!isNaN(numA) && !isNaN(numB)) {
                cmp = numA - numB;
            } else {
                cmp = String(av).localeCompare(String(bv));
            }
            return sortState.asc ? cmp : -cmp;
        });
    }

    function handleSortClick(col) {
        if (sortState.col === col) {
            sortState.asc = !sortState.asc;
        } else {
            sortState.col = col;
            sortState.asc = true;
        }
        // Update header indicators
        els.table.querySelectorAll('th[data-col]').forEach(th => {
            const icon = th.querySelector('.vm-sort-icon');
            if (!icon) return;
            if (th.dataset.col === col) {
                icon.textContent = sortState.asc ? ' ▲' : ' ▼';
                th.classList.add('vm-th-active');
            } else {
                icon.textContent = ' ⇅';
                th.classList.remove('vm-th-active');
            }
        });
        renderTable(allRows.filter(r => r.subject === currentSubject));
    }

    // ── Subject bar ───────────────────────────────────────────────────────
    function buildSubjectBar() {
        els.subjectBar.hidden = subjects.length <= 1;
        if (subjects.length <= 1) return;

        els.subjectSelect.innerHTML = '';
        for (const s of subjects) {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s.split('/').pop();  // basename
            els.subjectSelect.appendChild(opt);
        }
        els.subjectSelect.onchange = () => renderDashboard(els.subjectSelect.value);
    }

    // ── Status helpers ────────────────────────────────────────────────────
    function setStatus(type, msg) {
        if (!type) { els.status.hidden = true; return; }
        els.status.hidden  = false;
        els.status.className = `vm-status vm-status--${type}`;
        els.status.textContent = msg;
    }

    // ── External data ingestion ───────────────────────────────────────────
    /**
     * Accept pre-parsed rows (array of plain objects) from an external source
     * such as FreeSurferHandler.  Rows must have the same fields as the CSV:
     *   subject, roi, label, system, volume_mm3, volume_cm3, volume_pct_icv, icv_mm3
     */
    function ingestRows(rows, sourceLabel) {
        if (!rows || !rows.length) {
            setStatus('error', 'No data rows found — check the file.');
            return;
        }
        allRows        = rows;
        subjects       = [...new Set(rows.map(r => r.subject))];
        currentSubject = subjects[0];
        isDemo         = false;

        setStatus(null);
        buildSubjectBar();
        els.demoBanner.hidden      = true;
        els.sourceBadge.textContent = sourceLabel || 'FreeSurfer';
        els.sourceBadge.hidden      = false;
        els.sourceBadge.className   = 'vm-source-badge vm-source-live';

        renderDashboard(currentSubject);
        triggerMosconiAnalysis(rows.filter(r => r.subject === currentSubject));
    }

    // ── Initialisation ────────────────────────────────────────────────────
    function init() {
        els = {
            section:       document.getElementById('vm-dashboard'),
            status:        document.getElementById('vm-status'),
            sourceBadge:   document.getElementById('vm-data-source'),
            demoBanner:    document.getElementById('vm-demo-banner'),
            loadControls:  document.getElementById('vm-load-controls'),
            csvInput:      document.getElementById('vm-csv-input'),
            pngInput:      document.getElementById('vm-png-input'),
            subjectBar:    document.getElementById('vm-subject-bar'),
            subjectSelect: document.getElementById('vm-subject-select'),
            cards:         document.getElementById('vm-cards'),
            plotWrapper:   document.getElementById('vm-plot-wrapper'),
            plotImg:       document.getElementById('vm-plot-img'),
            tableWrapper:  document.getElementById('vm-table-wrapper'),
            tableBody:     document.getElementById('vm-table-body'),
            table:         document.getElementById('vm-table'),
        };

        // Wire up table header clicks
        els.table.querySelectorAll('th[data-col]').forEach(th => {
            th.style.cursor = 'pointer';
            th.title = 'Click to sort';
            th.addEventListener('click', () => handleSortClick(th.dataset.col));
        });

        // File upload handlers
        els.csvInput.addEventListener('change', () => {
            const file = els.csvInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => ingestCSV(e.target.result, file.name);
            reader.readAsText(file);
        });

        els.pngInput.addEventListener('change', () => {
            const file = els.pngInput.files[0];
            if (!file) return;
            ingestPlot(URL.createObjectURL(file));
        });

        // Auto-load sequence
        (async () => {
            setStatus('loading', 'Loading brain_metrics_summary.csv …');

            const csvText = await tryFetchText('brain_metrics_summary.csv');

            if (csvText) {
                ingestCSV(csvText, 'auto-loaded');
                // Try to load the plot too
                const plotURL = await tryFetchBlob('brain_metrics_plot.png');
                if (plotURL) ingestPlot(plotURL);
                // Show load controls so users can refresh with new files
                els.loadControls.hidden = false;
            } else {
                // Fall back to demo data
                ingestCSV(DEMO_CSV, 'demo');
                els.loadControls.hidden = false;
                setStatus(null);
            }
        })();
    }

    return { init, ingestRows };
})();

// Auto-init once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', VolumetricsDashboard.init);
} else {
    VolumetricsDashboard.init();
}
