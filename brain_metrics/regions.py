"""
brain_metrics.regions
---------------------
Canonical ROI definitions and fuzzy column-matching logic.

Each entry in ROI_DEFINITIONS is a dict with:
  patterns  : list of regex strings matched (case-insensitive) against CSV column names
  bilateral : if True, left+right columns are summed automatically
  system    : colour-coding group for the plot
  label     : human-readable display name

To add a new ROI, append an entry here — nothing else needs changing.
"""

from __future__ import annotations
import re
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# ROI definitions
# ---------------------------------------------------------------------------
ROI_DEFINITIONS: Dict[str, dict] = {
    # ── Hippocampus ──────────────────────────────────────────────────────
    "hippocampus_L": {
        "patterns": [r"left.*hippocampus", r"hippocampus.*left"],
        "bilateral": False,
        "system": "limbic",
        "label": "Hippocampus (L)",
    },
    "hippocampus_R": {
        "patterns": [r"right.*hippocampus", r"hippocampus.*right"],
        "bilateral": False,
        "system": "limbic",
        "label": "Hippocampus (R)",
    },
    "hippocampus": {
        "sum_of": ["hippocampus_L", "hippocampus_R"],
        "system": "limbic",
        "label": "Hippocampus (L+R)",
    },
    # ── Amygdala ─────────────────────────────────────────────────────────
    "amygdala_L": {
        "patterns": [r"left.*amygdala", r"amygdala.*left"],
        "bilateral": False,
        "system": "limbic",
        "label": "Amygdala (L)",
    },
    "amygdala_R": {
        "patterns": [r"right.*amygdala", r"amygdala.*right"],
        "bilateral": False,
        "system": "limbic",
        "label": "Amygdala (R)",
    },
    "amygdala": {
        "sum_of": ["amygdala_L", "amygdala_R"],
        "system": "limbic",
        "label": "Amygdala (L+R)",
    },
    # ── Cortex ───────────────────────────────────────────────────────────
    "cortex_L": {
        "patterns": [r"left.*cerebral.*cortex", r"left.*cortex.*cerebral"],
        "bilateral": False,
        "system": "cortical",
        "label": "Cerebral Cortex (L)",
    },
    "cortex_R": {
        "patterns": [r"right.*cerebral.*cortex", r"right.*cortex.*cerebral"],
        "bilateral": False,
        "system": "cortical",
        "label": "Cerebral Cortex (R)",
    },
    "cortex": {
        "sum_of": ["cortex_L", "cortex_R"],
        "system": "cortical",
        "label": "Cerebral Cortex (L+R)",
    },
    # ── White matter ─────────────────────────────────────────────────────
    "wm_L": {
        "patterns": [r"left.*cerebral.*white", r"left.*white.*matter"],
        "bilateral": False,
        "system": "cortical",
        "label": "Cerebral WM (L)",
    },
    "wm_R": {
        "patterns": [r"right.*cerebral.*white", r"right.*white.*matter"],
        "bilateral": False,
        "system": "cortical",
        "label": "Cerebral WM (R)",
    },
    "white_matter": {
        "sum_of": ["wm_L", "wm_R"],
        "system": "cortical",
        "label": "Cerebral WM (L+R)",
    },
    # ── Thalamus ─────────────────────────────────────────────────────────
    "thalamus_L": {
        "patterns": [r"left.*thalamus", r"thalamus.*left"],
        "bilateral": False,
        "system": "subcortical",
        "label": "Thalamus (L)",
    },
    "thalamus_R": {
        "patterns": [r"right.*thalamus", r"thalamus.*right"],
        "bilateral": False,
        "system": "subcortical",
        "label": "Thalamus (R)",
    },
    "thalamus": {
        "sum_of": ["thalamus_L", "thalamus_R"],
        "system": "subcortical",
        "label": "Thalamus (L+R)",
    },
    # ── Caudate ──────────────────────────────────────────────────────────
    "caudate_L": {
        "patterns": [r"left.*caudate", r"caudate.*left"],
        "bilateral": False,
        "system": "subcortical",
        "label": "Caudate (L)",
    },
    "caudate_R": {
        "patterns": [r"right.*caudate", r"caudate.*right"],
        "bilateral": False,
        "system": "subcortical",
        "label": "Caudate (R)",
    },
    "caudate": {
        "sum_of": ["caudate_L", "caudate_R"],
        "system": "subcortical",
        "label": "Caudate (L+R)",
    },
    # ── Putamen ──────────────────────────────────────────────────────────
    "putamen_L": {
        "patterns": [r"left.*putamen", r"putamen.*left"],
        "bilateral": False,
        "system": "subcortical",
        "label": "Putamen (L)",
    },
    "putamen_R": {
        "patterns": [r"right.*putamen", r"putamen.*right"],
        "bilateral": False,
        "system": "subcortical",
        "label": "Putamen (R)",
    },
    "putamen": {
        "sum_of": ["putamen_L", "putamen_R"],
        "system": "subcortical",
        "label": "Putamen (L+R)",
    },
    # ── Lateral ventricles ───────────────────────────────────────────────
    "lat_ventricle_L": {
        "patterns": [r"left.*lateral.*ventricle", r"left.*lat.*vent"],
        "bilateral": False,
        "system": "ventricular",
        "label": "Lateral Ventricle (L)",
    },
    "lat_ventricle_R": {
        "patterns": [r"right.*lateral.*ventricle", r"right.*lat.*vent"],
        "bilateral": False,
        "system": "ventricular",
        "label": "Lateral Ventricle (R)",
    },
    "lateral_ventricles": {
        "sum_of": ["lat_ventricle_L", "lat_ventricle_R"],
        "system": "ventricular",
        "label": "Lateral Ventricles (L+R)",
    },
    # ── 3rd / 4th ventricle ──────────────────────────────────────────────
    "ventricle_3rd": {
        "patterns": [r"3rd.ventricle", r"third.ventricle"],
        "bilateral": False,
        "system": "ventricular",
        "label": "3rd Ventricle",
    },
    "ventricle_4th": {
        "patterns": [r"4th.ventricle", r"fourth.ventricle"],
        "bilateral": False,
        "system": "ventricular",
        "label": "4th Ventricle",
    },
    # ── Cerebellar cortex ────────────────────────────────────────────────
    "cerebellum_L": {
        "patterns": [r"left.*cerebellum.*cortex", r"left.*cerebell"],
        "bilateral": False,
        "system": "cerebellar",
        "label": "Cerebellar Cortex (L)",
    },
    "cerebellum_R": {
        "patterns": [r"right.*cerebellum.*cortex", r"right.*cerebell"],
        "bilateral": False,
        "system": "cerebellar",
        "label": "Cerebellar Cortex (R)",
    },
    "cerebellum": {
        "sum_of": ["cerebellum_L", "cerebellum_R"],
        "system": "cerebellar",
        "label": "Cerebellar Cortex (L+R)",
    },
    # ── Brainstem ────────────────────────────────────────────────────────
    "brainstem": {
        "patterns": [r"brain.?stem", r"brain stem"],
        "bilateral": False,
        "system": "brainstem",
        "label": "Brainstem",
    },
}

