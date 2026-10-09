"""
FiftyOne Server rail labels for order boundaries.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import date, datetime
import math
import typing as t

MAX_STRING = 24


def compact_number(value: float) -> str:
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)

    magnitude = abs(value)
    for bound, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "k")):
        if magnitude >= bound:
            return f"{value / bound:.3g}{suffix}"

    if isinstance(value, int):
        return str(value)

    return f"{value:.3g}"


def format_label(value: t.Any, rank: int, sorted_: bool) -> str:
    """The rail label for a boundary: its sort value, or its 1-based rank
    when the order is unsorted."""
    if not sorted_:
        return compact_number(rank + 1)

    if value is None:
        return "None"

    if isinstance(value, bool):
        return str(value)

    if isinstance(value, (int, float)):
        return compact_number(value)

    if isinstance(value, (datetime, date)):
        return value.strftime("%b %Y")

    text = str(value)
    if len(text) > MAX_STRING:
        return text[: MAX_STRING - 1] + "…"

    return text
