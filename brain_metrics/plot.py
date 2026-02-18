"""
brain_metrics.plot
-------------------
Generate a clean, publication-ready summary figure.

Layout (single subject)
-----------------------
  Left panel  : horizontal bar chart — raw bilateral volumes (cm³)
  Right panel : horizontal bar chart — ICV-normalised volumes (% of ICV)
  Bottom panel: laterality index bar for bilateral ROIs  |(L-R)/(L+R)|

For multiple subjects a grouped-bar variant is produced instead.
"""

from __future__ import annotations
import warnings
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")          # non-interactive backend — safe for Colab & scripts
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec

from .regions import SYSTEM_COLORS, ROI_DEFINITIONS, PLOT_ROIS


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_palette(systems: pd.Series) -> List[str]:
    """Map a Series of system names to hex colours."""
    return [SYSTEM_COLORS.get(s, "#999999") for s in systems]


def _laterality_index(summary: pd.DataFrame) -> pd.DataFrame:
    """
    Compute laterality index = (L - R) / (L + R) for bilateral ROI pairs.
    Values close to 0 = symmetric; ±1 = fully lateralised.
    """
    bilateral_pairs = [
        ("hippocampus_L",    "hippocampus_R",    "Hippocampus"),
        ("amygdala_L",       "amygdala_R",       "Amygdala"),
        ("thalamus_L",       "thalamus_R",       "Thalamus"),
        ("caudate_L",        "caudate_R",        "Caudate"),
        ("putamen_L",        "putamen_R",        "Putamen"),
        ("cortex_L",         "cortex_R",         "Cerebral Cortex"),
        ("lat_ventricle_L",  "lat_ventricle_R",  "Lat. Ventricle"),
        ("cerebellum_L",     "cerebellum_R",     "Cerebellum"),
    ]
    rows = []
    for lkey, rkey, name in bilateral_pairs:
        lrow = summary.loc[summary["roi"] == lkey]
        rrow = summary.loc[summary["roi"] == rkey]
        if lrow.empty or rrow.empty:
            continue
        L = lrow["volume_mm3"].values[0]
        R = rrow["volume_mm3"].values[0]
        denom = L + R
        li = (L - R) / denom if denom > 0 else np.nan
        rows.append({"label": name, "laterality_index": li, "L_cm3": L / 1000, "R_cm3": R / 1000})
    return pd.DataFrame(rows)


def _add_value_labels(ax, bars, fmt="{:.2f}", fontsize=7, pad=0.005):
    """Add text labels at the end of each horizontal bar."""
    xlim = ax.get_xlim()
    span = xlim[1] - xlim[0]
    for bar in bars:
        w = bar.get_width()
        if np.isnan(w) or w <= 0:
            continue
        ax.text(
            w + span * pad,
            bar.get_y() + bar.get_height() / 2,
            fmt.format(w),
            va="center", ha="left",
            fontsize=fontsize, color="#333333",
        )


# ---------------------------------------------------------------------------
# Single-subject figure
# ---------------------------------------------------------------------------