# Patterns used to detect the ICV column (tried in order; first match wins)
ICV_PATTERNS: List[str] = [
    r"estimated.total.intracranial",
    r"intracranial.volume",
    r"\bicv\b",
    r"total.intracranial",
    r"etiv",
]

# Colour map: system → hex colour (used in plot)
SYSTEM_COLORS: Dict[str, str] = {
    "limbic":       "#4C72B0",
    "cortical":     "#55A868",
    "subcortical":  "#C44E52",
    "ventricular":  "#8172B2",
    "cerebellar":   "#CCB974",
    "brainstem":    "#64B5CD",
}

# ROIs shown in the summary plot (bilateral totals only)
PLOT_ROIS: List[str] = [
    "hippocampus",
    "amygdala",
    "thalamus",
    "caudate",
    "putamen",
    "cortex",
    "white_matter",
    "lateral_ventricles",
    "ventricle_3rd",
    "ventricle_4th",
    "cerebellum",
    "brainstem",
]


# ---------------------------------------------------------------------------
# Column-matching helpers
# ---------------------------------------------------------------------------

def _normalise_col(name: str) -> str:
    """Lower-case, strip, replace separators with spaces."""
    return re.sub(r"[-_]+", " ", name.strip().lower())


def find_icv_column(columns: List[str]) -> str | None:
    """Return the first column name that matches any ICV pattern, or None."""
    norm = {c: _normalise_col(c) for c in columns}
    for pat in ICV_PATTERNS:
        for col, n in norm.items():
            if re.search(pat, n):
                return col
    return None


def match_roi_columns(roi_key: str, columns: List[str]) -> List[str]:
    """
    Return all column names that match any pattern for the given ROI key.
    Returns [] if the ROI has no 'patterns' (e.g. it's a sum_of composite).
    """
    defn = ROI_DEFINITIONS.get(roi_key, {})
    if "patterns" not in defn:
        return []
    norm = {c: _normalise_col(c) for c in columns}
    matched = []
    for col, n in norm.items():
        if any(re.search(p, n) for p in defn["patterns"]):
            matched.append(col)
    return matched


def build_column_map(columns: List[str]) -> Dict[str, List[str]]:
    """
    Return {roi_key: [matched_csv_columns]} for every ROI that has 'patterns'.
    Composite (sum_of) ROIs are not included here — they are resolved later.
    """
    return {
        key: match_roi_columns(key, columns)
        for key in ROI_DEFINITIONS
        if "patterns" in ROI_DEFINITIONS[key]
    }
