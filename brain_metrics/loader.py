"""
brain_metrics.loader
---------------------
Load and validate a SynthSeg volumes.csv file.

SynthSeg writes one row per subject; the first column is the image filename
and the remaining columns are region volumes in mm³.
"""

from __future__ import annotations
import pandas as pd
from pathlib import Path


class VolumeCSVError(ValueError):
    """Raised when the CSV does not look like a SynthSeg volumes file."""


def load_volumes(path: str | Path) -> pd.DataFrame:
    """
    Load a SynthSeg ``volumes.csv`` and return a tidy DataFrame.

    Parameters
    ----------
    path : str or Path
        Path to ``volumes.csv`` produced by SynthSeg.

    Returns
    -------
    pd.DataFrame
        Index = subject filename (string).
        Columns = region names (strings).
        Values  = volumes in mm³ (float64).

    Raises
    ------
    FileNotFoundError
        If ``path`` does not exist.
    VolumeCSVError
        If the file cannot be parsed as a SynthSeg volumes file.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"volumes.csv not found: {path}")

    try:
        df = pd.read_csv(path)
    except Exception as exc:
        raise VolumeCSVError(f"Could not read CSV: {exc}") from exc

    if df.empty:
        raise VolumeCSVError("CSV is empty.")

    if df.shape[1] < 2:
        raise VolumeCSVError(
            f"Expected at least 2 columns (subject + regions), got {df.shape[1]}."
        )

    # First column = subject ID / filename
    subject_col = df.columns[0]
    region_cols = df.columns[1:].tolist()

    # Coerce region columns to float; flag any that cannot be converted
    bad_cols = []
    for col in region_cols:
        try:
            df[col] = pd.to_numeric(df[col], errors="raise")
        except Exception:
            bad_cols.append(col)

    if bad_cols:
        raise VolumeCSVError(
            f"These columns could not be parsed as numbers: {bad_cols}. "
            "Check that the CSV was produced by SynthSeg."
        )

    df = df.set_index(subject_col)
    df.index.name = "subject"
    df.columns.name = "region"

    # Sanity: volumes should be non-negative
    if (df < 0).any().any():
        import warnings
        warnings.warn(
            "Some volume values are negative — this is unexpected. "
            "Check the SynthSeg output for errors.",
            stacklevel=2,
        )

    return df


def describe_csv(df: pd.DataFrame) -> str:
    """Return a short human-readable summary of a loaded volumes DataFrame."""
    lines = [
        f"Subjects : {len(df)}",
        f"Regions  : {df.shape[1]}",
        f"Subjects : {list(df.index)}",
        f"Vol range: {df.min().min():.0f} – {df.max().max():.0f} mm³",
    ]
    return "\n".join(lines)
