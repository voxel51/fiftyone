"""
FiftyOne feature flags.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Literal

FeatureFlag = Literal[
    # experimental sample annotation features
    "VFF_EXP_ANNOTATION",
    # annotation milestone 4 features
    "VFF_ANNOTATION_M4",
    # annotation auto-save features
    "VFF_ANNOTATION_AUTO_SAVE",
]
"""Enumeration of active feature flags."""
