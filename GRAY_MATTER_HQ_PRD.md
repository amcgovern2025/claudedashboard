# Gray Matter HQ — Product Requirements Document

**Version:** 1.0
**Date:** February 20, 2026
**Status:** Living Document

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [User Personas](#3-user-personas)
4. [Feature Inventory](#4-feature-inventory)
   - 4.1 Access Control
   - 4.2 Input Pipelines
   - 4.3 MRI Viewer
   - 4.4 Analysis Engine
   - 4.5 Brain Health Score
   - 4.6 Volumetrics Dashboard
   - 4.7 Findings & Recommendations
   - 4.8 Session Persistence
5. [Technical Architecture](#5-technical-architecture)
6. [Known Limitations](#6-known-limitations)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Future Roadmap](#8-future-roadmap)

---

## 1. Product Overview

**Gray Matter HQ** is a browser-based brain MRI analysis dashboard built around the brain health research framework of leading women's brain health researchers (Weill Cornell Women's Brain Initiative). It enables users to upload raw MRI data or FreeSurfer segmentation outputs and receive a structured brain health report — including a composite score, sub-scores, regional volume metrics, and lifestyle recommendations — entirely within the browser, with no data ever leaving the user's device.

**Tagline:** Personal brain and hormone intelligence dashboard.

**Deployment:** Static site hosted on GitHub Pages. No server, no database, no backend.

**Primary URL:** `https://amcgovern2025.github.io/claudedashboard`

---

## 2. Goals and Non-Goals

### Goals

- Provide a private, no-upload-required tool for individuals to visualize and interpret their own brain MRI data
- Implement published structural MRI biomarkers as the scoring framework
- Support two input paths: raw MRI files (DICOM/NIfTI) and FreeSurfer volumetric outputs (`aseg.stats`)
- Produce a single, interpretable composite Brain Health Score with transparent sub-score breakdowns
- Display regional volumetric metrics with reference ranges and contextual research citations
- Remain a zero-dependency-on-server tool: all computation runs in the browser

### Non-Goals

- **Not a clinical diagnostic instrument.** Results are for research and educational purposes only.
- **Not a medical device.** Not FDA-cleared or CE-marked.
- **Not a replacement for radiologist review or neurology consultation.**
- **Not a multi-user SaaS platform.** No accounts, no cloud storage, no sharing features.
- **Not a full MRI reconstruction or segmentation tool.** It consumes already-processed outputs; it does not run SynthSeg or FreeSurfer in the browser.

---

## 3. User Personas

### Persona A — The Proactive Patient
A health-conscious adult (typically 40+) who has obtained a personal brain MRI and wants to understand their volumetric data beyond what a standard radiology report provides. They have a FreeSurfer `aseg.stats` from a service like Brainlife.io. They are not a clinician but are scientifically literate.

**Needs:**
- Clear, jargon-light interpretation of their volumetric numbers
- Reference ranges grounded in published research
- Actionable lifestyle recommendations
- Confidence that their data never leaves their computer

### Persona B — The Researcher / Lab Member
A graduate student, postdoc, or lab coordinator running brain imaging studies. They generate FreeSurfer outputs for multiple subjects and want a quick QC dashboard to spot outliers, asymmetries, or atrophy flags without writing custom Python each time.

**Needs:**
- Multi-subject CSV ingestion and per-subject switching
- Sortable regional volume tables
- Visual summary plots from the Python pipeline
- Ability to re-upload and refresh without losing context

### Persona C — The Curious Educator
A science communicator or medical educator who wants to demonstrate brain volumetrics concepts to students or general audiences using real or demo data.

**Needs:**
- Demo mode that loads meaningful placeholder data automatically
- Research citations embedded in the UI
- Clean visual design suitable for presentations

---

## 4. Feature Inventory

### 4.1 Access Control

| Feature | Description |
|---|---|
| Passcode gate | Full-page modal overlay blocks access until a correct passcode is entered |
| SHA-256 hashing | Passcode is never stored in plaintext; the page stores only its SHA-256 hash, computed client-side via the Web Crypto API |
| Session persistence | Successful auth is stored in `sessionStorage` so the user is not re-prompted on page refresh within the same browser session |
| Early CSS unlock | An inline `<script>` in `<head>` checks `sessionStorage` and adds `.smb-authed` to `<html>` before the DOM finishes rendering, preventing a flash of the overlay for returning sessions |
| Entry notification | On each successful passcode entry, a Discord webhook fires with the user's IP (via `ipapi.co`), geolocation, timestamp, and user-agent |
| Google Analytics | `gtag.js` (ID: `G-N515TJQ69Y`) tracks page views and usage |

**Security note:** Because this is a purely client-side implementation, the SHA-256 hash and the Discord webhook URL are visible in the public JavaScript source. The gate is intended to limit casual access, not to provide cryptographic security.

---

### 4.2 Input Pipelines

The dashboard has two independent data pipelines that converge at the analysis/display layer.

#### Pipeline A — Direct MRI File Upload

| Format | Extension(s) | Support Level |
|---|---|---|
| DICOM | `.dcm`, `.dicom` | Full: pixel rendering, windowing, metadata, full analysis |
| NIfTI | `.nii`, `.nii.gz` | Partial: header/metadata only; no pixel rendering |
| NRRD | `.nrrd` | Minimal: file accepted, no metadata or pixel data parsed |
| Raster image | `.png`, `.jpg`, `.jpeg` | Canvas rendering only; no quantitative analysis |

Upload UX: HTML5 drag-and-drop zone plus click-to-browse file picker. Multi-file drop is supported for DICOM stacks. Files are sorted by DICOM slice location / instance number to reconstruct the 3D volume order.

#### Pipeline B — Volumetrics / Segmentation Inputs

| Format | Source | Notes |
|---|---|---|
| `brain_metrics_summary.csv` | Auto-fetched from repo root on GitHub Pages; manual upload fallback | Columns: `subject, roi, label, system, volume_mm3, volume_cm3, volume_pct_icv, icv_mm3` |
| `brain_metrics_plot.png` | Auto-fetched; manual upload fallback | Optional matplotlib 3-panel summary figure |
| FreeSurfer `aseg.stats` | Dedicated upload button | Parsed entirely in-browser by `FreeSurferHandler`; extracts `# Measure` header lines and data-table rows |

Multi-subject CSVs are supported. When more than one unique subject identifier is detected, a subject dropdown appears and switching re-renders all cards and the table.

**Python pre-processing pipeline (optional, offline):**
A Python module (`brain_metrics/`) converts SynthSeg `volumes.csv` output into the CSV format consumed by Pipeline B. A Jupyter notebook (`synthseg_pipeline.ipynb`) supports running SynthSeg on Google Colab. A standalone `convert_freesurfer.py` converts FreeSurfer `aseg.stats` to the same CSV format (the in-browser `FreeSurferHandler` is its browser-native equivalent).

---

### 4.3 MRI Viewer (DICOM)

| Feature | Description |
|---|---|
| Canvas rendering | Each DICOM slice is rendered to an HTML5 `<canvas>` with applied windowing (rescale slope + intercept + window center/width) |
| Window Center slider | Range 0–4095, initialized from DICOM-embedded default |
| Window Width slider | Range 1–4095, initialized from DICOM-embedded default |
| Slice navigation slider | Moves through the sorted DICOM stack |
| Mouse scroll | Scroll wheel on the canvas changes the active slice |
| Invert toggle | Flips pixel polarity; auto-applied for `MONOCHROME1` photometric interpretation |
| Reset button | Restores DICOM-embedded default WC/WW values |
| DICOM metadata panel | 16 fields: patient name, ID, birth date, sex, age, study date, modality, study description, series description, manufacturer, institution, image size, bits stored/allocated, pixel spacing, slice thickness, window C/W |

---

### 4.4 Analysis Engine

The analysis engine (`analysis-engine.js`) operates on pixel-level data from DICOM or raster image uploads. It is not used for FreeSurfer/CSV pipeline data.

| Analysis Module | Method |
|---|---|
| Tissue segmentation | Intensity thresholding on 8-bit normalized pixel values: background (<10), CSF (10–50), gray matter (51–150), white matter (>150) |
| Tissue fractions | Counts of GM, WM, CSF pixels divided by total brain pixels |
| Gray-to-White Ratio | `gmCount / wmCount` |
| Brain parenchyma fraction | `(csf + gm + wm) / totalPixels` |
| Hemispheric symmetry | Pixel-level L/R column split; mean absolute asymmetry index; temporal lobe sub-region (rows 50–70%, cols 30–70%) |
| Intensity histogram | 256 bins; first 5 skipped (background noise); statistics: mean, std dev, median, range |
| Texture / homogeneity | Shannon entropy of the intensity histogram; converted to a 0–100 homogeneity score |
| Regional intensity | Fixed fractional bounding boxes for hippocampal, posterior cingulate, and frontal regions; each compared to global mean |
| Volumetric analysis (multi-slice) | Brain extent (fraction of slices with >20% of max brain pixels); cross-slice consistency (coefficient of variation) |

**Important caveat:** Regional analysis uses fixed fractional bounding boxes on axial slices. Results are only anatomically meaningful if the scan is in a standard axial orientation and field of view. The engine has no spatial registration capability.

---

### 4.5 Brain Health Score

A single composite integer (0–100) is the primary output of both pipelines.

#### For DICOM/image data (analysis-engine.js):

| Sub-score | Weight | Basis |
|---|---|---|
| Tissue Balance | 25% | GM/WM ratio closeness to ideal (1.3); CSF fraction closeness to ideal (~12%) |
| Structural Integrity | 25% | `brainParenchymaFraction × 120`, capped at 100 |
| Hemispheric Symmetry | 20% | `(1 − avgAsymmetryIndex) × 100` |
| Tissue Homogeneity | 15% | Entropy-derived homogeneity score |
| Regional Balance | 15% | Mean deviation of regional intensities from global mean |

**Level thresholds:** ≥ 75 = `good`, ≥ 50 = `moderate`, < 50 = `concern`.

#### For FreeSurfer/aseg.stats data (app.js `buildResultsFromFreeSurfer`):

All fractions are normalized by eTIV (Estimated Total Intracranial Volume).

| Metric | Computation |
|---|---|
| Gray Matter % | `(lhCortexVol + rhCortexVol) / eTIV` |
| White Matter % | `(lhCerebralWhiteMatterVol + rhCerebralWhiteMatterVol) / eTIV` |
| CSF % | `(leftLateralVentricle + rightLateralVentricle + 3rdVentricle + 4thVentricle) / eTIV` |
| GM/WM Ratio | `cortex / wm` |
| Brain Parenchyma % | `(cortex + wm + subcorticalStructures) / eTIV` |
| Hemispheric Symmetry | Average `|L−R| / ((L+R)/2)` across 9 paired structures; converted to 0–100 score |

Sub-score thresholds:

| Sub-score | Logic |
|---|---|
| Tissue Balance | GM in 35–45% → 100; GM > 25% → 65; else 35. WM in 25–40% → 100; WM > 20% → 65; else 35. Average of both. |
| Atrophy | Parenchyma > 70% → 90; > 55% → 65; else 35 |
| Symmetry | `round(symmetryScore)` |

**Composite formula:**
`round((tissueBalance + symmetrySubScore + atrophyScore + 75) / 4)`

The `+ 75` constant is a fixed placeholder for the texture sub-score, which cannot be derived from volumetric data. This is logged transparently in the DevTools console under `console.group('Brain Health Score Verification')`.

#### Metric Reference Ranges (displayed in the comparison table):

| Metric | Recommended Range | Orange (borderline) | Red (atypical) |
|---|---|---|---|
| Gray Matter | 35–45% | 25–35% | < 25% |
| White Matter | 25–40% | 20–25% | < 20% |
| GM/WM Ratio | 1.0–1.5 | — | outside range |
| CSF | < 15% | 15–25% | > 25% |
| Brain Parenchyma | > 70% | 55–70% | < 55% |
| Hemispheric Symmetry | > 85 | 70–85 | < 70 |
| Temporal Asymmetry | < 5% | 5–10% | > 10% |
| Tissue Homogeneity | > 60 | 45–60 | < 45 |

---

### 4.6 Volumetrics Dashboard

Rendered when Pipeline B data is available (CSV or FreeSurfer upload).

| Feature | Description |
|---|---|
| ROI metric cards | One card per region (Total ICV + bilateral totals for 8 systems): Hippocampus, Amygdala, Thalamus, Caudate, Lateral Ventricles, Cerebral Cortex, Cerebral WM, Brainstem. Each shows volume in cm³, % ICV, and a proportional bar. |
| Color-coded system stripes | Cards are color-coded by brain system: limbic (purple), cortical (blue), subcortical (teal), ventricular (amber), cerebellar (green), brainstem (gray). |
| Summary plot display | Optional matplotlib 3-panel PNG (raw volumes, ICV-normalized volumes, hemispheric asymmetry bar chart). |
| Sortable regional table | Columns: Region, System (with color dot), Volume (cm³), Volume (mm³), % ICV. Click any header to sort; click again to reverse. |
| Subject dropdown | Appears automatically when CSV contains multiple subjects; switching re-renders all cards and table. |
| Data source badge | Indicates: `auto-loaded`, `demo`, filename, or FreeSurfer file. |
| Demo mode banner | Displayed when no real data is loaded; clearly labeled with upload instructions. |

---

### 4.7 Findings & Recommendations

All findings are grouped into collapsible sections with inline research citations.

**Findings sections:**

1. **Tissue Composition** — GM proportion, WM proportion, GM/WM ratio with indicator dots (normal / borderline / atypical)
2. **Regional Analysis** — Hippocampus, amygdala, thalamus, ventricles (from FreeSurfer); or medial temporal, posterior cingulate, frontal (from pixel-based analysis)
3. **Hemispheric Symmetry** — Overall symmetry score; temporal lobe asymmetry index; hippocampal L/R asymmetry (FreeSurfer)
4. **Brain Atrophy Indicators** — Brain parenchyma fraction; CSF proportion; ventricular volume; eTIV
5. **White Matter Characterization** — Tissue homogeneity / entropy score (DICOM only)
6. **Sex-Specific Context** — Women's Brain Initiative framing (shown only when DICOM metadata contains `patientSex = F`)

**Recommendations (always shown, 5 standard):**
1. Mediterranean Diet
2. Antioxidant-Rich Foods
3. Physical Activity
4. Cognitive Engagement
5. Sleep Quality

**Conditional recommendations:**
- *Clinical Consultation Recommended* — prepended when score level is `concern`
- *Hormone Health Monitoring* — appended for female patients
- *Baseline Brain Imaging* — appended if patient age ≥ 40

---

### 4.8 Session Persistence

| Feature | Detail |
|---|---|
| Auto-save | After every real analysis (not demo), full results are serialized to `localStorage` under key `mri_analysis_state` |
| Saved content | Timestamp, all score objects, findings, recommendations, volumetric data, DICOM metadata, slice count, image size, file name chips |
| Exclusions | Demo data is explicitly not persisted |
| Restore on load | `loadSavedState()` runs on page load; if valid state is found, the analysis panel re-renders immediately (without the MRI viewer, since pixel data is not stored) |
| Restore badge | "Saved session restored" badge displayed on the dashboard heading |
| Privacy note | All data is stored in the local browser only; no data is transmitted to any server |

---

## 5. Technical Architecture

### Frontend

| Layer | Technology |
|---|---|
| Language | Vanilla JavaScript ES6+ (no framework) |
| Key APIs | HTML5 Canvas, FileReader, Web Crypto API (`crypto.subtle`), `fetch`, `localStorage`, `sessionStorage`, `URL.createObjectURL` |
| Build system | None — no bundler, no transpiler. Cache-busted with query strings (`?v=5`, `?v=6`) |
| Third-party libraries | `dicom-parser@1.8.21` (DICOM parsing), `nifti-reader-js@0.6.3` (NIfTI parsing), `gtag.js` (analytics) |
| Hosting | GitHub Pages (static, from repo root) |

### JavaScript Modules

| File | Responsibility |
|---|---|
| `js/passcode.js` | Passcode gate, SHA-256 verification, Discord webhook notification |
| `js/app.js` | Main app orchestration, DICOM/image upload flow, MRI viewer, analysis result rendering, FreeSurfer score computation (`buildResultsFromFreeSurfer`), session persistence |
| `js/analysis-engine.js` | Pixel-level tissue segmentation, symmetry, texture, regional analysis, composite score computation for image-based inputs |
| `js/freesurfer-handler.js` | `aseg.stats` parser, ROI aggregation, bridge to `VolumetricsDashboard.ingestRows` and `window.updateAnalysisFromFreeSurfer` |
| `js/volumetrics-dashboard.js` | CSV ingestion, metric card rendering, sortable table, subject dropdown, auto-fetch of CSV/PNG from repo root |
| `js/nifti-handler.js` | NIfTI header parsing, metadata display |

### Python Pipeline (optional, offline)

| Component | Purpose |
|---|---|
| `synthseg_pipeline.ipynb` | Google Colab notebook to run SynthSeg segmentation and generate `volumes.csv` |
| `brain_metrics/` module | Converts SynthSeg output to `brain_metrics_summary.csv` and `brain_metrics_plot.png` |
| `convert_freesurfer.py` | Standalone converter: FreeSurfer `aseg.stats` → `brain_metrics_summary.csv` |

---

## 6. Known Limitations

| # | Limitation | Impact | Workaround |
|---|---|---|---|
| 1 | **NRRD parsing is not implemented** | NRRD files are accepted but no metadata or pixel data is extracted | Use NIfTI or DICOM instead |
| 2 | **NIfTI pixel rendering is not implemented** | NIfTI uploads show metadata only; the MRI viewer is hidden | Convert to DICOM for full viewer experience |
| 3 | **Regional analysis uses fixed bounding boxes** | Hippocampal, posterior cingulate, and frontal region intensities are only anatomically correct for scans in standard axial orientation/FOV | Use FreeSurfer `aseg.stats` for anatomically accurate regional volumes |
| 4 | **FreeSurfer composite uses a `+75` texture placeholder** | The texture sub-score is not computable from volumetric data; a fixed 75/100 is assumed | Noted transparently in the DevTools Brain Health Score Verification log |
| 5 | **Passcode is client-side only** | A user inspecting the page source can extract the SHA-256 hash or bypass the overlay via browser DevTools | Not designed for high-security use cases; adequate for limiting casual access |
| 6 | **LocalStorage data is unencrypted** | DICOM metadata (which may include patient name, DOB, etc.) is stored in plaintext in the browser | Users should avoid using identifiable DICOM files on shared computers |
| 7 | **Auto-load fails on `file://` protocol** | `brain_metrics_summary.csv` cannot be fetched when `index.html` is opened directly from the filesystem | Use `python -m http.server` or VS Code Live Server for local preview |
| 8 | **CSV column names are version-sensitive** | CSVs generated by older versions of `run_brain_metrics.py` may not render correctly | Re-run the Python pipeline to regenerate the CSV |
| 9 | **Not a clinical tool** | All thresholds are research-derived estimates, not clinically validated diagnostic cutoffs | For clinical decisions, consult a neurologist or radiologist |

---

## 7. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Privacy** | Zero data transmission (no PHI leaves the browser). The only external calls are: GA analytics (page view events), ipapi.co (IP lookup on passcode entry), Discord webhook (entry notification). No MRI pixel data or volumetric values are ever transmitted. |
| **Performance** | Full DICOM analysis (single-slice) should complete in < 2 seconds on a modern laptop. Multi-slice stack rendering should be smooth at interactive frame rates on the slice slider. |
| **Compatibility** | Must function in current Chrome, Firefox, and Safari. Web Crypto API, Canvas, FileReader, and `fetch` are required. |
| **Accessibility** | Color-coded indicators (green/amber/red) should always be accompanied by text labels. Slider controls require keyboard accessibility. |
| **Reliability** | LocalStorage save/restore failures should be caught silently and fall back to demo mode without crashing the application. |
| **Disclaimers** | A persistent "Research & Educational Tool Only" disclaimer banner must be visible on the page at all times. Every automated recommendation must be paired with a prompt to consult a qualified healthcare provider. |

---

## 8. Future Roadmap

The following capabilities are **not currently implemented** and represent potential areas for future development:

| Feature | Description | Notes |
|---|---|---|
| **PDF export** | Generate a formatted, downloadable report from the analysis results | Could be implemented client-side with `jsPDF` or `html2canvas` |
| **NIfTI slice viewer** | Render axial/coronal/sagittal slices from NIfTI volumes in the browser | Requires a WebGL or Canvas-based NIfTI renderer |
| **Longitudinal tracking** | Compare two time-point scans (or two `aseg.stats` files) and display volume change over time | High clinical value for monitoring |
| **Reference population normalization** | Normalize volumetric metrics against an age/sex-matched reference distribution | Would require embedding a normative lookup table |
| **Texture sub-score from aseg.stats** | Replace the hardcoded `+75` placeholder with a meaningful estimate from white matter hyperintensity volume (if available in the stats file) | Would improve composite score accuracy for FreeSurfer-based inputs |
| **Lh/rh cortical parcellation** | Ingest `aparc.stats` (Desikan-Killiany parcellation) for region-specific cortical thickness and surface area metrics | Published research specifically highlights entorhinal cortex and posterior cingulate |
| **PET metabolic data overlay** | Accept FDG-PET SUV data and overlay regional metabolism values on the structural map | Core to the original research methodology |
| **PHI de-identification warning** | Detect DICOM files with populated patient name / DOB fields and display a warning before analysis | Privacy improvement |
| **Offline PWA mode** | Cache the app shell as a Progressive Web App for fully offline operation | Would eliminate the CDN dependency on `dicom-parser` and `nifti-reader-js` |
| **Print-optimized stylesheet** | CSS `@media print` styles for clean browser-print output of the analysis panel | Low-effort, high-utility for sharing with a clinician |

---

*This document was generated from live codebase analysis as of February 20, 2026.*
*Gray Matter HQ is a research and educational tool. It is not a medical device and is not intended for clinical diagnosis.*
