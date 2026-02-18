"""
brain_metrics.summary
----------------------
Build the tidy summary DataFrame from raw SynthSeg volumes.

Output schema (one row per subject × ROI combination):
  subject          – filename / subject ID
  roi              – canonical ROI key  (e.g. 'hippocampus')
  label            – human-readable name (e.g. 'Hippocampus (L+R)')
  system           – brain system group  (e.g. 'limbic')
  volume_mm3       – raw bilateral volume in mm³
  volume_cm3       – raw bilateral volume in cm³
  volume_pct_icv   – volume as % of ICV  (NaN if ICV not detected)
  icv_mm3          – ICV for this subject in mm³
"""

from __future__ import annotations
import warnings
import numpy as np
import pandas as pd
from typing import List

from .regions import ROI_DEFINITIONS, PLOT_ROIS, build_column_map
from .normalize import get_icv_series, normalize_to_icv


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_roi_volume(
    roi_key: str,
    col_map: dict[str, List[str]],
    df: pd.DataFrame,
) -> pd.Series | None:
    """
    Return a Series of volumes (mm³) for *roi_key* or None if unresolvable.

    Handles both direct-pattern ROIs and composite (sum_of) ROIs.
    """
    defn = ROI_DEFINITIONS[roi_key]

    # ── Composite ROI: sum component ROIs ────────────────────────────────
    if "sum_of" in defn:
        parts = []
        for sub_key in defn["sum_of"]:
            sub = _resolve_roi_volume(sub_key, col_map, df)
            if sub is not None:
                parts.append(sub)
        if not parts:
            return None
        return sum(parts)  # type: ignore[return-value]

    # ── Pattern-matched ROI: sum all matched CSV columns ─────────────────
    matched_cols = col_map.get(roi_key, [])
    if not matched_cols:
        return None
    return df[matched_cols].astype(float).sum(axis=1)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_summary(
    df: pd.DataFrame,
    rois: List[str] | None = None,
) -> pd.DataFrame:
    """
    Build the tidy summary DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        Output of ``loader.load_volumes``.
    rois : list of str, optional
        ROI keys to include (from ``regions.ROI_DEFINITIONS``).
        Defaults to ``regions.PLOT_ROIS`` (bilateral totals only).

    Returns
    -------
    pd.DataFrame
        Tidy frame with columns described in the module docstring.
        Sorted by subject, then by brain system and ROI label.
    """
    if rois is None:
        rois = PLOT_ROIS

    # ICV — tolerate missing
    try:
        icv_col, icv_series = get_icv_series(df)
    except Exception as exc:
        warnings.warn(f"ICV not found — normalization skipped. ({exc})", stacklevel=2)
        icv_col = None
        icv_series = None

    col_map = build_column_map(list(df.columns))
    records = []

    for subject in df.index:
        subject_row = df.loc[[subject]]  # keep as DataFrame for column indexing
        icv_val = float(icv_series.loc[subject]) if icv_series is not None else np.nan

        for roi_key in rois:
            if roi_key not in ROI_DEFINITIONS:
                warnings.warn(f"Unknown ROI key '{roi_key}' — skipping.", stacklevel=2)
                continue

            defn = ROI_DEFINITIONS[roi_key]
            vol_series = _resolve_roi_volume(roi_key, col_map, subject_row)

            if vol_series is None:
                vol_mm3 = np.nan
            else:
                vol_mm3 = float(vol_series.iloc[0])

            vol_pct = (vol_mm3 / icv_val * 100.0) if (icv_series is not None and icv_val > 0) else np.nan

            records.append({
                "subject":        str(subject),
                "roi":            roi_key,
                "label":          defn.get("label", roi_key),
                "system":         defn.get("system", "other"),
                "volume_mm3":     round(vol_mm3, 2),
                "volume_cm3":     round(vol_mm3 / 1000.0, 4) if not np.isnan(vol_mm3) else np.nan,
                "volume_pct_icv": round(vol_pct, 4) if not np.isnan(vol_pct) else np.nan,
                "icv_mm3":        round(icv_val, 2),
            })

    out = pd.DataFrame(records)
    if out.empty:
        return out

    # Stable sort: subject → system → label
    system_order = ["cortical", "subcortical", "limbic", "ventricular", "cerebellar", "brainstem", "other"]
    out["_sys_rank"] = out["system"].map(
        {s: i for i, s in enumerate(system_order)}
    ).fillna(len(system_order))
    out = (
        out
        .sort_values(["subject", "_sys_rank", "label"])
        .drop(columns=["_sys_rank"])
        .reset_index(drop=True)
    )
    return out


def pivot_summary(summary: pd.DataFrame, value_col: str = "volume_cm3") -> pd.DataFrame:
    """
    Pivot *summary* so rows = ROI labels, columns = subjects.

    Useful for multi-subject comparisons.

    Parameters
    ----------
    summary : pd.DataFrame
        Output of ``build_summary``.
    value_col : str
        Which value column to use as cell values.

    Returns
    -------
    pd.DataFrame
    """
    return summary.pivot_table(
        index=["system", "label"],
        columns="subject",
        values=value_col,
        aggfunc="first",
    )
