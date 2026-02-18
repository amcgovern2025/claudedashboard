"""
brain_metrics
=============
Reusable Python package for SynthSeg volumetrics post-processing.

Quick start
-----------
::

    from brain_metrics import run

    # Single subject — produces brain_metrics_summary.csv + brain_metrics_plot.png
    summary = run("volumes.csv", output_dir="results/")

    # Access normalised hippocampal volume programmatically
    hippo = summary.loc[summary["roi"] == "hippocampus", "volume_pct_icv"].values[0]
    print(f"Hippocampus: {hippo:.3f} % ICV")

Modules
-------
loader     – load and validate volumes.csv
regions    – ROI definitions and column-matching logic
normalize  – ICV detection and normalisation
summary    – build tidy summary DataFrame
plot       – generate matplotlib figure
pipeline   – orchestrate the full pipeline (``run()``)
"""

from .pipeline import run
from .loader   import load_volumes, VolumeCSVError
from .summary  import build_summary, pivot_summary
from .plot     import generate_plot
from .regions  import ROI_DEFINITIONS, PLOT_ROIS

__all__ = [
    "run",
    "load_volumes",
    "VolumeCSVError",
    "build_summary",
    "pivot_summary",
    "generate_plot",
    "ROI_DEFINITIONS",
    "PLOT_ROIS",
]

__version__ = "1.0.0"
