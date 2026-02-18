"""
brain_metrics.pipeline
-----------------------
High-level ``run()`` function that orchestrates the full pipeline:

  1. Load volumes.csv
  2. Build tidy summary DataFrame (raw + ICV-normalised)
  3. Save brain_metrics_summary.csv
  4. Generate brain_metrics_plot.png
  5. Print a human-readable report to stdout

Intended usage
--------------
  from brain_metrics import run
  summary = run("volumes.csv", output_dir="results/")

Or from the command line:
  python run_brain_metrics.py volumes.csv --output-dir results/
"""

from __future__ import annotations
import warnings
from pathlib import Path

import pandas as pd

from .loader import load_volumes, describe_csv
from .summary import build_summary
from .plot import generate_plot


# ---------------------------------------------------------------------------
# Report helper
# ---------------------------------------------------------------------------

def _print_report(summary: pd.DataFrame) -> None:
    """Print a compact, human-readable metrics table to stdout."""
    subjects = summary["subject"].unique()

    for subject in subjects:
        sub = summary[summary["subject"] == subject].copy()
        icv = sub["icv_mm3"].iloc[0] if "icv_mm3" in sub.columns else float("nan")

        print()
        print("=" * 62)
        print(f"  Subject : {subject}")
        import math
        if not math.isnan(icv):
            print(f"  ICV     : {icv/1000:,.2f} cm³  ({icv:,.0f} mm³)")
        print("=" * 62)
        print(f"  {'Region':<30} {'cm³':>8}  {'% ICV':>8}")
        print(f"  {'-'*30} {'-'*8}  {'-'*8}")

        for _, row in sub.iterrows():
            pct = f"{row['volume_pct_icv']:.3f}" if pd.notna(row["volume_pct_icv"]) else "  N/A  "
            cm3 = f"{row['volume_cm3']:.3f}" if pd.notna(row["volume_cm3"]) else "  N/A  "
            print(f"  {row['label']:<30} {cm3:>8}  {pct:>8}")

        print()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run(
    volumes_csv: str | Path,
    output_dir: str | Path = ".",
    rois: list[str] | None = None,
    dpi: int = 150,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Run the full brain-metrics pipeline on a SynthSeg ``volumes.csv``.

    Parameters
    ----------
    volumes_csv : str or Path
        Path to the ``volumes.csv`` produced by SynthSeg.
    output_dir : str or Path
        Directory where ``brain_metrics_summary.csv`` and
        ``brain_metrics_plot.png`` will be saved.  Created if absent.
    rois : list of str, optional
        ROI keys to include (see ``brain_metrics.regions.ROI_DEFINITIONS``).
        Defaults to ``regions.PLOT_ROIS`` (all bilateral totals).
    dpi : int
        Plot resolution (default 150).
    verbose : bool
        If True, print a summary table to stdout.

    Returns
    -------
    pd.DataFrame
        Tidy summary DataFrame (same as ``summary.build_summary`` output).

    Raises
    ------
    FileNotFoundError
        If *volumes_csv* does not exist.
    brain_metrics.loader.VolumeCSVError
        If the CSV cannot be parsed.
    """
    volumes_csv = Path(volumes_csv)
    output_dir  = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    summary_csv  = output_dir / "brain_metrics_summary.csv"
    plot_png     = output_dir / "brain_metrics_plot.png"

    # ── 1. Load ───────────────────────────────────────────────────────────
    if verbose:
        print(f"[1/4] Loading {volumes_csv} ...")
    df = load_volumes(volumes_csv)
    if verbose:
        print(describe_csv(df))

    # ── 2. Build summary ──────────────────────────────────────────────────
    if verbose:
        print(f"\n[2/4] Computing ROI volumes and ICV normalisation ...")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        summary = build_summary(df, rois=rois)
        for w in caught:
            print(f"  WARNING: {w.message}")

    if summary.empty:
        print("  No ROIs could be matched — check column names in volumes.csv.")
        return summary

    # ── 3. Save CSV ───────────────────────────────────────────────────────
    if verbose:
        print(f"\n[3/4] Saving summary CSV → {summary_csv}")
    summary.to_csv(summary_csv, index=False, float_format="%.4f")

    # ── 4. Generate plot ──────────────────────────────────────────────────
    if verbose:
        print(f"\n[4/4] Generating plot → {plot_png}")
    generate_plot(summary, output_path=plot_png, dpi=dpi)

    # ── Report ────────────────────────────────────────────────────────────
    if verbose:
        _print_report(summary)
        print(f"Saved: {summary_csv}")
        print(f"Saved: {plot_png}")

    return summary
