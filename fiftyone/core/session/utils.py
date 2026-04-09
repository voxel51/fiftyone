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

    Despite its name, ``selected_samples`` represents whatever sample grid
    items are in the current view: samples, patches, clips, or frames.

    Accepts both ``list[str]`` (all ``"default"``) and
    ``list[dict]`` (``{"id": ..., "type": ...}``).

    Args:
        samples: a list of IDs (strings) or dicts with ``id`` and ``type``
            keys

    Returns:
        a list of dicts with ``id`` and ``type`` keys
    """
    result = []
    for item in samples:
        if isinstance(item, str):
            result.append({"id": item, "type": "default"})
        elif isinstance(item, dict):
            sample_id = item.get("id")
            if not isinstance(sample_id, str) or not sample_id:
                raise ValueError(
                    f"Invalid or missing 'id' in dict entry: "
                    f"{item}. Must be a non-empty string"
                )
            sel_type = item.get("type", "default")
            if sel_type not in VALID_SELECTION_TYPES:
                raise ValueError(
                    f"Invalid selection type '{sel_type}' for "
                    f"'{sample_id}'. Must be one of {VALID_SELECTION_TYPES}"
                )
            result.append({"id": sample_id, "type": sel_type})
        else:
            raise TypeError(
                f"Invalid sample entry: {item!r}. Must be a string or dict"
            )
    return result
