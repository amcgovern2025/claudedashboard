#!/usr/bin/env python3
"""
convert_freesurfer.py
---------------------
Convert a FreeSurfer aseg.stats file into the volumes.csv format
expected by run_brain_metrics.py / the brain dashboard.

Usage
-----
  python convert_freesurfer.py aseg.stats
  python convert_freesurfer.py aseg.stats --subject T1.nii.gz
  python convert_freesurfer.py aseg.stats --out volumes.csv

After running this, feed the output straight into the pipeline:
  python run_brain_metrics.py volumes.csv

Where to find aseg.stats in the brainlife download
----------------------------------------------------
After downloading the FreeSurfer output from brainlife.io, unzip it.
The file you need is inside the subject folder:
  <subject>/stats/aseg.stats
"""

import argparse
import csv
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# FreeSurfer StructName  →  SynthSeg-compatible column name
# The column names on the right must match the regex patterns in
# brain_metrics/regions.py so the dashboard can find each region.
# ---------------------------------------------------------------------------
STRUCT_MAP = {
    # Hippocampus
    "Left-Hippocampus":               "left hippocampus",
    "Right-Hippocampus":              "right hippocampus",
    # Amygdala
    "Left-Amygdala":                  "left amygdala",
    "Right-Amygdala":                 "right amygdala",
    # Cerebral cortex
    "Left-Cerebral-Cortex":           "left cerebral cortex",
    "Right-Cerebral-Cortex":          "right cerebral cortex",
    # Cerebral white matter
    "Left-Cerebral-White-Matter":     "left cerebral white matter",
    "Right-Cerebral-White-Matter":    "right cerebral white matter",
    # Thalamus (FS 7+ uses no "-Proper" suffix)
    "Left-Thalamus":                  "left thalamus",
    "Right-Thalamus":                 "right thalamus",
    # Thalamus (older FreeSurfer versions)
    "Left-Thalamus-Proper":           "left thalamus",
    "Right-Thalamus-Proper":          "right thalamus",
    # Caudate
    "Left-Caudate":                   "left caudate",
    "Right-Caudate":                  "right caudate",
    # Putamen
    "Left-Putamen":                   "left putamen",
    "Right-Putamen":                  "right putamen",
    # Lateral ventricles
    "Left-Lateral-Ventricle":         "left lateral ventricle",
    "Right-Lateral-Ventricle":        "right lateral ventricle",
    # 3rd / 4th ventricle
    "3rd-Ventricle":                  "3rd ventricle",
    "4th-Ventricle":                  "4th ventricle",
    # Cerebellum cortex
    "Left-Cerebellum-Cortex":         "left cerebellum cortex",
    "Right-Cerebellum-Cortex":        "right cerebellum cortex",
    # Brainstem
    "Brain-Stem":                     "brainstem",
}

# Pattern to extract eTIV from the aseg.stats header comments
# Example line:
#   # Measure EstimatedTotalIntraCranialVol, eTIV, Estimated Total Intracranial Volume, 1456789.01, mm^3
_ETIV_RE = re.compile(
    r"#\s*Measure\s+EstimatedTotalIntraCranialVol.*?,\s*([\d.]+)\s*,\s*mm",
    re.IGNORECASE,
)


def parse_aseg_stats(path: Path) -> tuple[dict[str, float], float | None]:
    """
    Parse a FreeSurfer aseg.stats file.

    Returns
    -------
    regions : dict  {column_name: volume_mm3}
    etiv    : float or None  (intracranial volume in mm³)
    """
    regions: dict[str, float] = {}
    etiv: float | None = None

    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip()

            # --- header comment lines ---
            if line.startswith("#"):
                m = _ETIV_RE.search(line)
                if m:
                    etiv = float(m.group(1))
                continue

            # --- data rows (space-delimited) ---
            # Columns: Index SegId NVoxels Volume_mm3 StructName ...
            parts = line.split()
            if len(parts) < 5:
                continue

            try:
                volume_mm3 = float(parts[3])
            except ValueError:
                continue

            struct_name = parts[4]
            col_name = STRUCT_MAP.get(struct_name)
            if col_name:
                regions[col_name] = volume_mm3

    return regions, etiv


def write_volumes_csv(
    regions: dict[str, float],
    etiv: float | None,
    subject: str,
    out_path: Path,
) -> None:
    """Write a SynthSeg-compatible volumes.csv."""
    row: dict[str, object] = {"subject": subject}
    row.update(regions)
    if etiv is not None:
        row["estimated total intracranial volume"] = etiv

    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(row.keys()))
        writer.writeheader()
        writer.writerow(row)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Convert FreeSurfer aseg.stats → volumes.csv for the brain dashboard.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "aseg_stats",
        type=Path,
        help="Path to FreeSurfer aseg.stats (inside <subject>/stats/).",
    )
    parser.add_argument(
        "--subject", "-s",
        default=None,
        help="Subject label written in the CSV (default: aseg.stats parent folder name).",
    )
    parser.add_argument(
        "--out", "-o",
        type=Path,
        default=None,
        help="Output path for volumes.csv (default: volumes.csv in current directory).",
    )
    args = parser.parse_args(argv)

    aseg_path: Path = args.aseg_stats
    if not aseg_path.exists():
        print(f"ERROR: File not found: {aseg_path}", file=sys.stderr)
        return 1

    subject = args.subject or aseg_path.parent.parent.name or "subject"
    out_path = args.out or Path("volumes.csv")

    print(f"Parsing  : {aseg_path}")
    regions, etiv = parse_aseg_stats(aseg_path)

    if not regions:
        print(
            "ERROR: No recognised regions found in aseg.stats.\n"
            "Make sure you are passing the correct file (stats/aseg.stats).",
            file=sys.stderr,
        )
        return 1

    print(f"Regions  : {len(regions)} matched")
    if etiv:
        print(f"eTIV     : {etiv:,.0f} mm³")
    else:
        print(
            "WARNING: eTIV not found in header. "
            "ICV-normalised metrics will be unavailable.",
            file=sys.stderr,
        )

    write_volumes_csv(regions, etiv, subject, out_path)
    print(f"Saved    : {out_path}")
    print()
    print("Next step:")
    print(f"  python run_brain_metrics.py {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
