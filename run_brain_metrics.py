#!/usr/bin/env python3
"""
run_brain_metrics.py
---------------------
Command-line entry point for the brain_metrics pipeline.

Usage examples
--------------
# Minimal — saves to current directory
  python run_brain_metrics.py volumes.csv

# Custom output directory
  python run_brain_metrics.py volumes.csv --output-dir results/sub-01/

# Higher-res plot
  python run_brain_metrics.py volumes.csv --dpi 300

# Quiet mode (no stdout report)
  python run_brain_metrics.py volumes.csv --quiet

# Restrict to specific ROIs
  python run_brain_metrics.py volumes.csv --rois hippocampus lateral_ventricles cortex

In Google Colab
---------------
  !python run_brain_metrics.py /content/mri_output/volumes.csv \\
      --output-dir /content/mri_output/ --dpi 150
"""

import argparse
import sys
from pathlib import Path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="SynthSeg brain volumetrics: normalise + plot + save.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "volumes_csv",
        type=Path,
        help="Path to volumes.csv produced by SynthSeg.",
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=Path("."),
        metavar="DIR",
        help="Directory to save brain_metrics_summary.csv and brain_metrics_plot.png. "
             "Created if it does not exist. (default: current directory)",
    )
    parser.add_argument(
        "--rois",
        nargs="+",
        default=None,
        metavar="ROI",
        help="Space-separated list of ROI keys to include. "
             "Defaults to all bilateral-total ROIs. "
             "Available keys: hippocampus, amygdala, thalamus, caudate, "
             "putamen, cortex, white_matter, lateral_ventricles, "
             "ventricle_3rd, ventricle_4th, cerebellum, brainstem.",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=150,
        help="Plot resolution in DPI (default: 150).",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress the per-subject report printed to stdout.",
    )
    parser.add_argument(
        "--list-rois",
        action="store_true",
        help="Print all available ROI keys and exit.",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    if args.list_rois:
        from brain_metrics.regions import ROI_DEFINITIONS
        print("Available ROI keys:")
        for key, defn in ROI_DEFINITIONS.items():
            label = defn.get("label", key)
            kind  = "(composite)" if "sum_of" in defn else ""
            print(f"  {key:<25} {label}  {kind}")
        return 0

    # Validate input early for a clean error message
    if not args.volumes_csv.exists():
        print(f"ERROR: File not found: {args.volumes_csv}", file=sys.stderr)
        return 1

    from brain_metrics import run

    try:
        summary = run(
            volumes_csv = args.volumes_csv,
            output_dir  = args.output_dir,
            rois        = args.rois,
            dpi         = args.dpi,
            verbose     = not args.quiet,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        if "--debug" in sys.argv:
            raise
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
