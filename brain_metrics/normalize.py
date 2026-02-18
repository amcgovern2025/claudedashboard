"""
brain_metrics.normalize
------------------------
ICV detection and volume normalization.

Normalization formula
---------------------
  normalized = (region_volume_mm3 / ICV_mm3) * 100

The result is a percentage of ICV, which removes head-size confounds and
makes volumes comparable across subjects and scanners.
"""

from __future__ import annotations
import warnings
import pandas as pd
from .regions import find_icv_column


class ICVNotFoundError(RuntimeError):
    """Raised when no ICV column can be detected in the CSV."""


def detect_icv(df: pd.DataFrame) -> str:
    """
    Find and return the name of the ICV column in *df*.

    Parameters
    ----------
    df : pd.DataFrame
        Loaded volumes DataFrame (output of ``loader.load_volumes``).

    Returns
    -------
    str
        Column name for the ICV measure.

    Raises
    ------
    ICVNotFoundError
        If no column matches the known ICV patterns.
    """
    col = find_icv_column(list(df.columns))
    if col is None:
        raise ICVNotFoundError(
            "Could not detect an ICV column in the CSV.\n"
            "Expected a column whose name contains one of:\n"
            "  'estimated total intracranial', 'intracranial volume',\n"
            "  'ICV', 'eTIV', 'total intracranial'.\n"
            f"Columns present: {list(df.columns)[:10]} ..."
        )
    return col


def normalize_to_icv(
    raw_mm3: pd.Series,
    icv_mm3: pd.Series,
) -> pd.Series:
    """
    Return *raw_mm3* expressed as a percentage of *icv_mm3*.

    Parameters
    ----------
    raw_mm3 : pd.Series
        Region volumes in mm³ (one value per subject).
    icv_mm3 : pd.Series
        ICV values in mm³ aligned to *raw_mm3*.

    Returns
    -------
    pd.Series
        Normalized values (% of ICV), same index as inputs.
    """
    if (icv_mm3 <= 0).any():
        warnings.warn(
            "One or more ICV values are zero or negative — "
            "normalization will produce inf/NaN.",
            stacklevel=2,
        )
    return (raw_mm3 / icv_mm3) * 100.0


def get_icv_series(df: pd.DataFrame) -> tuple[str, pd.Series]:
    """
    Detect the ICV column and return ``(column_name, Series_in_mm3)``.

    Parameters
    ----------
    df : pd.DataFrame
        Loaded volumes DataFrame.

    Returns
    -------
    (str, pd.Series)
        Column name and the corresponding ICV values (mm³, float).
    """
    col = detect_icv(df)
    return col, df[col].astype(float)