def _plot_single_subject(
    summary: pd.DataFrame,
    subject: str,
    output_path: Path,
    dpi: int,
) -> None:
    sub = summary[summary["subject"] == subject].copy()
    # Keep only PLOT_ROIS (bilateral totals) that have data
    sub = sub[sub["roi"].isin(PLOT_ROIS) & sub["volume_cm3"].notna()].copy()
    if sub.empty:
        warnings.warn(f"No plottable ROIs found for subject '{subject}'.", stacklevel=3)
        return

    lat_df = _laterality_index(summary[summary["subject"] == subject])
    n_rois  = len(sub)
    n_lat   = len(lat_df)
    has_lat = n_lat > 0
    has_norm = sub["volume_pct_icv"].notna().any()

    # ── Figure layout ────────────────────────────────────────────────────
    n_rows = 3 if (has_lat and has_norm) else (2 if has_norm else 1)
    row_heights = []
    if has_norm:
        row_heights.append(n_rois * 0.38)   # raw
        row_heights.append(n_rois * 0.38)   # normalised
    else:
        row_heights.append(n_rois * 0.38)
    if has_lat:
        row_heights.append(max(n_lat * 0.38, 2.0))

    fig_h = max(sum(row_heights) + 2.0, 6.0)
    fig = plt.figure(figsize=(13, fig_h), facecolor="white")
    gs  = GridSpec(len(row_heights), 1, figure=fig,
                   hspace=0.55, top=0.92, bottom=0.05,
                   left=0.26, right=0.93,
                   height_ratios=row_heights)

    colors   = _get_palette(sub["system"])
    labels   = sub["label"].tolist()
    y_pos    = np.arange(n_rois)

    ax_idx = 0

    # ── Panel 1: raw volumes (cm³) ───────────────────────────────────────
    ax1 = fig.add_subplot(gs[ax_idx]); ax_idx += 1
    bars = ax1.barh(y_pos, sub["volume_cm3"], color=colors,
                    edgecolor="white", linewidth=0.5, height=0.65)
    ax1.set_yticks(y_pos)
    ax1.set_yticklabels(labels, fontsize=8)
    ax1.set_xlabel("Volume (cm³)", fontsize=9)
    ax1.set_title("Raw Bilateral Volumes", fontsize=10, fontweight="bold", pad=6)
    ax1.grid(axis="x", linestyle="--", linewidth=0.5, alpha=0.6)
    ax1.set_axisbelow(True)
    ax1.spines[["top", "right", "left"]].set_visible(False)
    ax1.tick_params(axis="y", length=0)
    _add_value_labels(ax1, bars, fmt="{:.2f}")

    # ── Panel 2: ICV-normalised (%) ──────────────────────────────────────
    if has_norm:
        ax2 = fig.add_subplot(gs[ax_idx]); ax_idx += 1
        bars2 = ax2.barh(y_pos, sub["volume_pct_icv"], color=colors,
                         edgecolor="white", linewidth=0.5, height=0.65)
        ax2.set_yticks(y_pos)
        ax2.set_yticklabels(labels, fontsize=8)
        ax2.set_xlabel("% of ICV", fontsize=9)
        ax2.set_title("ICV-Normalised Volumes", fontsize=10, fontweight="bold", pad=6)
        ax2.grid(axis="x", linestyle="--", linewidth=0.5, alpha=0.6)
        ax2.set_axisbelow(True)
        ax2.spines[["top", "right", "left"]].set_visible(False)
        ax2.tick_params(axis="y", length=0)
        _add_value_labels(ax2, bars2, fmt="{:.3f}")

    # ── Panel 3: Laterality index ─────────────────────────────────────────
    if has_lat:
        ax3 = fig.add_subplot(gs[ax_idx]); ax_idx += 1
        li_colors = [
            "#4C72B0" if v >= 0 else "#C44E52"
            for v in lat_df["laterality_index"]
        ]
        y3   = np.arange(n_lat)
        ax3.barh(y3, lat_df["laterality_index"], color=li_colors,
                 edgecolor="white", linewidth=0.5, height=0.55)
        ax3.axvline(0, color="#555555", linewidth=0.8, linestyle="--")
        ax3.set_yticks(y3)
        ax3.set_yticklabels(lat_df["label"], fontsize=8)
        ax3.set_xlabel("Laterality Index  (L−R)/(L+R)", fontsize=9)
        ax3.set_title("Hemispheric Asymmetry", fontsize=10, fontweight="bold", pad=6)
        ax3.set_xlim(-1, 1)
        ax3.grid(axis="x", linestyle="--", linewidth=0.5, alpha=0.6)
        ax3.set_axisbelow(True)
        ax3.spines[["top", "right", "left"]].set_visible(False)
        ax3.tick_params(axis="y", length=0)
        # Annotate L/R labels
        ax3.text( 0.97, -0.07, "→ Left larger", transform=ax3.transAxes,
                  ha="right", fontsize=7, color="#4C72B0")
        ax3.text( 0.03, -0.07, "Right larger ←", transform=ax3.transAxes,
                  ha="left",  fontsize=7, color="#C44E52")

    # ── Legend & title ───────────────────────────────────────────────────
    legend_patches = [
        mpatches.Patch(color=c, label=s.capitalize())
        for s, c in SYSTEM_COLORS.items()
    ]
    fig.legend(
        handles=legend_patches,
        loc="upper right", fontsize=8,
        framealpha=0.9, edgecolor="#cccccc",
        ncol=2, title="Brain system", title_fontsize=8,
    )
    icv_val = sub["icv_mm3"].iloc[0] if "icv_mm3" in sub.columns else np.nan
    icv_str = f"ICV = {icv_val/1000:.1f} cm³" if not np.isnan(icv_val) else "ICV: N/A"
    fig.suptitle(
        f"SynthSeg Brain Metrics — {Path(subject).name}\n{icv_str}",
        fontsize=12, fontweight="bold", y=0.97,
    )

    fig.savefig(output_path, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Multi-subject figure
# ---------------------------------------------------------------------------

def _plot_multi_subject(
    summary: pd.DataFrame,
    subjects: List[str],
    output_path: Path,
    dpi: int,
) -> None:
    """Grouped horizontal bar chart: one bar per subject per ROI."""
    sub = summary[summary["roi"].isin(PLOT_ROIS) & summary["volume_cm3"].notna()].copy()
    if sub.empty:
        warnings.warn("No plottable data found for multi-subject plot.", stacklevel=3)
        return

    roi_labels = sub.groupby("roi")["label"].first().reindex(PLOT_ROIS).dropna()
    n_rois   = len(roi_labels)
    n_subj   = len(subjects)
    bar_h    = 0.75 / n_subj
    palette  = plt.cm.tab10.colors  # up to 10 subjects

    fig_h = max(n_rois * 0.5 + 2, 6)
    fig, axes = plt.subplots(1, 2, figsize=(16, fig_h), facecolor="white")

    for ax_i, (val_col, xlabel, title) in enumerate([
        ("volume_cm3",     "Volume (cm³)", "Raw Bilateral Volumes"),
        ("volume_pct_icv", "% of ICV",    "ICV-Normalised Volumes"),
    ]):
        ax = axes[ax_i]
        for s_i, subject in enumerate(subjects):
            sdata = sub[sub["subject"] == subject].set_index("roi")
            offsets = np.arange(n_rois) + (s_i - n_subj / 2 + 0.5) * bar_h
            vals = [
                sdata.loc[roi, val_col] if roi in sdata.index else np.nan
                for roi in roi_labels.index
            ]
            ax.barh(offsets, vals, height=bar_h * 0.85,
                    color=palette[s_i % len(palette)],
                    label=Path(subject).name, edgecolor="white", linewidth=0.3)

        ax.set_yticks(np.arange(n_rois))
        ax.set_yticklabels(roi_labels.values, fontsize=8)
        ax.set_xlabel(xlabel, fontsize=9)
        ax.set_title(title, fontsize=10, fontweight="bold")
        ax.grid(axis="x", linestyle="--", linewidth=0.5, alpha=0.6)
        ax.set_axisbelow(True)
        ax.spines[["top", "right", "left"]].set_visible(False)
        ax.tick_params(axis="y", length=0)
        if ax_i == 1:
            ax.legend(fontsize=8, title="Subject", title_fontsize=8,
                      framealpha=0.9, edgecolor="#cccccc")

    fig.suptitle("SynthSeg Brain Metrics — Multi-Subject Comparison",
                 fontsize=12, fontweight="bold")
    plt.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_plot(
    summary: pd.DataFrame,
    output_path: str | Path = "brain_metrics_plot.png",
    dpi: int = 150,
) -> Path:
    """
    Generate and save the brain-metrics summary figure.

    Parameters
    ----------
    summary : pd.DataFrame
        Output of ``brain_metrics.summary.build_summary``.
    output_path : str or Path
        Where to save the PNG.
    dpi : int
        Output resolution (default 150 — good balance of quality and file size).

    Returns
    -------
    Path
        Absolute path to the saved figure.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    subjects = summary["subject"].unique().tolist()

    if len(subjects) == 0:
        raise ValueError("Summary DataFrame is empty — nothing to plot.")
    elif len(subjects) == 1:
        _plot_single_subject(summary, subjects[0], output_path, dpi)
    else:
        _plot_multi_subject(summary, subjects, output_path, dpi)

    return output_path.resolve()
