"""
FiftyOne session utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

from fiftyone.core.session.constants import VALID_SELECTION_TYPES


def normalize_selected_samples(
    samples: t.List,
) -> t.List[t.Dict]:
    """Normalizes a list of selected samples to the canonical format.

    Accepts both ``list[str]`` (all ``"default"``) and
    ``list[dict]`` (``{"sample_id": ..., "type": ...}``).

    Args:
        samples: a list of sample IDs (strings) or dicts with
            ``sample_id`` and ``type`` keys

    Returns:
        a list of dicts with ``sample_id`` and ``type`` keys
    """
    result = []
    for item in samples:
        if isinstance(item, str):
            result.append({"sample_id": item, "type": "default"})
        elif isinstance(item, dict):
            sample_id = item.get("sample_id")
            if not isinstance(sample_id, str) or not sample_id:
                raise ValueError(
                    f"Invalid or missing 'sample_id' in dict entry: "
                    f"{item}. Must be a non-empty string"
                )
            sel_type = item.get("type", "default")
            if sel_type not in VALID_SELECTION_TYPES:
                raise ValueError(
                    f"Invalid selection type '{sel_type}' for sample "
                    f"'{sample_id}'. Must be one of {VALID_SELECTION_TYPES}"
                )
            result.append({"sample_id": sample_id, "type": sel_type})
        else:
            raise TypeError(
                f"Invalid sample entry: {item!r}. Must be a string or dict"
            )
    return result
